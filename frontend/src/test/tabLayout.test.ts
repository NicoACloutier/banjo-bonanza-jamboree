import { describe, expect, it } from "vitest";
import {
  barStartNoteIds,
  computePlaybackSchedule,
  effectiveBeats,
  splitIntoLines,
  swingBeat,
  totalDurationSeconds,
} from "../lib/tabLayout";
import { frettedFrequency } from "../lib/audioTheory";
import { getFallbackTuning } from "../lib/tunings";
import type { NoteFretIn, NoteOut } from "../types/api";

function makeFret(overrides: Partial<NoteFretIn> = {}): NoteFretIn {
  return {
    string_number: 1,
    fret: 0,
    technique: "normal",
    slide_to_fret: null,
    bend_semitones: null,
    right_hand_finger: null,
    ...overrides,
  };
}

function makeNote(overrides: Partial<NoteOut>): NoteOut {
  return {
    id: "n1",
    position: 0,
    duration_beats: 1,
    line_break: false,
    lyric: null,
    is_rest: false,
    thumb_after: false,
    dotted: false,
    triplet: false,
    tied: false,
    chord: null,
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

  it("raises every sounding pitch by the capo fret count, independent of transpose", () => {
    const notes = [makeNote({ frets: [makeFret({ string_number: 1, fret: 0 })] })];
    const noCapo = computePlaybackSchedule(notes, tuning, 60, 0, { capoFret: 0 })[0].sounds[0].frequency;
    const capo2 = computePlaybackSchedule(notes, tuning, 60, 0, { capoFret: 2 })[0].sounds[0].frequency;
    expect(capo2).toBeCloseTo(noCapo * Math.pow(2, 2 / 12), 3);
  });

  it("composes capo and transpose independently (both raise pitch additively)", () => {
    const notes = [makeNote({ frets: [makeFret({ string_number: 1, fret: 0 })] })];
    const base = computePlaybackSchedule(notes, tuning, 60, 0, { capoFret: 0 })[0].sounds[0].frequency;
    const both = computePlaybackSchedule(notes, tuning, 60, 3, { capoFret: 2 })[0].sounds[0].frequency;
    expect(both).toBeCloseTo(base * Math.pow(2, 5 / 12), 3);
  });

  it("also raises a slide's target frequency by the capo fret count", () => {
    const notes = [
      makeNote({
        frets: [makeFret({ string_number: 1, fret: 2, technique: "slide", slide_to_fret: 4 })],
      }),
    ];
    const noCapo = computePlaybackSchedule(notes, tuning, 60, 0, { capoFret: 0 })[0].sounds[0];
    const withCapo = computePlaybackSchedule(notes, tuning, 60, 0, { capoFret: 3 })[0].sounds[0];
    expect(withCapo.frequency).toBeCloseTo(noCapo.frequency * Math.pow(2, 3 / 12), 3);
    expect(withCapo.slideToFrequency!).toBeCloseTo(noCapo.slideToFrequency! * Math.pow(2, 3 / 12), 3);
  });

  it("computes a bendToFrequency for bend technique frets, rising by bend_semitones", () => {
    const notes = [
      makeNote({
        frets: [makeFret({ string_number: 1, fret: 2, technique: "bend", bend_semitones: 2 })],
      }),
    ];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    const sound = schedule[0].sounds[0];
    expect(sound.technique).toBe("bend");
    expect(sound.bendToFrequency).toBeDefined();
    expect(sound.bendToFrequency!).toBeCloseTo(sound.frequency * Math.pow(2, 2 / 12), 3);
  });

  it("does not set bendToFrequency for a bend fret missing bend_semitones", () => {
    const notes = [
      makeNote({ frets: [makeFret({ string_number: 1, fret: 2, technique: "bend", bend_semitones: null })] }),
    ];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    expect(schedule[0].sounds[0].bendToFrequency).toBeUndefined();
  });

  it("does not set bendToFrequency for non-bend techniques", () => {
    const notes = [makeNote({ frets: [makeFret({ technique: "drop_thumb" })] })];
    const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
    expect(schedule[0].sounds[0].bendToFrequency).toBeUndefined();
  });

  describe("clawhammer thumb pluck (thumb_after)", () => {
    const melody = (id: string, position: number, overrides: Partial<NoteOut> = {}) =>
      makeNote({ id, position, frets: [makeFret({ string_number: 3 })], ...overrides });

    it("plucks the open 5th string halfway through the note, taking no extra time", () => {
      const notes = [melody("a", 0, { thumb_after: true }), melody("b", 1)];
      const schedule = computePlaybackSchedule(notes, tuning, 60, 0, { clawhammerTiming: true });
      expect(schedule.map((n) => [n.id, n.startTimeSeconds, n.sounds[0].stringNumber])).toEqual([
        ["a", 0, 3],
        ["a", 0.5, 5],
        ["b", 1, 3],
      ]);
      expect(schedule[1].sounds[0].frequency).toBeCloseTo(392, 0); // open G4
      expect(schedule[1].durationSeconds).toBeCloseTo(0.5, 5);
      expect(totalDurationSeconds(notes, 60)).toBeCloseTo(2, 5);
    });

    it("scales with the note's duration", () => {
      const notes = [melody("a", 0, { duration_beats: 2, thumb_after: true })];
      const schedule = computePlaybackSchedule(notes, tuning, 60, 0, { clawhammerTiming: true });
      expect(schedule[1].startTimeSeconds).toBeCloseTo(1, 5);
    });

    it("can follow a rest", () => {
      const notes = [makeNote({ id: "r", position: 0, is_rest: true, frets: [], thumb_after: true })];
      const schedule = computePlaybackSchedule(notes, tuning, 60, 0, { clawhammerTiming: true });
      expect(schedule.map((n) => [n.startTimeSeconds, n.sounds[0].stringNumber])).toEqual([[0.5, 5]]);
    });

    it("applies the capo and transposition to the 5th string", () => {
      const notes = [melody("a", 0, { thumb_after: true })];
      const plain = computePlaybackSchedule(notes, tuning, 60, 0, { clawhammerTiming: true })[1].sounds[0].frequency;
      const shifted = computePlaybackSchedule(notes, tuning, 60, 1, { capoFret: 2, clawhammerTiming: true })[1].sounds[0].frequency;
      expect(shifted / plain).toBeCloseTo(Math.pow(2, 3 / 12), 5);
    });

    it("is ignored when clawhammer mode is off", () => {
      const notes = [melody("a", 0, { thumb_after: true }), melody("b", 1)];
      const schedule = computePlaybackSchedule(notes, tuning, 60, 0, { clawhammerTiming: false });
      expect(schedule.map((n) => n.startTimeSeconds)).toEqual([0, 1]);
    });
  });

  describe("hammer-ons and pull-offs", () => {
    const on = (id: string, position: number, fret: number, technique: NoteFretIn["technique"] = "normal") =>
      makeNote({ id, position, frets: [makeFret({ string_number: 3, fret, technique })] });
    const g3 = (fret: number) => frettedFrequency("G3", fret);

    it("starts a hammer-on at the previous fret on that string, taking a normal note's time", () => {
      const notes = [on("a", 0, 0), on("b", 1, 2, "hammer_on"), on("c", 2, 0)];
      const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
      expect(schedule.map((n) => n.startTimeSeconds)).toEqual([0, 1, 2]);
      expect(schedule[1].sounds[0].fromFrequency).toBeCloseTo(g3(0), 3);
      expect(schedule[1].sounds[0].frequency).toBeCloseTo(g3(2), 3);
    });

    it("starts a pull-off at the previous fret on that string", () => {
      const notes = [on("a", 0, 3), on("b", 1, 0, "pull_off")];
      const sound = computePlaybackSchedule(notes, tuning, 60, 0)[1].sounds[0];
      expect(sound.fromFrequency).toBeCloseTo(g3(3), 3);
      expect(sound.frequency).toBeCloseTo(g3(0), 3);
    });

    it("uses the previous fret on the same string, skipping notes on other strings", () => {
      const notes = [
        on("a", 0, 1),
        makeNote({ id: "x", position: 1, frets: [makeFret({ string_number: 1, fret: 5 })] }),
        on("b", 2, 3, "hammer_on"),
      ];
      expect(computePlaybackSchedule(notes, tuning, 60, 0)[2].sounds[0].fromFrequency).toBeCloseTo(g3(1), 3);
    });

    it("counts a slide's target fret as the string's last fret", () => {
      const notes = [
        makeNote({ id: "a", position: 0, frets: [makeFret({ string_number: 3, fret: 2, technique: "slide", slide_to_fret: 4 })] }),
        on("b", 1, 2, "pull_off"),
      ];
      expect(computePlaybackSchedule(notes, tuning, 60, 0)[1].sounds[0].fromFrequency).toBeCloseTo(g3(4), 3);
    });

    it("with nothing before it, hammers on from the open string and pulls off from two frets up", () => {
      expect(computePlaybackSchedule([on("h", 0, 2, "hammer_on")], tuning, 60, 0)[0].sounds[0].fromFrequency).toBeCloseTo(
        g3(0),
        3,
      );
      expect(computePlaybackSchedule([on("p", 0, 2, "pull_off")], tuning, 60, 0)[0].sounds[0].fromFrequency).toBeCloseTo(
        g3(4),
        3,
      );
    });

    it("applies the capo to the starting fret too", () => {
      const notes = [on("a", 0, 0), on("b", 1, 2, "hammer_on")];
      const sound = computePlaybackSchedule(notes, tuning, 60, 0, { capoFret: 2 })[1].sounds[0];
      expect(sound.fromFrequency).toBeCloseTo(g3(2), 3);
      expect(sound.frequency).toBeCloseTo(g3(4), 3);
    });

    it("does not set a starting pitch for plain notes", () => {
      const schedule = computePlaybackSchedule([on("a", 0, 0), on("b", 1, 2)], tuning, 60, 0);
      expect(schedule[1].sounds[0].fromFrequency).toBeUndefined();
    });
  });

  describe("rhythm", () => {
    const n = (id: string, position: number, overrides: Partial<NoteOut> = {}) =>
      makeNote({ id, position, frets: [makeFret({ string_number: 3 })], ...overrides });

    it("applies dotted (x1.5) and triplet (x2/3) modifiers", () => {
      expect(effectiveBeats(n("a", 0, { duration_beats: 1, dotted: true }))).toBe(1.5);
      expect(effectiveBeats(n("a", 0, { duration_beats: 0.5, triplet: true }))).toBeCloseTo(1 / 3, 10);
      const notes = [n("a", 0, { dotted: true, duration_beats: 0.5 }), n("b", 1, { duration_beats: 0.25 }), n("c", 2)];
      expect(computePlaybackSchedule(notes, tuning, 60, 0).map((x) => x.startTimeSeconds)).toEqual([0, 0.75, 1]);
      expect(totalDurationSeconds(notes, 60)).toBeCloseTo(2, 10);
    });

    it("fits three triplet eighths into one beat", () => {
      const notes = [0, 1, 2, 3].map((i) => n(`t${i}`, i, { duration_beats: 0.5, triplet: i < 3 }));
      const starts = computePlaybackSchedule(notes, tuning, 60, 0).map((x) => x.startTimeSeconds);
      expect(starts[3]).toBeCloseTo(1, 10);
    });

    it("puts bar lines at measure boundaries for the time signature", () => {
      const quarters = [0, 1, 2, 3, 4, 5, 6].map((i) => n(`q${i}`, i));
      expect([...barStartNoteIds(quarters, "4/4")]).toEqual(["q4"]);
      expect([...barStartNoteIds(quarters, "3/4")]).toEqual(["q3", "q6"]);
      const eighths = Array.from({ length: 13 }, (_, i) => n(`e${i}`, i, { duration_beats: 0.5 }));
      expect([...barStartNoteIds(eighths, "6/8")]).toEqual(["e6", "e12"]);
      // A dotted quarter + eighth fills two beats.
      const dotted = [n("d", 0, { dotted: true }), n("e", 1, { duration_beats: 0.5 }), n("f", 2), n("g", 3)];
      expect([...barStartNoteIds(dotted, "2/4")]).toEqual(["f"]);
    });

    it("swings eighth notes long-short without changing whole beats", () => {
      expect(swingBeat(0.5)).toBeCloseTo(2 / 3, 10);
      expect(swingBeat(2)).toBe(2);
      const eighths = [0, 1, 2, 3].map((i) => n(`e${i}`, i, { duration_beats: 0.5 }));
      const schedule = computePlaybackSchedule(eighths, tuning, 60, 0, { swing: true });
      expect(schedule.map((x) => x.startTimeSeconds)).toEqual([0, 2 / 3, 1, 1 + 2 / 3].map((t) => expect.closeTo(t, 10)));
      expect(schedule[0].durationSeconds).toBeCloseTo(2 / 3, 10);
      expect(schedule[1].durationSeconds).toBeCloseTo(1 / 3, 10);
    });

    it("rings a tied note on from the previous one instead of re-picking it", () => {
      const notes = [
        n("a", 0, { frets: [makeFret({ string_number: 3, fret: 2 }), makeFret({ string_number: 1, fret: 0 })] }),
        n("b", 1, { tied: true, frets: [makeFret({ string_number: 3, fret: 2 }), makeFret({ string_number: 2, fret: 1 })] }),
      ];
      const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
      // The tied string 3 isn't picked again; the new string 2 is.
      expect(schedule[1].sounds.map((s) => s.stringNumber)).toEqual([2]);
      // Note a's string 3 now rings through both notes; its string 1 doesn't.
      const [string3, string1] = schedule[0].sounds;
      expect(string3.durationSeconds).toBeCloseTo(2, 10);
      expect(string1.durationSeconds).toBeUndefined();
    });

    it("re-picks a tied note whose fret differs from the previous one", () => {
      const notes = [n("a", 0, { frets: [makeFret({ string_number: 3, fret: 2 })] }), n("b", 1, { tied: true, frets: [makeFret({ string_number: 3, fret: 4 })] })];
      expect(computePlaybackSchedule(notes, tuning, 60, 0)[1].sounds.map((s) => s.fret)).toEqual([4]);
    });

    it("keeps a fully tied note in the schedule, silent, for highlighting", () => {
      const notes = [n("a", 0), n("b", 1, { tied: true })];
      const schedule = computePlaybackSchedule(notes, tuning, 60, 0);
      expect(schedule.map((x) => [x.id, x.sounds.length])).toEqual([["a", 1], ["b", 0]]);
    });
  });

  describe("5th-string capo", () => {
    const fifth = [makeNote({ id: "f", frets: [makeFret({ string_number: 5, fret: 0 })] })];
    const third = [makeNote({ id: "t", frets: [makeFret({ string_number: 3, fret: 0 })] })];
    const freq = (notes: NoteOut[], options: object) => computePlaybackSchedule(notes, tuning, 60, 0, options)[0].sounds[0].frequency;
    const g4 = frettedFrequency("G4", 0);

    it("follows the main capo by default", () => {
      expect(freq(fifth, { capoFret: 2 })).toBeCloseTo(g4 * Math.pow(2, 2 / 12), 5);
    });

    it("stays open, or is raised by its own capo (spike at fret N = N - 5 semitones)", () => {
      expect(freq(fifth, { capoFret: 2, fifthStringCapoFret: 0 })).toBeCloseTo(g4, 5);
      expect(freq(fifth, { capoFret: 0, fifthStringCapoFret: 7 })).toBeCloseTo(g4 * Math.pow(2, 2 / 12), 5);
    });

    it("doesn't affect strings 1-4", () => {
      expect(freq(third, { capoFret: 2, fifthStringCapoFret: 0 })).toBeCloseTo(freq(third, { capoFret: 2 }), 5);
    });

    it("applies to clawhammer thumb plucks", () => {
      const notes = [makeNote({ id: "a", thumb_after: true })];
      const thumb = computePlaybackSchedule(notes, tuning, 60, 0, { clawhammerTiming: true, fifthStringCapoFret: 9 })[1];
      expect(thumb.sounds[0].frequency).toBeCloseTo(g4 * Math.pow(2, 4 / 12), 5);
    });
  });
});
