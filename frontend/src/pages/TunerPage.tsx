/**
 * Tuner page: fetches the tuning list and renders the TunerPanel.
 */
import { useEffect, useState } from "react";
import { TunerPanel } from "../components/TunerPanel";
import { TabsApi } from "../lib/api";
import { FALLBACK_TUNINGS } from "../lib/tunings";
import type { TuningOut } from "../types/api";

export function TunerPage() {
  const [tunings, setTunings] = useState<TuningOut[]>(FALLBACK_TUNINGS);

  useEffect(() => {
    TabsApi.tunings()
      .then(setTunings)
      .catch(() => {
        /* keep the bundled fallback list */
      });
  }, []);

  return (
    <div className="panel">
      <h1>Banjo Tuner</h1>
      <p className="muted-text">
        Select your tuning (and any transposition), then start the
        tuner and pluck a string. Requires microphone access.
      </p>
      <TunerPanel tunings={tunings} />
    </div>
  );
}
