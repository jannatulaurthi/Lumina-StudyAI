import React from 'react';
import { useTimer } from '../context/TimerContext';
import { Sparkles, Trophy, CheckCircle2, Clock, Flame, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './Auth';

export const TimerCelebrationModal: React.FC = () => {
  const { isCelebrationOpen, celebrationData, dismissCelebration } = useTimer();
  const { profile } = useAuth();

  if (!isCelebrationOpen || !celebrationData) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissCelebration}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#120906] border border-[#606C38]/60 rounded-3xl p-6 sm:p-8 text-[#FEFAE0] shadow-2xl shadow-black z-10 space-y-6 overflow-hidden"
        >
          {/* Subtle decorative background glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#606C38]/20 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={dismissCelebration}
            className="absolute top-4 right-4 p-2 rounded-xl bg-[#2C1810] border border-[#3D2B1F] text-[#FEFAE0]/60 hover:text-[#FEFAE0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header Trophy Icon */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#606C38] to-[#99A86B] flex items-center justify-center text-[#FEFAE0] shadow-xl shadow-[#606C38]/30 animate-bounce">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#606C38] bg-[#606C38]/10 px-3 py-1 rounded-full border border-[#606C38]/30">
                Session Successfully Logged
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-[#FEFAE0] mt-2">
                Great Work, Scholar!
              </h2>
              <p className="text-xs text-[#FEFAE0]/60 mt-1 max-w-xs mx-auto">
                Your focused study time was recorded and permanently added to your profile stats.
              </p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#1C2314] border border-[#606C38]/40 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#606C38] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Time Studied
              </span>
              <p className="text-2xl font-black text-[#FEFAE0] mt-2">
                +{celebrationData.minutes} <span className="text-xs font-bold text-[#FEFAE0]/50">mins</span>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#160D08] border border-[#3D2B1F] flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" /> Daily Streak
              </span>
              <p className="text-2xl font-black text-[#FEFAE0] mt-2">
                {profile?.streak || 1} <span className="text-xs font-bold text-[#FEFAE0]/50">Days Active</span>
              </p>
            </div>
          </div>

          {/* Subject note badge */}
          {celebrationData.subject && (
            <div className="p-3 rounded-xl bg-black/40 border border-[#3D2B1F] flex items-center justify-between text-xs">
              <span className="text-[#FEFAE0]/40 font-medium">Topic / Subject:</span>
              <span className="font-bold text-[#FEFAE0] truncate max-w-[200px]">{celebrationData.subject}</span>
            </div>
          )}

          {/* Continue Button */}
          <button
            onClick={dismissCelebration}
            className="w-full py-3.5 rounded-2xl bg-[#606C38] hover:bg-[#606C38]/80 text-[#FEFAE0] font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#606C38]/20 transition-all active:scale-[0.98]"
          >
            <span>Continue Learning</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
