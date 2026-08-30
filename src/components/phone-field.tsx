/**
 * Ghana mobile-number input. Live formats, detects the telecom network and
 * blocks submission of anything that is not a supported 10-digit number.
 * Every phone capture point in the app uses this control so the rule is
 * identical everywhere; the same validation runs again server-side.
 */
import { useId } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { checkGhPhone, formatGhPhone, normalizeGhPhone } from "@/lib/gh-phone";

export type PhoneFieldProps = {
  value: string;
  onChange: (canonical: string) => void;
  label?: string;
  name?: string;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  hint?: string;
  className?: string;
  id?: string;
};

export function PhoneField({
  value,
  onChange,
  label = "Mobile number",
  name = "phone",
  required,
  optional,
  disabled,
  hint,
  className,
  id,
}: PhoneFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `phone-${autoId}`;
  const raw = normalizeGhPhone(value);
  const empty = raw.length === 0;
  const check = checkGhPhone(raw);
  const showError = !empty && !check.valid;
  const msgId = `${fieldId}-msg`;

  return (
    <div className={className}>
      <label
        htmlFor={fieldId}
        className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {label}
        {required && !optional ? " *" : ""}
      </label>
      <div className="relative">
        <Input
          id={fieldId}
          name={name}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={17}
          disabled={disabled}
          required={required && !optional}
          aria-invalid={showError || undefined}
          aria-describedby={msgId}
          value={empty ? "" : formatGhPhone(raw) || raw}
          placeholder="024 123 4567"
          onChange={(e) => onChange(normalizeGhPhone(e.target.value))}
          className="pr-28 font-mono"
        />
        {check.valid ? (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-mid">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {check.networkLabel}
          </span>
        ) : null}
      </div>
      <p
        id={msgId}
        className={`mt-1 text-[11px] ${showError ? "font-semibold text-destructive" : "text-muted-foreground"}`}
        role={showError ? "alert" : undefined}
      >
        {showError
          ? check.error
          : check.valid
            ? `Detected network: ${check.networkLabel}`
            : (hint ?? "Exactly 10 digits, e.g. 024 123 4567 (MTN, Telecel, AirtelTigo/AT).")}
      </p>
    </div>
  );
}

/** Helper for forms: true when the field can be submitted. */
export function phoneFieldReady(value: string, optional = false): boolean {
  const raw = normalizeGhPhone(value);
  if (optional && raw.length === 0) return true;
  return checkGhPhone(raw).valid;
}
