import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { Moon } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  login: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userDoc = doc(db, 'profiles', user.uid);
        
        // Initial check and creation if needed
        const docSnap = await getDoc(userDoc);
        if (!docSnap.exists()) {
          const newProfile = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            learningStyle: 'intermediate',
            streak: 0,
            totalStudyMinutes: 0,
            tutorVisits: 0,
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp()
          };
          await setDoc(userDoc, newProfile);
        }

        // Set up real-time listener
        unsubscribeProfile = onSnapshot(userDoc, (snapshot) => {
          if (snapshot.exists()) {
            setProfile(snapshot.data());
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        if (unsubscribeProfile) unsubscribeProfile();
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const signOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, login } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <div className="animate-pulse text-[#FEFAE0] font-medium tracking-tight">Lumina is waking up...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black px-6">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-[#606C38] rounded-3xl flex items-center justify-center text-[#FEFAE0] shadow-2xl shadow-[#606C38]/20 animate-in zoom-in duration-1000">
              <Moon className="w-10 h-10 fill-current" />
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-light tracking-tighter text-[#FEFAE0]">Lumina</h1>
            <p className="text-[#FEFAE0]/60 leading-relaxed">
              Your advanced AI study companion. Master complex subjects, track your progress, and stay motivated.
            </p>
          </div>
          <button
            onClick={login}
            className="w-full bg-[#606C38] text-[#FEFAE0] py-4 rounded-full font-medium hover:bg-[#606C38]/80 transition-all transform active:scale-[0.98] shadow-xl shadow-black"
          >
            Get Started with Google
          </button>
          <p className="text-xs text-[#FEFAE0]/30 uppercase tracking-widest">Elevate your learning</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
