import { useId } from "react";
export default function TimeInput({
  value,
  onChange,
  label,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = useId();
  const [hour, minute] = (value || "09:00").split(":").map(Number);
  function change(h: number, m: number) {
    onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return (
    <span className="time-input" id={id} role="group" aria-label={label}>
      <select
        aria-label={`${label} hour`}
        value={value ? hour % 12 || 12 : ""}
        required={required}
        onChange={(e) =>
          e.target.value
            ? change(
                (Number(e.target.value) % 12) + (hour >= 12 ? 12 : 0),
                minute,
              )
            : onChange("")
        }
      >
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1}>{i + 1}</option>
        ))}
      </select>
      <span>:</span>
      <select
        aria-label={`${label} minute`}
        value={minute}
        onChange={(e) => change(hour, Number(e.target.value))}
      >
        {Array.from({ length: 60 }, (_, i) => (
          <option key={i} value={i}>
            {String(i).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} AM or PM`}
        value={hour < 12 ? "AM" : "PM"}
        onChange={(e) =>
          change((hour % 12) + (e.target.value === "PM" ? 12 : 0), minute)
        }
      >
        <option>AM</option>
        <option>PM</option>
      </select>
      {value && !required && (
        <button
          type="button"
          className="icon-button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange("")}
        >
          ×
        </button>
      )}
    </span>
  );
}
