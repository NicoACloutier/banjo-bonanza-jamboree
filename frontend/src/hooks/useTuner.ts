/**
 * React hook wrapping microphone capture + continuous pitch detection for
 * the Tuner feature. Exposes the current detected frequency (if any) and
 * manages starting/stopping the microphone stream.
 */
import { useCallback, useRef, useState } from "react";
import { detectPitch, OnsetDetector, PitchSmoother, rmsLevel } from "../lib/pitchDetection";

export function useTuner() {
  const [listening, setListening] = useState(false);
  const [frequency, setFrequency] = useState<number | null>(null);
  // Whether a pitch is being detected right now (vs. holding the last one).
  const [hearing, setHearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smootherRef = useRef(new PitchSmoother());
  const onsetDetectorRef = useRef(new OnsetDetector());
  // performance.now() time until which mic input is ignored (e.g. while the
  // app itself is making a sound the mic would otherwise pick up).
  const ignoreInputUntilRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setListening(false);
    setFrequency(null);
    setHearing(false);
    smootherRef.current.reset();
    onsetDetectorRef.current.reset();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      const poll = () => {
        if (performance.now() < ignoreInputUntilRef.current) {
          rafRef.current = requestAnimationFrame(poll);
          return;
        }
        analyser.getFloatTimeDomainData(buffer);
        const detected = detectPitch(buffer, audioContext.sampleRate);
        const onset = onsetDetectorRef.current.add(rmsLevel(buffer));
        // Report a pitch averaged over the last ~2.5s so the reading is
        // steady, and hold it after the note decays so it stays on screen
        // until a new note is heard. Onsets (new plucks) let the smoother
        // switch notes quickly; otherwise it treats jumps as detector glitches.
        if (detected !== null) setFrequency(smootherRef.current.add(detected, performance.now(), onset));
        setHearing(detected !== null);
        rafRef.current = requestAnimationFrame(poll);
      };
      poll();
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access microphone.");
    }
  }, []);

  /** Ignore mic input for `ms`, holding the current reading meanwhile. */
  const ignoreInputFor = useCallback((ms: number) => {
    ignoreInputUntilRef.current = performance.now() + ms;
  }, []);

  return { listening, frequency, hearing, error, start, stop, ignoreInputFor };
}
