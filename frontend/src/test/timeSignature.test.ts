import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Metronome } from "../lib/metronome";
import { TabPlaybackEngine } from "../lib/playbackEngine";
import { meterOf } from "../lib/tabLayout";
import { getFallbackTuning } from "../lib/tunings";
import type { NoteOut } from "../types/api";

/** A fake Web Audio context recording what starts when (jsdom has no Web Audio). */
class FakeAudioContext {
  static last: FakeAudioContext;
  currentTime = 10;
  sampleRate = 8000;
  destination = {};
  clicks: { when: number; frequency: number }[] = [];
  plucks: number[] = [];
  constructor() {
    FakeAudioContext.last = this;
  }
  createOscillator() {
    const osc = {
      frequency: { value: 0 },
      connect: () => ({ connect: () => undefined }),
      start: (when: number) => this.clicks.push({ when, frequency: osc.frequency.value }),
      stop: () => undefined,
    };
    return osc;
  }
  createGain() {
    return {
      gain: { value: 0, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: () => ({ connect: () => undefined }),
    };
  }
  createBuffer() {
    return { copyToChannel: () => undefined };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: () => ({ connect: () => undefined }),
      start: (when: number) => this.plucks.push(when),
      stop: () => undefined,
    };
  }
  close() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});
afterEach(() => vi.useRealTimers());

describe("meterOf", () => {
  it("counts quarter notes, except 6/8 which is felt in two dotted quarters", () => {
    expect(meterOf("2/4")).toEqual({ pulseBeats: 1, pulsesPerBar: 2 });
    expect(meterOf("3/4")).toEqual({ pulseBeats: 1, pulsesPerBar: 3 });
    expect(meterOf("4/4")).toEqual({ pulseBeats: 1, pulsesPerBar: 4 });
    expect(meterOf("6/8")).toEqual({ pulseBeats: 1.5, pulsesPerBar: 2 });
  });
});

describe("Metronome with a time signature", () => {
  const accents = () => FakeAudioContext.last.clicks.map((c) => c.frequency === 1500);

  it("accents the first beat of each 3/4 bar", () => {
    const metronome = new Metronome();
    metronome.start(120, meterOf("3/4"));
    vi.advanceTimersByTime(500 * 5);
    expect(accents()).toEqual([true, false, false, true, false, false]);
    metronome.stop();
  });

  it("clicks dotted quarters in 6/8", () => {
    const metronome = new Metronome();
    metronome.start(120, meterOf("6/8")); // a dotted quarter is 750ms at 120 bpm
    vi.advanceTimersByTime(749);
    expect(FakeAudioContext.last.clicks).toHaveLength(1);
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(750);
    expect(accents()).toEqual([true, false, true]);
    metronome.stop();
  });

  it("doesn't accent anything without a time signature", () => {
    const metronome = new Metronome();
    metronome.start(120);
    vi.advanceTimersByTime(500 * 4);
    expect(accents()).toEqual([false, false, false, false, false]);
    metronome.stop();
  });
});

describe("count-in", () => {
  const quarter = (position: number): NoteOut => ({
    id: `n${position}`,
    position,
    duration_beats: 1,
    is_rest: false,
    frets: [
      {
        string_number: 3,
        fret: 0,
        technique: "normal",
        slide_to_fret: null,
        bend_semitones: null,
        right_hand_finger: null,
      },
    ],
    lyric: null,
    line_break: false,
    thumb_after: false,
    dotted: false,
    triplet: false,
    tied: false,
    chord: null,
  });
  const notes = [quarter(0), quarter(1)];

  it("clicks one bar, then the first note lands on the next downbeat", () => {
    const engine = new TabPlaybackEngine();
    engine.play(notes, getFallbackTuning("standard_g"), 120, 0, { countIn: meterOf("3/4") });
    const ctx = FakeAudioContext.last;
    const start = 10.05;
    expect(ctx.clicks.map((c) => c.when)).toEqual([start, start + 0.5, start + 1]);
    expect(ctx.clicks.map((c) => c.frequency)).toEqual([1500, 1000, 1000]);
    expect(ctx.plucks).toEqual([start + 1.5, start + 2]);
    engine.stop();
  });

  it("is skipped unless asked for", () => {
    const engine = new TabPlaybackEngine();
    engine.play(notes, getFallbackTuning("standard_g"), 120, 0);
    expect(FakeAudioContext.last.clicks).toEqual([]);
    expect(FakeAudioContext.last.plucks[0]).toBeCloseTo(10.05);
    engine.stop();
  });

  it("isn't repeated when a looped section starts over", () => {
    const engine = new TabPlaybackEngine();
    engine.play(notes, getFallbackTuning("standard_g"), 120, 0, {
      countIn: meterOf("4/4"),
      loop: { startPosition: 0, endPosition: 1 },
    });
    const ctx = FakeAudioContext.last;
    expect(ctx.clicks).toHaveLength(4);
    vi.advanceTimersByTime((2 + 1) * 1000 + 200); // count-in + two notes, then the loop restarts
    expect(ctx.clicks).toHaveLength(4);
    expect(ctx.plucks.length).toBeGreaterThan(2);
    engine.stop();
  });
});
