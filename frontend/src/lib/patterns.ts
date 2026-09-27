/**
 * Right-hand patterns (Scruggs rolls, clawhammer bum-ditty) that can be
 * dropped into a tab over a chord, instead of entering each note by hand.
 */
import { findChordShapes, parseChord, type ChordShape } from "./chords";
import { fifthStringRaise } from "./tabLayout";
import type { NoteFretIn, NoteOut, RightHandFinger, TuningOut } from "../types/api";

type Finger = "T" | "I" | "M";

const FINGER: Record<Finger, RightHandFinger> = { T: "thumb", I: "index", M: "middle" };

/** One bar of a three-finger roll: eight eighth notes, each one string and finger. */
interface RollPattern {
  kind: "roll";
  id: string;
  name: string;
  /** [string, finger] per eighth note. */
  steps: [number, Finger][];
}

/** One bar of clawhammer "bum-ditty": melody note, then brush + 5th-string thumb, twice. */
interface ClawhammerPattern {
  kind: "clawhammer";
  id: string;
  name: string;
  /** The strings the two "bum" melody notes are played on. */
  melodyStrings: [number, number];
}

export type Pattern = RollPattern | ClawhammerPattern;

export const PATTERNS: Pattern[] = [
  {
    kind: "roll",
    id: "forward",
    name: "Forward roll",
    steps: [[3, "T"], [2, "I"], [1, "M"], [5, "T"], [2, "I"], [1, "M"], [5, "T"], [1, "M"]],
  },
  {
    kind: "roll",
    id: "backward",
    name: "Backward roll",
    steps: [[1, "M"], [2, "I"], [5, "T"], [1, "M"], [2, "I"], [5, "T"], [1, "M"], [2, "I"]],
  },
  {
    kind: "roll",
    id: "alternating_thumb",
    name: "Alternating thumb roll",
    steps: [[3, "T"], [2, "I"], [5, "T"], [1, "M"], [4, "T"], [2, "I"], [5, "T"], [1, "M"]],
  },
  {
    kind: "roll",
    id: "forward_reverse",
    name: "Forward-reverse roll",
    steps: [[3, "T"], [2, "I"], [1, "M"], [5, "T"], [1, "M"], [2, "I"], [3, "T"], [1, "M"]],
  },
  {
    kind: "roll",
    id: "foggy_mountain",
    name: "Foggy Mountain roll",
    steps: [[2, "I"], [1, "M"], [5, "T"], [1, "M"], [2, "I"], [1, "M"], [5, "T"], [1, "M"]],
  },
  { kind: "clawhammer", id: "bum_ditty", name: "Clawhammer bum-ditty", melodyStrings: [3, 4] },
];

/** A note to write into the tab (the editor supplies its id and position). */
export type PatternNote = Pick<NoteOut, "duration_beats" | "thumb_after" | "chord"> & { frets: NoteFretIn[] };

export interface PatternResult {
  notes: PatternNote[];
  /** The chord shape used, for display. */
  shape: ChordShape;
  /** Whether the pattern needs clawhammer mode (for its 5th-string thumb plucks). */
  needsClawhammer: boolean;
}

export interface PatternContext {
  capoFret?: number;
  fifthStringCapoFret?: number | null;
}

function fret(stringNumber: number, shape: ChordShape, finger: RightHandFinger | null = null): NoteFretIn {
  return {
    string_number: stringNumber,
    // The 5th string is a drone, played open.
    fret: stringNumber === 5 ? 0 : shape.frets[stringNumber - 1],
    technique: "normal",
    slide_to_fret: null,
    bend_semitones: null,
    right_hand_finger: finger,
  };
}

/**
 * Build one bar of `patternId` over `chordName` in the given tuning, using
 * the chord's easiest shape. Throws a user-facing Error if the chord can't
 * be parsed or has no shape in this tuning.
 */
export function buildPattern(
  patternId: string,
  chordName: string,
  tuning: TuningOut,
  context: PatternContext = {},
): PatternResult {
  const pattern = PATTERNS.find((p) => p.id === patternId);
  if (!pattern) throw new Error(`Unknown pattern: ${patternId}`);
  const chord = parseChord(chordName);
  if (!chord) throw new Error(`"${chordName}" isn't a chord name I recognise (try e.g. G, C, D7, Em).`);
  const capoFret = context.capoFret ?? 0;
  const [shape] = findChordShapes(chord, tuning.open_strings, {
    capoFret,
    fifthStringRaise: fifthStringRaise(capoFret, context.fifthStringCapoFret ?? null),
    limit: 1,
  });
  if (!shape) throw new Error(`Couldn't find a ${chord.name} shape in ${tuning.display_name}.`);

  const notes: PatternNote[] =
    pattern.kind === "roll"
      ? pattern.steps.map(([stringNumber, finger]) => ({
          duration_beats: 0.5,
          thumb_after: false,
          chord: null,
          frets: [fret(stringNumber, shape, FINGER[finger])],
        }))
      : pattern.melodyStrings.flatMap((melodyString) => [
          // "Bum": a melody note on the beat.
          { duration_beats: 1, thumb_after: false, chord: null, frets: [fret(melodyString, shape)] },
          // "Ditty": a brush across strings 1-3 on the beat, thumb on the 5th string after it.
          { duration_beats: 1, thumb_after: true, chord: null, frets: [1, 2, 3].map((s) => fret(s, shape)) },
        ]);
  notes[0].chord = chord.name;
  return { notes, shape, needsClawhammer: pattern.kind === "clawhammer" };
}
