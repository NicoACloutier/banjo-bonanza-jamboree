/**
 * A simple Web Audio metronome: schedules short click sounds at a fixed
 * tempo (BPM), independent of tab playback -- useful for practicing timing
 * separately from (or alongside) the tab's own automatic playback.
 */
export class Metronome {
  private audioContext: AudioContext | null = null;
  private timerHandle: number | null = null;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtor();
    }
    return this.audioContext;
  }

  private clickOnce(): void {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  start(tempoBpm: number): void {
    this.stop();
    this.running = true;
    const intervalMs = (60 / tempoBpm) * 1000;
    this.clickOnce();
    this.timerHandle = window.setInterval(() => this.clickOnce(), intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timerHandle !== null) {
      window.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  dispose(): void {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
  }
}
