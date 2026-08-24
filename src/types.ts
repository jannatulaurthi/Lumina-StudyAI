export interface Profile {
  uid: string;
  displayName?: string;
  email: string;
  learningStyle?: 'beginner' | 'intermediate' | 'advanced';
  streak?: number;
  totalStudyMinutes?: number;
  tutorVisits?: number;
  createdAt?: any;
  lastActive?: any;
}

export interface StudyGoal {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  deadline?: string;
  createdAt?: any;
}

export interface StudyNote {
  id?: string;
  userId: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface Quiz {
  id?: string;
  userId: string;
  topic: string;
  questions: QuizQuestion[];
  score?: number;
  totalQuestions?: number;
  createdAt?: any;
}

export interface StudySession {
  id?: string;
  userId: string;
  duration: number; // in minutes
  type: 'work' | 'shortBreak' | 'longBreak' | 'custom' | string;
  startTime?: any;
  endTime?: any;
  notes?: string;
}

export type TimerMode = 'work' | 'shortBreak' | 'longBreak' | 'custom';

export interface TimerCelebrationData {
  minutes: number;
  type: TimerMode;
  subject: string;
  timestamp: Date;
}
