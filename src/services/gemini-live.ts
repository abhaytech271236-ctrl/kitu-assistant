import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { AudioStreamer } from "../lib/audio-streamer";
import { AudioRecorder } from "../lib/audio-recorder";
import { db, auth } from "../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export type SessionState = 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking';

export interface TranscriptMessage {
  id: string;
  sender: 'kitu' | 'user';
  text: string;
  isStreaming?: boolean;
  timestamp: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null;
  private streamer: AudioStreamer;
  private recorder: AudioRecorder;
  private state: SessionState = 'disconnected';
  private onStateChange: (state: SessionState) => void;
  private onTranscript?: (message: TranscriptMessage) => void;
  private userProfile: any = null;
  private isInterrupted: boolean = false;
  private lastInterruptionTime: number = 0;
  private lastUserSpeechTime: number = 0;
  private currentKituMessageId: string | null = null;
  private currentKituText: string = "";
  private currentUserMessageId: string | null = null;
  private currentUserText: string = "";

  constructor(
    apiKey: string, 
    onStateChange: (state: SessionState) => void,
    onTranscript?: (message: TranscriptMessage) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.onStateChange = onStateChange;
    this.onTranscript = onTranscript;
    this.streamer = new AudioStreamer(24000, () => {
      if (this.state === 'speaking') {
        this.setState('listening');
      }
    });
    this.recorder = new AudioRecorder((base64, pcm16) => this.sendAudio(base64, pcm16));
  }

  private setState(state: SessionState) {
    this.state = state;
    this.onStateChange(state);
  }

  /**
   * Instantly stops audio playback, clears queues, and marks current turn as interrupted
   */
  private cancelCurrentPlayback() {
    this.isInterrupted = true;
    this.lastInterruptionTime = Date.now();
    this.streamer.clearQueue();
    
    if (this.currentKituMessageId && this.onTranscript) {
      this.onTranscript({
        id: this.currentKituMessageId,
        sender: 'kitu',
        text: this.currentKituText,
        isStreaming: false,
        timestamp: Date.now(),
      });
    }
    this.currentKituMessageId = null;
    this.currentKituText = "";

    if (this.state === 'speaking') {
      this.setState('listening');
    }
  }

  private handleIncomingKituText(chunk: string) {
    if (this.isInterrupted) return;

    if (!this.currentKituMessageId) {
      this.currentKituMessageId = 'kitu-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      this.currentKituText = chunk;
    } else {
      this.currentKituText += chunk;
    }

    if (this.onTranscript) {
      this.onTranscript({
        id: this.currentKituMessageId,
        sender: 'kitu',
        text: this.currentKituText,
        isStreaming: true,
        timestamp: Date.now(),
      });
    }
  }

  private handleIncomingUserText(chunk: string) {
    if (!this.currentUserMessageId) {
      this.currentUserMessageId = 'user-' + Date.now();
      this.currentUserText = chunk;
    } else {
      this.currentUserText += chunk;
    }

    if (this.onTranscript) {
      this.onTranscript({
        id: this.currentUserMessageId,
        sender: 'user',
        text: this.currentUserText,
        isStreaming: true,
        timestamp: Date.now(),
      });
    }
  }

