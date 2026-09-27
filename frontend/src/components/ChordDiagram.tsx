/**
 * A banjo chord diagram (SVG): strings 4-1 left to right, frets top to
 * bottom, a dot where each string is fretted and "o" above open strings,
 * with the starting fret labelled when the shape sits up the neck. The
 * 5th (drone) string isn't drawn; a note below says whether it can ring
 * open with the chord.
 */
import type { ChordShape } from "../lib/chords";

interface ChordDiagramProps {
  name: string;
  shape: ChordShape;
}

const FRETS_SHOWN = 4;
const STRING_GAP = 18;
const FRET_GAP = 22;
const LEFT = 22;
const TOP = 30;

export function ChordDiagram({ name, shape }: ChordDiagramProps) {
  const fretted = shape.frets.filter((f) => f > 0);
  const highest = fretted.length ? Math.max(...fretted) : 0;
  // Start the grid at the nut unless the shape doesn't fit there.
  const baseFret = highest <= FRETS_SHOWN ? 1 : Math.min(...fretted);
  const width = LEFT + STRING_GAP * 3 + 14;
  const height = TOP + FRET_GAP * FRETS_SHOWN + 8;
  // Strings 4, 3, 2, 1 from left to right, as the banjo is held facing you.
  const stringX = (stringNumber: number) => LEFT + (4 - stringNumber) * STRING_GAP;
  const summary = shape.frets
    .map((f, i) => `string ${i + 1} ${f === 0 ? "open" : `fret ${f}`}`)
    .join(", ");

  return (
    <figure className="chord-diagram">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${name}: ${summary}`}
      >
        {/* Nut (thick) or a thin top line with the starting fret number. */}
        <line
          x1={LEFT}
          x2={stringX(1)}
          y1={TOP}
          y2={TOP}
          stroke="currentColor"
          strokeWidth={baseFret === 1 ? 4 : 1}
        />
        {baseFret > 1 && (
          <text x={LEFT - 6} y={TOP + FRET_GAP / 2 + 4} fontSize="10" textAnchor="end" fill="currentColor">
            {baseFret}
          </text>
        )}
        {Array.from({ length: FRETS_SHOWN }, (_, i) => (
          <line
            key={`fret-${i}`}
            x1={LEFT}
            x2={stringX(1)}
            y1={TOP + FRET_GAP * (i + 1)}
            y2={TOP + FRET_GAP * (i + 1)}
            stroke="currentColor"
            strokeWidth={1}
          />
        ))}
        {[4, 3, 2, 1].map((stringNumber) => {
          const fret = shape.frets[stringNumber - 1];
          const x = stringX(stringNumber);
          return (
            <g key={stringNumber}>
              <line x1={x} x2={x} y1={TOP} y2={TOP + FRET_GAP * FRETS_SHOWN} stroke="currentColor" strokeWidth={1} />
              {fret === 0 ? (
                <circle cx={x} cy={TOP - 10} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
              ) : (
                <circle
                  cx={x}
                  cy={TOP + FRET_GAP * (fret - baseFret) + FRET_GAP / 2}
                  r={6}
                  className="chord-diagram-dot"
                />
              )}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <strong>{name}</strong>
        <span className="muted-text">5th string: {shape.fifthStringFits ? "rings open" : "don't play"}</span>
      </figcaption>
    </figure>
  );
}
