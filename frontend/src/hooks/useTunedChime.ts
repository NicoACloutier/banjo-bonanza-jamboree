/**
 * Fires `onTuned` once a string has stayed in tune for `holdMs`. It then
 * stays quiet until the reading clearly leaves the in-tune zone (`outOfTune`)
 * or the target string changes, so hovering at the edge of the zone doesn't
 * trigger it repeatedly.
 */
import { useEffect, useRef } from "react";

export function useTunedChime(
  inTune: boolean,
  outOfTune: boolean,
  targetId: number | null,
  onTuned: () => void,
  holdMs = 700,
): void {
  const armedRef = useRef(true);
  const onTunedRef = useRef(onTuned);

  useEffect(() => {
    onTunedRef.current = onTuned;
  }, [onTuned]);

  useEffect(() => {
    armedRef.current = true;
  }, [targetId]);

  useEffect(() => {
    if (outOfTune) armedRef.current = true;
  }, [outOfTune]);

  useEffect(() => {
    if (!inTune || !armedRef.current) return;
    const timer = window.setTimeout(() => {
      armedRef.current = false;
      onTunedRef.current();
    }, holdMs);
    return () => window.clearTimeout(timer);
  }, [inTune, targetId, holdMs]);
}
