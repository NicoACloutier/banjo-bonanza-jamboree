/**
 * A simple Web Audio metronome: schedules short click sounds at a fixed
 * tempo (BPM), independent of tab playback -- useful for practicing timing
 * separately from (or alongside) the tab's own automatic playback. Given a
 * meter (from the tab's time signature) it clicks once per pulse and
 * accents the first pulse of each bar.
 */
import type { Meter } from "./tabLayout";

/**
 * Schedule one click at `when` (AudioContext time). Accented clicks (the
 * first of a bar) are higher and louder. Returns the click's source node so
 * callers can cancel it.
 */
export function scheduleClick(ctx: AudioContext, when: number, accent = false): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1500 : 1000;
  gain.gain.setValueAtTime(accent ? 0.5 : 0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.05);
  return osc;
}

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

  /**
   * Start clicking at `tempoBpm` (quarter notes per minute). With a `meter`,
   * it clicks once per pulse (a dotted quarter in 6/8) and accents each
   * bar's first click; without one, it clicks every beat, unaccented.
   */
  start(tempoBpm: number, meter: Meter | null = null): void {
    this.stop();
    this.running = true;
    const intervalMs = (meter?.pulseBeats ?? 1) * (60 / tempoBpm) * 1000;
    let pulse = 0;
    const click = () => {
      const ctx = this.ensureContext();
      scheduleClick(ctx, ctx.currentTime, meter !== null && pulse % meter.pulsesPerBar === 0);
      pulse++;
    };
    click();
    this.timerHandle = window.setInterval(click, intervalMs);
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
