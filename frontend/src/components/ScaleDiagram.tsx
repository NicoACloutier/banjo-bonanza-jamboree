/**
 * A key's scale on the banjo neck (SVG): strings 1-5 top to bottom like tab,
 * frets 0-12 left to right (counted from the capo), with every scale note
 * marked by its degree (1 = the root, highlighted). The short 5th string is
 * drawn from where it starts: the 5th fret, or wherever it's capoed/spiked.
 */
import { pitchClassOf, scaleForKey } from "../lib/chords";
import type { TuningOut } from "../types/api";

interface ScaleDiagramProps {
  /** A key from MAJOR_KEYS or MINOR_KEYS, e.g. "G" or "Em". */
  songKey: string;
  tuning: TuningOut;
  capoFret: number;
  /** How far the 5th string is raised (its own capo/spike, or the main capo). */
  fifthStringRaise: number;
  frets?: number;
}

const FRET_WIDTH = 36;
const STRING_GAP = 24;
const LEFT = 58; // room for string labels and open-string notes
const TOP = 16;
const MARKER_RADIUS = 9;
const FRET_NUMBERS = [3, 5, 7, 9, 12];

export function ScaleDiagram({ songKey, tuning, capoFret, fifthStringRaise, frets = 12 }: ScaleDiagramProps) {
  const scale = scaleForKey(songKey);
  const width = LEFT + frets * FRET_WIDTH + 12;
  const height = TOP + STRING_GAP * 4 + 34;
  const y = (stringNumber: number) => TOP + (stringNumber - 1) * STRING_GAP;
  // Open notes sit just left of the nut; fretted notes in the middle of their fret.
  const noteX = (fret: number) => (fret === 0 ? LEFT - 18 : LEFT + (fret - 0.5) * FRET_WIDTH);
  // The 5th string starts at the 5th fret (plus any spike), counted from the capo.
  const fifthStart = Math.max(0, 5 + fifthStringRaise - capoFret);

  const markers: { stringNumber: number; x: number; degree: number }[] = [];
  for (let stringNumber = 1; stringNumber <= 5; stringNumber++) {
    const isFifth = stringNumber === 5;
    const openPitch = pitchClassOf(tuning.open_strings[stringNumber - 1], isFifth ? fifthStringRaise : capoFret);
    const first = isFifth ? fifthStart : 0;
    for (let fret = first; fret <= frets; fret++) {
      const degree = scale.indexOf((openPitch + fret - first) % 12);
      if (degree === -1) continue;
      // The 5th string's open note sits at its own nut (the spike), not the main nut.
      const x = isFifth && fret === fifthStart && fret > 0 ? LEFT + fret * FRET_WIDTH : noteX(fret);
      markers.push({ stringNumber, x, degree: degree + 1 });
    }
  }

  const keyLabel = songKey.endsWith("m") ? `${songKey.slice(0, -1)} minor` : `${songKey} major`;
  return (
    <figure className="scale-diagram">
      <figcaption>
        <strong>{keyLabel} scale</strong>
        <span className="muted-text"> -- numbers are scale degrees (1 is the root); frets counted from the capo</span>
      </figcaption>
      <div className="scale-diagram-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${keyLabel} scale`}>
          {/* Nut and frets. */}
          <line x1={LEFT} x2={LEFT} y1={y(1)} y2={y(4)} stroke="currentColor" strokeWidth={4} />
          {Array.from({ length: frets }, (_, i) => (
            <line
              key={`fret-${i}`}
              x1={LEFT + (i + 1) * FRET_WIDTH}
              x2={LEFT + (i + 1) * FRET_WIDTH}
              y1={y(1)}
              y2={y(5)}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.6}
            />
          ))}
          {/* Strings, labelled 1-5; the 5th string starts partway up the neck. */}
          {[1, 2, 3, 4, 5].map((stringNumber) => (
            <g key={stringNumber}>
              <text x={8} y={y(stringNumber) + 4} fontSize="11" fill="currentColor">
                {stringNumber}
              </text>
              <line
                x1={stringNumber === 5 ? LEFT + fifthStart * FRET_WIDTH : LEFT}
                x2={LEFT + frets * FRET_WIDTH}
                y1={y(stringNumber)}
                y2={y(stringNumber)}
                stroke="currentColor"
                strokeWidth={1.25}
              />
            </g>
          ))}
          {fifthStart > 0 && (
            <rect
              x={LEFT + fifthStart * FRET_WIDTH - 3}
              y={y(5) - 6}
              width={6}
              height={12}
              fill="currentColor"
              aria-hidden="true"
            />
          )}
          {FRET_NUMBERS.filter((fret) => fret <= frets).map((fret) => (
            <text
              key={`n-${fret}`}
              x={noteX(fret)}
              y={y(5) + 26}
              fontSize="10"
              textAnchor="middle"
              fill="currentColor"
              opacity={0.7}
            >
              {fret}
            </text>
          ))}
          {markers.map(({ stringNumber, x, degree }) => (
            <g key={`${stringNumber}-${x}`} className={degree === 1 ? "scale-note root" : "scale-note"}>
              <circle cx={x} cy={y(stringNumber)} r={MARKER_RADIUS} />
              <text x={x} y={y(stringNumber) + 4} fontSize="11" textAnchor="middle">
                {degree}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}
