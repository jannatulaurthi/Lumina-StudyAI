import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../components/Auth';
import { db } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  increment, 
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { TimerMode, TimerCelebrationData } from '../types';

interface TimerContextType {
  isActive: boolean;
  isPaused: boolean;
  mode: TimerMode;
  timeLeft: number;
  totalDuration: number;
  elapsedSeconds: number;
  subject: string;
  sessionsCompletedToday: number;
  isCelebrationOpen: boolean;
  celebrationData: TimerCelebrationData | null;
  startTimer: (customDurationSec?: number, customSubject?: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  setMode: (mode: TimerMode, customDurationSec?: number) => void;
  setSubject: (subject: string) => void;
  endAndRecordSession: (forcedMinutes?: number) => Promise<{ success: boolean; minutes: number }>;
  dismissCelebration: () => void;
  formatTime: (seconds: number) => string;
  progressPercent: number;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

const STORAGE_KEY = 'lumina_focus_timer_state';

const DEFAULT_DURATIONS: Record<TimerMode, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  custom: 45 * 60
};

// Play a pleasant Web Audio synthesizer chime on session finish
function playSessionCompleteChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    // Harmonic frequencies (528Hz Love freq + 792Hz harmonic)
    const freqs = [528, 660, 792, 1056];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 1.3);
    });
  } catch (err) {
    console.warn('Audio chime warning:', err);
  }
}

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Core Timer State
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [mode, setTimerModeState] = useState<TimerMode>('work');
  const [totalDuration, setTotalDuration] = useState<number>(DEFAULT_DURATIONS.work);
  const [timeLeft, setTimeLeft] = useState<number>(DEFAULT_DURATIONS.work);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [subject, setSubjectState] = useState<string>('Deep Focus Session');
  const [sessionsCompletedToday, setSessionsCompletedToday] = useState<number>(0);

  // Celebration Modal state
  const [isCelebrationOpen, setIsCelebrationOpen] = useState(false);
  const [celebrationData, setCelebrationData] = useState<TimerCelebrationData | null>(null);

  // References for precision wall-clock tracking
  const targetEndTimeRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const accumulatedElapsedRef = useRef<number>(0);
  const intervalRef = useRef<any>(null);

  // 1. Restore state from localStorage on initial mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          const now = Date.now();
          setTimerModeState(parsed.mode || 'work');
          setTotalDuration(parsed.totalDuration || DEFAULT_DURATIONS.work);
          setSubjectState(parsed.subject || 'Deep Focus Session');
          setSessionsCompletedToday(parsed.sessionsCompletedToday || 0);

          if (parsed.isActive && parsed.targetEndTime && !parsed.isPaused) {
            // Timer was running when page left/reloaded
            const remaining = Math.max(0, Math.round((parsed.targetEndTime - now) / 1000));
            const calculatedElapsed = Math.max(0, Math.round((now - (parsed.sessionStartTime || now)) / 1000));

            targetEndTimeRef.current = parsed.targetEndTime;
            sessionStartTimeRef.current = parsed.sessionStartTime;
            accumulatedElapsedRef.current = calculatedElapsed;

            if (remaining > 0) {
              setTimeLeft(remaining);
              setElapsedSeconds(calculatedElapsed);
              setIsActive(true);
              setIsPaused(false);
            } else {
              // Timer finished while user was away
              setTimeLeft(0);
              setElapsedSeconds(parsed.totalDuration || DEFAULT_DURATIONS.work);
              setIsActive(false);
              setIsPaused(false);
              // Trigger auto complete
              handleSessionComplete(parsed.totalDuration || DEFAULT_DURATIONS.work, parsed.mode || 'work', parsed.subject || 'Deep Focus Session');
            }
          } else if (parsed.isPaused) {
            setIsActive(true);
            setIsPaused(true);
            setTimeLeft(parsed.timeLeft || 0);
            setElapsedSeconds(parsed.elapsedSeconds || 0);
          } else {
            setTimeLeft(parsed.timeLeft || DEFAULT_DURATIONS.work);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse timer state from storage:', e);
    }
  }, []);

  // 2. Persist state changes to localStorage
  const saveStateToStorage = useCallback(() => {
    try {
      const stateToSave = {
        isActive,
        isPaused,
        mode,
        totalDuration,
        timeLeft,
        elapsedSeconds,
        subject,
        sessionsCompletedToday,
        targetEndTime: targetEndTimeRef.current,
        sessionStartTime: sessionStartTimeRef.current
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save timer state to storage:', e);
    }
  }, [isActive, isPaused, mode, totalDuration, timeLeft, elapsedSeconds, subject, sessionsCompletedToday]);

  useEffect(() => {
    saveStateToStorage();
  }, [saveStateToStorage]);

  // 3. Complete and Record Session helper
  const handleSessionComplete = useCallback(async (
    durationSec: number, 
    sessionMode: TimerMode, 
    sessionSubject: string
  ) => {
    playSessionCompleteChime();

    // Calculate actual minutes focused (at least 1 minute)
    const minutesStudied = Math.max(1, Math.round(durationSec / 60));

    // Reset local timer state
    setIsActive(false);
    setIsPaused(false);
    targetEndTimeRef.current = null;
    sessionStartTimeRef.current = null;
    accumulatedElapsedRef.current = 0;

    if (sessionMode === 'work' || sessionMode === 'custom') {
      setSessionsCompletedToday(prev => prev + 1);

      // Record to Firestore
      if (user) {
        try {
          // Add to sessions collection
          await addDoc(collection(db, 'sessions'), {
            userId: user.uid,
            duration: minutesStudied,
            type: sessionMode,
            startTime: serverTimestamp(),
            endTime: serverTimestamp(),
            notes: sessionSubject || 'Deep Focus Block'
          });

          // Update user profile totalStudyMinutes
          const profileDocRef = doc(db, 'profiles', user.uid);
          const snap = await getDoc(profileDocRef);
          if (snap.exists()) {
            await updateDoc(profileDocRef, {
              totalStudyMinutes: increment(minutesStudied),
              lastActive: serverTimestamp()
            });
          }
        } catch (err) {
          console.error('Failed to log study session to Firestore:', err);
        }
      }

      // Show celebratory modal
      setCelebrationData({
        minutes: minutesStudied,
        type: sessionMode,
        subject: sessionSubject || 'Focus Block',
        timestamp: new Date()
      });
      setIsCelebrationOpen(true);
    }
  }, [user]);

  // 4. Main Timer Ticking Engine (Wall-Clock Precision)
  useEffect(() => {
    if (isActive && !isPaused) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        if (targetEndTimeRef.current) {
          const remaining = Math.max(0, Math.round((targetEndTimeRef.current - now) / 1000));
          setTimeLeft(remaining);

          const currentElapsed = Math.max(0, Math.round((now - (sessionStartTimeRef.current || now)) / 1000));
          setElapsedSeconds(currentElapsed);

          if (remaining === 0) {
            clearInterval(intervalRef.current);
            handleSessionComplete(totalDuration, mode, subject);
          }
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isPaused, totalDuration, mode, subject, handleSessionComplete]);

  // Handle Tab Focus / Visibility Change to correct any browser background throttling instantly
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive && !isPaused && targetEndTimeRef.current) {
        const now = Date.now();
        const remaining = Math.max(0, Math.round((targetEndTimeRef.current - now) / 1000));
        setTimeLeft(remaining);
        const currentElapsed = Math.max(0, Math.round((now - (sessionStartTimeRef.current || now)) / 1000));
        setElapsedSeconds(currentElapsed);

        if (remaining === 0) {
          handleSessionComplete(totalDuration, mode, subject);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, isPaused, totalDuration, mode, subject, handleSessionComplete]);

  // Public Controller Methods
  const startTimer = (customDurationSec?: number, customSubject?: string) => {
    const duration = customDurationSec || totalDuration || DEFAULT_DURATIONS[mode];
    const now = Date.now();

    setTotalDuration(duration);
    setTimeLeft(duration);
    setElapsedSeconds(0);
    if (customSubject) setSubjectState(customSubject);

    targetEndTimeRef.current = now + duration * 1000;
    sessionStartTimeRef.current = now;
    accumulatedElapsedRef.current = 0;

    setIsActive(true);
    setIsPaused(false);
  };

  const pauseTimer = () => {
    if (!isActive || isPaused) return;
    setIsPaused(true);
    const now = Date.now();
    if (sessionStartTimeRef.current) {
      accumulatedElapsedRef.current = Math.max(0, Math.round((now - sessionStartTimeRef.current) / 1000));
      setElapsedSeconds(accumulatedElapsedRef.current);
    }
  };

  const resumeTimer = () => {
    if (!isActive || !isPaused) return;
    const now = Date.now();
    targetEndTimeRef.current = now + timeLeft * 1000;
    sessionStartTimeRef.current = now - (elapsedSeconds * 1000);
    setIsPaused(false);
  };

  const resetTimer = () => {
    setIsActive(false);
    setIsPaused(false);
    targetEndTimeRef.current = null;
    sessionStartTimeRef.current = null;
    accumulatedElapsedRef.current = 0;
    const defaultDur = DEFAULT_DURATIONS[mode];
    setTimeLeft(defaultDur);
    setTotalDuration(defaultDur);
    setElapsedSeconds(0);
  };

  const setMode = (newMode: TimerMode, customDurationSec?: number) => {
    setTimerModeState(newMode);
    const dur = customDurationSec || DEFAULT_DURATIONS[newMode];
    setTotalDuration(dur);
    setTimeLeft(dur);
    setElapsedSeconds(0);
    setIsActive(false);
    setIsPaused(false);
    targetEndTimeRef.current = null;
    sessionStartTimeRef.current = null;
  };

  const setSubject = (newSubject: string) => {
    setSubjectState(newSubject);
  };

  // End and record the active session manually at any moment
  const endAndRecordSession = async (forcedMinutes?: number): Promise<{ success: boolean; minutes: number }> => {
    const studiedSec = forcedMinutes ? forcedMinutes * 60 : Math.max(elapsedSeconds, totalDuration - timeLeft);
    const minutesStudied = forcedMinutes || Math.max(1, Math.round(studiedSec / 60));

    // Reset timer
    resetTimer();

    if (user && (mode === 'work' || mode === 'custom')) {
      try {
        setSessionsCompletedToday(prev => prev + 1);

        // Add to sessions collection in Firestore
        await addDoc(collection(db, 'sessions'), {
          userId: user.uid,
          duration: minutesStudied,
          type: mode,
          startTime: serverTimestamp(),
          endTime: serverTimestamp(),
          notes: subject || 'Focused Study Session'
        });

        // Update profile totalStudyMinutes in Firestore
        const profileRef = doc(db, 'profiles', user.uid);
        const snap = await getDoc(profileRef);
        if (snap.exists()) {
          await updateDoc(profileRef, {
            totalStudyMinutes: increment(minutesStudied),
            lastActive: serverTimestamp()
          });
        }

        playSessionCompleteChime();

        // Trigger celebratory toast / modal
        setCelebrationData({
          minutes: minutesStudied,
          type: mode,
          subject: subject || 'Focused Study Session',
          timestamp: new Date()
        });
        setIsCelebrationOpen(true);

        return { success: true, minutes: minutesStudied };
      } catch (err) {
        console.error('Failed to save ended study session:', err);
        return { success: false, minutes: minutesStudied };
      }
    }

    return { success: true, minutes: minutesStudied };
  };

  const dismissCelebration = () => {
    setIsCelebrationOpen(false);
    setCelebrationData(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = totalDuration > 0 ? ((totalDuration - timeLeft) / totalDuration) * 100 : 0;

  return (
    <TimerContext.Provider
      value={{
        isActive,
        isPaused,
        mode,
        timeLeft,
        totalDuration,
        elapsedSeconds,
        subject,
        sessionsCompletedToday,
        isCelebrationOpen,
        celebrationData,
        startTimer,
        pauseTimer,
        resumeTimer,
        resetTimer,
        setMode,
        setSubject,
        endAndRecordSession,
        dismissCelebration,
        formatTime,
        progressPercent
      }}
    >
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
};
