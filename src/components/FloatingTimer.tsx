import React from 'react';
import { useTimer } from '../context/TimerContext';
import { Play, Pause, Square, Sparkles, ChevronRight, Brain, Coffee } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { View } from './Sidebar';

interface FloatingTimerProps {
  currentView: View;
  onOpenTimer: () => void;
}

export const FloatingTimer: React.FC<FloatingTimerProps> = ({ currentView, onOpenTimer }) => {
  const { 
    isActive, 
    isPaused, 
    mode, 
    timeLeft, 
    subject, 
    pauseTimer, 
    resumeTimer, 
    endAndRecordSession, 
    formatTime 
  } = useTimer();

  // Only show when the timer is active (running or paused) and the user is NOT already on the timer page
  if (!isActive || currentView === 'timer') {
    return null;
  }

  const isWork = mode === 'work' || mode === 'custom';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex items-center shadow-2xl"
      >
        <div className="bg-[#160D08]/95 backdrop-blur-md border border-[#3D2B1F] hover:border-[#606C38]/80 transition-all rounded-2xl p-2 sm:p-2.5 flex items-center gap-2.5 sm:gap-3 text-[#FEFAE0] shadow-black/80 ring-1 ring-white/5">
          {/* Pulsing Mode Icon / Button to Jump to Timer */}
          <button
            onClick={onOpenTimer}
            className={cn(
              "w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all active:scale-95",
              isWork
                ? "bg-[#606C38]/20 border-[#606C38]/50 text-[#606C38]"
                : "bg-emerald-950/40 border-emerald-800 text-emerald-400"
            )}
            title="Open Focus Timer"
          >
            {isWork ? (
              <Brain className={cn("w-4 h-4 sm:w-5 sm:h-5", !isPaused && "animate-pulse")} />
            ) : (
              <Coffee className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </button>

          {/* Time & Subject Clickable Region */}
          <div 
            onClick={onOpenTimer}
            className="cursor-pointer flex flex-col justify-center pr-1 select-none group"
          >
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                isPaused ? "bg-amber-400" : "bg-emerald-400 animate-ping"
              )} />
              <span className="text-[9px] font-black uppercase tracking-wider text-[#FEFAE0]/40 group-hover:text-[#606C38] transition-colors truncate max-w-[90px] sm:max-w-[120px]">
                {subject || (isWork ? 'Deep Focus' : 'Break')}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-black tracking-tight tabular-nums text-[#FEFAE0]">
                {formatTime(timeLeft)}
              </span>
              {isPaused && (
                <span className="text-[8px] font-bold uppercase text-amber-400 tracking-tighter">
                  (Paused)
                </span>
              )}
            </div>
          </div>

          <div className="h-6 w-[1px] bg-[#3D2B1F]" />

          {/* Quick Action Controls */}
          <div className="flex items-center gap-1">
            {/* Play / Pause */}
            <button
              onClick={isPaused ? resumeTimer : pauseTimer}
              className="p-2 rounded-xl bg-[#2C1810] hover:bg-[#3D2B1F] border border-[#3D2B1F] text-[#FEFAE0] active:scale-95 transition-all"
              title={isPaused ? "Resume Session" : "Pause Session"}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 fill-current text-emerald-400" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            </button>

            {/* End & Record Session */}
            <button
              onClick={() => endAndRecordSession()}
              className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 active:scale-95 transition-all flex items-center gap-1 text-[10px] font-bold"
              title="End & Record Study Session"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Save</span>
            </button>

            {/* Expand Arrow */}
            <button
              onClick={onOpenTimer}
              className="p-1.5 rounded-lg hover:bg-[#2C1810] text-[#FEFAE0]/40 hover:text-[#FEFAE0] transition-colors"
              title="Maximize Focus Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
