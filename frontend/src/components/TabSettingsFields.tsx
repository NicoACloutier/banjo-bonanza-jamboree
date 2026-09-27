/**
 * Editor field for a tab's 5th-string capo.
 */
import { FIFTH_STRING_CAPO_OPTIONS } from "../lib/tabSettings";
import type { TabSettings } from "../types/api";

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
      </div>
    </>
  );
}
