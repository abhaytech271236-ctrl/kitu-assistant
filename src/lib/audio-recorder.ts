/**
 * AudioRecorder handles microphone capture at native 16kHz for Gemini Live API compatibility.
 */
export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioData: (base64: string, pcm16: Int16Array) => void;
  private targetSampleRate: number = 16000;

  constructor(onAudioData: (base64: string, pcm16: Int16Array) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } 
    });
    
    // Create AudioContext at native sample rate for maximum browser & OS compatibility
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    
    const source = this.audioContext.createMediaStreamSource(this.stream);
    const inputSampleRate = this.audioContext.sampleRate;
    
    // 4096 is extremely safe, buffer-stable and low-latency at native rate
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
    
    this.processor.onaudioprocess = (e) => {
      if (!this.audioContext) return;
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Perform manual downsampling from native rate (e.g. 48kHz or 44.1kHz) to 16kHz
      const downsampled = this.downsample(inputData, inputSampleRate, this.targetSampleRate);
      
      const pcm16 = new Int16Array(downsampled.length);
      for (let i = 0; i < downsampled.length; i++) {
        // Boost gain slightly (1.3x) to enhance hearing without digital clipping/distortion
        const s = Math.max(-1, Math.min(1, downsampled[i] * 1.3));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Convert PCM16 buffer to Base64 in a fast, standard, and stack-safe manner
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      this.onAudioData(base64, pcm16);
    };
  }

  /**
   * Helper function to downsample a buffer using box-filter averaging
   */
  private downsample(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
    if (inputSampleRate === outputSampleRate) {
      return buffer;
    }
    if (inputSampleRate < outputSampleRate) {
      // In case native rate is somehow lower than target, return as-is
      return buffer;
    }
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? Math.max(-1, Math.min(1, accum / count)) : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(err => console.error("Error closing AudioContext", err));
      }
      this.audioContext = null;
    }
  }
}
