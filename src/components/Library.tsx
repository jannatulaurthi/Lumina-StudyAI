import React, { useState, useEffect } from 'react';
import { 
  Library, 
  Plus, 
  Search, 
  HelpCircle, 
  ChevronRight, 
  Trophy, 
  Calendar,
  Sparkles,
  BookOpen,
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  TrendingUp,
  X,
  Trash2,
  Moon
} from 'lucide-react';
import { useAuth } from './Auth';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { askLumina } from '../lib/gemini';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { extractTextFromPdf } from '../lib/pdfUtils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export const QuizLibrary: React.FC = () => {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [topic, setTopic] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [pdfContext, setPdfContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<any>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const fetchQuizzes = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'quizzes'), 
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));

      const attemptsQuery = query(
        collection(db, 'quiz_attempts'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const attemptsSnap = await getDocs(attemptsQuery);
      setAttempts(attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setIsExtracting(true);
    setFileName(file.name);
    try {
      const text = await extractTextFromPdf(file);
      if (!text.trim()) {
        alert("The PDF seems to have no readable text. It might be an image-only scan.");
        setIsExtracting(false);
        setFileName(null);
        return;
      }
      setPdfContext(text);
      if (!topic) {
        setTopic(file.name.replace('.pdf', ''));
      }
    } catch (err) {
      console.error("PDF Extraction failed", err);
      alert("Failed to read PDF content. Please check if the file is valid.");
    } finally {
      setIsExtracting(false);
    }
  };

  const clearFile = () => {
    setFileName(null);
    setPdfContext(null);
  };

  const generateQuiz = async () => {
    if ((!topic.trim() && !pdfContext) || isGenerating) return;
    setIsGenerating(true);
    try {
      const contextText = pdfContext 
        ? `BASED ON THIS CONTENT: ${pdfContext.substring(0, 15000)}...` 
        : `ABOUT TOPIC: ${topic}`;

      const difficultyContext = {
        beginner: "Focus on basic concepts and clear, straightforward questions.",
        intermediate: "Focus on application of knowledge and slightly more complex reasoning.",
        advanced: "Focus on deep theoretical concepts, intricate details, and critical synthesis of the material."
      }[difficulty];

      const prompt = `Generate a high-quality study quiz with exactly ${numQuestions} multiple choice questions ${contextText}. 
      The difficulty level should be ${difficulty.toUpperCase()}. ${difficultyContext}
      Return the output as a valid JSON array of objects, where each object has:
      - question: the question text (Use LaTeX for any mathematical or scientific formulas, e.g., $E=mc^2$)
      - options: array of 4 strings (Use LaTeX for any formulas)
      - answer: the correct string from the options
      - explanation: a short explanation of the answer. (Use LaTeX for any formulas)
      Only return the JSON. No other text.`;
      
      console.log("Generating quiz for:", topic || fileName, "Context length:", pdfContext?.length || 0, "Questions:", numQuestions, "Difficulty:", difficulty);
      const response = await askLumina(prompt, [], 'general');
      
      if (!response) {
        throw new Error("AI returned empty response");
      }

      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const questionsList = JSON.parse(cleanJson);
      
      const docRef = await addDoc(collection(db, 'quizzes'), {
        userId: user?.uid,
        topic: topic || fileName || 'New Quiz',
        questions: questionsList,
        difficulty,
        createdAt: serverTimestamp(),
        score: 0,
        isPdfGenerated: !!pdfContext
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'quizzes'));
      
      setTopic('');
      setPdfContext(null);
      setFileName(null);
      fetchQuizzes();
    } catch (e) {
      console.error("Quiz generation failed", e);
      alert("Apologies, I couldn't generate the quiz. Error: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const startQuiz = (quiz: any) => {
    setActiveQuiz(quiz);
    setCurrentQuestion(0);
    setScore(0);
    setWrongCount(0);
    setQuizFinished(false);
  };

  const handleAnswer = async (answer: string) => {
    const isCorrect = answer === activeQuiz.questions[currentQuestion].answer;
    
    if (isCorrect) {
      setScore(s => s + 1);
    } else {
      setWrongCount(w => w + 1);
    }
    
    if (currentQuestion < activeQuiz.questions.length - 1) {
      setCurrentQuestion(q => q + 1);
    } else {
      setQuizFinished(true);
      // Save attempt
      const finalScore = isCorrect ? score + 1 : score;
      const finalWrong = isCorrect ? wrongCount : wrongCount + 1;
      
      try {
        await addDoc(collection(db, 'quiz_attempts'), {
          userId: user?.uid,
          quizId: activeQuiz.id,
          topic: activeQuiz.topic,
          correctCount: finalScore,
          incorrectCount: finalWrong,
          totalQuestions: activeQuiz.questions.length,
          scorePercentage: (finalScore / activeQuiz.questions.length) * 100,
          timestamp: serverTimestamp()
        });
        fetchQuizzes();
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'quiz_attempts');
      }
    }
  };

  const getWeeklyStats = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = days.map(day => ({ name: day, score: 0, count: 0 }));
    
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);

    attempts.forEach(attempt => {
      const date = attempt.timestamp?.toDate();
      if (date && date >= startOfWeek) {
        const dayIdx = date.getDay();
        data[dayIdx].score += attempt.scorePercentage;
        data[dayIdx].count += 1;
      }
    });

    return data.map(d => ({
      ...d,
      average: d.count > 0 ? Math.round(d.score / d.count) : 0
    }));
  };

  const weeklyData = getWeeklyStats();

  const deleteQuiz = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this quiz?")) return;
    try {
      await deleteDoc(doc(db, 'quizzes', id))
        .catch(err => handleFirestoreError(err, OperationType.DELETE, `quizzes/${id}`));
      fetchQuizzes();
    } catch (e) {
      console.error(e);
    }
  };

  if (activeQuiz) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-12 animate-in fade-in zoom-in-95 duration-500 text-[#FEFAE0]">
        <header className="flex justify-between items-center bg-[#2C1810] border border-[#3D2B1F] p-6 rounded-[32px] sticky top-4 z-10 shadow-xl shadow-black/40">
          <button onClick={() => setActiveQuiz(null)} className="p-2 hover:bg-black/40 rounded-xl text-[#FEFAE0]/30 hover:text-[#FEFAE0] transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center flex-1">
             <span className="text-[10px] font-bold uppercase tracking-widest text-[#606C38] mb-1 block">Active Quiz</span>
             <h2 className="text-lg font-medium tracking-tight truncate max-w-lg mx-auto">{activeQuiz.topic}</h2>
          </div>
          <div className="text-xs font-bold text-[#FEFAE0] tabular-nums bg-black/40 px-4 py-1.5 rounded-full">
            {currentQuestion + 1} / {activeQuiz.questions.length}
          </div>
        </header>

        {quizFinished ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 space-y-8 bg-[#2C1810] border border-[#3D2B1F] rounded-[48px] shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#606C38]/10 to-transparent pointer-events-none" />
            <div className="relative z-10 space-y-6">
              <div className="w-24 h-24 bg-black/40 border border-[#3D2B1F] rounded-[2.5rem] mx-auto flex items-center justify-center shadow-lg">
                <Trophy className="w-12 h-12 text-[#606C38]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black tracking-tight text-[#FEFAE0]">Mastery Achieved!</h2>
                <p className="text-[#FEFAE0]/40 font-bold uppercase tracking-widest text-xs">Performance Analysis Complete</p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                <div className="bento-card p-6 bg-emerald-950/30 border-emerald-900/40">
                  <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest mb-1">Correct</p>
                  <p className="text-3xl font-black text-emerald-400">{score}</p>
                </div>
                <div className="bento-card p-6 bg-rose-950/30 border-rose-900/40">
                  <p className="text-[10px] font-black text-rose-300 uppercase tracking-widest mb-1">Incorrect</p>
                  <p className="text-3xl font-black text-rose-400">{wrongCount}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-lg font-bold text-[#FEFAE0]">Overall Accuracy: <span className="text-[#606C38]">{(score / activeQuiz.questions.length * 100).toFixed(0)}%</span></p>
                <div className="w-64 h-3 bg-black/40 rounded-full mx-auto overflow-hidden border border-[#3D2B1F]">
                   <div 
                    className="bg-[#606C38] h-full transition-all duration-1000 shadow-lg shadow-[#606C38]/20" 
                    style={{ width: `${(score / activeQuiz.questions.length) * 100}%` }} 
                  />
                </div>
              </div>
            </div>
            <div className="pt-8 relative z-10">
              <button 
                onClick={() => {
                  setActiveQuiz(null);
                  fetchQuizzes();
                }}
                className="bg-[#606C38] text-[#FEFAE0] px-12 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-[#606C38]/80 transition-all shadow-xl"
              >
                Sync with Library
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8 pb-20">
            <motion.div 
              key={currentQuestion}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[#2C1810] border border-[#3D2B1F] p-10 rounded-[40px] space-y-8 shadow-xl shadow-black/20"
            >
              <div className="text-2xl font-light tracking-tight text-[#FEFAE0] leading-relaxed markdown-body">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {activeQuiz.questions[currentQuestion].question}
                </ReactMarkdown>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {activeQuiz.questions[currentQuestion].options.map((option: string) => (
                  <button 
                    key={option}
                    onClick={() => handleAnswer(option)}
                    className="w-full text-left p-6 border border-[#3D2B1F] rounded-[28px] hover:border-[#606C38] hover:bg-[#606C38]/10 transition-all group flex items-center justify-between"
                  >
                    <div className="text-sm font-medium text-[#FEFAE0]/80 group-hover:text-[#FEFAE0] markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {option}
                      </ReactMarkdown>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#FEFAE0]/20 group-hover:text-[#FEFAE0] group-hover:translate-x-1 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700 text-[#FEFAE0]">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#606C38] rounded-2xl flex items-center justify-center shadow-lg shadow-black">
            <Trophy className="w-6 h-6 text-[#FEFAE0]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#FEFAE0]">Quiz Forge</h1>
            <p className="text-xs text-[#FEFAE0]/40 font-bold uppercase tracking-widest leading-none mt-1">Strengthen Mental Neural pathways</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Topic Entry & Upload (Bento Style) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bento-card p-8 shadow-xl shadow-black/20 space-y-8 relative overflow-hidden group border-[#3D2B1F]">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <Trophy className="w-32 h-32 text-[#606C38]" />
            </div>
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#606C38]/10 border border-[#606C38]/20 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[#606C38]" />
                  </div>
                  <h2 className="text-lg font-bold text-[#FEFAE0]">Quiz Generator</h2>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40">Knowledge Topic</label>
                  <input 
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. Modern Physics"
                    className="w-full bg-black/40 border border-[#3D2B1F] rounded-2xl p-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-[#606C38]/10 transition-all text-[#FEFAE0] placeholder:text-[#FEFAE0]/10"
                  />
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-3 h-3 text-[#FEFAE0]/20" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/30">Or Study Material PDF</span>
                  </div>
                  
                  {fileName ? (
                    <div className="flex items-center justify-between p-4 bg-[#606C38]/10 border border-[#606C38]/20 rounded-2xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-[#606C38] shrink-0" />
                        <span className="text-xs font-bold text-[#FEFAE0] truncate">{fileName}</span>
                      </div>
                      <button onClick={clearFile} className="p-1 hover:bg-[#2C1810] rounded-lg text-[#FEFAE0]/30">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#3D2B1F] rounded-2xl cursor-pointer hover:bg-black/20 transition-all hover:border-[#606C38] group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 text-[#FEFAE0]/10 group-hover:text-[#606C38]/50 mb-2" />
                        <p className="text-[10px] font-bold text-[#FEFAE0]/30 uppercase tracking-widest">Upload PDF Asset</p>
                      </div>
                      <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                    </label>
                  )}
                  {isExtracting && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                       <Loader2 className="w-6 h-6 text-[#606C38] animate-spin" />
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-2 border-t border-[#3D2B1F]">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40">Neural Complexity</label>
                    <span className="text-[10px] font-bold text-[#606C38] uppercase px-2 py-0.5 bg-[#606C38]/10 rounded-lg">{difficulty}</span>
                  </div>
                  <div className="flex gap-2">
                    {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setDifficulty(level)}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-tighter border transition-all",
                          difficulty === level 
                            ? "bg-[#606C38] text-[#FEFAE0] border-[#606C38] shadow-lg shadow-black/20" 
                            : "bg-black/20 border-[#3D2B1F] text-[#FEFAE0]/20 hover:border-[#606C38]/30"
                        )}
                      >
                        {level.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40">Question Volume</label>
                    <span className="text-sm font-black text-[#FEFAE0] tabular-nums">{numQuestions}</span>
                  </div>
                  <input 
                    type="range" 
                    min="3" 
                    max="15" 
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                    className="w-full accent-[#606C38] h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
              
              <button 
                onClick={generateQuiz}
                disabled={(!topic.trim() && !pdfContext) || isGenerating || isExtracting}
                className="w-full bg-[#606C38] text-[#FEFAE0] py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-30 transition-all hover:bg-[#606C38]/80 active:scale-[0.98] shadow-lg shadow-black"
              >
                {isGenerating ? (
                  <>Synthesizing Neural Map...</>
                ) : (
                  <>Forge {numQuestions} {difficulty} Queries <TrendingUp className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>

          {/* Weekly Progress Chart */}
          <div className="bento-card p-8 shadow-xl shadow-black/20 space-y-6">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-950/30 border border-emerald-900/40 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-300" />
                </div>
                <h2 className="text-lg font-bold text-[#FEFAE0]">Weekly Progress</h2>
              </div>
            </div>
            
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3D2B1F" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#FEFAE0', opacity: 0.4 }} 
                  />
                  <YAxis hide />
                  <Tooltip 
                     cursor={{ fill: 'transparent' }} 
                     content={({ active, payload }) => {
                       if (active && payload && payload.length) {
                         return (
                           <div className="bg-[#2C1810] text-[#FEFAE0] p-3 rounded-xl shadow-xl border border-[#3D2B1F]">
                             <p className="text-[10px] font-black uppercase mb-1">{payload[0].payload.name}</p>
                             <p className="text-lg font-black">{payload[0].value}% Accuracy</p>
                           </div>
                         );
                       }
                       return null;
                     }}
                  />
                  <Bar dataKey="average" radius={[6, 6, 0, 0]}>
                    {weeklyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.average > 70 ? '#10b981' : entry.average > 40 ? '#606C38' : '#f43f5e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="pt-2 border-t border-[#3D2B1F] flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/30">
               <span>Sun</span>
               <span>Goal: 85%</span>
               <span>Sat</span>
            </div>
          </div>
        </div>

        {/* Previous Quizzes (Bento Style) */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="flex items-center justify-between mb-2">
             <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#FEFAE0]/40">Library Assets</h2>
             <div className="flex items-center gap-2 bento-card p-1.5 rounded-xl bg-[#2C1810]/50 backdrop-blur-sm shadow-none border-[#3D2B1F]">
               <Search className="w-3.5 h-3.5 text-[#FEFAE0]/20 ml-2" />
               <input placeholder="Filter library..." className="bg-transparent border-none focus:outline-none text-[10px] font-bold uppercase tracking-wider text-[#FEFAE0] w-40" />
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              [1, 2, 3, 4].map(i => <div key={i} className="h-48 bento-card animate-pulse shadow-none opacity-50" />)
            ) : quizzes.length > 0 ? (
              quizzes.map((quiz, i) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  key={quiz.id} 
                  className="bento-card p-8 space-y-6 bento-card-hover cursor-pointer group"
                >
                  <div className="flex justify-between items-start">
                    <div className="w-12 h-12 bg-black/40 border border-[#3D2B1F] rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#606C38] transition-colors">
                      <HelpCircle className="w-6 h-6 text-[#FEFAE0]/20 group-hover:text-[#FEFAE0]" />
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                       <span className="text-[9px] uppercase tracking-widest font-black text-[#FEFAE0]/30 block">{formatDate(quiz.createdAt?.toDate())}</span>
                       <button 
                         onClick={(e) => deleteQuiz(quiz.id, e)}
                         className="p-1.5 hover:bg-rose-950/30 text-rose-300/40 hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-rose-900/50"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                       <span className="text-[9px] uppercase tracking-widest font-black text-[#606C38] bg-[#606C38]/10 px-2 py-0.5 rounded-lg border border-[#606C38]/30">{quiz.questions?.length || 0} Queries</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#FEFAE0] line-clamp-1 group-hover:text-[#606C38] transition-colors">{quiz.topic}</h3>
                    <p className="text-[10px] text-[#FEFAE0]/40 font-black uppercase tracking-widest">Global Mastery: {quiz.score || 0}/{quiz.questions?.length || 0}</p>
                  </div>
                  <button 
                    onClick={() => startQuiz(quiz)}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-black/40 border border-[#3D2B1F] group-hover:bg-[#606C38] group-hover:text-[#FEFAE0] rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Initiate Challenge <ChevronRight className="w-3 h-3" />
                  </button>
                </motion.div>
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 py-32 text-center space-y-8 bento-card border-dashed border-[#3D2B1F] bg-transparent shadow-none">
                <div className="w-20 h-20 bg-[#2C1810] rounded-[2rem] mx-auto flex items-center justify-center border border-[#3D2B1F]">
                  <Moon className="w-12 h-12 text-[#606C38] fill-current" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-[#FEFAE0]">Empty Library</h3>
                  <p className="text-[10px] text-[#FEFAE0]/30 font-black uppercase tracking-widest">Forging your first quiz will populate this archive.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
