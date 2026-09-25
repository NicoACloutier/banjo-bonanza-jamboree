/**
 * Tuner UI: captures microphone audio, detects pitch, and compares it to
 * a string in the selected tuning (optionally transposed, e.g. "sawmill
 * tuned up 2 frets"), showing a simple sharp/flat meter. The target string
 * is either picked by the user or, in "Auto" mode, the nearest string.
 */
import { useCallback, useMemo, useState } from "react";
import { useTunedChime } from "../hooks/useTunedChime";
import { useTuner } from "../hooks/useTuner";
import { frettedFrequency, frequencyToNearestNote } from "../lib/audioTheory";
import { centsOff, findClosestTarget, type TunerTarget } from "../lib/pitchDetection";
import { playReferenceNote, playStrum, playTunedChime, TUNED_CHIME_SECONDS } from "../lib/referenceTone";
import { keyForTuning } from "../lib/tunings";
import type { TuningOut } from "../types/api";

// A whole step either side, so notes well off pitch still show on the meter.
const METER_RANGE_CENTS = 200;
const METER_TICKS_CENTS = [-200, -150, -100, -50, 0, 50, 100, 150, 200];
// Within this many cents counts as in tune (shaded on the meter).
const IN_TUNE_CENTS = 5;
// The "tuned" chime can only play again after drifting this far out of tune.
const CHIME_REARM_CENTS = 10;

function centsToMeterPercent(cents: number): number {
  return 50 + (cents / METER_RANGE_CENTS) * 50;
}

interface TunerPanelProps {
  tunings: TuningOut[];
}

