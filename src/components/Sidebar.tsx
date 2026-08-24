import React from 'react';
import { 
  BarChart3, 
  MessageSquareText, 
  Target, 
  FileText, 
  Library, 
  Timer, 
  Settings, 
  LogOut,
  Sparkles,
  Moon,
  Mic,
  Radio,
  X
} from 'lucide-react';
import { useAuth } from './Auth';
import { useTimer } from '../context/TimerContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export type View = 'dashboard' | 'tutor' | 'live_voice' | 'goals' | 'notes' | 'library' | 'timer' | 'settings';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const { user, signOut } = useAuth();
  const { isActive, isPaused, timeLeft, formatTime } = useTimer();

  const navItems = [
    { id: 'dashboard', icon: BarChart3, label: 'Overview' },
    { id: 'tutor', icon: MessageSquareText, label: 'LuminaBot' },
    { id: 'live_voice', icon: Radio, label: 'LuminaVoice', badge: 'Live API' },
    { id: 'goals', icon: Target, label: 'Study Goals' },
    { id: 'notes', icon: FileText, label: 'Notes & PDFs' },
    { id: 'library', icon: Library, label: 'Quiz Library' },
    { 
      id: 'timer', 
      icon: Timer, 
      label: 'Focus Timer',
      customBadge: isActive ? (
        <span className={cn(
          "text-[9px] font-black tracking-tight tabular-nums px-2 py-0.5 rounded-full flex items-center gap-1 border",
          isPaused 
            ? "bg-amber-950/60 text-amber-400 border-amber-800" 
            : "bg-[#606C38]/30 text-emerald-300 border-[#606C38] animate-pulse"
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full", isPaused ? "bg-amber-400" : "bg-emerald-400")} />
          {formatTime(timeLeft)}
        </span>
      ) : null
    },
  ] as const;

  const handleNavClick = (view: View) => {
    onViewChange(view);
    if (onCloseMobile) onCloseMobile();
  };

  const navigationContent = (
    <div className="flex flex-col h-full bg-black text-[#FEFAE0]">
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#606C38] rounded-xl flex items-center justify-center text-[#FEFAE0] shadow-lg shadow-[#606C38]/20">
              <Moon className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#FEFAE0] leading-tight">Lumina</h2>
              <p className="text-[10px] text-[#FEFAE0]/50 font-bold uppercase tracking-wider">Celestial Study</p>
            </div>
          </div>
          {onCloseMobile && (
            <button 
              onClick={onCloseMobile}
              className="md:hidden p-2 rounded-xl bg-[#2C1810] border border-[#3D2B1F] text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id as View)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group text-sm font-semibold",
                currentView === item.id 
                  ? "bg-[#2C1810] text-[#FEFAE0] shadow-[0_4px_12px_rgba(44,24,16,0.5)] border border-[#606C38]/40" 
                  : "text-[#FEFAE0]/50 hover:text-[#FEFAE0] hover:bg-[#2C1810]/30 border border-transparent"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn(
                  "w-4 h-4 transition-transform group-hover:scale-110",
                  currentView === item.id ? "text-[#606C38]" : "text-[#FEFAE0]/30"
                )} />
                <span>{item.label}</span>
              </div>
              {'badge' in item && item.badge && (
                <span className="text-[8px] font-black uppercase tracking-tighter bg-[#606C38]/20 text-emerald-400 border border-[#606C38]/40 px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              )}
              {'customBadge' in item && item.customBadge}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 space-y-4">
        <button
          onClick={() => handleNavClick('settings')}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-semibold",
            currentView === 'settings' 
              ? "bg-[#2C1810] text-[#FEFAE0] border border-[#606C38]/40" 
              : "text-[#FEFAE0]/50 hover:text-[#FEFAE0] border border-transparent"
          )}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>

        <div className="pt-4 border-t border-[#3D2B1F]">
          <div className="flex items-center gap-3 px-2 mb-4">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full border border-[#3D2B1F]" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-9 h-9 bg-[#2C1810] text-[#FEFAE0] rounded-full flex items-center justify-center text-xs font-bold uppercase ring-2 ring-[#3D2B1F]">
                {user?.email?.[0] || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#FEFAE0] truncate leading-none mb-1">{user?.displayName || 'Student'}</p>
              <p className="text-[10px] text-[#606C38] font-bold uppercase tracking-wider">Lumina Scholar</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              signOut();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-400 hover:bg-rose-950/30 transition-all duration-200 text-sm font-bold uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex h-screen w-64 border-r border-[#3D2B1F] flex-col fixed left-0 top-0 z-30">
        {navigationContent}
      </aside>

      {/* Mobile Slide-Over Drawer with Backdrop */}
      <AnimatePresence>
        {isOpenMobile && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* Slide-out Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-72 max-w-[85vw] h-full border-r border-[#3D2B1F] shadow-2xl z-10"
            >
              {navigationContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
