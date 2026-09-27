/**
 * Editor fields for a tab's rhythm (time signature, swing) and 5th-string capo.
 */
import {
  FIFTH_STRING_CAPO_OPTIONS,
  TIME_SIGNATURES,
} from "../lib/tabSettings";
import type { TabSettings, TimeSignature } from "../types/api";

interface TabSettingsFieldsProps {
  settings: TabSettings;
  onChange: (settings: TabSettings) => void;
}

export function TabSettingsFields({ settings, onChange }: TabSettingsFieldsProps) {
  const set = (patch: Partial<TabSettings>) => onChange({ ...settings, ...patch });

  return (
    <>
      <div className="form-row">
        <label>
          Time signature
          <select
            value={settings.time_signature ?? ""}
            onChange={(e) => set({ time_signature: (e.target.value || null) as TimeSignature | null })}
          >
            {TIME_SIGNATURES.map((ts) => (
              <option key={ts} value={ts}>
                {ts}
              </option>
            ))}
            <option value="">None (fixed bars per line)</option>
          </select>
        </label>
        <label>
          5th-string capo
          <select
            value={settings.fifth_string_capo_fret ?? ""}
            onChange={(e) => set({ fifth_string_capo_fret: e.target.value === "" ? null : Number(e.target.value) })}
          >
            {FIFTH_STRING_CAPO_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={settings.swing} onChange={(e) => set({ swing: e.target.checked })} />
          Swing eighth notes
        </label>
      </div>
    </>
  );
}
