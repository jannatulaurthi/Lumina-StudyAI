import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Multi-Turn Chatbot API with Streaming & Model Selection
  app.post('/api/chat', async (req, res) => {
    try {
      const { 
        messages, 
        model = 'gemini-3.5-flash', 
        systemInstruction, 
        stream = false 
      } = req.body;

      // Ensure valid model selection as requested:
      // gemini-3.1-pro-preview: Complex tasks
      // gemini-3.5-flash: General tasks
      // gemini-3.1-flash-lite: Fast tasks
      const allowedModels = ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
      const selectedModel = allowedModels.includes(model) ? model : 'gemini-3.5-flash';

      // Format multi-turn conversation history
      const contents = (messages || []).map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: typeof m.content === 'string' ? m.content : (m.text || '') }]
      }));

      if (contents.length === 0) {
        return res.status(400).json({ error: 'No messages provided' });
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const responseStream = await ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: systemInstruction || undefined
          }
        });

        for await (const chunk of responseStream) {
          const chunkText = chunk.text;
          if (chunkText) {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: systemInstruction || undefined
          }
        });

        res.json({ text: response.text || '' });
      }
    } catch (error: any) {
      console.error('Chat API Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message || 'Failed to communicate with Gemini API' });
      } else {
        res.write(`data: ${JSON.stringify({ error: error?.message || 'Streaming failed' })}\n\n`);
        res.end();
      }
    }
  });

  // Single Generation helper (for quizzes, summaries, etc.)
  app.post('/api/generate', async (req, res) => {
    try {
      const { prompt, model = 'gemini-3.5-flash', systemInstruction } = req.body;
      const response = await ai.models.generateContent({
        model: model || 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || undefined
        }
      });
      res.json({ text: response.text || '' });
    } catch (error: any) {
      console.error('Generate API Error:', error);
      res.status(500).json({ error: error?.message || 'Generation failed' });
    }
  });

  // Fast Real-Time Live Knowledge & Concept Extraction Endpoint
  app.post('/api/live/extract-topics', async (req, res) => {
    try {
      const { spokenText, conversationHistory = [] } = req.body;
      if (!spokenText && conversationHistory.length === 0) {
        return res.json({ topicTitle: 'Interactive Voice Learning', concepts: [], takeaways: [], suggestedQuestions: [] });
      }

      const prompt = `You are an expert real-time academic concept extractor for LuminaVoice.
Analyze what is being spoken and taught in this voice study session and extract structured knowledge cards.

Spoken context/turn:
"${spokenText || ''}"

Recent conversation context:
${conversationHistory.slice(-4).map((m: any) => `${m.sender || m.role}: ${m.text || m.content}`).join('\n')}

Extract:
1. topicTitle: A concise, accurate title of the subject/theme being discussed (e.g. "Kinematics & Projectile Motion", "Binary Search Trees", "Cellular Respiration").
2. concepts: 1 to 3 rich, concrete cards being explained.
   Each concept must have:
   - title: Clear title (e.g., "Conservation of Momentum", "Time Complexity O(log n)")
   - category: One of ["Concept", "Formula", "Key Takeaway", "Definition", "Example", "Rule"]
   - summary: A crisp 1-2 sentence explanation of the concept taught
   - codeOrMath (optional): Mathematical formula or code snippet if relevant (e.g. "v = u + at", "E = mc^2")
3. takeaways: 1 to 3 punchy, high-yield bullet points the student must remember.
4. suggestedQuestions: 2 to 3 natural questions the student can ask Puck next out loud.

Return valid JSON adhering strictly to this schema:
{
  "topicTitle": "string",
  "concepts": [
    {
      "title": "string",
      "category": "string",
      "summary": "string",
      "codeOrMath": "string"
    }
  ],
  "takeaways": ["string"],
  "suggestedQuestions": ["string"]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({
        topicTitle: parsed.topicTitle || 'Interactive Voice Learning',
        concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
        takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : []
      });
    } catch (error: any) {
      console.error('Extract topics API error:', error);
      res.status(500).json({ error: error?.message || 'Topic extraction failed' });
    }
  });

  // WebSocket Server for Gemini Live API Voice Conversations
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
    if (pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    console.log('[Live API] Client connected to voice session');
    let session: any = null;
    let isSessionReady = false;

    // Helper to send JSON messages to client safely
    const sendToClient = (obj: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(obj));
      }
    };

    clientWs.on('message', async (data: Buffer | string) => {
      try {
        const payload = JSON.parse(data.toString());

        // Initialize Live session on 'start' action
        if (payload.type === 'start') {
          if (session) {
            try { await session.close(); } catch (_) {}
          }

          // Strictly use Puck voice as requested
          const voiceName = 'Puck';
          const systemInstruction = payload.systemInstruction || 
            "You are Lumina, a brilliant, energetic, and warm voice study tutor powered by the Puck persona. Keep your spoken explanations natural, clear, structured, concise, conversational, and direct. Break down complex subjects with intuitive analogies, highlight key formulas and takeaways clearly, and speak cheerfully with high engagement.";

          try {
            session = await ai.live.connect({
              model: 'gemini-3.1-flash-live-preview',
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Puck' }
                  }
                },
                systemInstruction,
                outputAudioTranscription: {},
                inputAudioTranscription: {},
              },
              callbacks: {
                onmessage: (message: LiveServerMessage) => {
                  const serverContent = message.serverContent as any;
                  if (serverContent) {
                    // Output Audio and text parts
                    const parts = serverContent.modelTurn?.parts;
                    if (parts) {
                      for (const part of parts) {
                        if (part.inlineData?.data) {
                          sendToClient({ type: 'audio', audio: part.inlineData.data });
                        }
                        if (part.text) {
                          sendToClient({ type: 'modelText', text: part.text });
                        }
                      }
                    }

                    // Check for transcriptions in server content
                    if (serverContent.outputAudioTranscription?.text) {
                      sendToClient({ type: 'outputTranscription', text: serverContent.outputAudioTranscription.text });
                    }
                    if (serverContent.inputAudioTranscription?.text) {
                      sendToClient({ type: 'inputTranscription', text: serverContent.inputAudioTranscription.text });
                    }

                    // Handle interruption from user
                    if (serverContent.interrupted) {
                      sendToClient({ type: 'interrupted' });
                    }

                    // Turn completion
                    if (serverContent.turnComplete) {
                      sendToClient({ type: 'turnComplete' });
                    }
                  }
                },
                onerror: (err) => {
                  console.error('[Live API] Session Error:', err);
                  sendToClient({ type: 'error', message: String(err) });
                },
                onclose: () => {
                  console.log('[Live API] Session closed by server');
                  isSessionReady = false;
                  sendToClient({ type: 'sessionClosed' });
                }
              }
            });

            isSessionReady = true;
            sendToClient({ type: 'connected', voice: 'Puck', model: 'gemini-3.1-flash-live-preview' });
            console.log('[Live API] Session connected successfully with Puck voice & model gemini-3.1-flash-live-preview');
          } catch (initErr: any) {
            console.error('[Live API] Failed to connect session:', initErr);
            sendToClient({ type: 'error', message: initErr?.message || 'Failed to start Live audio session' });
          }
          return;
        }

        // Stream microphone audio (16kHz PCM Base64) to Live API
        if (payload.type === 'audio' && payload.audio) {
          if (session && isSessionReady) {
            session.sendRealtimeInput({
              audio: {
                data: payload.audio,
                mimeType: 'audio/pcm;rate=16000'
              }
            });
          }
          return;
        }

        // Send text prompt in Live session
        if (payload.type === 'text' && payload.text) {
          if (session && isSessionReady) {
            session.sendRealtimeInput({
              text: payload.text
            });
          }
          return;
        }

        // Stop session
        if (payload.type === 'stop') {
          if (session) {
            try {
              await session.close();
            } catch (_) {}
            session = null;
            isSessionReady = false;
          }
          sendToClient({ type: 'stopped' });
        }
      } catch (err: any) {
        console.error('[Live API] WS message processing error:', err);
        sendToClient({ type: 'error', message: err?.message || 'Message parse error' });
      }
    });

    clientWs.on('close', async () => {
      console.log('[Live API] Client disconnected');
      if (session) {
        try {
          await session.close();
        } catch (_) {}
        session = null;
        isSessionReady = false;
      }
    });

    clientWs.on('error', (err) => {
      console.error('[Live API] WS socket error:', err);
    });
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Lumina server with Live API & Gemini Chat running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
