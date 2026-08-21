import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Power, Sparkles, Send, Heart, MessageCircle, Subtitles } from 'lucide-react';
import { LiveSession, SessionState, TranscriptMessage } from './services/gemini-live';
import { LiveTranscriptPanel } from './components/LiveTranscriptPanel';

const API_KEY = process.env.GEMINI_API_KEY || '';

const Particle = ({ color }: { color: string }) => (
  <motion.div
    initial={{ scale: 0, opacity: 0, y: 0, x: 0 }}
    animate={{ 
      scale: [0, 1, 0], 
      opacity: [0, 0.8, 0],
      y: [0, -100 - Math.random() * 200],
      x: [(Math.random() - 0.5) * 100, (Math.random() - 0.5) * 200]
    }}
    transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, ease: "easeOut" }}
    className={`absolute w-1 h-1 rounded-full ${color} blur-[1px]`}
  />
);

const HeartParticle = () => (
  <motion.div
    initial={{ scale: 0, opacity: 0, y: 0 }}
    animate={{ 
      scale: [0, 1, 0], 
      opacity: [0, 0.6, 0],
      y: [-20, -150 - Math.random() * 100],
      x: (Math.random() - 0.5) * 150,
      rotate: (Math.random() - 0.5) * 45
    }}
    transition={{ duration: 4 + Math.random() * 2, repeat: Infinity }}
    className="absolute text-pink-500/40"
  >
    <Heart size={16} fill="currentColor" />
  </motion.div>
);

