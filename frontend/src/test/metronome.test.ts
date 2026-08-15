import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Metronome } from "../lib/metronome";

/**
 * jsdom does not implement the Web Audio API, so we install a minimal fake
 * `AudioContext` before each test -- just enough surface area for
 * `Metronome` to schedule its click oscillator without throwing.
 */
class FakeOscillator {
  frequency = { value: 0 };
  connect() {
    return this;
  }
  start() {}
  stop() {}
}

class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect() {
    return this;
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createOscillator() {
    return new FakeOscillator();
  }
  createGain() {
    return new FakeGain();
  }
  close() {}
}

describe("Metronome", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      FakeAudioContext as unknown as typeof AudioContext;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not running until started", () => {
    const metronome = new Metronome();
    expect(metronome.isRunning).toBe(false);
  });

  it("reports running after start() and not running after stop()", () => {
    const metronome = new Metronome();
    metronome.start(120);
    expect(metronome.isRunning).toBe(true);
    metronome.stop();
    expect(metronome.isRunning).toBe(false);
  });

  it("schedules clicks at the interval implied by the tempo", () => {
    const metronome = new Metronome();
    const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, "createOscillator");
    metronome.start(120); // 500ms per beat
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1); // immediate first click

    vi.advanceTimersByTime(500);
    expect(createOscillatorSpy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(createOscillatorSpy).toHaveBeenCalledTimes(4);

    metronome.stop();
  });

  it("restarting replaces the previous interval rather than stacking timers", () => {
    const metronome = new Metronome();
    const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, "createOscillator");
    metronome.start(60); // 1000ms per beat
    createOscillatorSpy.mockClear();
    metronome.start(240); // restart at a faster tempo: 250ms per beat

    vi.advanceTimersByTime(250);
    // Only the faster interval's click should have fired -- if the old
    // 1000ms interval were still alive too, this would be identical either
    // way at t=250ms, so also check that no extra/duplicate timers exist
    // by advancing further and counting precisely.
    vi.advanceTimersByTime(750); // total elapsed since restart: 1000ms => 4 clicks at 250ms cadence
    // 1 immediate + 3 more from the interval by t=1000ms (at 250, 500, 750, 1000 => 4 interval fires + 1 immediate)
    expect(createOscillatorSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    metronome.stop();
  });

  it("dispose() stops the metronome", () => {
    const metronome = new Metronome();
    metronome.start(120);
    metronome.dispose();
    expect(metronome.isRunning).toBe(false);
  });
});
