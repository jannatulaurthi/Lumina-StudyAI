import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Sparkles, 
  BrainCircuit, 
  Zap, 
  BookOpen, 
  Code2, 
  Loader2, 
  User, 
  Moon, 
  ZapIcon, 
  Bot, 
  Sliders, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  Mic, 
  Square, 
  ArrowRight,
  Settings,
  ChevronDown,
  Info,
  Flame,
  MessageSquare,
  Volume2
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useAuth } from './Auth';
import { 
  GEMINI_CHAT_MODELS, 
  CHAT_ROLE_PRESETS, 
  GeminiModelId, 
  ChatMessage, 
  streamChatResponse 
} from '../lib/gemini';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc, increment, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface ChatSession {
  id: string;
  title: string;
  model: GeminiModelId;
  roleId: string;
  updatedAt: number;
}

interface TutorProps {
  onOpenVoiceMode?: () => void;
}

export const Tutor: React.FC<TutorProps> = ({ onOpenVoiceMode }) => {
  const { profile, user } = useAuth();
  
  // Model selection state
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>('gemini-3.5-flash');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('socratic');
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [isCustomRole, setIsCustomRole] = useState(false);

  // Chat conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showRoleConfig, setShowRoleConfig] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);

  // Chat sessions list
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('default');
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Record tutor visit telemetry
  useEffect(() => {
    const recordVisit = async () => {
      if (profile?.uid) {
        try {
          const userDoc = doc(db, 'profiles', profile.uid);
          await updateDoc(userDoc, {
            tutorVisits: increment(1)
          });
        } catch (error) {
          console.error("Failed to update visit count", error);
        }
      }
    };
    recordVisit();
  }, [profile?.uid]);

  // Load chat sessions from local storage / state
  useEffect(() => {
    const savedSessions = localStorage.getItem(`lumina_chat_sessions_${user?.uid || 'guest'}`);
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
          const savedMsgs = localStorage.getItem(`lumina_chat_msgs_${parsed[0].id}`);
          if (savedMsgs) {
            setMessages(JSON.parse(savedMsgs));
          }
        }
      } catch (e) {
        console.error('Error loading sessions', e);
      }
    }
  }, [user?.uid]);

  // Save active messages
  const saveCurrentMessages = (msgs: ChatMessage[], sessId: string) => {
    localStorage.setItem(`lumina_chat_msgs_${sessId}`, JSON.stringify(msgs));
  };

  // Get active system instruction
  const getActiveSystemInstruction = () => {
    if (isCustomRole && customSystemInstruction.trim()) {
      return customSystemInstruction.trim();
    }
    const preset = CHAT_ROLE_PRESETS.find(r => r.id === selectedRoleId) || CHAT_ROLE_PRESETS[0];
    return preset.systemInstruction;
  };

  const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {
    e?.preventDefault();
    const textToSend = customText !== undefined ? customText : input;
    if (!textToSend.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now(),
      modelUsed: selectedModel
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsGenerating(true);

    const botMessageId = (Date.now() + 1).toString();
    const initialBotMessage: ChatMessage = {
      id: botMessageId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
      modelUsed: selectedModel
    };

    setMessages([...newMessages, initialBotMessage]);

    abortControllerRef.current = new AbortController();

    try {
      const historyForApi = newMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const activeInstruction = getActiveSystemInstruction();

      const finalResponse = await streamChatResponse(
        historyForApi,
        selectedModel,
        activeInstruction,
        (currentStreamText) => {
          setMessages(prev => 
            prev.map(m => m.id === botMessageId ? { ...m, content: currentStreamText } : m)
          );
        },
        abortControllerRef.current.signal
      );

      const updatedList = newMessages.map(m => m).concat({
        id: botMessageId,
        role: 'model',
        content: finalResponse,
        timestamp: Date.now(),
        modelUsed: selectedModel
      });

      setMessages(updatedList);
      saveCurrentMessages(updatedList, activeSessionId);

      // Update session title if first exchange
      if (messages.length === 0) {
        const title = textToSend.slice(0, 30) + (textToSend.length > 30 ? '...' : '');
        const updatedSessions = sessions.map(s => s.id === activeSessionId ? { ...s, title, updatedAt: Date.now() } : s);
        if (!sessions.some(s => s.id === activeSessionId)) {
          updatedSessions.unshift({
            id: activeSessionId,
            title,
            model: selectedModel,
            roleId: selectedRoleId,
            updatedAt: Date.now()
          });
        }
        setSessions(updatedSessions);
        localStorage.setItem(`lumina_chat_sessions_${user?.uid || 'guest'}`, JSON.stringify(updatedSessions));
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream stopped by user');
      } else {
        console.error('Chat error:', err);
        setMessages(prev => prev.map(m => 
          m.id === botMessageId 
            ? { ...m, content: m.content || `⚠️ Error: ${err.message || 'Unable to get response from Gemini'}. Please try again.` } 
            : m
        ));
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  const handleNewChat = () => {
    const newId = 'session_' + Date.now();
    setActiveSessionId(newId);
    setMessages([]);
    localStorage.setItem(`lumina_chat_msgs_${newId}`, JSON.stringify([]));
    const newSession: ChatSession = {
      id: newId,
      title: 'New Study Conversation',
      model: selectedModel,
      roleId: selectedRoleId,
      updatedAt: Date.now()
    };
    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    localStorage.setItem(`lumina_chat_sessions_${user?.uid || 'guest'}`, JSON.stringify(updatedSessions));
    setShowSessionDrawer(false);
  };

  const handleSelectSession = (sessId: string) => {
    setActiveSessionId(sessId);
    const savedMsgs = localStorage.getItem(`lumina_chat_msgs_${sessId}`);
    setMessages(savedMsgs ? JSON.parse(savedMsgs) : []);
    setShowSessionDrawer(false);
  };

  const handleDeleteSession = (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter(s => s.id !== sessId);
    setSessions(filtered);
    localStorage.setItem(`lumina_chat_sessions_${user?.uid || 'guest'}`, JSON.stringify(filtered));
    localStorage.removeItem(`lumina_chat_msgs_${sessId}`);
    if (activeSessionId === sessId) {
      if (filtered.length > 0) {
        handleSelectSession(filtered[0].id);
      } else {
        handleNewChat();
      }
    }
  };

  const handleCopyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const activeModelObj = GEMINI_CHAT_MODELS.find(m => m.id === selectedModel) || GEMINI_CHAT_MODELS[0];
  const activeRoleObj = CHAT_ROLE_PRESETS.find(r => r.id === selectedRoleId) || CHAT_ROLE_PRESETS[0];

  return (
    <div className="flex flex-col h-full bg-black text-[#FEFAE0] overflow-hidden">
      {/* Header */}
      <header className="min-h-16 py-2 border-b border-[#3D2B1F] bg-black/90 backdrop-blur-md flex flex-wrap items-center justify-between px-3 sm:px-6 md:px-8 shrink-0 z-20 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#606C38] flex items-center justify-center text-[#FEFAE0] shadow-md shadow-[#606C38]/20 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#FEFAE0]">LuminaBot</h1>
                <span className="hidden sm:inline-block text-[9px] uppercase font-black tracking-widest text-[#606C38] bg-[#606C38]/10 px-2 py-0.5 rounded-lg border border-[#606C38]/30">
                  {activeModelObj.badge}
                </span>
              </div>
            </div>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#3D2B1F]" />

          {/* Model Switcher Pill */}
          <div className="relative">
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#2C1810] border border-[#3D2B1F] hover:border-[#606C38] transition-all text-xs font-bold"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#606C38]" />
              <span className="max-w-[100px] sm:max-w-none truncate">{activeModelObj.name}</span>
              <ChevronDown className={cn("w-3 h-3 text-[#FEFAE0]/40 transition-transform", showModelMenu && "rotate-180")} />
            </button>

            {/* Model Dropdown Menu */}
            <AnimatePresence>
              {showModelMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute left-0 mt-2 w-72 sm:w-80 bg-[#160D08] border border-[#3D2B1F] rounded-2xl shadow-2xl p-2 z-50 space-y-1"
                >
                  <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-[#FEFAE0]/40">
                    Select Lumina Model Engine
                  </div>
                  {GEMINI_CHAT_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelMenu(false);
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-all flex flex-col gap-1 border",
                        selectedModel === model.id
                          ? "bg-[#606C38] border-[#606C38] text-[#FEFAE0] shadow-md"
                          : "bg-black/30 border-transparent hover:border-[#3D2B1F] text-[#FEFAE0]/70 hover:text-[#FEFAE0]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{model.name}</span>
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase",
                          selectedModel === model.id ? "bg-black/30 text-[#FEFAE0]" : "bg-[#2C1810] text-[#606C38]"
                        )}>
                          {model.badge}
                        </span>
                      </div>
                      <p className="text-[10px] opacity-80 leading-tight">{model.description}</p>
                      <div className="flex items-center gap-3 text-[9px] opacity-60 font-semibold mt-0.5">
                        <span>Speed: {model.speed}</span>
                        <span>•</span>
                        <span>Reasoning: {model.reasoning}</span>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Role Config Toggle */}
          <button
            onClick={() => setShowRoleConfig(!showRoleConfig)}
            className={cn(
              "px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5",
              showRoleConfig
                ? "bg-[#2C1810] border-[#606C38] text-[#FEFAE0]"
                : "bg-black border-[#3D2B1F] text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
            )}
          >
            <Sliders className="w-3.5 h-3.5 text-[#606C38]" />
            <span className="hidden sm:inline">Role: {isCustomRole ? 'Custom' : activeRoleObj.name}</span>
            <span className="sm:hidden">{isCustomRole ? 'Custom' : activeRoleObj.name.split(' ')[0]}</span>
          </button>

          {/* Switch to Live Voice Mode */}
          {onOpenVoiceMode && (
            <button
              onClick={onOpenVoiceMode}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#606C38] to-[#283618] border border-[#606C38]/60 text-xs font-bold text-[#FEFAE0] hover:scale-105 transition-all shadow-md flex items-center gap-1.5"
            >
              <Mic className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
              <span>LuminaVoice</span>
            </button>
          )}

          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="p-1.5 sm:p-2 rounded-xl bg-[#2C1810] border border-[#3D2B1F] text-[#FEFAE0]/80 hover:text-[#FEFAE0] hover:border-[#606C38] transition-all"
            title="Start New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Session history toggle */}
          <button
            onClick={() => setShowSessionDrawer(!showSessionDrawer)}
            className={cn(
              "p-1.5 sm:p-2 rounded-xl border transition-all",
              showSessionDrawer 
                ? "bg-[#606C38] border-[#606C38] text-[#FEFAE0]" 
                : "bg-[#2C1810] border-[#3D2B1F] text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
            )}
            title="Chat History Threads"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Role / Persona Configuration Bar */}
      <AnimatePresence>
        {showRoleConfig && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-[#3D2B1F] bg-[#160D08] px-4 sm:px-8 py-4 shrink-0 overflow-hidden"
          >
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/50">
                  Select LuminaBot Persona & System Instruction
                </span>
                <button
                  onClick={() => setIsCustomRole(!isCustomRole)}
                  className="text-[10px] font-bold text-[#606C38] hover:underline uppercase tracking-wider"
                >
                  {isCustomRole ? '← Choose Preset Roles' : '✏️ Write Custom System Prompt'}
                </button>
              </div>

              {!isCustomRole ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {CHAT_ROLE_PRESETS.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRoleId(role.id)}
                      className={cn(
                        "p-2.5 sm:p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5",
                        selectedRoleId === role.id
                          ? "bg-[#606C38] border-[#606C38] text-[#FEFAE0] shadow-md"
                          : "bg-black/40 border-[#3D2B1F] text-[#FEFAE0]/60 hover:border-[#606C38]/40 hover:text-[#FEFAE0]"
                      )}
                    >
                      <div className="text-xs font-bold leading-tight">{role.name}</div>
                      <div className="text-[9px] opacity-70 leading-snug line-clamp-2">{role.tagline}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={customSystemInstruction}
                    onChange={(e) => setCustomSystemInstruction(e.target.value)}
                    placeholder="Provide custom system instructions to define LuminaBot's exact persona, grading strictness, subject expertise, and tone..."
                    className="w-full bg-black/60 border border-[#3D2B1F] rounded-xl p-3 text-xs text-[#FEFAE0] focus:outline-none focus:border-[#606C38]"
                  />
                  <p className="text-[9px] text-[#FEFAE0]/40">
                    System instruction is injected into every turn of this multi-turn conversation.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Conversation Canvas with Session Drawer */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Session Drawer */}
        <AnimatePresence>
          {showSessionDrawer && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r border-[#3D2B1F] bg-[#0E0704] flex flex-col h-full shrink-0 overflow-hidden z-10"
            >
              <div className="p-4 border-b border-[#3D2B1F] flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#FEFAE0]">Conversations</span>
                <button
                  onClick={handleNewChat}
                  className="px-2.5 py-1 rounded-lg bg-[#606C38] text-[#FEFAE0] text-[10px] font-bold flex items-center gap-1 hover:scale-105 transition-all"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
                {sessions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#FEFAE0]/30">No saved sessions yet</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSession(s.id)}
                      className={cn(
                        "p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between group",
                        activeSessionId === s.id
                          ? "bg-[#2C1810] border-[#606C38] text-[#FEFAE0]"
                          : "bg-black/30 border-transparent hover:border-[#3D2B1F] text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold truncate">{s.title || 'Study Session'}</p>
                        <p className="text-[9px] opacity-40 uppercase tracking-tighter">{s.model}</p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-opacity"
                        title="Delete chat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable Message Thread */}
        <main className="flex-1 overflow-y-auto px-3 sm:px-6 md:px-12 py-6 space-y-6 scroll-smooth bg-black no-scrollbar">
          {messages.length === 0 && (
            <div className="max-w-2xl mx-auto text-center space-y-6 sm:space-y-8 py-8 sm:py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#2C1810] border border-[#3D2B1F] rounded-[2rem] mx-auto flex items-center justify-center mb-2 shadow-xl shadow-black/40">
                <Moon className="text-[#606C38] w-8 h-8 sm:w-10 sm:h-10 fill-current" />
              </div>
              <div className="space-y-3 px-2">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#FEFAE0]">
                  How can LuminaBot assist your study today?
                </h2>
                <p className="text-xs sm:text-sm font-medium text-[#FEFAE0]/50 max-w-md mx-auto leading-relaxed">
                  Active Persona: <span className="text-[#606C38] font-bold uppercase tracking-widest">{isCustomRole ? 'Custom Persona' : activeRoleObj.name}</span> • Powered by <span className="text-[#FEFAE0] font-bold">{activeModelObj.name}</span>
                </p>
              </div>

              {/* Starter Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                {[
                  { q: "Explain the Fourier Transform using intuitive visual analogies", model: 'gemini-3.5-flash' },
                  { q: "Prove mathematically why NP-complete problems are verifiable in polynomial time", model: 'gemini-3.1-pro-preview' },
                  { q: "Quick active recall drill on Cell Respiration and Krebs Cycle", model: 'gemini-3.1-flash-lite' },
                  { q: "Help debug this async JavaScript concurrency pattern step-by-step", model: 'gemini-3.1-pro-preview' }
                ].map((item, idx) => (
                  <button 
                    key={idx}
                    onClick={() => {
                      setSelectedModel(item.model as GeminiModelId);
                      handleSendMessage(undefined, item.q);
                    }}
                    className="p-3.5 sm:p-4 bg-[#160D08]/60 border border-[#3D2B1F] rounded-2xl text-left text-xs font-semibold text-[#FEFAE0]/70 hover:border-[#606C38] hover:text-[#FEFAE0] hover:bg-[#2C1810]/50 transition-all group shadow-sm flex items-center justify-between"
                  >
                    <span className="line-clamp-2 pr-2">{item.q}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0 text-[#606C38] group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message List */}
          {messages.map((message, i) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={message.id || i}
              className={cn(
                "flex gap-2.5 sm:gap-4 max-w-3xl mx-auto group",
                message.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              <div className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md",
                message.role === 'user' 
                  ? "bg-[#606C38] text-[#FEFAE0]" 
                  : "bg-[#2C1810] border border-[#3D2B1F] text-[#606C38]"
              )}>
                {message.role === 'user' ? (
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </div>

              {/* Message Bubble */}
              <div className="flex-1 max-w-[92%] sm:max-w-[88%] space-y-1">
                <div className="flex items-center gap-2 px-1 text-[9px] font-black uppercase tracking-widest text-[#FEFAE0]/30">
                  <span>{message.role === 'user' ? 'You' : 'LuminaBot'}</span>
                  {message.modelUsed && message.role === 'model' && (
                    <span className="text-[#606C38]">({message.modelUsed})</span>
                  )}
                </div>

                <div className={cn(
                  "p-4 sm:p-5 rounded-2xl text-xs sm:text-sm leading-relaxed border relative",
                  message.role === 'user' 
                    ? "bg-[#606C38] text-[#FEFAE0] rounded-tr-none border-[#606C38]/60 shadow-lg shadow-black/20" 
                    : "bg-[#1C120C] text-[#FEFAE0]/90 border-[#3D2B1F] rounded-tl-none font-medium shadow-xl shadow-black/40"
                )}>
                  {message.role === 'model' ? (
                    <div className="markdown-body prose prose-invert max-w-none text-xs sm:text-sm space-y-3">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {message.content}
                      </Markdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}

                  {/* Copy Button */}
                  {message.role === 'model' && message.content && (
                    <button
                      onClick={() => handleCopyMessage(message.content, i)}
                      className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1.5 bg-[#2C1810] border border-[#3D2B1F] rounded-lg text-[#FEFAE0]/50 hover:text-[#FEFAE0] transition-all"
                      title="Copy response"
                    >
                      {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Loading Indicator */}
          {isGenerating && messages[messages.length - 1]?.role !== 'model' && (
            <div className="flex gap-3 max-w-3xl mx-auto items-center">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#2C1810] border border-[#3D2B1F] flex items-center justify-center shadow-md shrink-0">
                <Loader2 className="w-4 h-4 text-[#606C38] animate-spin" />
              </div>
              <div className="flex items-center gap-2 bg-[#2C1810] px-3.5 py-2 rounded-2xl border border-[#3D2B1F] text-xs text-[#FEFAE0]/60">
                <span className="w-2 h-2 rounded-full bg-[#606C38] animate-ping" />
                <span>Thinking with {activeModelObj.name}...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>
      </div>

      {/* Input Control Area */}
      <div className="px-3 sm:px-6 md:px-12 pb-4 pt-2 bg-black border-t border-[#3D2B1F]/60">
        <form 
          onSubmit={handleSendMessage}
          className="max-w-3xl mx-auto relative"
        >
          <div className="bento-card p-1.5 sm:p-2 flex items-center gap-2 pr-2 sm:pr-3 shadow-2xl shadow-black/80 bg-[#160D08] border-[#3D2B1F]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask LuminaBot anything using ${activeModelObj.name}...`}
              className="flex-1 bg-transparent px-2.5 sm:px-3 py-2.5 sm:py-3 focus:outline-none text-xs sm:text-sm font-medium text-[#FEFAE0] placeholder-[#FEFAE0]/30"
              disabled={isGenerating}
            />

            {isGenerating ? (
              <button 
                type="button"
                onClick={handleStopGeneration}
                className="bg-rose-900/60 border border-rose-600 text-rose-200 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl text-xs font-bold transition-all hover:bg-rose-800 flex items-center gap-1.5 shadow-lg"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button 
                type="submit"
                disabled={!input.trim()}
                className="bg-[#606C38] text-[#FEFAE0] p-2.5 sm:p-3 rounded-xl disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black"
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        <div className="flex items-center justify-between max-w-3xl mx-auto mt-2 text-[8px] sm:text-[9px] text-[#FEFAE0]/30 font-bold uppercase tracking-widest px-1">
          <span className="truncate max-w-[60%]">Active: {activeModelObj.id}</span>
          <span className="truncate max-w-[40%] text-right">{isCustomRole ? 'Custom' : activeRoleObj.name}</span>
        </div>
      </div>
    </div>
  );
};