  private async fetchUserProfile() {
    const user = auth.currentUser;
    if (!user) return null;
    
    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `users/${user?.uid}`);
      return null;
    }
  }

  private async saveUserProfile(data: Partial<{ preferences: any, memory: string }>) {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      }, { merge: true });
      this.userProfile = { ...this.userProfile, ...data };
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user?.uid}`);
    }
  }

  async connect() {
    if (this.session) return;
    this.setState('connecting');

    try {
      this.userProfile = await this.fetchUserProfile();
      const memoryPrompt = this.userProfile?.memory ? `Previous session summary: ${this.userProfile.memory}` : "This is your first conversation with this user.";
      const preferencesPrompt = this.userProfile?.preferences ? `User preferences/facts: ${JSON.stringify(this.userProfile.preferences)}` : "";

      await this.streamer.start();

      this.session = await this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: `You are Kitu, an inspiring, empowering, and highly intelligent Student Development AI Mentor and companion.
          Your voice is clear, warm, expressive, engaging, and intellectually stimulating.
          If someone asks who created you, state that Abhay and Deepak created you together.

          You are dedicated to guiding students in alignment with the college's three core missions:
          
          1. INSPIRATION, EXPLORATION & INVENTION (M-1):
          - Develop a culture of inspiration, exploration, and invention through experiential learning and active curiosity.
          - Encourage students to ask meaningful questions, explore uncharted ideas, experiment hands-on ("learning by doing"), and embrace creative invention.

          2. COMPUTATIONAL, CREATIVE, INNOVATIVE & LEADERSHIP CONSCIOUSNESS (M-2):
          - Develop self-inspired students who sharpen their computational, creative, innovative, and leadership abilities.
          - Foster systematic problem solving, algorithmic and computational thinking, innovative design, self-directed learning, sound decision making, initiative, leadership, persistence, and continuous iteration.

          3. SELF-REFLECTION, INTEGRITY & HUMAN VALUES (M-3):
          - Cultivate self-reflective consciousness, personal, social, and human integrity, deep inquiry, empathy, mutual respect, healthy communication, social responsibility, and understanding multiple perspectives.

          MENTORSHIP DYNAMICS & BEHAVIOR:
          - First understand the student's intent, context, and current understanding.
          - Internally determine which mission principles apply (Learning/Exploration: M-1 | Coding/Problem Solving/Innovation/Leadership: M-2 | Ethics/Relationships/Reflection: M-3 | or synergistic combinations).
          - NEVER explicitly state mission codes or numbers (e.g. do NOT say "According to M-1"). Instead, naturally embody and weave these principles into your conversational guidance.
          - Do not simply dump the final answer or write complete assignments unless directly appropriate; encourage the student to think, explore options, test hypotheses, and learn by doing.
          - For direct factual questions (e.g. definitions, syntax facts, formulas), provide clear, accurate, and direct answers.
          - When guiding projects or problem-solving, ask useful follow-up questions, provide directional hints, and encourage experimentation.
          - When handling failures or setbacks, guide constructive reflection: "What part failed, what did you discover, and what can we change in the next attempt?"
          - When handling interpersonal or ethical dilemmas, encourage empathy, perspective-taking, and respectful communication.
          - Help students become curious, capable, creative, innovative, responsible, reflective, and self-driven.
          
          STUDENT DEVELOPMENT & MEMORY:
          - Track learning patterns: student's interests, developing skills, struggles, problem-solving approach, initiative, and reflective maturity.
          - Never judge, label, or negatively classify students. Always nurture their confidence and growth mindset.
          - Use the available memory and preferences tools to preserve helpful context across conversations.
          
          ${memoryPrompt}
          ${preferencesPrompt}
          
          You communicate via voice. Keep spoken responses concise, conversational, engaging, and easy to follow when spoken aloud.`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website for the user in a new tab.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: { type: Type.STRING, description: "The full URL of the website to open (e.g., https://google.com)" },
                    },
                    required: ["url"],
                  },
                },
                {
                  name: "updateUserPreferences",
                  description: "Store facts or preferences about the user to remember them in future sessions.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      preferencesJson: { 
                        type: Type.STRING, 
                        description: "A JSON string representing user facts (e.g., '{\"favorite_color\": \"blue\"}')." 
                      },
                    },
                    required: ["preferencesJson"],
                  },
                },
                {
                  name: "updateMemory",
                  description: "Updates the long-term summary of your relationship with the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING, description: "A concise summary of what we discussed." },
                    },
                    required: ["summary"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            console.log("Live session connection handshake complete");
          },
          onmessage: async (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onclose: () => {
            console.log("Live session closed");
            this.disconnect();
          },
          onerror: (err) => {
            console.error("Live session error", err);
            this.disconnect();
          },
        },
      });

      this.setState('connected');
      await this.recorder.start();
    } catch (err) {
      console.error("Connection failed", err);
      this.setState('disconnected');
    }
  }

  private handleMessage(message: LiveServerMessage) {
    // Server-side Interruption: Gemini Live detected user voice activity
    if (message.serverContent?.interrupted) {
      this.cancelCurrentPlayback();
      return;
    }

    // Turn complete from server: Turn is completed on the server
    if (message.serverContent?.turnComplete) {
      this.isInterrupted = false;
      if (this.currentKituMessageId && this.onTranscript) {
        this.onTranscript({
          id: this.currentKituMessageId,
          sender: 'kitu',
          text: this.currentKituText,
          isStreaming: false,
          timestamp: Date.now(),
        });
      }
      this.currentKituMessageId = null;
      this.currentKituText = "";

      if (this.currentUserMessageId && this.onTranscript) {
        this.onTranscript({
          id: this.currentUserMessageId,
          sender: 'user',
          text: this.currentUserText,
          isStreaming: false,
          timestamp: Date.now(),
        });
      }
      this.currentUserMessageId = null;
      this.currentUserText = "";

      if (!this.streamer.isPlaying()) {
        this.setState('listening');
      }
    }

    // Check if new model response is starting after an interruption
    if (this.isInterrupted) {
      const timeSinceInterruption = Date.now() - this.lastInterruptionTime;
      if (timeSinceInterruption > 300 && (this.lastUserSpeechTime >= this.lastInterruptionTime || !this.streamer.isPlaying())) {
        this.isInterrupted = false;
      }
    }

    // Model text extraction (Streaming text from model - single-source deduplication)
    let incomingKituChunk = "";
    const parts = message.serverContent?.modelTurn?.parts;
    if (parts && parts.length > 0) {
      for (const part of parts) {
        if (part.text) {
          incomingKituChunk += part.text;
        }
      }
    }
    const outputTranscriptionText = (message.serverContent as any)?.outputTranscription?.text;
    if (!incomingKituChunk && outputTranscriptionText) {
      incomingKituChunk = outputTranscriptionText;
    }

    if (incomingKituChunk && !this.isInterrupted) {
      this.handleIncomingKituText(incomingKituChunk);
    }

    // Input transcription text (Speech-to-text of User's voice)
    const inputTranscriptionText = (message.serverContent as any)?.inputTranscription?.text;
    if (inputTranscriptionText) {
      this.handleIncomingUserText(inputTranscriptionText);
    }

    // Audio Output from Model Turn
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // Discard late-arriving audio chunks from the previous interrupted response
      if (this.isInterrupted) {
        return;
      }

      this.setState('speaking');
      this.streamer.addChunk(base64Audio);
    }

    // Tool Calls
    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls) {
        if (call.name === 'openWebsite') {
          const { url } = call.args as { url: string };
          window.open(url, '_blank');
          this.session.sendToolResponse({
            functionResponses: [{
              name: call.name,
              response: { success: true, opened: url },
              id: call.id
            }]
          });
        } else if (call.name === 'updateUserPreferences') {
          try {
            const { preferencesJson } = call.args as { preferencesJson: string };
            const prefs = JSON.parse(preferencesJson);
            this.saveUserProfile({ preferences: prefs });
            this.session.sendToolResponse({
              functionResponses: [{
                name: call.name,
                response: { success: true, updated: true },
                id: call.id
              }]
            });
          } catch (e) {
            this.session.sendToolResponse({
              functionResponses: [{
                name: call.name,
                response: { success: false, error: "Invalid JSON" },
                id: call.id
              }]
            });
          }
        } else if (call.name === 'updateMemory') {
          const { summary } = call.args as { summary: string };
          this.saveUserProfile({ memory: summary });
          this.session.sendToolResponse({
            functionResponses: [{
              name: call.name,
              response: { success: true, memorized: true },
              id: call.id
            }]
          });
        }
      }
    }
  }

  private sendAudio(base64: string, pcm16?: Int16Array) {
    if (this.session && this.state !== 'disconnected') {
      if (pcm16) {
        let sumSquares = 0;
        for (let i = 0; i < pcm16.length; i++) {
          const norm = pcm16[i] / 32768.0;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / pcm16.length);
        // Voice activity threshold above background room noise
        if (rms > 0.035) {
          this.lastUserSpeechTime = Date.now();
          // If user speaks while Kitu is actively speaking, trigger instant local cutoff
          if (this.streamer.isPlaying() || this.state === 'speaking') {
            this.cancelCurrentPlayback();
          }
        }
      }

      if (this.state !== 'speaking' && this.state !== 'listening') {
        this.setState('listening');
      }

      this.session.sendRealtimeInput({
        audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
      });
    }
  }

  sendText(text: string) {
    if (this.session && this.state !== 'disconnected') {
      this.cancelCurrentPlayback();
      this.lastUserSpeechTime = Date.now() + 500;
      this.isInterrupted = false;

      if (this.onTranscript) {
        this.onTranscript({
          id: 'user-' + Date.now(),
          sender: 'user',
          text,
          isStreaming: false,
          timestamp: Date.now(),
        });
      }

      this.session.send({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text }]
          }],
          turnComplete: true
        }
      });
    }
  }

  disconnect() {
    this.recorder.stop();
    this.streamer.stop();
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.setState('disconnected');
  }
}
