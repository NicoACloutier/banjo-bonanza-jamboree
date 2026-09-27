/**
 * Editor fields for a tab's rhythm (time signature, swing), 5th-string capo,
 * and library metadata (style, key, difficulty).
 */
import {
  DIFFICULTY_LABELS,
  FIFTH_STRING_CAPO_OPTIONS,
  SONG_KEYS,
  STYLE_LABELS,
  TIME_SIGNATURES,
} from "../lib/tabSettings";
import type { Difficulty, TabSettings, TabStyle, TimeSignature } from "../types/api";

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

      <div className="form-row">
        <label>
          Style (optional)
          <select value={settings.style ?? ""} onChange={(e) => set({ style: (e.target.value || null) as TabStyle | null })}>
            <option value="">(none)</option>
            {Object.entries(STYLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Key (optional)
          <select value={settings.song_key ?? ""} onChange={(e) => set({ song_key: e.target.value || null })}>
            <option value="">(none)</option>
            {SONG_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty (optional)
          <select
            value={settings.difficulty ?? ""}
            onChange={(e) => set({ difficulty: (e.target.value || null) as Difficulty | null })}
          >
            <option value="">(none)</option>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