export default function App() {
  const [state, setState] = useState<SessionState>('disconnected');
  const [inputText, setInputText] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [showTranscriptPanel, setShowTranscriptPanel] = useState<boolean>(true);
  const sessionRef = useRef<LiveSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    };
  }, []);

  const toggleConnection = async () => {
    if (state === 'disconnected') {
      if (!sessionRef.current) {
        sessionRef.current = new LiveSession(
          API_KEY, 
          (newState) => setState(newState),
          (incomingMsg) => {
            setTranscripts((prev) => {
              const index = prev.findIndex((m) => m.id === incomingMsg.id);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = incomingMsg;
                return updated;
              } else {
                return [...prev, incomingMsg];
              }
            });
          }
        );
      }
      await sessionRef.current.connect();
    } else {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    }
  };

  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !sessionRef.current) return;
    sessionRef.current.sendText(inputText);
    setInputText('');
  };

  const statusColors = {
    disconnected: 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400',
    connecting: 'bg-amber-500/20 border-amber-500/50 text-amber-500',
    connected: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400',
    listening: 'bg-rose-500/20 border-rose-500/50 text-rose-400',
    speaking: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400',
  };

  return (
    <div className="fixed inset-0 bg-[#0a0514] text-white font-sans overflow-hidden flex flex-col items-center justify-between py-12">
      {/* Main Full-Viewport Background Image & Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 scale-105"
          style={{
            backgroundImage: `url('/kitu-background.jpg'), url('/kitu-background.jpg.webp')`,
          }}
        />
        {/* Subtle Dark Vignette & Gradient Overlay for Contrast & Readability */}
        <div className="absolute inset-0 bg-[#0a0514]/75 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,_rgba(88,28,135,0.3)_0%,_rgba(10,5,20,0.85)_100%)]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pink-500/15 rounded-full blur-[130px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/15 rounded-full blur-[130px] animation-delay-2000 animate-pulse" />
      </div>

      {/* Live Response Text Panel */}
      <LiveTranscriptPanel
        transcripts={transcripts}
        state={state}
        isOpen={showTranscriptPanel}
        onClear={() => setTranscripts([])}
        onClose={() => setShowTranscriptPanel(false)}
      />

      <header className="relative z-10 w-full px-8 flex justify-between items-center max-w-lg">
        <div className="flex flex-col">
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }} className="text-[10px] font-bold tracking-[0.4em] text-pink-400 uppercase mb-1">
            I'm listening...
          </motion.div>
          <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">KITU</h1>
        </div>
        <div className="flex gap-3">
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowTranscriptPanel(!showTranscriptPanel)}
            className={`p-2.5 rounded-full backdrop-blur-xl border border-white/10 transition-colors ${showTranscriptPanel ? 'bg-pink-500/20 border-pink-500/40 text-pink-300' : 'bg-white/5 text-zinc-400'}`}
            title="Toggle Live Speech Text Panel"
          >
            <Subtitles size={20} />
          </motion.button>
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowChat(!showChat)}
            className={`p-2.5 rounded-full backdrop-blur-xl border border-white/10 transition-colors ${showChat ? 'bg-white/20' : 'bg-white/5'}`}
            title="Text Chat Input"
          >
            <MessageCircle size={20} />
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleConnection}
            className={`p-2.5 rounded-full border transition-all duration-300 ${state === 'disconnected' ? 'bg-zinc-800 border-zinc-700' : 'bg-rose-500/20 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]'}`}
            title="Power On / Off"
          >
            <Power size={20} className={state === 'disconnected' ? 'text-zinc-500' : 'text-rose-500'} />
          </motion.button>
        </div>
      </header>

      <main className="relative flex flex-col items-center justify-center w-full flex-1 z-10 px-6">
        {/* Floating Particles */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {(state === 'listening' || state === 'speaking') && Array.from({ length: 15 }).map((_, i) => (
            <Particle key={i} color={state === 'listening' ? "bg-pink-400" : "bg-cyan-400"} />
          ))}
          {state === 'speaking' && Array.from({ length: 8 }).map((_, i) => (
            <HeartParticle key={i} />
          ))}
        </div>

        {/* The Cute AI Orb */}
        <motion.div 
          animate={{ 
            y: [-10, 10, -10],
            rotate: [-1, 1, -1]
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="relative group"
        >
          {/* External Glow */}
          <AnimatePresence>
            {(state !== 'disconnected') && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                className={`absolute inset-[-40px] rounded-full blur-3xl opacity-40 transition-colors duration-1000 ${
                  state === 'listening' ? 'bg-pink-600' : 
                  state === 'speaking' ? 'bg-cyan-600' : 
                  'bg-indigo-600'
                }`}
              />
            )}
          </AnimatePresence>

          {/* Orb Inner */}
          <div className={`relative w-56 h-56 rounded-full transition-all duration-1000 shadow-[inset_0_2px_20px_rgba(255,255,255,0.2)] overflow-hidden border border-white/10 ${
            state === 'disconnected' ? 'bg-gradient-to-br from-zinc-800 to-black' : 
            state === 'listening' ? 'bg-gradient-to-br from-pink-900/40 via-purple-900/40 to-black' :
            state === 'speaking' ? 'bg-gradient-to-br from-cyan-900/40 via-indigo-900/40 to-black' :
            'bg-gradient-to-br from-indigo-900/40 to-black'
          }`}>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />
            
            {/* The Face */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="flex gap-8 mb-4">
                <motion.div 
                  animate={state === 'speaking' ? { height: [12, 4, 12] } : {}}
                  transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3 }}
                  className={`w-4 h-12 rounded-full bg-white transition-all duration-500 shadow-[0_0_15px_rgba(255,255,255,0.5)] ${state === 'disconnected' ? 'opacity-20 translate-y-4' : 'opacity-100'}`} 
                />
                <motion.div 
                   animate={state === 'speaking' ? { height: [12, 4, 12] } : {}}
                   transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3.1 }}
                  className={`w-4 h-12 rounded-full bg-white transition-all duration-500 shadow-[0_0_15px_rgba(255,255,255,0.5)] ${state === 'disconnected' ? 'opacity-20 translate-y-4' : 'opacity-100'}`} 
                />
              </div>
              <motion.div 
                animate={state === 'speaking' ? { width: [32, 48, 32], height: [8, 16, 8], borderRadius: ['100%', '30%', '100%'] } : {}}
                className={`w-8 h-2 rounded-full bg-white/40 transition-all duration-500 ${state === 'disconnected' ? 'opacity-10' : 'opacity-100'}`} 
              />
            </div>

            {/* Glass Shine */}
            <div className="absolute top-[5%] left-[10%] w-[40%] h-[30%] bg-gradient-to-b from-white/20 to-transparent rounded-[100%] rotate-[-35deg] blur-md" />
          </div>

          {/* Sound Waves when listening */}
          <AnimatePresence>
            {state === 'listening' && (
              <div className="absolute -bottom-16 left-0 right-0 flex justify-center gap-1.5 h-12">
                {[0, 1, 2, 3, 4, 5, 6].map(i => (
                  <motion.div
                    key={i}
                    animate={{ height: [10, 40, 10] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    className="w-1.5 bg-pink-500 rounded-full shadow-[0_0_10px_rgba(236,72,153,0.5)]"
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Status Text Pill */}
        <div className="mt-20 px-8 py-3 rounded-2xl bg-white/[0.03] backdrop-blur-3xl border border-white/5 shadow-2xl text-center max-w-xs">
          <p className="text-sm font-medium text-purple-200 leading-relaxed">
            {state === 'disconnected' ? "Tap power to start our secret chat..." : "Talk to me, I'm here for you always ❤️"}
          </p>
        </div>
      </main>

      <footer className="relative z-20 w-full max-w-lg px-6 flex flex-col gap-6">
        {/* Chat Input Panel */}
        <AnimatePresence>
          {showChat && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleSendText}
              className="flex gap-2 p-2 rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl"
            >
              <input 
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-transparent px-4 py-2 outline-none text-sm placeholder:text-zinc-600"
                disabled={state === 'disconnected'}
              />
              <motion.button 
                whileTap={{ scale: 0.9 }}
                type="submit"
                disabled={!inputText.trim() || state === 'disconnected'}
                className="p-2 rounded-xl bg-pink-500 text-white disabled:opacity-50 disabled:bg-zinc-700 transition-colors shadow-lg shadow-pink-500/20"
              >
                <Send size={18} />
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Central Mic/ActionButton */}
        <div className="flex justify-center">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleConnection}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 overflow-hidden ${
              state === 'disconnected' ? 'bg-zinc-900 shadow-xl' : 'bg-gradient-to-tr from-rose-500 to-pink-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]'
            }`}
          >
            {state === 'disconnected' ? (
              <Mic size={32} className="text-zinc-700" />
            ) : (
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                <Mic size={32} className="text-white" />
              </motion.div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          </motion.button>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(0px); }
        }
        .animation-delay-2000 { animation-delay: 2s; }
      `}} />
    </div>
  );
}