export function TunerPanel({ tunings }: TunerPanelProps) {
  const [tuningKey, setTuningKey] = useState(tunings[0]?.key ?? "");
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  // The string being tuned, or null to auto-pick the nearest string.
  const [selectedString, setSelectedString] = useState<number | null>(null);
  const { listening, frequency, hearing, error, start, stop, ignoreInputFor } = useTuner();

  const tuning = tunings.find((t) => t.key === tuningKey) ?? tunings[0];

  const targets: TunerTarget[] = useMemo(() => {
    if (!tuning) return [];
    return tuning.open_strings.map((openNote, idx) => ({
      stringNumber: idx + 1,
      label: `String ${idx + 1}`,
      targetFrequency: frettedFrequency(openNote, 0, transposeSemitones),
    }));
  }, [tuning, transposeSemitones]);

  const key = tuning ? keyForTuning(tuning.key, transposeSemitones) : null;

  const manualTarget = targets.find((t) => t.stringNumber === selectedString) ?? null;
  const target =
    manualTarget ?? (frequency && targets.length > 0 ? findClosestTarget(frequency, targets) : null);
  const cents = frequency && target ? centsOff(frequency, target.targetFrequency) : 0;
  const detectedNote = frequency ? frequencyToNearestNote(frequency) : null;

  // Chime once the string has stayed in the green zone for a moment. The mic
  // ignores the chime itself so it isn't mistaken for a new note.
  const onTuned = useCallback(() => {
    playTunedChime();
    // Small margin for audio output latency and room echo.
    ignoreInputFor(TUNED_CHIME_SECONDS * 1000 + 150);
  }, [ignoreInputFor]);
  useTunedChime(
    listening && hearing && target !== null && Math.abs(cents) <= IN_TUNE_CENTS,
    Math.abs(cents) > CHIME_REARM_CENTS,
    target?.stringNumber ?? null,
    onTuned,
  );

  // The meter spans +/- METER_RANGE_CENTS; readings beyond that pin to the edge.
  const offScale = Math.abs(cents) > METER_RANGE_CENTS;
  // Keep the needle just inside the edges so it isn't clipped when pinned.
  const needlePercent = Math.max(1, Math.min(99, centsToMeterPercent(cents)));

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

      {key && (
        <p>
          Key: <strong>{key.tonic}{key.quality === "major" ? "" : ` ${key.quality}`}</strong>
          {transposeSemitones !== 0 && tuning && (
            <span className="muted-text"> ({tuning.display_name} {transposeSemitones > 0 ? "up" : "down"} {Math.abs(transposeSemitones)} fret{Math.abs(transposeSemitones) === 1 ? "" : "s"})</span>
          )}
        </p>
      )}

      <div className="reference-notes">
        <span>Play a string:</span>
        {targets.map((target) => {
          const note = frequencyToNearestNote(target.targetFrequency);
          return (
            <button
              key={target.stringNumber}
              type="button"
              className="secondary"
              title={`Play ${target.label} (${target.targetFrequency.toFixed(1)} Hz)`}
              onClick={() => playReferenceNote(target.targetFrequency)}
            >
              {target.stringNumber}: {note.name}
              {note.octave}
            </button>
          );
        })}
        <button
          type="button"
          className="secondary"
          title="Strum all 5 open strings"
          // Downstroke: string 5 (top of the neck) first, down to string 1.
          onClick={() => playStrum([...targets].reverse().map((t) => t.targetFrequency))}
        >
          Strum all
        </button>
      </div>

      <button onClick={listening ? stop : start}>{listening ? "Stop listening" : "Start tuner"}</button>
      {error && <p className="error-banner">{error}</p>}

      {listening && (
        <div className="panel tuner-layout">
          <div className="tuner-string-picker" role="radiogroup" aria-label="String to tune">
            {[null, ...targets.map((t) => t.stringNumber)].map((stringNumber) => {
              const selected = selectedString === stringNumber;
              const stringTarget = targets.find((t) => t.stringNumber === stringNumber);
              const note = stringTarget ? frequencyToNearestNote(stringTarget.targetFrequency) : null;
              return (
                <button
                  key={stringNumber ?? "auto"}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? "selected" : "secondary"}
                  onClick={() => setSelectedString(stringNumber)}
                >
                  {stringNumber === null ? "Auto" : `String ${stringNumber}: ${note?.name}${note?.octave}`}
                </button>
              );
            })}
          </div>
          <div className="tuner-readout">
            {frequency ? (
              <>
                <p>
                  {hearing ? "Detected" : "Last note"}: <strong>{frequency.toFixed(1)} Hz</strong>{" "}
                  ({detectedNote?.name}
                  {detectedNote?.octave})
                </p>
                {target && (
                  <p>
                    {manualTarget ? "Tuning" : "Closest string"}: <strong>{target.label}</strong> ({target.targetFrequency.toFixed(1)} Hz),{" "}
                    {cents > 0 ? "sharp" : cents < 0 ? "flat" : "in tune"} by {Math.abs(cents).toFixed(0)} cents
                  </p>
                )}
                <div className="tuner-meter">
                  <div
                    className="tuner-in-tune-zone"
                    style={{
                      left: `${centsToMeterPercent(-IN_TUNE_CENTS)}%`,
                      right: `${100 - centsToMeterPercent(IN_TUNE_CENTS)}%`,
                    }}
                  />
                  {METER_TICKS_CENTS.map((tick) => (
                    <div
                      key={tick}
                      className={tick === 0 ? "tuner-center-line" : tick % 100 === 0 ? "tuner-tick major" : "tuner-tick"}
                      style={{ left: `${centsToMeterPercent(tick)}%` }}
                    />
                  ))}
                  <div
                    className={offScale ? "tuner-needle off-scale" : "tuner-needle"}
                    style={{ left: `${needlePercent}%` }}
                  />
                </div>
                <div className="tuner-scale-labels" aria-hidden="true">
                  {METER_TICKS_CENTS.filter((tick) => tick % 100 === 0).map((tick) => (
                    <span key={tick} style={{ left: `${centsToMeterPercent(tick)}%` }}>
                      {tick > 0 ? `+${tick}` : tick}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted-text">
                Listening... pluck {manualTarget ? manualTarget.label.toLowerCase() : "a string"}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
