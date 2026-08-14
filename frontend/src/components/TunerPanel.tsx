/**
 * Tuner UI: captures microphone audio, detects pitch, and compares it to
 * the nearest string in the selected tuning (optionally transposed, e.g.
 * "sawmill tuned up 2 frets"), showing a simple sharp/flat meter.
 */
import { useMemo, useState } from "react";
import { useTuner } from "../hooks/useTuner";
import { frettedFrequency, frequencyToNearestNote } from "../lib/audioTheory";
import { centsOff, findClosestTarget, type TunerTarget } from "../lib/pitchDetection";
import type { TuningOut } from "../types/api";

interface TunerPanelProps {
  tunings: TuningOut[];
}

export function TunerPanel({ tunings }: TunerPanelProps) {
  const [tuningKey, setTuningKey] = useState(tunings[0]?.key ?? "");
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  const { listening, frequency, error, start, stop } = useTuner();

  const tuning = tunings.find((t) => t.key === tuningKey) ?? tunings[0];

  const targets: TunerTarget[] = useMemo(() => {
    if (!tuning) return [];
    return tuning.open_strings.map((openNote, idx) => ({
      stringNumber: idx + 1,
      label: `String ${idx + 1}`,
      targetFrequency: frettedFrequency(openNote, 0, transposeSemitones),
    }));
  }, [tuning, transposeSemitones]);

  const closest = frequency && targets.length > 0 ? findClosestTarget(frequency, targets) : null;
  const cents = frequency && closest ? centsOff(frequency, closest.targetFrequency) : 0;
  const detectedNote = frequency ? frequencyToNearestNote(frequency) : null;

  // Clamp the needle position to +/- 50 cents for display purposes.
  const needlePercent = 50 + Math.max(-50, Math.min(50, cents)) / 1;

  return (
    <div>
      <div className="form-row">
        <label>
          Tuning
          <select value={tuningKey} onChange={(e) => setTuningKey(e.target.value)}>
            {tunings.map((t) => (
              <option key={t.key} value={t.key}>
                {t.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Transpose: {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones} fret
          {Math.abs(transposeSemitones) === 1 ? "" : "s"}
          <input
            type="range"
            min={-12}
            max={12}
            value={transposeSemitones}
            onChange={(e) => setTransposeSemitones(Number(e.target.value))}
          />
        </label>
      </div>

      <button onClick={listening ? stop : start}>{listening ? "Stop listening" : "Start tuner"}</button>
      {error && <p className="error-banner">{error}</p>}

      {listening && (
        <div className="panel">
          {frequency ? (
            <>
              <p>
                Detected: <strong>{frequency.toFixed(1)} Hz</strong>{" "}
                ({detectedNote?.name}
                {detectedNote?.octave})
              </p>
              {closest && (
                <p>
                  Closest target: <strong>{closest.label}</strong> ({closest.targetFrequency.toFixed(1)} Hz),{" "}
                  {cents > 0 ? "sharp" : cents < 0 ? "flat" : "in tune"} by {Math.abs(cents).toFixed(0)} cents
                </p>
              )}
              <div className="tuner-meter">
                <div className="tuner-center-line" />
                <div className="tuner-needle" style={{ left: `${needlePercent}%` }} />
              </div>
            </>
          ) : (
            <p className="muted-text">Listening... pluck a string.</p>
          )}
        </div>
      )}
    </div>
  );
}
