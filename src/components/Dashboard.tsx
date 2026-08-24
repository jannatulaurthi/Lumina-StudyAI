import React, { useEffect, useState } from 'react';
import { 
  Flame, 
  Target, 
  Clock, 
  Calendar, 
  Plus, 
  CheckCircle2, 
  ArrowRight,
  TrendingUp,
  Brain,
  Timer,
  Sparkles,
  BookOpen,
  Moon
} from 'lucide-react';
import { useAuth } from './Auth';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';
import { cn, formatDate } from '../lib/utils';

export const Dashboard: React.FC<{ onNavigate: (view: any) => void }> = ({ onNavigate }) => {
  const { profile, user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const goalsQuery = query(
          collection(db, 'goals'), 
          where('userId', '==', user.uid),
          where('status', '!=', 'completed'),
          limit(3)
        );
        const notesQuery = query(
          collection(db, 'notes'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(3)
        );

        const [goalsSnap, notesSnap] = await Promise.all([
          getDocs(goalsQuery),
          getDocs(notesQuery)
        ]);

        setGoals(goalsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setRecentNotes(notesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Dashboard fetch failed", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const stats = [
    { label: 'Current Streak', value: `${profile?.streak || 0} Days`, icon: Flame, color: 'text-orange-300', bg: 'bg-orange-950/30' },
    { label: 'Study Time', value: `${profile?.totalStudyMinutes || 0}m`, icon: Timer, color: 'text-[#606C38]', bg: 'bg-[#606C38]/10' },
    { label: 'Active Goals', value: goals.length.toString(), icon: Target, color: 'text-emerald-300', bg: 'bg-emerald-950/30' },
    { label: 'Tutor Access', value: (profile?.tutorVisits || 0).toString(), icon: Moon, color: 'text-amber-200', bg: 'bg-amber-950/30' },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-700 bg-black text-[#FEFAE0]">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2 sm:mb-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#606C38] rounded-xl flex items-center justify-center text-[#FEFAE0] shrink-0 shadow-md shadow-[#606C38]/20">
            <Moon className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#FEFAE0]">Lumina</h1>
              <div className="h-4 sm:h-6 w-[1.5px] bg-[#3D2B1F]" />
              <p className="text-[10px] sm:text-xs text-[#FEFAE0]/50 font-bold uppercase tracking-widest">{formatDate(currentTime)}</p>
            </div>
            <p className="text-[10px] sm:text-xs text-[#606C38] font-black tracking-widest tabular-nums mt-0.5">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <div className="flex flex-col sm:items-end">
            <span className="text-xs font-bold text-[#606C38] uppercase tracking-wider">{profile?.streak || 0} Day Streak</span>
            <span className="text-[10px] sm:text-xs text-[#FEFAE0]/40 font-medium">Focus Master</span>
          </div>
          <button 
            onClick={() => onNavigate('tutor')}
            className="bg-[#606C38] text-[#FEFAE0] px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#606C38]/80 transition-all shadow-lg shadow-black active:scale-95 whitespace-nowrap"
          >
            Start Session
          </button>
        </div>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4">
        
        {/* STATS TILES (Top Row) */}
        {stats.map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            key={stat.label} 
            className="col-span-1 sm:col-span-1 md:col-span-3 bento-card p-4 sm:p-5 flex items-center justify-between group"
          >
            <div>
              <p className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#FEFAE0]/40 font-bold mb-1">{stat.label}</p>
              <p className="text-lg sm:text-xl font-bold text-[#FEFAE0] group-hover:text-[#606C38] transition-colors">{stat.value}</p>
            </div>
            <div className={cn("w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 shrink-0", stat.bg)}>
              <stat.icon className={cn("w-4 h-4 sm:w-5 sm:h-5", stat.color)} />
            </div>
          </motion.div>
        ))}

        {/* TODAY'S STUDY PLAN & WEEKLY MASTERY (Center Large - Replaces Cognitive Intensity) */}
        <div className="col-span-1 sm:col-span-2 md:col-span-8 bento-card p-5 sm:p-7 flex flex-col relative overflow-hidden group">
          <div className="relative z-10 space-y-6 flex-grow flex flex-col justify-between">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-xl font-bold text-[#FEFAE0]">Today's Study Plan & Mastery</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#606C38]/20 text-[#606C38] border border-[#606C38]/40">
                    Daily Roadmap
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#FEFAE0]/60 font-medium mt-0.5">
                  Track your daily study checklist and weekly learning distribution.
                </p>
              </div>

              {/* Quick Action Button to Launch Voice/Tutor */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => onNavigate('live_voice')}
                  className="flex items-center gap-1.5 bg-[#160D08] hover:bg-[#2C1810] text-[#606C38] hover:text-[#FEFAE0] px-3 py-1.5 rounded-xl text-xs font-bold border border-[#3D2B1F] hover:border-[#606C38] transition-all shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#606C38]" />
                  <span>Voice with Puck</span>
                </button>
                <button 
                  onClick={() => onNavigate('tutor')}
                  className="flex items-center gap-1.5 bg-[#606C38] text-[#FEFAE0] px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-[#606C38]/80 transition-all shadow-sm"
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>LuminaBot</span>
                </button>
              </div>
            </div>

            {/* Split Content: Left = Daily Interactive Checklist, Right = Weekly Study Time Chart */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-1">
              
              {/* Daily Checklist (6 cols) */}
              <div className="md:col-span-6 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/50 flex items-center gap-1.5">
                    <Target className="w-3 h-3 text-[#606C38]" /> Today's Action Checklist
                  </span>
                  <span className="text-[10px] font-bold text-[#606C38]">3 of 4 Ready</span>
                </div>

                <div className="space-y-2">
                  {[
                    { 
                      id: 'voice', 
                      title: 'LuminaVoice Session with Puck', 
                      desc: '15m interactive spoken concept drill',
                      completed: false,
                      action: () => onNavigate('live_voice'),
                      badge: 'Interactive'
                    },
                    { 
                      id: 'flashcards', 
                      title: 'Review Study Notes & Flashcards', 
                      desc: 'Active recall spaced repetition',
                      completed: true,
                      action: () => onNavigate('library'),
                      badge: 'Recall'
                    },
                    { 
                      id: 'pomodoro', 
                      title: 'Complete 25m Focus Block', 
                      desc: 'Deep undisturbed study session',
                      completed: (profile?.totalStudyMinutes || 0) >= 25,
                      action: () => onNavigate('timer'),
                      badge: 'Focus'
                    },
                    { 
                      id: 'quiz', 
                      title: 'Test Knowledge with Socratic AI', 
                      desc: 'Challenge misunderstandings',
                      completed: false,
                      action: () => onNavigate('tutor'),
                      badge: 'Quiz'
                    }
                  ].map((task) => (
                    <div 
                      key={task.id}
                      onClick={task.action}
                      className="p-2.5 sm:p-3 rounded-xl bg-black/40 border border-[#3D2B1F] hover:border-[#606C38]/60 flex items-center justify-between gap-3 cursor-pointer transition-all group/item"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          "w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
                          task.completed 
                            ? "bg-[#606C38] border-[#606C38] text-[#FEFAE0]" 
                            : "border-[#3D2B1F] text-transparent group-hover/item:border-[#606C38]"
                        )}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className={cn(
                            "text-xs font-bold truncate",
                            task.completed ? "text-[#FEFAE0]/50 line-through" : "text-[#FEFAE0] group-hover/item:text-[#606C38] transition-colors"
                          )}>
                            {task.title}
                          </p>
                          <p className="text-[10px] text-[#FEFAE0]/40 font-medium truncate">{task.desc}</p>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#160D08] border border-[#3D2B1F] text-[#FEFAE0]/60 shrink-0">
                        {task.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Study Activity Chart & Breakdown (6 cols) */}
              <div className="md:col-span-6 flex flex-col justify-between space-y-4 bg-black/40 border border-[#3D2B1F] rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/50">Weekly Study Time</span>
                    <h4 className="text-base font-bold text-[#FEFAE0] mt-0.5">
                      {Math.max(1, Math.round(((profile?.totalStudyMinutes || 0) / 60) * 10) / 10)} Hours Logged
                    </h4>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-800/40">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>+24% vs last wk</span>
                  </div>
                </div>

                {/* Day-by-Day Activity Bars (Mon to Sun) */}
                <div className="grid grid-cols-7 gap-2 items-end h-24 pt-2 px-1">
                  {[
                    { day: 'Mon', minutes: 45, max: 90 },
                    { day: 'Tue', minutes: 60, max: 90 },
                    { day: 'Wed', minutes: 30, max: 90 },
                    { day: 'Thu', minutes: 75, max: 90 },
                    { day: 'Fri', minutes: 50, max: 90 },
                    { day: 'Sat', minutes: 85, max: 90 },
                    { day: 'Sun', minutes: 40, max: 90, isToday: true }
                  ].map((d, idx) => {
                    const heightPercent = Math.min(100, Math.max(18, Math.round((d.minutes / d.max) * 100)));
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end group/bar">
                        <span className="text-[8px] font-bold text-[#FEFAE0]/40 opacity-0 group-hover/bar:opacity-100 transition-opacity">
                          {d.minutes}m
                        </span>
                        <div className="w-full bg-[#160D08] border border-[#3D2B1F] rounded-lg h-full flex flex-col justify-end p-0.5 overflow-hidden">
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${heightPercent}%` }}
                            transition={{ duration: 0.6, delay: idx * 0.05 }}
                            className={cn(
                              "w-full rounded-md transition-all",
                              d.isToday 
                                ? "bg-gradient-to-t from-[#606C38] to-[#99A86B] shadow-sm shadow-[#606C38]/40" 
                                : "bg-[#606C38]/60 hover:bg-[#606C38]"
                            )}
                          />
                        </div>
                        <span className={cn(
                          "text-[9px] font-black uppercase",
                          d.isToday ? "text-[#606C38]" : "text-[#FEFAE0]/30"
                        )}>
                          {d.day}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Focus Summary Pill Bar */}
                <div className="pt-2 border-t border-[#3D2B1F]/60 flex items-center justify-between text-[10px] text-[#FEFAE0]/60">
                  <span className="font-semibold">Top Focus: Concepts & Problem Solving</span>
                  <span className="font-black text-[#FEFAE0]">92% Consistency</span>
                </div>
              </div>

            </div>

            {/* Bottom Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[#3D2B1F]">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-[#606C38]" />
                  <span className="text-[9px] font-bold text-[#FEFAE0]/50 uppercase tracking-tighter">Completed Sessions</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-[#3D2B1F]" />
                  <span className="text-[9px] font-bold text-[#FEFAE0]/50 uppercase tracking-tighter">Pending Action</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#FEFAE0]/80">
                <Clock className="w-3.5 h-3.5 text-[#606C38]" />
                <span>Next recommended review: <strong className="text-[#FEFAE0]">LuminaVoice Practice</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* RECENT GOALS (Right Column) */}
        <div className="col-span-1 sm:col-span-2 md:col-span-4 bento-card p-5 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-[#FEFAE0]">Current Goals</h3>
            <button onClick={() => onNavigate('goals')} className="text-xs font-bold text-[#606C38] hover:underline">View All</button>
          </div>
          <div className="space-y-3 flex-grow min-h-[160px]">
            {goals.length > 0 ? (
              goals.map((goal, i) => (
                <div 
                  key={goal.id} 
                  className="p-3.5 sm:p-4 bg-black/40 border border-[#3D2B1F] rounded-2xl flex items-center gap-3 hover:border-[#606C38] transition-all cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#2C1810] border border-[#3D2B1F] flex items-center justify-center group-hover:bg-[#606C38] group-hover:text-[#FEFAE0] transition-colors shrink-0">
                    <Target className="w-4 h-4 text-[#FEFAE0]/30 group-hover:text-[#FEFAE0]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#FEFAE0] truncate">{goal.title}</p>
                    <div className="w-full bg-black h-1 rounded-full mt-1.5 overflow-hidden">
                       <div className="bg-[#606C38] h-full w-[40%]" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <Target className="w-8 h-8 text-[#FEFAE0]/20" />
                <p className="text-xs text-[#FEFAE0]/40 font-medium">No active goals. Stay focused!</p>
              </div>
            )}
          </div>
          <button 
            onClick={() => onNavigate('goals')}
            className="mt-4 sm:mt-6 w-full py-2.5 sm:py-3 bg-[#606C38] text-[#FEFAE0] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#606C38]/80 transition-colors"
          >
            Create New Goal
          </button>
        </div>

        {/* QUICK ACCESS (Bottom Row Large) */}
        <div className="col-span-1 sm:col-span-2 md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
           {[
             { id: 'library', icon: BookOpen, label: 'Knowledge Base', sub: `${recentNotes.length} Saved Assets`, color: 'bg-emerald-950/30 text-emerald-300 border border-emerald-900/40' },
             { id: 'notes', icon: Brain, label: 'PDF AI Summarizer', sub: 'Upload Study Material', color: 'bg-amber-950/30 text-amber-300 border border-amber-900/40' },
             { id: 'timer', icon: Timer, label: 'Pomodoro Timer', sub: '25:00 Session Ready', color: 'bg-rose-950/30 text-rose-300 border border-rose-900/40' },
           ].map((tool, i) => (
             <div 
               key={tool.id}
               onClick={() => onNavigate(tool.id as any)}
               className="bento-card bento-card-hover p-5 sm:p-6 flex flex-col items-center text-center justify-center cursor-pointer group"
             >
               <div className={cn("w-11 h-11 sm:w-12 sm:h-12 rounded-2xl mb-3 flex items-center justify-center transition-transform group-hover:scale-110", tool.color)}>
                 <tool.icon className="w-5 h-5 sm:w-6 sm:h-6" />
               </div>
               <h4 className="text-sm font-bold text-[#FEFAE0]">{tool.label}</h4>
               <p className="text-[10px] text-[#FEFAE0]/40 font-bold uppercase mt-1">{tool.sub}</p>
             </div>
           ))}
        </div>

        {/* TIP OF THE DAY (Bottom Right) */}
        <div className="col-span-1 sm:col-span-2 md:col-span-4 bg-[#606C38] rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 text-[#FEFAE0] relative overflow-hidden group">
           <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
           <div className="relative z-10 flex flex-col h-full justify-between space-y-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/10 rounded-xl flex items-center justify-center">
                 <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-2">
                <h4 className="text-base sm:text-lg font-bold leading-tight">Focus Technique</h4>
                <p className="text-xs text-[#FEFAE0]/80 font-medium leading-relaxed opacity-90">
                  Switching modes in LuminaBot helps activate different cognitive patterns. Try 'Deep Study' for hard concepts!
                </p>
              </div>
              <button onClick={() => onNavigate('tutor')} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-[#FEFAE0] text-[#606C38] w-fit px-4 py-2 rounded-full hover:bg-[#FEFAE0]/90 transition-colors">
                Explore LuminaBot <ArrowRight className="w-3 h-3" />
              </button>
           </div>
        </div>

      </div>
    </div>
  );
};
