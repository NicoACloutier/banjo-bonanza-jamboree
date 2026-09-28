/**
 * Chord finder: shapes for any chord in any tuning (with capo and 5th-string
 * capo), plus the common chords of a key and its scale on the neck, as diagrams.
 */
import { useState } from "react";
import { ChordDiagram } from "../components/ChordDiagram";
import { ScaleDiagram } from "../components/ScaleDiagram";
import { chordsInKey, findChordShapes, keyName, MAJOR_KEYS, MINOR_KEYS, parseChord } from "../lib/chords";
import { fifthStringRaise } from "../lib/tabLayout";
import { FIFTH_STRING_CAPO_OPTIONS } from "../lib/tabSettings";
import { FALLBACK_TUNINGS, keyForTuning } from "../lib/tunings";

export function ChordsPage() {
  const [tuningKey, setTuningKey] = useState(FALLBACK_TUNINGS[0].key);
  const [capoFret, setCapoFret] = useState(0);
  const [fifthStringCapoFret, setFifthStringCapoFret] = useState<number | null>(null);
  const [chordName, setChordName] = useState("C");
  const tuning = FALLBACK_TUNINGS.find((t) => t.key === tuningKey) ?? FALLBACK_TUNINGS[0];
  // Default the key to the one this tuning (and capo) plays in (minor for minor tunings).
  const tuningKeyInfo = keyForTuning(tuning.key, capoFret);
  const defaultKey = tuningKeyInfo ? keyName(tuningKeyInfo.tonic, tuningKeyInfo.quality === "minor") : null;
  const [songKey, setSongKey] = useState<string | null>(null);
  const key = songKey ?? defaultKey ?? "G";

  const shapeOptions = { capoFret, fifthStringRaise: fifthStringRaise(capoFret, fifthStringCapoFret) };
  const chord = parseChord(chordName);
  const shapes = chord ? findChordShapes(chord, tuning.open_strings, { ...shapeOptions, limit: 4 }) : [];

  return (
    <div className="panel">
      <h1>Chord Finder</h1>
      <p className="muted-text">
        Shapes are worked out for the tuning you pick, so they work for any tuning and capo. Frets are
        counted from the capo.
      </p>
      <div className="form-row">
        <label>
          Tuning
          <select
            value={tuningKey}
            onChange={(e) => {
              setTuningKey(e.target.value);
              setSongKey(null);
            }}
          >
            {FALLBACK_TUNINGS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Capo (fret, 0 = none)
          <input
            type="number"
            min={0}
            max={12}
            value={capoFret}
            onChange={(e) => setCapoFret(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
          />
        </label>
        <label>
          5th-string capo
          <select
            value={fifthStringCapoFret ?? ""}
            onChange={(e) => setFifthStringCapoFret(e.target.value === "" ? null : Number(e.target.value))}
          >
            {FIFTH_STRING_CAPO_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2>Find a chord</h2>
      <label>
        Chord name (e.g. G, D7, Em, Bbmaj7)
        <input type="text" value={chordName} maxLength={16} onChange={(e) => setChordName(e.target.value)} />
      </label>
      {chordName.trim() && !chord && <p className="error-banner">"{chordName}" isn't a chord name I recognise.</p>}
      {chord && shapes.length === 0 && <p className="muted-text">No playable {chord.name} shape in this tuning.</p>}
      <div className="chord-grid">
        {shapes.map((shape) => (
          <ChordDiagram key={shape.frets.join("-")} name={chord!.name} shape={shape} />
        ))}
      </div>

      <h2>Chords in a key</h2>
      <label>
        Key
        <select value={key} onChange={(e) => setSongKey(e.target.value)}>
          <optgroup label="Major">
            {MAJOR_KEYS.map((k) => (
              <option key={k} value={k}>
                {k} major
              </option>
            ))}
          </optgroup>
          <optgroup label="Minor">
            {MINOR_KEYS.map((k) => (
              <option key={k} value={k}>
                {k.slice(0, -1)} minor
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="chord-grid">
        {chordsInKey(key).map((name) => {
          const [shape] = findChordShapes(parseChord(name)!, tuning.open_strings, { ...shapeOptions, limit: 1 });
          return shape ? (
            <ChordDiagram key={name} name={name} shape={shape} />
          ) : (
            <p key={name} className="muted-text">
              {name}: no shape
            </p>
          );
        })}
      </div>
      <ScaleDiagram
        songKey={key}
        tuning={tuning}
        capoFret={capoFret}
        fifthStringRaise={shapeOptions.fifthStringRaise}
      />
    </div>
  );
}
