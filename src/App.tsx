/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, AuthGuard } from './components/Auth';
import { TimerProvider, useTimer } from './context/TimerContext';
import { Sidebar, View } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Tutor } from './components/Tutor';
import { VoiceLiveTutor } from './components/VoiceLiveTutor';
import { Goals } from './components/Goals';
import { Timer } from './components/Timer';
import { Notes } from './components/Notes';
import { QuizLibrary } from './components/Library';
import { SettingsView } from './components/Settings';
import { FloatingTimer } from './components/FloatingTimer';
import { TimerCelebrationModal } from './components/TimerCelebrationModal';
import { AnimatePresence, motion } from 'motion/react';
import { 
  Menu, 
  Moon, 
  BarChart3, 
  MessageSquareText, 
  Radio, 
  FileText, 
  Library, 
  Mic,
  Timer as TimerIcon
} from 'lucide-react';
import { cn } from './lib/utils';

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isActive, isPaused, timeLeft, formatTime } = useTimer();

  const getViewTitle = (view: View) => {
    switch (view) {
      case 'dashboard': return 'Overview';
      case 'tutor': return 'LuminaBot';
      case 'live_voice': return 'LuminaVoice';
      case 'goals': return 'Study Goals';
      case 'notes': return 'Notes & PDFs';
      case 'library': return 'Quiz Library';
      case 'timer': return 'Focus Timer';
      case 'settings': return 'Settings';
      default: return 'Lumina';
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentView} />;
      case 'tutor':
        return <Tutor onOpenVoiceMode={() => setCurrentView('live_voice')} />;
      case 'live_voice':
        return <VoiceLiveTutor onSwitchToChat={() => setCurrentView('tutor')} />;
      case 'goals':
        return <Goals />;
      case 'timer':
        return <Timer />;
      case 'notes':
        return <Notes />;
      case 'library':
        return <QuizLibrary />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard onNavigate={setCurrentView} />;
    }
  };

  const mobileBottomNavItems = [
    { id: 'dashboard' as View, icon: BarChart3, label: 'Overview' },
    { id: 'timer' as View, icon: TimerIcon, label: 'Timer', badge: isActive ? formatTime(timeLeft) : undefined },
    { id: 'tutor' as View, icon: MessageSquareText, label: 'LuminaBot' },
    { id: 'live_voice' as View, icon: Radio, label: 'Voice' },
    { id: 'notes' as View, icon: FileText, label: 'Notes' },
    { id: 'library' as View, icon: Library, label: 'Quiz' },
  ];

  return (
    <div className="min-h-screen bg-black text-[#FEFAE0]">
      {/* Sidebar for Desktop & Slide-out drawer for Mobile */}
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Floating Timer when timer is active and student is on any other page */}
      <FloatingTimer 
        currentView={currentView} 
        onOpenTimer={() => setCurrentView('timer')} 
      />

      {/* Celebration Modal when session completes or records */}
      <TimerCelebrationModal />

      {/* Mobile Top App Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-black/95 backdrop-blur-md border-b border-[#3D2B1F] px-4 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl bg-[#2C1810] border border-[#3D2B1F] text-[#FEFAE0] active:scale-95 transition-transform"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#606C38] rounded-lg flex items-center justify-center text-[#FEFAE0]">
              <Moon className="w-3.5 h-3.5 fill-current" />
            </div>
            <div>
              <span className="text-sm font-bold text-[#FEFAE0] tracking-tight">{getViewTitle(currentView)}</span>
            </div>
          </div>
        </div>

        {/* Header Quick Action */}
        <div className="flex items-center gap-2">
          {isActive && currentView !== 'timer' && (
            <button
              onClick={() => setCurrentView('timer')}
              className={cn(
                "px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all tabular-nums",
                isPaused 
                  ? "bg-amber-950/40 border-amber-800 text-amber-300"
                  : "bg-[#606C38]/20 border-[#606C38] text-emerald-300 animate-pulse"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", isPaused ? "bg-amber-400" : "bg-emerald-400")} />
              <span>{formatTime(timeLeft)}</span>
            </button>
          )}

          {currentView !== 'live_voice' && (
            <button
              onClick={() => setCurrentView('live_voice')}
              className="px-2.5 py-1.5 rounded-lg bg-[#606C38]/20 border border-[#606C38]/40 text-[#FEFAE0] text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Mic className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>LuminaVoice</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="pt-14 pb-20 md:pt-0 md:pb-0 md:pl-64 min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full min-h-[calc(100vh-3.5rem)] md:min-h-screen"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-black/95 backdrop-blur-md border-t border-[#3D2B1F] px-1 flex items-center justify-around z-40 safe-area-bottom">
        {mobileBottomNavItems.map((item) => {
          const isActiveNav = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-150 relative min-w-[48px]",
                isActiveNav 
                  ? "text-[#FEFAE0] bg-[#2C1810]" 
                  : "text-[#FEFAE0]/40 hover:text-[#FEFAE0]/70"
              )}
            >
              <item.icon className={cn("w-4 h-4 mb-0.5 transition-transform", isActiveNav && "scale-110 text-[#606C38]")} />
              <span className="text-[9px] font-bold tracking-tight whitespace-nowrap">{item.label}</span>
              {item.badge && (
                <span className="absolute -top-1 right-0 text-[8px] font-black bg-[#606C38] text-[#FEFAE0] px-1 rounded-full border border-black tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <TimerProvider>
          <AppContent />
        </TimerProvider>
      </AuthGuard>
    </AuthProvider>
  );
}
