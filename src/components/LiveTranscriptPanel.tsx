import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Trash2, X, Volume2, ChevronDown, ChevronUp, Subtitles, Radio } from 'lucide-react';
import { TranscriptMessage, SessionState } from '../services/gemini-live';

interface LiveTranscriptPanelProps {
  transcripts: TranscriptMessage[];
  state: SessionState;
  onClear: () => void;
  onClose?: () => void;
  isOpen: boolean;
}

export function LiveTranscriptPanel({
  transcripts,
  state,
  onClear,
  onClose,
  isOpen,
}: LiveTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [isMobileCollapsed, setIsMobileCollapsed] = useState(false);

  // Auto-scroll whenever transcript updates or incoming text streams
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [transcripts]);

  const activeStreamingMessage = transcripts.find((t) => t.isStreaming && t.sender === 'kitu');
  const hasTranscripts = transcripts.length > 0;

  if (!isOpen) return null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 30, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30, scale: 0.96 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`fixed z-30 transition-all duration-300 flex flex-col rounded-3xl bg-zinc-950/80 backdrop-blur-2xl border border-white/10 shadow-[0_12px_45px_rgba(0,0,0,0.65)] overflow-hidden
        lg:top-20 lg:bottom-24 lg:right-6 lg:w-[380px] xl:w-[420px] 
        max-lg:inset-x-4 max-lg:bottom-24 ${
          isMobileCollapsed ? 'max-lg:h-14' : 'max-lg:max-h-[46vh]'
        }`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/[0.02] select-none">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                state === 'speaking'
                  ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)] animate-ping'
                  : state === 'listening'
                  ? 'bg-pink-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]'
                  : 'bg-zinc-600'
              }`}
            />
            <span
              className={`absolute w-2 h-2 rounded-full ${
                state === 'speaking'
                  ? 'bg-cyan-400'
                  : state === 'listening'
                  ? 'bg-pink-500'
                  : 'bg-zinc-600'
              }`}
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase text-white/90">
                Live Speech Text
              </span>
              {state === 'speaking' ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse flex items-center gap-1">
                  <Radio size={9} className="animate-spin" /> Speaking
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase bg-pink-500/20 text-pink-400 border border-pink-500/30">
                  Real-time
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-400">
              {state === 'speaking'
                ? "Streaming Kitu's voice response..."
                : state === 'listening'
                ? 'Listening to you...'
                : state === 'connected'
                ? 'Ready'
                : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Mobile Collapse / Expand Button */}
          <button
            onClick={() => setIsMobileCollapsed(!isMobileCollapsed)}
            className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            title={isMobileCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isMobileCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {hasTranscripts && !isMobileCollapsed && (
            <button
              onClick={onClear}
              title="Clear transcript history"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/5 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              title="Close panel"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Real-time Streaming Active Highlight Banner */}
      <AnimatePresence>
        {activeStreamingMessage && !isMobileCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500/15 via-purple-500/15 to-pink-500/15 border-b border-cyan-500/20 flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2 text-cyan-300 font-medium">
              <Sparkles size={13} className="animate-spin text-cyan-400" />
              <span>Streaming Kitu's voice response...</span>
            </div>
            <div className="flex gap-1 items-center">
              {[0, 1, 2].map((dot) => (
                <motion.div
                  key={dot}
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: dot * 0.2 }}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcript Messages Container */}
      {!isMobileCollapsed && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent min-h-0"
        >
          {transcripts.length === 0 ? (
            <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-center p-6 text-zinc-500">
              <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center mb-3">
                <Volume2 size={20} className="text-zinc-600" />
              </div>
              <p className="text-xs font-medium text-zinc-400 max-w-[220px]">
                {state === 'disconnected'
                  ? 'Turn on Kitu to start live voice conversations.'
                  : 'Speak to Kitu. Her spoken words will stream here in real-time as she speaks.'}
              </p>
            </div>
          ) : (
            transcripts.map((msg) => {
              const isKitu = msg.sender === 'kitu';
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex flex-col ${isKitu ? 'items-start' : 'items-end'}`}
                >
                  {/* Sender badge */}
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    {isKitu ? (
                      <>
                        <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-pink-500 to-cyan-400 flex items-center justify-center text-[9px] font-black text-black">
                          K
                        </div>
                        <span className="text-[11px] font-semibold text-pink-300">Kitu</span>
                        {msg.isStreaming && (
                          <span className="text-[10px] text-cyan-400 font-mono animate-pulse">
                            • speaking live
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold text-indigo-300">You</span>
                        <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold text-white">
                          U
                        </div>
                      </>
                    )}
                  </div>

                  {/* Message Bubble with dynamic live glow for active speech */}
                  <div
                    className={`relative max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all duration-300 ${
                      isKitu
                        ? msg.isStreaming
                          ? 'bg-gradient-to-b from-cyan-950/60 to-purple-950/50 text-white border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                          : 'bg-white/[0.06] text-zinc-100 border border-white/10 shadow-sm'
                        : 'bg-indigo-600/80 text-white border border-indigo-500/30'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    {isKitu && msg.isStreaming && (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="inline-block w-1.5 h-3.5 ml-1 bg-cyan-400 align-middle rounded-[1px]"
                      />
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[9px] text-zinc-600 mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </motion.div>
              );
            })
          )}
          <div ref={bottomAnchorRef} />
        </div>
      )}

      {/* Footer Info */}
      {!isMobileCollapsed && (
        <div className="px-4 py-2 border-t border-white/5 bg-black/40 flex items-center justify-between text-[10px] text-zinc-500 select-none">
          <span>Transcribed live from Gemini stream</span>
          <span>{transcripts.length} {transcripts.length === 1 ? 'turn' : 'turns'}</span>
        </div>
      )}
    </motion.aside>
  );
}
