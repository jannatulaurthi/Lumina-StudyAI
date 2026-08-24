import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  Sparkles, 
  Square, 
  Play, 
  RefreshCw, 
  Radio, 
  AlertCircle, 
  MessageSquare,
  AudioWaveform,
  BookOpen,
  Lightbulb,
  CheckCircle2,
  Copy,
  Check,
  Bookmark,
  Tag,
  HelpCircle,
  Search,
  Zap,
  Flame,
  ArrowRight
} from 'lucide-react';
import { float32ToPcm16Base64, pcm16Base64ToAudioBuffer } from '../lib/gemini';
import { useAuth } from './Auth';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export interface TranscriptItem {
  id: string;
  sender: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface TaughtConcept {
  id: string;
  title: string;
  category: 'Concept' | 'Formula' | 'Key Takeaway' | 'Definition' | 'Example' | 'Rule';
  summary: string;
  details?: string[];
  codeOrMath?: string;
  timestamp: string;
}

interface VoiceLiveTutorProps {
  onSwitchToChat?: () => void;
}

export const VoiceLiveTutor: React.FC<VoiceLiveTutorProps> = ({ onSwitchToChat }) => {
  const { user, profile } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string>('Interactive Voice Learning');
  const [modelSpeaking, setModelSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Ready to start conversation with Puck');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [liveUserText, setLiveUserText] = useState('');
  const [liveModelText, setLiveModelText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Right Panel State (Topics & Live Knowledge Board)
  const [rightPanelTab, setRightPanelTab] = useState<'topics' | 'transcript'>('topics');
  const [taughtConcepts, setTaughtConcepts] = useState<TaughtConcept[]>([]);
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isExtracting, setIsExtracting] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
    "Can you give me a real-world example of this?",
    "How does this formula or principle work step by step?",
    "What are common pitfalls or mistakes to avoid?",
    "Can you quiz me on what you just explained?"
  ]);

  // Audio & WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const accumulatedSpeechRef = useRef<string>('');
  const extractDebounceTimerRef = useRef<any>(null);

  // Keep isMuted ref synchronized
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, liveUserText, liveModelText]);

  // Call Server-Side AI Knowledge Extractor (gemini-3.1-flash-lite)
  const triggerLiveKnowledgeExtraction = useCallback(async (spokenContext: string, currentTranscripts: TranscriptItem[]) => {
    if (!spokenContext && currentTranscripts.length === 0) return;
    setIsExtracting(true);

    try {
      const res = await fetch('/api/live/extract-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spokenText: spokenContext,
          conversationHistory: currentTranscripts.slice(-6)
        })
      });

      if (!res.ok) throw new Error('Topic extraction failed');

      const data = await res.json();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (data.topicTitle && data.topicTitle !== 'Interactive Voice Learning') {
        setActiveTopic(data.topicTitle);
      }

      if (Array.isArray(data.concepts) && data.concepts.length > 0) {
        const formattedNewConcepts: TaughtConcept[] = data.concepts.map((c: any) => ({
          id: 'concept-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          title: c.title || 'Core Concept',
          category: c.category || 'Concept',
          summary: c.summary || '',
          codeOrMath: c.codeOrMath || undefined,
          timestamp: timeStr
        }));

        setTaughtConcepts(prev => {
          // Avoid duplicate concepts with same title
          const existingTitles = new Set(prev.map(p => p.title.toLowerCase()));
          const uniqueNew = formattedNewConcepts.filter(c => !existingTitles.has(c.title.toLowerCase()));
          return [...uniqueNew, ...prev];
        });
      }

      if (Array.isArray(data.takeaways) && data.takeaways.length > 0) {
        setKeyTakeaways(prev => Array.from(new Set([...data.takeaways, ...prev])));
      }

      if (Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length > 0) {
        setSuggestedQuestions(data.suggestedQuestions);
      }
    } catch (err) {
      console.warn('[Extraction Warning]', err);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  // Instant Local Heuristic Parser for Real-time Card Generation while speaking
  const parseLocalConcepts = useCallback((spokenText: string) => {
    if (!spokenText || spokenText.length < 15) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sentences = spokenText.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 15);
    const newItems: TaughtConcept[] = [];
    const newTakeaways: string[] = [];

    sentences.forEach((sentence) => {
      const lower = sentence.toLowerCase();

      // Formulas or Mathematical expressions
      if (
        sentence.includes('=') || 
        sentence.includes('formula') || 
        sentence.includes('equation') || 
        sentence.includes('theorem') || 
        /\b[EekmfcOvxy]\s*=\s*/.test(sentence) || 
        sentence.includes('O(') || 
        sentence.includes('dx')
      ) {
        newItems.push({
          id: 'concept-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title: 'Formula / Mathematical Principle',
          category: 'Formula',
          summary: sentence,
          codeOrMath: sentence.match(/[^.?!]+(?:=|\b(?:formula|equation|is given by)\b)[^.?!]+/i)?.[0] || sentence,
          timestamp: timeStr
        });
      }
      // Definitions
      else if (
        lower.includes('is defined as') || 
        lower.includes('refers to') || 
        lower.includes('is called') || 
        lower.includes('means that') || 
        lower.includes('is essentially')
      ) {
        const titleMatch = sentence.match(/(?:The\s+)?([A-Za-z\s]{3,30}?)\s+(?:is defined as|refers to|means|is essentially|is called)/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Core Definition';
        newItems.push({
          id: 'concept-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title: title.charAt(0).toUpperCase() + title.slice(1),
          category: 'Definition',
          summary: sentence,
          timestamp: timeStr
        });
      }
      // Key Takeaways & Rules
      else if (
        lower.includes('key point') || 
        lower.includes('remember that') || 
        lower.includes('important rule') || 
        lower.includes('takeaway') || 
        lower.includes('in summary') ||
        lower.includes('fundamental principle')
      ) {
        newTakeaways.push(sentence);
        newItems.push({
          id: 'concept-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title: 'Key Rule & Principle',
          category: 'Key Takeaway',
          summary: sentence,
          timestamp: timeStr
        });
      }
      // Examples & Analogies
      else if (
        lower.includes('for example') || 
        lower.includes('imagine that') || 
        lower.includes('consider a case') || 
        lower.includes('an analogy is')
      ) {
        newItems.push({
          id: 'concept-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title: 'Illustrative Example & Analogy',
          category: 'Example',
          summary: sentence,
          timestamp: timeStr
        });
      }
    });

    if (newItems.length > 0) {
      setTaughtConcepts(prev => {
        const existingSummaries = new Set(prev.map(p => p.summary.slice(0, 30)));
        const unique = newItems.filter(item => !existingSummaries.has(item.summary.slice(0, 30)));
        return [...unique, ...prev];
      });
    }

    if (newTakeaways.length > 0) {
      setKeyTakeaways(prev => Array.from(new Set([...newTakeaways, ...prev])));
    }
  }, []);

  // Stop and cleanup everything
  const stopLiveSession = useCallback(() => {
    console.log('[Live] Stopping audio session');
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (_) {}
      speechRecognitionRef.current = null;
    }

    // Stop microphone processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }

    // Stop audio output
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch (_) {}
    });
    activeSourcesRef.current = [];

    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }

    if (extractDebounceTimerRef.current) {
      clearTimeout(extractDebounceTimerRef.current);
    }

    setIsConnected(false);
    setIsConnecting(false);
    setModelSpeaking(false);
    setUserSpeaking(false);
    setAudioLevel(0);
    setStatusMessage('Session ended');
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, [stopLiveSession]);

  // Handle interruption
  const handleInterruption = useCallback(() => {
    console.log('[Live] Model interrupted by user');
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch (_) {}
    });
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    setModelSpeaking(false);
  }, []);

  // Start live session with single voice (Puck)
  const startLiveSession = async () => {
    setErrorMsg(null);
    setIsConnecting(true);
    setStatusMessage('Connecting to LuminaVoice (Voice: Puck)...');

    try {
      // 1. Setup Web Audio contexts
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });

      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }

      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      // 2. Request user microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // 3. Connect WebSocket to server
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Live WS] Connected to backend');
        setStatusMessage('Starting live voice session with Puck...');

        const systemInstruction = `You are Lumina, a warm, lively, and highly articulate AI voice study tutor with the Puck persona. Student profile: ${profile?.learningStyle || 'Interactive'}. Teach clearly with structured concepts, intuitive real-world analogies, concise explanations, key formulas, and practical takeaways. Keep your answers conversational, natural, direct, punchy, and engaging for live voice speech. Highlight the subject title and key rules clearly.`;

        // Send start configuration with Puck voice strictly
        ws.send(JSON.stringify({
          type: 'start',
          voice: 'Puck',
          systemInstruction
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connected') {
            setIsConnecting(false);
            setIsConnected(true);
            setStatusMessage('LuminaVoice Live (Puck) • Speak freely');
          }

          // Handle incoming 24kHz audio chunk from Gemini Live
          if (data.type === 'audio' && data.audio) {
            setModelSpeaking(true);
            if (outputAudioCtxRef.current) {
              const audioBuffer = pcm16Base64ToAudioBuffer(data.audio, outputAudioCtxRef.current);
              const source = outputAudioCtxRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioCtxRef.current.destination);

              const now = outputAudioCtxRef.current.currentTime;
              const startTime = Math.max(now, nextStartTimeRef.current);
              source.start(startTime);
              nextStartTimeRef.current = startTime + audioBuffer.duration;

              activeSourcesRef.current.push(source);
              source.onended = () => {
                const idx = activeSourcesRef.current.indexOf(source);
                if (idx > -1) activeSourcesRef.current.splice(idx, 1);
                if (activeSourcesRef.current.length === 0) {
                  setModelSpeaking(false);
                }
              };
            }
          }

          // Real-time text outputs from tutor
          if (data.type === 'outputTranscription' || data.type === 'modelText') {
            const textChunk = data.text || '';
            setLiveModelText(prev => prev + textChunk);
            accumulatedSpeechRef.current += textChunk;

            // Run instant local parser as words stream in
            parseLocalConcepts(accumulatedSpeechRef.current);

            // Debounced AI extraction
            if (extractDebounceTimerRef.current) {
              clearTimeout(extractDebounceTimerRef.current);
            }
            extractDebounceTimerRef.current = setTimeout(() => {
              triggerLiveKnowledgeExtraction(accumulatedSpeechRef.current, transcripts);
            }, 1200);
          }

          if (data.type === 'inputTranscription') {
            const textChunk = data.text || '';
            setLiveUserText(prev => prev + textChunk);
          }

          if (data.type === 'interrupted') {
            handleInterruption();
          }

          if (data.type === 'turnComplete') {
            setModelSpeaking(false);
            const fullTurnModelText = liveModelText.trim() || accumulatedSpeechRef.current.trim();
            
            // Commit live text to transcript history
            if (fullTurnModelText) {
              const newModelItem: TranscriptItem = {
                id: Date.now().toString() + '-model',
                sender: 'model',
                text: fullTurnModelText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              };

              setTranscripts(prev => [...prev, newModelItem]);
              
              // Extract structured concepts from this turn for the Right Panel
              parseLocalConcepts(fullTurnModelText);
              triggerLiveKnowledgeExtraction(fullTurnModelText, [...transcripts, newModelItem]);
              
              setLiveModelText('');
              accumulatedSpeechRef.current = '';
            }

            if (liveUserText.trim()) {
              const newUserItem: TranscriptItem = {
                id: Date.now().toString() + '-user',
                sender: 'user',
                text: liveUserText.trim(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              };
              setTranscripts(prev => [...prev, newUserItem]);
              triggerLiveKnowledgeExtraction(liveUserText.trim(), [...transcripts, newUserItem]);
              setLiveUserText('');
            }
          }

          if (data.type === 'error') {
            console.error('[Live WS Error]', data.message);
            setErrorMsg(data.message);
            setStatusMessage('Error in LuminaVoice session');
          }
        } catch (e) {
          console.error('Error handling WS message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[Live WS Error event]', err);
        setErrorMsg('WebSocket connection failed. Please ensure the server is active.');
        stopLiveSession();
      };

      ws.onclose = () => {
        console.log('[Live WS Closed]');
        setIsConnected(false);
        setIsConnecting(false);
      };

      // 4. Setup microphone audio processing (16kHz PCM stream to server)
      const micSource = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          setUserSpeaking(false);
          setAudioLevel(0);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate audio RMS level for visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setAudioLevel(Math.min(100, Math.round(rms * 400)));
        setUserSpeaking(rms > 0.02);

        // Convert to PCM16 Base64 and send
        const pcmBase64 = float32ToPcm16Base64(inputData);
        wsRef.current.send(JSON.stringify({
          type: 'audio',
          audio: pcmBase64
        }));
      };

      micSource.connect(processor);
      processor.connect(inputCtx.destination);

      // 5. Browser Speech Recognition (Web Speech API) for real-time speech transcription & immediate knowledge extraction
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (interimTranscript) {
            setLiveUserText(interimTranscript);
          }

          if (finalTranscript) {
            const trimmed = finalTranscript.trim();
            setLiveUserText('');
            if (trimmed) {
              setTranscripts(prev => [
                ...prev,
                {
                  id: Date.now().toString() + '-user',
                  sender: 'user',
                  text: trimmed,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
              ]);
              triggerLiveKnowledgeExtraction(trimmed, transcripts);
            }
          }
        };

        recognition.onerror = (e: any) => {
          console.warn('[Web Speech Recognition warning]:', e?.error);
        };

        try {
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (_) {}
      }

    } catch (err: any) {
      console.error('[Live Setup Failure]:', err);
      setErrorMsg(err?.message || 'Failed to initialize microphone or LuminaVoice session.');
      stopLiveSession();
    }
  };

  const handleInterruptClick = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: '[Student interrupted]' }));
    }
    handleInterruption();
  };

  // Copy helper
  const handleCopyConcept = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Save all learned concepts to Firestore / Study Notes
  const handleSaveToNotes = async () => {
    if (taughtConcepts.length === 0 && transcripts.length === 0) return;
    setSaveStatus('saving');

    try {
      const topicName = activeTopic || 'LuminaVoice Study Session';
      let contentMarkdown = `# 🎙️ LuminaVoice Session: ${topicName}\n\n`;
      contentMarkdown += `**Date:** ${new Date().toLocaleDateString()} | **Voice Persona:** Puck\n\n`;

      if (keyTakeaways.length > 0) {
        contentMarkdown += `## 🎯 Key Takeaways & Principles\n\n`;
        keyTakeaways.forEach(t => {
          contentMarkdown += `- ${t}\n`;
        });
        contentMarkdown += `\n---\n\n`;
      }

      if (taughtConcepts.length > 0) {
        contentMarkdown += `## 📚 Concepts Taught by LuminaVoice (Puck)\n\n`;
        taughtConcepts.forEach((c, idx) => {
          contentMarkdown += `### ${idx + 1}. [${c.category}] ${c.title}\n`;
          contentMarkdown += `${c.summary}\n\n`;
          if (c.codeOrMath) {
            contentMarkdown += `\`\`\`\n${c.codeOrMath}\n\`\`\`\n\n`;
          }
        });
        contentMarkdown += `\n---\n\n`;
      }

      if (transcripts.length > 0) {
        contentMarkdown += `## 💬 Live Audio Transcript\n\n`;
        transcripts.forEach(t => {
          contentMarkdown += `**${t.sender === 'user' ? 'Student' : 'Lumina (Puck)'} (${t.timestamp}):** ${t.text}\n\n`;
        });
      }

      if (user) {
        await addDoc(collection(db, 'notes'), {
          userId: user.uid,
          title: `LuminaVoice: ${topicName}`,
          content: contentMarkdown,
          tags: ['LuminaVoice', 'Voice Notes', 'Puck', topicName],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error('Failed to save voice note:', e);
      setSaveStatus('idle');
    }
  };

  // Filtered concepts
  const filteredConcepts = taughtConcepts.filter(c => {
    const matchesFilter = selectedFilter === 'all' || 
      (selectedFilter === 'formulas' && c.category === 'Formula') ||
      (selectedFilter === 'takeaways' && c.category === 'Key Takeaway') ||
      (selectedFilter === 'definitions' && c.category === 'Definition') ||
      (selectedFilter === 'examples' && c.category === 'Example') ||
      (selectedFilter === 'concepts' && c.category === 'Concept');

    const matchesSearch = !searchQuery.trim() || 
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.summary.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-black text-[#FEFAE0] overflow-hidden">
      {/* Top Header */}
      <header className="min-h-16 py-2 border-b border-[#3D2B1F] bg-black/90 backdrop-blur-md flex flex-wrap items-center justify-between px-3 sm:px-6 md:px-8 shrink-0 z-10 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#606C38]/20 border border-[#606C38]/40 flex items-center justify-center text-[#606C38] shrink-0 shadow-md shadow-[#606C38]/20">
              <Radio className={cn("w-4 h-4", isConnected && "animate-pulse text-emerald-400")} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#FEFAE0]">LuminaVoice</h1>
                <span className="hidden sm:inline-block text-[9px] uppercase font-black tracking-widest text-[#606C38] bg-[#606C38]/10 px-2 py-0.5 rounded-lg border border-[#606C38]/30">
                  Voice: Puck
                </span>
              </div>
              <span className="text-[10px] text-[#FEFAE0]/40 font-medium">Real-time Bi-directional AI Voice Tutor</span>
            </div>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#3D2B1F]" />
          
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#160D08] border border-[#3D2B1F] text-[11px] text-[#FEFAE0]/60">
            <Sparkles className="w-3 h-3 text-[#606C38]" />
            <span className="truncate max-w-[200px] font-semibold text-[#FEFAE0]">{activeTopic}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Persona Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#160D08] border border-[#3D2B1F] text-xs font-bold text-[#FEFAE0]/80">
            <Volume2 className="w-3.5 h-3.5 text-[#606C38]" />
            <span>Voice: Puck</span>
          </div>

          {onSwitchToChat && (
            <button
              onClick={onSwitchToChat}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#2C1810] border border-[#3D2B1F] text-xs font-bold text-[#FEFAE0]/80 hover:text-[#FEFAE0] hover:border-[#606C38]/50 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#606C38]" />
              <span>LuminaBot</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Dual-Pane Stage */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Left / Center: Holographic Voice Orb & Live Controls */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden bg-black">
          {/* Subtle Ambient Background glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className={cn(
              "w-80 sm:w-96 h-80 sm:h-96 rounded-full blur-3xl transition-all duration-700",
              modelSpeaking ? "bg-[#606C38]/40 scale-125" :
              userSpeaking ? "bg-amber-600/30 scale-110" :
              isConnected ? "bg-[#606C38]/20 scale-95" :
              "bg-[#2C1810]/40 scale-75"
            )} />
          </div>

          {/* Central Holographic Visualizer */}
          <div className="relative flex flex-col items-center justify-center my-auto">
            {/* Animated Ripples when Live */}
            {isConnected && (
              <>
                <motion.div
                  animate={{
                    scale: modelSpeaking ? [1, 1.4, 1] : userSpeaking ? [1, 1.25, 1] : [1, 1.05, 1],
                    opacity: modelSpeaking ? [0.4, 0.8, 0.4] : userSpeaking ? [0.3, 0.6, 0.3] : [0.15, 0.3, 0.15]
                  }}
                  transition={{ repeat: Infinity, duration: modelSpeaking ? 1.5 : 2.5, ease: "easeInOut" }}
                  className="absolute w-56 sm:w-64 h-56 sm:h-64 rounded-full border border-[#606C38]/40 pointer-events-none"
                />
                <motion.div
                  animate={{
                    scale: modelSpeaking ? [1.2, 1.7, 1.2] : userSpeaking ? [1.1, 1.4, 1.1] : [1.05, 1.15, 1.05],
                    opacity: modelSpeaking ? [0.2, 0.5, 0.2] : userSpeaking ? [0.15, 0.3, 0.15] : [0.08, 0.15, 0.08]
                  }}
                  transition={{ repeat: Infinity, duration: modelSpeaking ? 2 : 3, ease: "easeInOut", delay: 0.3 }}
                  className="absolute w-64 sm:w-72 h-64 sm:h-72 rounded-full border border-[#FEFAE0]/20 pointer-events-none"
                />
              </>
            )}

            {/* Central Orb Button */}
            <div className="relative z-10 flex flex-col items-center">
              <motion.button
                whileHover={{ scale: isConnecting ? 1 : 1.05 }}
                whileTap={{ scale: isConnecting ? 1 : 0.95 }}
                onClick={isConnected ? stopLiveSession : startLiveSession}
                disabled={isConnecting}
                className={cn(
                  "w-32 sm:w-36 h-32 sm:h-36 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 border-2 relative group",
                  isConnected 
                    ? modelSpeaking 
                      ? "bg-gradient-to-b from-[#606C38] to-[#283618] border-[#FEFAE0] shadow-[#606C38]/50 ring-4 ring-[#606C38]/30" 
                      : userSpeaking 
                      ? "bg-gradient-to-b from-amber-700 to-[#2C1810] border-amber-300 shadow-amber-900/50"
                      : "bg-[#2C1810] border-[#606C38] shadow-black/80"
                    : isConnecting
                    ? "bg-[#2C1810] border-[#3D2B1F] animate-pulse"
                    : "bg-[#2C1810] border-[#3D2B1F] hover:border-[#606C38] hover:shadow-[#606C38]/20"
                )}
              >
                {isConnecting ? (
                  <RefreshCw className="w-9 h-9 sm:w-10 sm:h-10 text-[#FEFAE0] animate-spin" />
                ) : isConnected ? (
                  modelSpeaking ? (
                    <Volume2 className="w-10 h-10 sm:w-12 sm:h-12 text-[#FEFAE0] animate-bounce" />
                  ) : (
                    <Mic className={cn("w-10 h-10 sm:w-12 sm:h-12 text-[#FEFAE0]", isMuted && "text-rose-400 opacity-60")} />
                  )
                ) : (
                  <Play className="w-10 h-10 sm:w-12 sm:h-12 text-[#FEFAE0] translate-x-1 group-hover:text-[#606C38] transition-colors" />
                )}

                <span className="text-[10px] font-black uppercase tracking-widest mt-2 text-[#FEFAE0]/80">
                  {isConnecting ? 'Connecting' : isConnected ? (modelSpeaking ? 'Puck Speaking' : userSpeaking ? 'Listening' : 'Live') : 'Start LuminaVoice'}
                </span>
              </motion.button>
            </div>
          </div>

          {/* Status Bar & Action Controls */}
          <div className="mt-6 sm:mt-8 flex flex-col items-center space-y-3 z-10 w-full max-w-md px-2">
            <div className="flex items-center gap-2 px-4 py-1.5 sm:py-2 rounded-full bg-[#160D08] border border-[#3D2B1F] text-xs font-semibold text-[#FEFAE0] shadow-md">
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                isConnected ? (modelSpeaking ? "bg-emerald-400 animate-ping" : "bg-emerald-500") : "bg-[#3D2B1F]"
              )} />
              <span className="truncate">{statusMessage}</span>
            </div>

            {/* Error Message if any */}
            {errorMsg && (
              <div className="w-full p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="flex-1">{errorMsg}</p>
              </div>
            )}

            {/* Live Action Controls */}
            {isConnected && (
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-1">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={cn(
                    "px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-md",
                    isMuted 
                      ? "bg-rose-950/50 border-rose-600 text-rose-300" 
                      : "bg-[#2C1810] border-[#3D2B1F] text-[#FEFAE0] hover:border-[#606C38]"
                  )}
                >
                  {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-[#606C38]" />}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>

                {modelSpeaking && (
                  <button
                    onClick={handleInterruptClick}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#2C1810] border border-amber-700/60 text-amber-300 text-xs font-bold flex items-center gap-1.5 hover:bg-amber-950/40 transition-all shadow-md"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Interrupt</span>
                  </button>
                )}

                <button
                  onClick={stopLiveSession}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-bold hover:bg-rose-900/60 transition-all shadow-md"
                >
                  End Voice Session
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Topics & Knowledge Board Section */}
        <div className="w-full lg:w-[440px] xl:w-[480px] border-t lg:border-t-0 lg:border-l border-[#3D2B1F] bg-[#0A0503] flex flex-col h-[520px] lg:h-full shrink-0">
          {/* Header & Segmented Tab Controls */}
          <div className="p-3.5 sm:p-4 border-b border-[#3D2B1F] bg-[#120906] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-xl border border-[#3D2B1F]">
              <button
                onClick={() => setRightPanelTab('topics')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  rightPanelTab === 'topics'
                    ? "bg-[#606C38] text-[#FEFAE0] shadow-sm"
                    : "text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Topics & Knowledge</span>
                {taughtConcepts.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-black/40 font-black text-[#FEFAE0]">
                    {taughtConcepts.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setRightPanelTab('transcript')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  rightPanelTab === 'transcript'
                    ? "bg-[#606C38] text-[#FEFAE0] shadow-sm"
                    : "text-[#FEFAE0]/60 hover:text-[#FEFAE0]"
                )}
              >
                <AudioWaveform className="w-3.5 h-3.5" />
                <span>Live Transcript</span>
                {transcripts.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-black/40 font-black text-[#FEFAE0]">
                    {transcripts.length}
                  </span>
                )}
              </button>
            </div>

            {/* Save to Notes button */}
            <button
              onClick={handleSaveToNotes}
              disabled={taughtConcepts.length === 0 && transcripts.length === 0}
              className={cn(
                "p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-30",
                saveStatus === 'saved'
                  ? "bg-emerald-950/60 border-emerald-600 text-emerald-300"
                  : "bg-[#2C1810] border-[#3D2B1F] text-[#FEFAE0]/80 hover:text-[#FEFAE0] hover:border-[#606C38]"
              )}
              title="Save taught topics to Notes"
            >
              {saveStatus === 'saved' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline text-emerald-300">Saved</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-[#606C38]" />
                  <span className="hidden sm:inline">Save Notes</span>
                </>
              )}
            </button>
          </div>

          {/* Active Topic Banner in Right Panel */}
          <div className="px-4 py-2.5 bg-[#160D08]/90 border-b border-[#3D2B1F]/80 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-[#606C38]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40">Subject:</span>
              <span className="font-bold text-[#FEFAE0] truncate">{activeTopic}</span>
            </div>

            <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#606C38] bg-[#606C38]/10 px-2 py-0.5 rounded-md border border-[#606C38]/20 shrink-0">
              {modelSpeaking ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Puck Teaching
                </span>
              ) : isConnected ? (
                'Live Listening'
              ) : (
                'Ready'
              )}
            </div>
          </div>

          {/* Tab 1: Topics & Knowledge Board */}
          {rightPanelTab === 'topics' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {/* Live Extraction Active Indicator */}
              {(modelSpeaking || isExtracting) && (
                <motion.div 
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-3.5 py-2 rounded-xl bg-[#1C2314] border border-[#606C38]/60 flex items-center justify-between text-xs text-[#FEFAE0]"
                >
                  <div className="flex items-center gap-2 text-[#606C38]">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span className="font-bold text-[11px] text-[#FEFAE0]">
                      {modelSpeaking ? "Puck is explaining & teaching..." : "Extracting key concepts..."}
                    </span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    Live Board Active
                  </span>
                </motion.div>
              )}

              {/* Category Filter Chips & Search if concepts exist */}
              {taughtConcepts.length > 0 && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#FEFAE0]/30" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search taught concepts or formulas..."
                      className="w-full bg-[#160D08] border border-[#3D2B1F] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#FEFAE0] placeholder-[#FEFAE0]/30 focus:outline-none focus:border-[#606C38]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-[10px]">
                    {[
                      { id: 'all', label: 'All Topics' },
                      { id: 'concepts', label: 'Concepts' },
                      { id: 'formulas', label: 'Formulas' },
                      { id: 'takeaways', label: 'Takeaways' },
                      { id: 'definitions', label: 'Definitions' },
                      { id: 'examples', label: 'Examples' }
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFilter(f.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all border",
                          selectedFilter === f.id
                            ? "bg-[#606C38] border-[#606C38] text-[#FEFAE0]"
                            : "bg-[#160D08] border-[#3D2B1F] text-[#FEFAE0]/50 hover:text-[#FEFAE0]"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State / Live Teaching Intro */}
              {taughtConcepts.length === 0 && (
                <div className="h-full flex flex-col justify-between py-4 space-y-6 animate-in fade-in duration-500">
                  <div className="p-5 rounded-2xl bg-[#160D08] border border-[#3D2B1F] space-y-3 shadow-xl">
                    <div className="w-10 h-10 rounded-xl bg-[#2C1810] border border-[#3D2B1F] flex items-center justify-center text-[#606C38] shadow-md">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#FEFAE0]">Live Knowledge Board</h3>
                      <p className="text-xs text-[#FEFAE0]/60 leading-relaxed mt-1">
                        As you speak with Puck, every key concept, formula, definition, and takeaway taught during your conversation will automatically appear here in real time.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#3D2B1F]/60 flex items-center gap-2 text-[10px] text-[#606C38] font-bold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Writing knowledge cards automatically while speaking</span>
                    </div>
                  </div>

                  {/* Suggestion prompts to speak out loud */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40 flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-[#606C38]" /> Try Asking Puck Out Loud
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        "Explain the difference between superposition and entanglement.",
                        "What is dynamic programming and when should I use memoization?",
                        "How does Snell's law explain light refraction?",
                        "Can you explain the citric acid cycle simply?"
                      ].map((promptText, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-[#160D08]/60 border border-[#3D2B1F] rounded-xl text-left text-xs font-semibold text-[#FEFAE0]/70 flex items-center justify-between"
                        >
                          <span className="truncate pr-2 italic">"{promptText}"</span>
                          <Mic className="w-3.5 h-3.5 text-[#606C38] shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Key Takeaways Highlights Bar */}
              {keyTakeaways.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#1C2314] border border-[#606C38]/40 space-y-2 shadow-lg">
                  <div className="flex items-center gap-2 text-[#606C38] font-black text-[10px] uppercase tracking-widest">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Key Takeaways & Core Rules</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#FEFAE0]/90">
                    {keyTakeaways.map((takeaway, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-[#606C38] font-bold shrink-0">•</span>
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Taught Concept Cards Stream */}
              <div className="space-y-3">
                {filteredConcepts.map((concept) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={concept.id}
                    className="p-4 rounded-2xl bg-[#160D08] border border-[#3D2B1F] hover:border-[#606C38]/60 transition-all space-y-2.5 shadow-md relative group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border",
                          concept.category === 'Formula'
                            ? "bg-purple-950/40 text-purple-300 border-purple-800/50"
                            : concept.category === 'Key Takeaway'
                            ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/50"
                            : concept.category === 'Definition'
                            ? "bg-blue-950/40 text-blue-300 border-blue-800/50"
                            : concept.category === 'Example'
                            ? "bg-amber-950/40 text-amber-300 border-amber-800/50"
                            : "bg-[#2C1810] text-[#606C38] border-[#3D2B1F]"
                        )}>
                          {concept.category}
                        </span>
                        <h4 className="text-xs font-bold text-[#FEFAE0] truncate max-w-[200px]">{concept.title}</h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#FEFAE0]/30 font-medium">{concept.timestamp}</span>
                        <button
                          onClick={() => handleCopyConcept(concept.summary + (concept.codeOrMath ? `\n${concept.codeOrMath}` : ''), concept.id)}
                          className="p-1 bg-[#2C1810] border border-[#3D2B1F] rounded-md text-[#FEFAE0]/50 hover:text-[#FEFAE0] transition-colors opacity-0 group-hover:opacity-100"
                          title="Copy concept"
                        >
                          {copiedId === concept.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#FEFAE0]/80 leading-relaxed font-medium">
                      {concept.summary}
                    </p>

                    {concept.codeOrMath && (
                      <div className="p-2.5 rounded-xl bg-black/60 border border-[#3D2B1F] text-xs font-mono text-emerald-300 overflow-x-auto">
                        <code>{concept.codeOrMath}</code>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* What to Ask Puck Next (Verbal Prompt Suggestions) */}
              {taughtConcepts.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#160D08]/80 border border-[#3D2B1F] space-y-2 mt-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/50">
                    <HelpCircle className="w-3.5 h-3.5 text-[#606C38]" />
                    <span>Ask Puck Next Out Loud</span>
                  </div>
                  <div className="space-y-1.5">
                    {suggestedQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-black/40 border border-[#3D2B1F]/60 text-[11px] text-[#FEFAE0]/70 font-medium flex items-center gap-2"
                      >
                        <Mic className="w-3 h-3 text-[#606C38] shrink-0" />
                        <span className="italic">{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Live Transcript Stream */}
          {rightPanelTab === 'transcript' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 no-scrollbar">
              {transcripts.length === 0 && !liveUserText && !liveModelText && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#FEFAE0]/30 space-y-2">
                  <Mic className="w-8 h-8 opacity-20" />
                  <p className="text-xs font-semibold">Start the live voice session and speak naturally.</p>
                  <p className="text-[10px] leading-relaxed opacity-60">LuminaVoice Live API will stream ultra-low latency voice responses and live transcriptions.</p>
                </div>
              )}

              {transcripts.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "p-3.5 rounded-xl text-xs leading-relaxed border space-y-1",
                    t.sender === 'user'
                      ? "bg-[#2C1810] border-[#3D2B1F] text-[#FEFAE0] ml-4"
                      : "bg-[#1C2314] border-[#606C38]/40 text-[#FEFAE0] mr-4"
                  )}
                >
                  <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-[#FEFAE0]/40">
                    <span>{t.sender === 'user' ? 'You' : 'Lumina (Puck)'}</span>
                    <span>{t.timestamp}</span>
                  </div>
                  <p className="font-medium">{t.text}</p>
                </div>
              ))}

              {/* Currently Streaming text */}
              {liveUserText && (
                <div className="p-3.5 rounded-xl text-xs leading-relaxed border bg-[#2C1810]/70 border-[#3D2B1F] text-[#FEFAE0]/80 ml-4 animate-pulse">
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 block mb-1">Listening to you...</span>
                  <p>{liveUserText}</p>
                </div>
              )}

              {liveModelText && (
                <div className="p-3.5 rounded-xl text-xs leading-relaxed border bg-[#1C2314]/80 border-[#606C38] text-[#FEFAE0] mr-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#606C38] block mb-1">Puck speaking...</span>
                  <p>{liveModelText}</p>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
