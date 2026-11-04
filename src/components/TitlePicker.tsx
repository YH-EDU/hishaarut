import { TITLE_OPTIONS } from "../lib/staffName";

/** Required title: הרב / המורה, or a short free text under אחר. */
export function TitlePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const preset = (TITLE_OPTIONS as readonly string[]).includes(value);
  const other = !preset && value !== "";
  return (
    <div className="stack">
      <div className="chips">
        {TITLE_OPTIONS.map((option) => (
          <button key={option} type="button" className="chip" aria-pressed={value === option} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={other} onClick={() => onChange(other ? value : " ")}>
          אחר
        </button>
      </div>
      {other ? (
        <input
          aria-label="תואר אחר"
          placeholder="למשל: המחנך, הרב ד״ר"
          maxLength={20}
          value={value.trim() === "" ? "" : value}
          onChange={(event) => onChange(event.target.value || " ")}
        />
      ) : null}
    </div>
  );
}
