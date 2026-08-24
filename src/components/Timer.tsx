import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Coffee, 
  Brain, 
  CheckCircle2, 
  Moon, 
  Square, 
  Clock, 
  Sparkles, 
  Tag, 
  TrendingUp, 
  History, 
  Flame,
  Plus
} from 'lucide-react';
import { useAuth } from './Auth';
import { useTimer } from '../context/TimerContext';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { TimerMode } from '../types';

export const Timer: React.FC = () => {
  const { user, profile } = useAuth();
  const { 
    isActive, 
    isPaused, 
    mode, 
    timeLeft, 
    totalDuration, 
    elapsedSeconds, 
    subject, 
    sessionsCompletedToday, 
    startTimer, 
    pauseTimer, 
    resumeTimer, 
    resetTimer, 
    setMode, 
    setSubject, 
    endAndRecordSession, 
    formatTime, 
    progressPercent 
  } = useTimer();

  const [customMinutesInput, setCustomMinutesInput] = useState<number>(30);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [selectedSubjectInput, setSelectedSubjectInput] = useState<string>(subject);
  const [isEditingSubject, setIsEditingSubject] = useState<boolean>(false);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Fetch recent study sessions from Firestore
  const fetchRecentSessions = async () => {
    if (!user) return;
    try {
      setLoadingHistory(true);
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        orderBy('startTime', 'desc'),
        limit(5)
      );
      const snap = await getDocs(q);
      setRecentSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn('Could not fetch recent sessions:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchRecentSessions();
  }, [user, sessionsCompletedToday]);

  const handleStartOrToggle = () => {
    if (!isActive) {
      startTimer(totalDuration, selectedSubjectInput);
    } else if (isPaused) {
      resumeTimer();
    } else {
      pauseTimer();
    }
  };

  const handleModeChange = (newMode: TimerMode, durationSec?: number) => {
    setMode(newMode, durationSec);
  };

  const handleSaveCustomDuration = () => {
    const sec = Math.max(1, customMinutesInput) * 60;
    handleModeChange('custom', sec);
    setShowCustomModal(false);
  };

  const handleEndAndRecordNow = async () => {
    setIsSaving(true);
    try {
      await endAndRecordSession();
      fetchRecentSessions();
    } finally {
      setIsSaving(false);
    }
  };

  const subjectSuggestions = [
    'Deep Study',
    'Quantum Physics',
    'Calculus & Linear Algebra',
    'Organic Chemistry',
    'Data Structures & Algorithms',
    'Exam Revision'
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[85vh] space-y-8 sm:space-y-10 animate-in fade-in duration-500 text-[#FEFAE0]">
      
      {/* Header */}
      <header className="text-center space-y-2 max-w-lg mx-auto">
        <div className="w-14 h-14 bg-[#2C1810] border border-[#3D2B1F] rounded-2xl mx-auto flex items-center justify-center shadow-xl shadow-black mb-3 group hover:border-[#606C38] transition-all">
          <Moon className="w-7 h-7 text-[#606C38] fill-current" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#FEFAE0]">Deep Focus Engine</h1>
        <p className="text-[#FEFAE0]/50 font-bold uppercase tracking-wider text-[10px]">
          Persistent Spaced Immersion • Stays active across tabs & pages
        </p>
      </header>

      {/* Mode Selector Tabs */}
      <div className="bg-[#160D08] p-1.5 rounded-2xl flex flex-wrap justify-center gap-1 border border-[#3D2B1F] shadow-lg">
        {[
          { id: 'work', label: 'Deep Work (25m)', icon: Brain, duration: 25 * 60 },
          { id: 'shortBreak', label: 'Quick Rest (5m)', icon: Coffee, duration: 5 * 60 },
          { id: 'longBreak', label: 'Long Break (15m)', icon: Coffee, duration: 15 * 60 },
          { id: 'custom', label: 'Custom Time', icon: Clock, duration: 45 * 60 }
        ].map((m) => {
          const isSelected = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                if (m.id === 'custom') {
                  setShowCustomModal(true);
                } else {
                  handleModeChange(m.id as TimerMode, m.duration);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all",
                isSelected
                  ? "bg-[#606C38] text-[#FEFAE0] shadow-md shadow-[#606C38]/30 scale-[1.02]"
                  : "text-[#FEFAE0]/60 hover:text-[#FEFAE0] hover:bg-[#2C1810]"
              )}
            >
              <m.icon className="w-3.5 h-3.5" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subject / Focus Topic Tagging Banner */}
      <div className="w-full max-w-md bg-[#160D08] border border-[#3D2B1F] rounded-2xl p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40 flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-[#606C38]" /> Focus Subject
          </span>
          {!isEditingSubject && (
            <button
              onClick={() => setIsEditingSubject(true)}
              className="text-[10px] font-bold text-[#606C38] hover:underline"
            >
              Edit Subject
            </button>
          )}
        </div>

        {isEditingSubject ? (
          <div className="flex items-center gap-2">
            <input
              value={selectedSubjectInput}
              onChange={(e) => setSelectedSubjectInput(e.target.value)}
              placeholder="e.g. Calculus, Biology Chapter 4..."
              className="flex-1 bg-black/50 border border-[#3D2B1F] rounded-xl px-3 py-1.5 text-xs text-[#FEFAE0] focus:outline-none focus:border-[#606C38]"
            />
            <button
              onClick={() => {
                setSubject(selectedSubjectInput || 'Deep Focus Session');
                setIsEditingSubject(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#606C38] text-[#FEFAE0] text-xs font-bold"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#FEFAE0] truncate">{subject}</span>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[220px]">
              {subjectSuggestions.slice(0, 2).map((sugg) => (
                <button
                  key={sugg}
                  onClick={() => {
                    setSelectedSubjectInput(sugg);
                    setSubject(sugg);
                  }}
                  className="px-2 py-0.5 rounded-md bg-[#2C1810] border border-[#3D2B1F] text-[9px] font-bold text-[#FEFAE0]/60 hover:text-[#FEFAE0] hover:border-[#606C38] whitespace-nowrap"
                >
                  {sugg}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Central Interactive Radial Timer Display */}
      <div className="relative w-80 sm:w-96 h-80 sm:h-96 flex items-center justify-center">
        {/* SVG Circular Progress Meter */}
        <svg className="absolute w-full h-full -rotate-90 drop-shadow-2xl" viewBox="0 0 100 100">
          <circle 
            cx="50" cy="50" r="45" 
            fill="none" 
            stroke="#1F130B" 
            strokeWidth="3.5" 
          />
          <motion.circle 
            cx="50" cy="50" r="45" 
            fill="none" 
            stroke={mode === 'shortBreak' || mode === 'longBreak' ? '#10b981' : '#606C38'} 
            strokeWidth="3.5" 
            strokeDasharray="283"
            strokeDashoffset={283 - (283 * progressPercent / 100)}
            strokeLinecap="round"
            transition={{ duration: 0.3, ease: 'linear' }}
          />
        </svg>

        {/* Inner Content */}
        <div className="relative z-10 text-center space-y-3 flex flex-col items-center">
          <motion.span 
            key={timeLeft}
            initial={{ scale: 1 }}
            animate={isActive && !isPaused ? { scale: [1, 1.015, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1 }}
            className="text-7xl sm:text-8xl font-black tracking-tighter text-[#FEFAE0] tabular-nums select-none drop-shadow-md"
          >
            {formatTime(timeLeft)}
          </motion.span>

          {/* Status Chip */}
          <div className="flex flex-col items-center gap-1.5">
            <div className={cn(
              "px-3.5 py-1 rounded-full flex items-center gap-2 border text-[10px] font-black uppercase tracking-widest transition-all",
              isActive && !isPaused
                ? "bg-[#606C38]/20 border-[#606C38] text-emerald-400"
                : isPaused
                ? "bg-amber-950/40 border-amber-800 text-amber-300"
                : "bg-[#2C1810] border-[#3D2B1F] text-[#FEFAE0]/50"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                isActive && !isPaused ? "bg-emerald-400 animate-ping" : isPaused ? "bg-amber-400" : "bg-[#3D2B1F]"
              )} />
              <span>
                {isActive && !isPaused 
                  ? 'Focus Session Active' 
                  : isPaused 
                  ? 'Session Paused' 
                  : 'Ready to Immerse'}
              </span>
            </div>

            {isActive && (
              <span className="text-[10px] font-bold text-[#FEFAE0]/40 tabular-nums">
                {Math.round(elapsedSeconds / 60)}m studied this block
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Action Controls Container */}
      <div className="bg-[#160D08] border border-[#3D2B1F] p-3 sm:p-4 rounded-3xl flex items-center gap-3 sm:gap-4 shadow-2xl">
        {/* Reset Button */}
        <button 
          onClick={resetTimer}
          className="p-3.5 sm:p-4 bg-[#2C1810] border border-[#3D2B1F] text-[#FEFAE0]/60 hover:text-[#FEFAE0] hover:border-[#606C38] rounded-2xl transition-all active:scale-95"
          title="Reset Timer"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        
        {/* Main Play / Pause Button */}
        <button 
          onClick={handleStartOrToggle}
          className={cn(
            "px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl flex items-center gap-2.5 font-bold text-sm sm:text-base transition-all transform active:scale-95 shadow-xl",
            isActive && !isPaused
              ? "bg-[#2C1810] border-2 border-[#606C38] text-[#FEFAE0] hover:bg-[#3D2B1F]"
              : "bg-[#606C38] text-[#FEFAE0] hover:bg-[#606C38]/80 shadow-[#606C38]/30"
          )}
        >
          {isActive && !isPaused ? (
            <>
              <Pause className="w-5 h-5 fill-current" />
              <span>Pause</span>
            </>
          ) : isPaused ? (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span>Start Focus</span>
            </>
          )}
        </button>

        {/* End & Record Study Session Button */}
        {isActive && (
          <button 
            onClick={handleEndAndRecordNow}
            disabled={isSaving}
            className="px-4 sm:px-5 py-3.5 sm:py-4 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 active:scale-95 transition-all shadow-md"
            title="Stop & Log Study Time"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>End & Record</span>
          </button>
        )}
      </div>

      {/* Today's Productivity Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
        <div className="p-5 rounded-2xl bg-[#160D08] border border-[#3D2B1F] flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#606C38]" /> Sessions Finished Today
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-[#FEFAE0]">{sessionsCompletedToday}</span>
            <span className="text-xs font-bold text-[#606C38]">Daily Target: 6</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#160D08] border border-[#3D2B1F] flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#606C38]" /> Total Profile Minutes
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-[#FEFAE0]">{profile?.totalStudyMinutes || 0}m</span>
            <span className="text-xs font-bold text-emerald-400">All-time Recorded</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#160D08] border border-[#3D2B1F] flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-400" /> Active Streak
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-[#FEFAE0]">{profile?.streak || 1} Days</span>
            <span className="text-xs font-bold text-orange-300">Unbroken</span>
          </div>
        </div>
      </div>

      {/* Recent Session History Logs */}
      <div className="w-full max-w-3xl bg-[#160D08] border border-[#3D2B1F] rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#FEFAE0]/60 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#606C38]" /> Recent Logged Study Sessions
          </span>
          <button 
            onClick={fetchRecentSessions} 
            className="text-[10px] font-bold text-[#606C38] hover:underline"
          >
            Refresh
          </button>
        </div>

        {recentSessions.length === 0 ? (
          <p className="text-xs text-[#FEFAE0]/40 italic py-2">
            No study sessions logged yet. Complete or stop a focus session to record your hours!
          </p>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((sess, idx) => (
              <div 
                key={sess.id || idx}
                className="p-3 rounded-xl bg-black/40 border border-[#3D2B1F] flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-[#606C38]/20 border border-[#606C38]/40 flex items-center justify-center text-[#606C38]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-[#FEFAE0]">{sess.notes || 'Focus Block'}</span>
                    <p className="text-[10px] text-[#FEFAE0]/40 capitalize">{sess.type || 'Pomodoro'}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-black text-[#606C38]">+{sess.duration} min</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Duration Modal */}
      <AnimatePresence>
        {showCustomModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCustomModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-[#120906] border border-[#3D2B1F] rounded-2xl p-6 text-[#FEFAE0] shadow-2xl z-10 space-y-4"
            >
              <h3 className="text-base font-bold text-[#FEFAE0]">Set Custom Focus Duration</h3>
              <p className="text-xs text-[#FEFAE0]/60">Select the target minutes for this session:</p>

              <div className="flex items-center justify-center gap-4 py-4">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={customMinutesInput}
                  onChange={(e) => setCustomMinutesInput(parseInt(e.target.value) || 1)}
                  className="w-24 text-center bg-black border border-[#3D2B1F] rounded-xl py-2 text-2xl font-black text-[#FEFAE0] focus:border-[#606C38] focus:outline-none"
                />
                <span className="text-sm font-bold text-[#FEFAE0]/60">Minutes</span>
              </div>

              {/* Quick minute pills */}
              <div className="flex items-center justify-center gap-2">
                {[15, 30, 45, 60, 90].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setCustomMinutesInput(mins)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold border",
                      customMinutesInput === mins
                        ? "bg-[#606C38] border-[#606C38] text-[#FEFAE0]"
                        : "bg-[#2C1810] border-[#3D2B1F] text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
                    )}
                  >
                    {mins}m
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#3D2B1F]">
                <button
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#2C1810] text-xs font-bold text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCustomDuration}
                  className="px-4 py-2 rounded-xl bg-[#606C38] text-xs font-bold text-[#FEFAE0] hover:bg-[#606C38]/80"
                >
                  Apply Time
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
