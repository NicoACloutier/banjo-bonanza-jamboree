import { describe, expect, it } from "vitest";
import { computePlaybackSchedule, splitIntoLines, totalDurationSeconds } from "../lib/tabLayout";
import { getFallbackTuning } from "../lib/tunings";
import type { NoteFretIn, NoteOut } from "../types/api";

function makeFret(overrides: Partial<NoteFretIn> = {}): NoteFretIn {
  return { string_number: 1, fret: 0, technique: "normal", slide_to_fret: null, ...overrides };
}

function makeNote(overrides: Partial<NoteOut>): NoteOut {
  return {
    id: "n1",
    position: 0,
    duration_beats: 1,
    line_break: false,
    lyric: null,
    is_rest: false,
    frets: [makeFret()],
    ...overrides,
  };
}

describe("tabLayout", () => {
  const tuning = getFallbackTuning("standard_g");

  it("computes sequential start times based on tempo and durations", () => {
    const notes = [
      makeNote({ id: "a", position: 0, duration_beats: 1 }),
      makeNote({ id: "b", position: 1, duration_beats: 2 }),
      makeNote({ id: "c", position: 2, duration_beats: 1 }),
    ];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0); // 1 beat = 1 second at 60bpm
    expect(schedule.map((n) => n.startTimeSeconds)).toEqual([0, 1, 3]);
  });

  it("sorts by position regardless of input order", () => {
    const notes = [makeNote({ id: "b", position: 1 }), makeNote({ id: "a", position: 0 })];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    expect(schedule.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("applies transposition to computed frequencies", () => {
    const notes = [makeNote({ frets: [makeFret({ string_number: 1, fret: 0 })] })];
    const noTranspose = computePlaybackSchedule(notes, tuning, 100, 0)[0].sounds[0].frequency;
    const transposedUp = computePlaybackSchedule(notes, tuning, 100, 2)[0].sounds[0].frequency;
    expect(transposedUp).toBeCloseTo(noTranspose * Math.pow(2, 2 / 12), 3);
  });

  it("computes total duration in seconds", () => {
    const notes = [makeNote({ duration_beats: 1 }), makeNote({ duration_beats: 3 })];
    expect(totalDurationSeconds(notes, 60)).toBeCloseTo(4, 5);
  });

  it("splits notes into lines at line_break markers", () => {
    const notes = [
      makeNote({ id: "a", position: 0, line_break: true }),
      makeNote({ id: "b", position: 1 }),
      makeNote({ id: "c", position: 2, line_break: true }),
      makeNote({ id: "d", position: 3 }),
    ];
    const lines = splitIntoLines(notes);
    expect(lines).toHaveLength(3);
    expect(lines[0].map((n) => n.id)).toEqual(["a"]);
    expect(lines[1].map((n) => n.id)).toEqual(["b", "c"]);
    expect(lines[2].map((n) => n.id)).toEqual(["d"]);
  });

  it("skips rest notes when building the sounding schedule, but still advances time", () => {
    const notes = [
      makeNote({ id: "a", position: 0, duration_beats: 1 }),
      makeNote({ id: "rest", position: 1, duration_beats: 2, is_rest: true, frets: [] }),
      makeNote({ id: "b", position: 2, duration_beats: 1 }),
    ];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    // The rest itself produces no sounding event...
    expect(schedule.map((n) => n.id)).toEqual(["a", "b"]);
    // ...but note "b" starts 3 seconds in (1s for "a" + 2s for the rest), not 1s.
    expect(schedule.map((n) => n.startTimeSeconds)).toEqual([0, 3]);
  });

  it("still counts rest duration towards the total playback duration", () => {
    const notes = [
      makeNote({ duration_beats: 1 }),
      makeNote({ duration_beats: 3, is_rest: true, frets: [] }),
    ];
    expect(totalDurationSeconds(notes, 60)).toBeCloseTo(4, 5);
  });

  it("does not crash and skips sound for a fret with an out-of-range string_number", () => {
    // Defense-in-depth: the backend now validates string_number is 1..5,
    // but the frontend schedule builder must not throw if it ever receives
    // malformed data (e.g. from stale cached data or a future bug).
    const notes = [
      makeNote({ id: "bad", position: 0, duration_beats: 1, frets: [makeFret({ string_number: 9 })] }),
      makeNote({ id: "good", position: 1, duration_beats: 1, frets: [makeFret({ string_number: 1 })] }),
    ];
    expect(() => computePlaybackSchedule(notes, tuning, 60, 0)).not.toThrow();
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    // The malformed note produces no sounding event, but time still advances
    // for it, so "good" starts at 1s, not 0s.
    expect(schedule.map((n) => n.id)).toEqual(["good"]);
    expect(schedule[0].startTimeSeconds).toBe(1);
  });

  it("produces one schedule entry with multiple simultaneous sounds for a chord", () => {
    const notes = [
      makeNote({
        id: "chord",
        position: 0,
        duration_beats: 1,
        frets: [
          makeFret({ string_number: 1, fret: 0 }),
          makeFret({ string_number: 2, fret: 1 }),
          makeFret({ string_number: 3, fret: 0 }),
        ],
      }),
    ];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].sounds).toHaveLength(3);
    expect(schedule[0].sounds.map((s) => s.stringNumber)).toEqual([1, 2, 3]);
    // All three notes of the chord must start at the exact same time.
    expect(schedule[0].startTimeSeconds).toBe(0);
  });

  it("computes a slideToFrequency for slide technique frets", () => {
    const notes = [
      makeNote({
        frets: [makeFret({ string_number: 1, fret: 2, technique: "slide", slide_to_fret: 4 })],
      }),
    ];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    const sound = schedule[0].sounds[0];
    expect(sound.technique).toBe("slide");
    expect(sound.slideToFrequency).toBeDefined();
    // Sliding up 2 frets (2 semitones) raises the frequency.
    expect(sound.slideToFrequency!).toBeGreaterThan(sound.frequency);
    expect(sound.slideToFrequency!).toBeCloseTo(sound.frequency * Math.pow(2, 2 / 12), 3);
  });

  it("does not set slideToFrequency for non-slide techniques", () => {
    const notes = [makeNote({ frets: [makeFret({ technique: "hammer_on" })] })];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    expect(schedule[0].sounds[0].slideToFrequency).toBeUndefined();
  });
});
