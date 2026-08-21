/**
 * AudioStreamer handles PCM16 24kHz audio playback with instant interruption support.
 */
export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime: number = 0;
  private sampleRate: number = 24000;
  private isProcessing: boolean = false;
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  private onPlaybackComplete?: () => void;

  constructor(sampleRate: number = 24000, onPlaybackComplete?: () => void) {
    this.sampleRate = sampleRate;
    this.onPlaybackComplete = onPlaybackComplete;
  }

  async start() {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: this.sampleRate });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.nextStartTime = this.audioContext.currentTime;
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);
    }
    this.isProcessing = true;
  }

  stop() {
    this.clearQueue();
    this.isProcessing = false;
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch((err) => console.error("Error closing playback AudioContext", err));
      }
      this.audioContext = null;
      this.gainNode = null;
    }
    this.nextStartTime = 0;
  }

  isPlaying(): boolean {
    return this.scheduledSources.size > 0;
  }

  /**
   * Adds a base64 encoded PCM16 24kHz audio chunk to the playback queue.
   */
  addChunk(base64Data: string) {
    if (!this.isProcessing || !this.audioContext || !this.gainNode) return;

    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;

      this.scheduledSources.add(source);
      source.onended = () => {
        this.scheduledSources.delete(source);
        if (this.scheduledSources.size === 0 && this.onPlaybackComplete) {
          this.onPlaybackComplete();
        }
      };
    } catch (e) {
      console.error("Error processing audio chunk:", e);
    }
  }

  /**
   * Instantly stops all currently playing and queued audio chunks.
   */
  clearQueue() {
    if (this.gainNode && this.audioContext) {
      try {
        // Immediate mute to cancel any in-flight buffer frames in hardware output
        this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      } catch {}
    }

    for (const source of this.scheduledSources) {
      try {
        source.onended = null;
        source.stop(0);
        source.disconnect();
      } catch {
        // Source might have already finished or stopped
      }
    }
    this.scheduledSources.clear();

    if (this.audioContext && this.gainNode) {
      this.nextStartTime = this.audioContext.currentTime;
      // Re-enable gain cleanly for incoming fresh audio
      try {
        this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);
      } catch {}
    } else {
      this.nextStartTime = 0;
    }
  }
}
