/**
 * React hook wrapping microphone capture + continuous pitch detection for
 * the Tuner feature. Exposes the current detected frequency (if any) and
 * manages starting/stopping the microphone stream.
 */
import { useCallback, useRef, useState } from "react";
import { detectPitch } from "../lib/pitchDetection";

export function useTuner() {
  const [listening, setListening] = useState(false);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setListening(false);
    setFrequency(null);
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
        analyser.getFloatTimeDomainData(buffer);
        const detected = detectPitch(buffer, audioContext.sampleRate);
        setFrequency(detected);
        rafRef.current = requestAnimationFrame(poll);
      };
      poll();
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access microphone.");
    }
  }, []);

  return { listening, frequency, error, start, stop };
}
