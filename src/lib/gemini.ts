// Client API interfaces and helpers for Gemini Multi-Turn Chat & Live Audio

export type GeminiModelId = 'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite';

export interface ChatModelOption {
  id: GeminiModelId;
  name: string;
  badge: string;
  description: string;
  idealFor: string;
  speed: string;
  reasoning: string;
}

export const GEMINI_CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    badge: 'Balanced',
    description: 'Recommended for general study, homework, summaries, and broad inquiries.',
    idealFor: 'General Tasks & Daily Tutoring',
    speed: 'High',
    reasoning: 'Strong'
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    badge: 'Pro Reasoning',
    description: 'Deep reasoning model for intricate STEM proofs, difficult code, and multi-step logic.',
    idealFor: 'Complex Tasks & Deep Logic',
    speed: 'Moderate',
    reasoning: 'Maximum'
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    badge: 'Ultra Fast',
    description: 'Optimized for minimal latency, quick Q&A, flashcard generation, and rapid queries.',
    idealFor: 'Fast Tasks & Low Latency',
    speed: 'Instant',
    reasoning: 'Standard'
  }
];

export interface ChatRolePreset {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  systemInstruction: string;
}

export const CHAT_ROLE_PRESETS: ChatRolePreset[] = [
  {
    id: 'socratic',
    name: 'Socratic Tutor',
    icon: 'Sparkles',
    tagline: 'Teaches by asking probing questions and building first principles',
    systemInstruction: `You are Lumina in Socratic Tutor mode. Your objective is not just to give direct answers, but to guide the student toward understanding through targeted questions, intuitive analogies, and breaking problems down into digestible steps. Validate their effort, point out flaws gently, and celebrate milestones.`
  },
  {
    id: 'exam_coach',
    name: 'Strict Exam Coach',
    icon: 'Zap',
    tagline: 'High-yield recall, memory triggers, and rapid drill questions',
    systemInstruction: `You are Lumina in Strict Exam Coach mode. Focus ruthlessly on high-yield exam material, bullet-pointed memory devices, common pitfalls on standardized tests, and active recall drills. Be concise, direct, and structured.`
  },
  {
    id: 'deep_explainer',
    name: 'Deep Concept Simplifier',
    icon: 'BrainCircuit',
    tagline: 'Explains complex theoretical concepts with visual metaphors',
    systemInstruction: `You are Lumina in Deep Concept Simplifier mode. Your superpower is taking the most mathematically dense or theoretically abstract concepts and explaining them with relatable real-world analogies, mental models, and step-by-step visual breakdowns.`
  },
  {
    id: 'code_architect',
    name: 'Code Architect & Debugger',
    icon: 'Code2',
    tagline: 'Clean syntax, algorithmic analysis, and structured debugging',
    systemInstruction: `You are Lumina in Code Architect mode. Help the user write elegant, clean, and bug-free code. Explain time and space complexity, offer idiomatic patterns, and guide debugging with step-by-step logic tracing.`
  },
  {
    id: 'research_mentor',
    name: 'Academic Research Mentor',
    icon: 'BookOpen',
    tagline: 'Rigorous scientific analysis, literature synthesis, and methodology',
    systemInstruction: `You are Lumina in Academic Research Mentor mode. Provide graduate-level academic critique, thesis framing, literature review synthesis, and methodology recommendations. Maintain scholarly tone and precision.`
  }
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp?: number;
  modelUsed?: GeminiModelId;
}

export type StudyMode = 'general' | 'exam' | 'deep' | 'motivation' | 'quiz' | 'code';

export async function askLumina(prompt: string, history: any[] = [], mode: StudyMode = 'general'): Promise<string> {
  const modeRoleMap: Record<StudyMode, string> = {
    general: 'socratic',
    exam: 'exam_coach',
    deep: 'deep_explainer',
    motivation: 'socratic',
    code: 'code_architect',
    quiz: 'exam_coach'
  };

  const preset = CHAT_ROLE_PRESETS.find(p => p.id === modeRoleMap[mode]) || CHAT_ROLE_PRESETS[0];

  const formattedMessages = [
    ...history.map(m => ({
      role: m.role,
      content: m.content || m.text || ''
    })),
    { role: 'user', content: prompt }
  ];

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: formattedMessages,
      model: 'gemini-3.5-flash',
      systemInstruction: preset.systemInstruction,
      stream: false
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }

  const data = await res.json();
  return data.text || '';
}

// Multi-turn chat streaming helper
export async function streamChatResponse(
  messages: Array<{ role: 'user' | 'model'; content: string }>,
  model: GeminiModelId,
  systemInstruction: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model,
      systemInstruction,
      stream: true
    }),
    signal
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to communicate with AI' }));
    throw new Error(err.error || `Error ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No readable stream available');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') break;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.text) {
          fullText += parsed.text;
          onChunk(fullText);
        } else if (parsed.error) {
          throw new Error(parsed.error);
        }
      } catch (e: any) {
        if (e.message !== 'Unexpected end of JSON input') {
          console.warn('Stream parse error:', e);
        }
      }
    }
  }

  return fullText;
}

// ----------------------------------------------------
// Web Audio Utilities for Gemini Live API (16kHz in / 24kHz out)
// ----------------------------------------------------

export const LIVE_VOICES = [
  { id: 'Puck', name: 'Puck', tone: 'Playful, Crisp & Engaging', gender: 'Energetic' }
] as const;

export const DEFAULT_LIVE_VOICE = 'Puck';

/**
 * Converts Float32Array from Web Audio ScriptProcessor to 16-bit PCM Base64 string
 */
export function float32ToPcm16Base64(input: Float32Array): string {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    // Clamp to [-1, 1]
    const s = Math.max(-1, Math.min(1, input[i]));
    // Convert to 16-bit PCM integer
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts Base64 16-bit PCM little-endian data to an AudioBuffer at 24000 Hz
 */
export function pcm16Base64ToAudioBuffer(base64Data: string, ctx: AudioContext): AudioBuffer {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const int16View = new Int16Array(bytes.buffer);
  const sampleRate = 24000;
  const audioBuffer = ctx.createBuffer(1, int16View.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < int16View.length; i++) {
    channelData[i] = int16View[i] / 32768.0;
  }

  return audioBuffer;
}
