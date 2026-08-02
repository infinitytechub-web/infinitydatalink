/**
 * Shared biodata inputs: Ghana region/district, national ID type + number,
 * date of birth with live age + under-18 detection, and relationship select.
 *
 * Used by Profile & KYC, next of kin and admin member screens so every module
 * writes the same shape of data. Mobile-first: single column on phones,
 * two columns from `sm:` upwards, 44px touch targets.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import { GHANA_REGIONS, districtsForRegion } from "@/lib/ghana-locations";
import { NATIONAL_ID_TYPES, findIdType, validateNationalId } from "@/lib/ghana-id-types";
import { calculateAge, MINOR_AGE_THRESHOLD, validateDateOfBirth } from "@/lib/age";
import {
  DEFAULT_RELATIONSHIPS,
  listRelationshipTypes,
} from "@/lib/relationship-types.functions";

const labelCls =
  "flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60";
const controlCls =
  "min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-emerald-deep outline-none focus:border-emerald-mid disabled:bg-cream/50 disabled:text-emerald-deep/50";

function Hint({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <span
      className={`text-[10px] font-normal normal-case tracking-normal ${
        tone === "error" ? "text-destructive" : "text-emerald-deep/50"
      }`}
    >
      {children}
    </span>
  );
}

/* ---------------- Region + district ---------------- */
export function RegionDistrictFields({
  region,
  district,
  onRegionChange,
  onDistrictChange,
  disabled,
  required,
}: {
  region: string;
  district: string;
  onRegionChange: (v: string) => void;
  onDistrictChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const districts = useMemo(() => districtsForRegion(region), [region]);
  return (
    <>
      <label className={labelCls}>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" aria-hidden /> Region
        </span>
        <select
          value={region}
          required={required}
          disabled={disabled}
          onChange={(e) => {
            onRegionChange(e.target.value);
            onDistrictChange("");
          }}
          className={controlCls}
        >
          <option value="">Select region…</option>
          {GHANA_REGIONS.map((r) => (
            <option key={r.code} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
        <Hint>All 16 regions of Ghana</Hint>
      </label>

      <label className={labelCls}>
        District / Municipal
        <select
          value={district}
          required={required && districts.length > 0}
          disabled={disabled || districts.length === 0}
          onChange={(e) => onDistrictChange(e.target.value)}
          className={controlCls}
        >
          <option value="">
            {districts.length === 0 ? "Select a region first" : "Select district…"}
          </option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {districts.length > 0 ? <Hint>{districts.length} districts in {region}</Hint> : null}
      </label>
    </>
  );
}

/* ---------------- National ID ---------------- */
export function NationalIdFields({
  idType,
  idNumber,
  onTypeChange,
  onNumberChange,
  disabled,
  lockedHint,
}: {
  idType: string;
  idNumber: string;
  onTypeChange: (v: string) => void;
  onNumberChange: (v: string) => void;
  disabled?: boolean;
  lockedHint?: string;
}) {
  const type = findIdType(idType);
  const error = validateNationalId(idType, idNumber);
  return (
    <>
      <label className={labelCls}>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden /> National ID type
        </span>
        <select
          value={idType}
          disabled={disabled}
          onChange={(e) => onTypeChange(e.target.value)}
          className={controlCls}
        >
          <option value="">Select ID type…</option>
          {NATIONAL_ID_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        {lockedHint ? <Hint>{lockedHint}</Hint> : null}
      </label>

      <label className={labelCls}>
        ID number
        <input
          value={idNumber}
          disabled={disabled}
          inputMode={type?.code === "voter_id" || type?.code === "nhis" ? "numeric" : "text"}
          onChange={(e) => onNumberChange(e.target.value)}
          onBlur={(e) => {
            if (type && e.target.value.trim()) onNumberChange(type.normalize(e.target.value));
          }}
          placeholder={type?.example ?? "Select an ID type first"}
          aria-invalid={Boolean(error)}
          className={controlCls}
        />
        {error ? <Hint tone="error">{error}</Hint> : type ? <Hint>{type.hint}</Hint> : null}
      </label>
    </>
  );
}

/* ---------------- Date of birth + age ---------------- */
export function DateOfBirthField({
  value,
  onChange,
  disabled,
  lockedHint,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  lockedHint?: string;
  className?: string;
}) {
  const age = calculateAge(value);
  const error = validateDateOfBirth(value);
  const minor = age !== null && age < MINOR_AGE_THRESHOLD;
  return (
    <label className={`${labelCls} ${className ?? ""}`}>
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="h-3 w-3" aria-hidden /> Date of birth
      </span>
      <input
        type="date"
        value={value}
        max={new Date().toISOString().slice(0, 10)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={controlCls}
      />
      {error ? (
        <Hint tone="error">{error}</Hint>
      ) : age !== null ? (
        <span className="inline-flex flex-wrap items-center gap-2 normal-case tracking-normal">
          <Hint>Age: {age} years</Hint>
          {minor ? (
            <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gold">
              Under 18 · minor saver
            </span>
          ) : null}
        </span>
      ) : lockedHint ? (
        <Hint>{lockedHint}</Hint>
      ) : (
        <Hint>Age is calculated automatically</Hint>
      )}
    </label>
  );
}

/* ---------------- Relationship ---------------- */
export function useRelationshipOptions() {
  const query = useQuery({
    queryKey: ["relationship-types"],
    queryFn: () => listRelationshipTypes(),
    staleTime: 10 * 60_000,
  });
  const options = useMemo(() => {
    const rows = (query.data ?? []).filter((r) => r.is_active);
    if (rows.length === 0) return DEFAULT_RELATIONSHIPS;
    return rows.map((r) => ({ code: r.code, label: r.label }));
  }, [query.data]);
  return { options, isLoading: query.isLoading };
}

export function RelationshipSelect({
  value,
  onChange,
  required,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { options } = useRelationshipOptions();
  // Legacy free-text values remain selectable so old records still render.
  const known = options.some((o) => o.label.toLowerCase() === value.toLowerCase());
  return (
    <label className={`${labelCls} ${className ?? ""}`}>
      Relationship
      <select
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={controlCls}
      >
        <option value="">Select relationship…</option>
        {options.map((o) => (
          <option key={o.code} value={o.label}>
            {o.label}
          </option>
        ))}
        {value && !known ? <option value={value}>{value}</option> : null}
      </select>
    </label>
  );
}

/* ---------------- Read-only display helpers ---------------- */
export function AgeBadge({ dateOfBirth }: { dateOfBirth: string | null }) {
  const age = calculateAge(dateOfBirth);
  if (age === null) return <span className="text-emerald-deep/40">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{age} yrs</span>
      {age < MINOR_AGE_THRESHOLD ? (
        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gold">
          Under 18
        </span>
      ) : null}
    </span>
  );
}
