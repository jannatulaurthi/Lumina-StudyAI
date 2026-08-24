import React, { useState, useEffect } from 'react';
import { 
  Target, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  Clock,
  Trash2,
  Calendar,
  Moon
} from 'lucide-react';
import { useAuth } from './Auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const Goals: React.FC = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', status: 'pending' });

  const fetchGoals = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'goals'), 
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.title.trim()) return;

    try {
      await addDoc(collection(db, 'goals'), {
        ...newGoal,
        userId: user?.uid,
        createdAt: serverTimestamp()
      });
      setNewGoal({ title: '', description: '', status: 'pending' });
      setIsAdding(false);
      fetchGoals();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStatus = async (goalId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      await updateDoc(doc(db, 'goals', goalId), { status: newStatus });
      setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status: newStatus } : g));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (goalId: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteDoc(doc(db, 'goals', goalId));
      setGoals(prev => prev.filter(g => g.id !== goalId));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 text-[#FEFAE0]">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#606C38] rounded-2xl flex items-center justify-center shadow-lg shadow-black">
            <Target className="w-6 h-6 text-[#FEFAE0]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#FEFAE0]">Academic Goals</h1>
            <p className="text-xs text-[#FEFAE0]/40 font-bold uppercase tracking-widest leading-none mt-1">Conquer your milestones</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#606C38] text-[#FEFAE0] px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#606C38]/80 transition-all active:scale-95 shadow-xl shadow-black"
        >
          <Plus className="w-4 h-4" />
          New Objective
        </button>
      </header>

      {/* Stats Summary Bento */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: 'Total Missions', value: goals.length, color: 'bg-[#2C1810] border-[#3D2B1F]', text: 'text-[#FEFAE0]' },
          { label: 'Completed', value: goals.filter(g => g.status === 'completed').length, color: 'bg-[#2C1810] border-[#3D2B1F]', text: 'text-[#FEFAE0]' },
          { 
            label: 'Success Rate', 
            value: `${goals.length > 0 ? Math.round((goals.filter(g => g.status === 'completed').length / goals.length) * 100) : 0}%`, 
            color: 'bg-[#606C38]', 
            text: 'text-[#FEFAE0]' 
          },
        ].map((stat, i) => (
          <div key={i} className={cn("bento-card p-8 flex flex-col justify-between min-h-[140px]", stat.color)}>
            <p className={cn("text-[10px] uppercase font-black tracking-widest opacity-60 mb-2", stat.text === 'text-[#FEFAE0]' && stat.color.includes('606C38') ? 'text-[#FEFAE0]' : 'text-[#FEFAE0]/30')}>{stat.label}</p>
            <p className={cn("text-4xl font-black tracking-tighter", stat.text)}>{stat.value}</p>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bento-card p-10 shadow-2xl relative z-10 border-[#606C38]/30 bg-[#606C38]/10"
          >
            <form onSubmit={handleCreate} className="space-y-8">
              <div className="space-y-6">
                <input 
                  autoFocus
                  placeholder="What's the main goal?"
                  className="w-full text-3xl font-black tracking-tighter focus:outline-none placeholder:text-[#FEFAE0]/10 bg-transparent text-[#FEFAE0]"
                  value={newGoal.title}
                  onChange={e => setNewGoal({ ...newGoal, title: e.target.value })}
                />
                <textarea 
                  placeholder="Define the success criteria and deadline..."
                  className="w-full h-32 text-sm text-[#FEFAE0]/50 font-medium focus:outline-none resize-none placeholder:text-[#FEFAE0]/10 bg-transparent"
                  value={newGoal.description}
                  onChange={e => setNewGoal({ ...newGoal, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-[#3D2B1F]">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-3 text-[10px] uppercase font-black tracking-widest text-[#FEFAE0]/30 hover:text-[#FEFAE0] transition-colors"
                >
                  Discard
                </button>
                <button 
                  type="submit"
                  className="px-10 py-3 bg-[#606C38] text-[#FEFAE0] text-[10px] uppercase font-black tracking-widest rounded-2xl hover:bg-[#606C38]/80 transition-colors"
                >
                  Lock In Goal
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Goals List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2 px-2">
           <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#FEFAE0]/40">Current Assignments</h2>
           <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#FEFAE0]/20" />
              <input placeholder="Filter goals..." className="bg-transparent border-none focus:outline-none text-[10px] font-bold uppercase tracking-wider text-[#FEFAE0] w-32" />
           </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            [1, 2, 3].map(i => <div key={i} className="h-32 bento-card animate-pulse shadow-none opacity-50" />)
          ) : goals.length > 0 ? (
            goals.map((goal, i) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                key={goal.id} 
                className={cn(
                  "group bento-card p-6 flex items-center gap-6 hover:border-[#606C38]",
                  goal.status === 'completed' && "opacity-50 grayscale bg-black/20 border-[#3D2B1F]"
                )}
              >
                <button 
                  onClick={() => handleToggleStatus(goal.id, goal.status)}
                  className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-90 shadow-sm",
                    goal.status === 'completed' 
                      ? "bg-emerald-500 text-[#FEFAE0]" 
                      : "bg-black/40 text-[#FEFAE0]/20 hover:bg-[#606C38] hover:text-[#FEFAE0]"
                  )}
                >
                  <CheckCircle2 className="w-6 h-6" />
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className={cn(
                      "text-lg font-bold tracking-tight",
                      goal.status === 'completed' ? "line-through text-[#FEFAE0]/30" : "text-[#FEFAE0]"
                    )}>
                      {goal.title}
                    </h3>
                    {goal.status === 'completed' && (
                      <span className="text-[9px] bg-emerald-950/30 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-900/40 font-black uppercase">Archive</span>
                    )}
                  </div>
                  <p className="text-xs text-[#FEFAE0]/50 font-medium leading-relaxed truncate max-w-xl">{goal.description}</p>
                  
                  <div className="flex items-center gap-6 mt-4">
                     <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#FEFAE0]/20 group-hover:text-[#606C38] transition-colors">
                       <Calendar className="w-3.5 h-3.5" />
                       {formatDate(goal.createdAt?.toDate())}
                     </div>
                     <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#FEFAE0]/20">
                       <Clock className="w-3.5 h-3.5" />
                       {goal.status}
                     </div>
                  </div>
                </div>

                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                  <button 
                    onClick={() => handleDelete(goal.id)}
                    className="p-3 bg-black/40 border border-[#3D2B1F] text-[#FEFAE0]/20 hover:text-rose-400 hover:border-rose-900/50 hover:scale-105 rounded-xl transition-all shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button className="p-3 bg-black/40 border border-[#3D2B1F] text-[#FEFAE0]/20 hover:text-[#FEFAE0] hover:scale-105 rounded-xl transition-all shadow-sm">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="py-24 text-center space-y-8 bento-card border-dashed border-[#3D2B1F] bg-transparent shadow-none">
              <div className="w-20 h-20 bg-[#2C1810] rounded-[2rem] mx-auto flex items-center justify-center border border-[#3D2B1F]">
                 <Moon className="w-10 h-10 text-[#606C38] fill-current" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-[#FEFAE0]">Clear your mind. Set a goal.</h3>
                <p className="text-xs text-[#FEFAE0]/30 font-bold uppercase tracking-wider">What's the one thing you need to master today?</p>
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="text-[10px] font-black uppercase tracking-[0.2em] bg-[#606C38] text-[#FEFAE0] px-8 py-3 rounded-2xl hover:bg-[#606C38]/80 transition-all shadow-xl shadow-black"
              >
                Create First Goal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
