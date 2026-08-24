import React, { useState } from 'react';
import { useAuth } from './Auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Mail, GraduationCap, Shield, Bell, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

export const SettingsView: React.FC = () => {
  const { profile, user } = useAuth();
  const [learningStyle, setLearningStyle] = useState(profile?.learningStyle || 'intermediate');
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { learningStyle });
      alert("Settings updated!");
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 text-[#FEFAE0]">
      <header className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[#606C38] rounded-2xl flex items-center justify-center shadow-lg shadow-black">
          <Shield className="w-6 h-6 text-[#FEFAE0]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#FEFAE0]">System Preferences</h1>
          <p className="text-xs text-[#FEFAE0]/40 font-black uppercase tracking-widest leading-none mt-1">Configure your academic environment</p>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Account Info Card */}
        <div className="col-span-12 lg:col-span-7 bg-[#2C1810] bento-card p-8 space-y-8 shadow-xl shadow-black">
          <div className="flex items-center gap-3 border-b border-[#3D2B1F] pb-6">
            <div className="w-10 h-10 bg-black/20 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-[#FEFAE0]/30" />
            </div>
            <h3 className="font-bold text-[#FEFAE0]">Profile Architecture</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/30">Identity Tag</label>
              <div className="bg-black/20 p-4 rounded-xl text-sm text-[#FEFAE0] font-bold border border-[#3D2B1F]">{user?.displayName}</div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/30">Neural Network Address</label>
              <div className="bg-black/20 p-4 rounded-xl text-sm text-[#FEFAE0] font-bold border border-[#3D2B1F] truncate">{user?.email}</div>
            </div>
          </div>
        </div>

        {/* Learning Style Card */}
        <div className="col-span-12 lg:col-span-5 bento-card p-8 bg-[#606C38] text-[#FEFAE0] border-none shadow-xl shadow-black space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <GraduationCap className="w-32 h-32" />
          </div>
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black/20 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-[#FEFAE0]" />
              </div>
              <h3 className="font-bold">Cognitive Profile</h3>
            </div>
            <p className="text-xs text-[#FEFAE0]/70 font-medium leading-relaxed">Adjust your pedagogical depth. Higher levels increase synthesis complexity.</p>
            
            <div className="flex flex-col gap-2">
              {['beginner', 'intermediate', 'advanced'].map(style => (
                <button
                  key={style}
                  onClick={() => setLearningStyle(style)}
                  className={cn(
                    "w-full p-4 rounded-xl border font-bold text-xs uppercase tracking-widest transition-all text-left flex items-center justify-between",
                    learningStyle === style 
                      ? "bg-[#FEFAE0] text-[#606C38] border-[#FEFAE0] shadow-lg" 
                      : "bg-black/20 border-white/10 text-[#FEFAE0]/70 hover:bg-black/30"
                  )}
                >
                  {style}
                  {learningStyle === style && <div className="w-2 h-2 bg-[#606C38] rounded-full animate-pulse" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="col-span-12 bento-card p-6 border-[#3D2B1F] bg-black/20 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#2C1810] border border-[#3D2B1F] rounded-xl flex items-center justify-center">
                 <Bell className="w-5 h-5 text-[#FEFAE0]/30" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#FEFAE0]">Operational Persistence</h4>
                <p className="text-[10px] text-[#FEFAE0]/30 font-bold uppercase">Sync changes to all neural instances</p>
              </div>
           </div>
           <button 
              onClick={handleUpdate}
              disabled={isSaving}
              className="w-full md:w-auto px-12 py-4 bg-[#606C38] text-[#FEFAE0] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#606C38]/80 transition-all disabled:opacity-30 shadow-lg shadow-black"
            >
              {isSaving ? 'Synchronizing...' : 'Commit Changes'}
            </button>
        </div>

        {/* Destructive Actions */}
        <div className="col-span-12 bento-card p-8 border-rose-900/30 bg-rose-950/20 flex flex-col md:flex-row items-center justify-between gap-6 shadow-none">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-black/20 border border-rose-900/30 rounded-2xl flex items-center justify-center">
                 <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h4 className="text-base font-bold text-rose-400">Archive Termination</h4>
                <p className="text-xs text-rose-400/60 font-medium leading-relaxed">Permanently purge all learned patterns and account metrics.</p>
              </div>
           </div>
           <button 
              className="w-full md:w-auto px-8 py-3 bg-[#2C1810] text-rose-400 border border-rose-900/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-[#FEFAE0] transition-all shadow-sm"
              onClick={() => confirm("Execute archive purge?")}
            >
              Purge Database
            </button>
        </div>
      </div>
    </div>
  );
};
