import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Eye, EyeOff, Fingerprint, ShieldCheck, UserRound } from "lucide-react";
import { passwordStrength } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useBranding } from "@/components/branding-provider";
import { AuthBrandMark } from "@/components/auth-brand-mark";
import { PhoneField } from "@/components/phone-field";
import DOMPurify from "isomorphic-dompurify";
import { calculateAge, isMinor, validateDateOfBirth } from "@/lib/age";
import { GHANA_REGIONS, districtsForRegion } from "@/lib/ghana-locations";

import {
  beginPasskeyAuthentication,
  finishPasskeyAuthentication,
} from "@/lib/passkeys.functions";
import {
  GHANA_CARD_DIGITS,
  GHANA_CARD_REGEX,
  MEMBERSHIP_TYPES,
  MEMBERSHIP_TYPE_LABEL,
  ghanaCardDigits,
  normalizePhone,
  toCanonicalGhanaCard,
  type MembershipType,
} from "@/lib/member-registration";



export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Sign in to your IT-360 CashApp member or administrator portal to access savings, loans, transfers, and system controls.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sign in — IT-360 CashApp" },
      {
        property: "og:description",
        content:
          "Access your IT-360 CashApp member or administrator portal to manage savings, loans, and payments.",
      },
      { property: "og:url", content: "https://infinity-wealth360.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://infinity-wealth360.lovable.app/auth" }],
  }),
  component: AuthPage,
});

type PanelKind = "user" | "admin";

function AuthPage() {
  const [activeTab, setActiveTab] = useState<PanelKind>("user");
  const { branding } = useBranding();
  const appName = branding.app_name || "IT-360 CashApp";
  const heroUrl = branding.login_hero_url;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-cream via-cream to-emerald-deep/5 font-sans text-emerald-deep"
      style={
        heroUrl
          ? {
              backgroundImage: `linear-gradient(135deg, rgba(245,241,229,0.92), rgba(15,118,110,0.55)), url(${heroUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <AuthBrandMark />
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] uppercase tracking-widest text-muted-foreground sm:inline">
            Secure session · TLS 1.3
          </span>
          <ThemeToggle />
        </div>
      </header>

      {branding.login_tagline ? (
        <p className="mx-auto max-w-2xl px-6 pb-4 text-center text-sm text-muted-foreground">
          {branding.login_tagline}
        </p>
      ) : null}

      {/* Mobile segmented tab */}
      <div className="mx-auto mb-4 flex max-w-md gap-1 rounded-full border border-emerald-deep/10 bg-white/70 p-1 backdrop-blur lg:hidden">
        {(["user", "admin"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setActiveTab(k)}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all",
              activeTab === k
                ? k === "admin"
                  ? "bg-emerald-deep text-cream shadow-sm"
                  : "bg-teal-500 text-white shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {k === "user" ? "User" : "Administrator"}
          </button>
        ))}
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <div className={cn(activeTab === "user" ? "block" : "hidden", "lg:block")}>
          <LoginPanel kind="user" />
        </div>
        <div className={cn(activeTab === "admin" ? "block" : "hidden", "lg:block")}>
          <LoginPanel kind="admin" />
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-8 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
        {branding.footer_html ? (
          <div
            className="mb-2 normal-case tracking-normal text-muted-foreground"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(branding.footer_html, {
                ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "u", "br", "span", "p", "small"],
                ALLOWED_ATTR: ["href", "title", "target", "rel"],
                ALLOWED_URI_REGEXP: /^(https?:|mailto:|tel:|#)/i,
              }),
            }}
          />
        ) : null}
        © {new Date().getFullYear()} {appName} · Enterprise financial platform
        {branding.support_email ? (
          <>
            {" · "}
            <a href={`mailto:${branding.support_email}`} className="hover:underline">
              {branding.support_email}
            </a>
          </>
        ) : null}
        {branding.support_phone ? <> · {branding.support_phone}</> : null}
      </footer>
    </div>
  );
}


function LoginPanel({ kind }: { kind: PanelKind }) {
  const isAdmin = kind === "admin";
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const bg = isAdmin
    ? "bg-gradient-to-br from-brand-forest to-brand-teal text-white"
    : "bg-gradient-to-br from-teal-500 to-cyan-500 text-white";
  const badgeBg = isAdmin ? "bg-gold text-brand-forest" : "bg-white text-teal-700";
  const eyebrow = isAdmin ? "Administrator access" : "Member access";
  const title = isAdmin ? "Administrator Login" : "User Login";
  const subtitle = isAdmin
    ? "Staff sign-in for compliance, finance, and system administration."
    : "Sign in to manage your savings, loans, transfers, and profile.";

  return (
    <section
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 transition-transform",
        isAdmin ? "ring-emerald-deep/10" : "ring-teal-500/10",
      )}
    >
      {/* Hero */}
      <div className={cn("relative px-8 pb-8 pt-10", bg)}>
        <div
          aria-hidden
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.25) 0, transparent 40%)",
          }}
        />
        <div className="relative flex items-start justify-between">
          <div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                badgeBg,
              )}
            >
              {isAdmin ? <ShieldCheck className="size-3" /> : <UserRound className="size-3" />}
              {eyebrow}
            </span>
            <h2 className="mt-4 font-serif text-3xl leading-tight">{title}</h2>
            <p className="mt-2 max-w-sm text-sm opacity-90">{subtitle}</p>
          </div>
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-xl shadow-lg backdrop-blur",
              isAdmin ? "bg-white/10" : "bg-white/20",
            )}
            aria-hidden
          >
            {isAdmin ? <ShieldCheck className="size-7" /> : <UserRound className="size-7" />}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col bg-card p-8">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-serif text-lg text-emerald-deep">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h3>
          {!isAdmin && (
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-[11px] font-bold uppercase tracking-widest text-primary hover:underline"
            >
              {mode === "signin" ? "Create account" : "Have an account? Sign in"}
            </button>
          )}
        </div>

        <AuthForm mode={isAdmin ? "signin" : mode} kind={kind} />

        <div className="my-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <div className="h-px flex-1 bg-emerald-deep/10" />
          or
          <div className="h-px flex-1 bg-emerald-deep/10" />
        </div>

        <BiometricButton kind={kind} />
        <div className="my-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <div className="h-px flex-1 bg-emerald-deep/10" />
          or
          <div className="h-px flex-1 bg-emerald-deep/10" />
        </div>
        <GoogleButton />

        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
          {isAdmin
            ? "Administrator roles are assigned by an existing Super Admin. Access is logged for audit review."
            : "New accounts start with Member permissions and require identity verification (KYC) before full access."}
        </p>
      </div>
    </section>
  );
}

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

const signUpSchema = signInSchema.extend({
  firstName: z.string().trim().min(2, "Enter your first name"),
  lastName: z.string().trim().min(2, "Enter your last name"),
  ghanaCard: z
    .string()
    .regex(GHANA_CARD_REGEX, "Ghana Card must be 10 digits after the GHA- prefix"),
  phone: z.string().min(1, "Enter your telephone number"),
  membershipType: z.enum(MEMBERSHIP_TYPES),
});

function AuthForm({ mode, kind }: { mode: "signin" | "signup"; kind: PanelKind }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cardDigits, setCardDigits] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [membershipType, setMembershipType] = useState<MembershipType>("individual");


  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const isAdmin = kind === "admin";
  const strength = useMemo(() => passwordStrength(password), [password]);
  const accent = isAdmin
    ? "bg-emerald-deep hover:bg-emerald-mid text-cream"
    : "bg-primary hover:brightness-110 text-primary-foreground";
  const focusRing = isAdmin ? "focus:border-emerald-mid" : "focus:border-teal-500";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === "function") setCapsOn(e.getModifierState("CapsLock"));
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", handler);
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const canonicalCard = toCanonicalGhanaCard(cardDigits) ?? "";
        const canonicalPhone = normalizePhone(phone);
        if (!canonicalPhone) {
          setErr("Enter a valid Ghana telephone number, e.g. 024 123 4567");
          return;
        }
        const dobError = validateDateOfBirth(dob);
        if (dobError) {
          setErr(dobError);
          return;
        }
        if (!region || !district) {
          setErr("Select your region and district.");
          return;
        }

        const parsed = signUpSchema.safeParse({
          email,
          password,
          firstName,
          lastName,
          ghanaCard: canonicalCard,
          phone: canonicalPhone,
          membershipType,
        });

        if (!parsed.success) {
          setErr(parsed.error.issues[0]?.message ?? "Invalid input");
          return;
        }

        // Pre-flight duplicate check so users see a clear message instead of a
        // raw unique-constraint error from the database.
        const { data: availability, error: availErr } = await (supabase as any).rpc(
          "check_registration_availability",
          { _ghana_card: canonicalCard, _phone: canonicalPhone },
        );
        if (!availErr && availability) {
          if (availability.ghana_card_valid === false) {
            setErr("Ghana Card number format is invalid.");
            return;
          }
          if (availability.ghana_card_taken) {
            setErr("This Ghana Card number is already registered.");
            return;
          }
          if (availability.phone_taken) {
            setErr("This telephone number is already registered.");
            return;
          }
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: {
              full_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
              first_name: parsed.data.firstName,
              last_name: parsed.data.lastName,

              ghana_card: canonicalCard,
              phone: canonicalPhone,
              membership_type: membershipType,
              date_of_birth: dob || null,
              region: region || null,
              district: district || null,
              is_minor: dob ? isMinor(dob) : null,

            },
          },
        });
        if (error) {
          setErr(
            /duplicate|already/i.test(error.message)
              ? "An account with these details already exists."
              : error.message,
          );
          return;
        }
        setNotice(
          "Registration submitted. An administrator will review your request — you'll be notified once approved.",
        );
        navigate({ to: "/app" });
      } else {
        const parsed = signInSchema.safeParse({ email, password });
        if (!parsed.success) {
          setErr(parsed.error.issues[0]?.message ?? "Invalid input");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setErr(error.message);
          return;
        }
        // Route hint by panel; role gates will further redirect if needed.
        setTimeout(() => navigate({ to: isAdmin ? "/admin" : "/app" }), 100);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" ? (
        <>
          <Field label="First name">
            <input
              type="text"
              required
              autoComplete="given-name"
              className={inputClass(focusRing)}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ada"
            />
          </Field>
          <Field label="Last name">
            <input
              type="text"
              required
              autoComplete="family-name"
              className={inputClass(focusRing)}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Lovelace"
            />
          </Field>

          <Field label="Ghana Card number" hint={<span className="text-[11px] text-muted-foreground">10 digits</span>}>
            <div className="flex items-stretch gap-0">
              <span className="flex items-center rounded-l-lg border border-r-0 border-emerald-deep/15 bg-emerald-deep/5 px-3 text-sm font-semibold text-muted-foreground">
                GHA-
              </span>
              <input
                type="text"
                required
                inputMode="numeric"
                aria-label="Ghana Card digits"
                className={cn(inputClass(focusRing), "rounded-l-none tracking-widest")}
                value={cardDigits}
                onChange={(e) => setCardDigits(ghanaCardDigits(e.target.value))}
                placeholder="0123456789"
              />
            </div>
            {cardDigits && cardDigits.length !== GHANA_CARD_DIGITS ? (
              <p className="mt-1 text-[10px] uppercase tracking-widest text-brand-gold-ink dark:text-brand-gold">
                {GHANA_CARD_DIGITS - cardDigits.length} digit(s) remaining
              </p>
            ) : null}
          </Field>
          <PhoneField
            value={phone}
            onChange={setPhone}
            required
            label="Telephone number"
            hint="10-digit Ghana mobile number, e.g. 024 123 4567"
          />
          <Field
            label="Date of birth"
            hint={
              dob ? (
                <span className="text-[11px] text-muted-foreground">
                  Age {calculateAge(dob) ?? "—"}
                  {isMinor(dob) ? " · under 18 (minor saver)" : ""}
                </span>
              ) : null
            }
          >
            <input
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              className={inputClass(focusRing)}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
            {dob && validateDateOfBirth(dob) ? (
              <p className="mt-1 text-[10px] uppercase tracking-widest text-destructive">
                {validateDateOfBirth(dob)}
              </p>
            ) : null}
          </Field>
          <Field label="Region">
            <select
              required
              className={inputClass(focusRing)}
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setDistrict("");
              }}
            >
              <option value="">Select region…</option>
              {GHANA_REGIONS.map((r) => (
                <option key={r.code} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="District / Municipal">
            <select
              required
              disabled={!region}
              className={inputClass(focusRing)}
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="">{region ? "Select district…" : "Select a region first"}</option>
              {districtsForRegion(region).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Membership type">
            <select
              className={inputClass(focusRing)}
              value={membershipType}
              onChange={(e) => setMembershipType(e.target.value as MembershipType)}
            >
              {MEMBERSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEMBERSHIP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>

        </>
      ) : null}

      <Field label="Email">
        <input
          type="email"
          required
          autoComplete="email"
          className={inputClass(focusRing)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={isAdmin ? "staff@it360.example" : "you@example.com"}
        />
      </Field>
      <Field
        label="Password"
        hint={
          mode === "signin" ? (
            <Link
              to="/auth/forgot"
              className={cn(
                "text-[11px] font-medium hover:underline",
                isAdmin ? "text-emerald-mid" : "text-primary",
              )}
            >
              Forgot password?
            </Link>
          ) : null
        }
      >
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={cn(inputClass(focusRing), "pr-11")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowPassword((s) => !s);
            }}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-1 my-auto flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-emerald-deep/5 hover:text-emerald-deep"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {capsOn ? (
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-gold-ink dark:text-brand-gold">
            Caps Lock is on
          </p>
        ) : null}
        {password ? (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-deep/10">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  strength.score <= 1
                    ? "bg-destructive"
                    : strength.score === 2
                      ? "bg-gold"
                      : strength.score === 3
                        ? "bg-teal-500"
                        : "bg-emerald-mid",
                )}
                style={{ width: `${(strength.score / 4) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              Strength: {strength.label}
            </p>
          </div>
        ) : null}
      </Field>

      {err ? <p className="text-xs font-medium text-destructive">{err}</p> : null}
      {notice ? <p className="text-xs font-medium text-teal-700">{notice}</p> : null}


      <button
        type="submit"
        disabled={loading}
        className={cn(
          "w-full rounded-lg py-3 text-xs font-bold uppercase tracking-widest shadow-sm transition-all hover:shadow-md disabled:opacity-60",
          accent,
        )}
      >
        {loading
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : isAdmin
              ? "Sign in to admin"
              : "Sign in"}
      </button>
    </form>
  );
}

function BiometricButton({ kind }: { kind: PanelKind }) {
  const isAdmin = kind === "admin";
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (typeof window === "undefined" || !window.PublicKeyCredential) {
          if (!cancelled) setSupported(false);
          return;
        }
        const available = await (
          window.PublicKeyCredential as unknown as {
            isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
          }
        ).isUserVerifyingPlatformAuthenticatorAvailable?.();
        if (!cancelled) setSupported(!!available);
      } catch {
        if (!cancelled) setSupported(false);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = useNavigate();

  if (supported === false) return null;


  const onClick = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const options = await beginPasskeyAuthentication();
      const assertion = await startAuthentication({ optionsJSON: options as never });
      const { email, tokenHash } = await finishPasskeyAuthentication({
        data: { response: assertion },
      });
      const { error } = await supabase.auth.verifyOtp({
        email,
        token_hash: tokenHash,
        type: "magiclink",
      });
      if (error) {
        setMsg({ tone: "error", text: error.message });
        return;
      }
      setMsg({ tone: "success", text: "Signed in with passkey — redirecting…" });
      setTimeout(() => navigate({ to: isAdmin ? "/admin" : "/app" }), 150);
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      const message = (e as { message?: string } | null)?.message;
      if (name === "NotAllowedError") {
        setMsg({ tone: "error", text: "Biometric prompt cancelled." });
      } else if (message?.includes("not recognised")) {
        setMsg({
          tone: "error",
          text: "No passkey on this device is registered for this app. Sign in with your password, then enrol a passkey from Profile & KYC.",
        });
      } else {
        setMsg({ tone: "error", text: message ?? "Passkey sign-in failed." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading || supported === null}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg border py-3 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-60",
          isAdmin
            ? "border-emerald-deep/20 bg-emerald-deep/5 text-emerald-deep hover:bg-emerald-deep/10"
            : "border-teal-500/25 bg-teal-500/5 text-teal-700 hover:bg-teal-500/10",
        )}
      >
        <Fingerprint className="size-4" />
        {loading
          ? "Waiting for biometric…"
          : isAdmin
            ? "Sign in with biometrics"
            : "Use Face ID / fingerprint"}
      </button>
      {msg ? (
        <p
          className={cn(
            "mt-2 text-[11px] leading-relaxed",
            msg.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}


function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setErr(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) setErr(result.error.message || "Google sign-in failed");
      if (result.redirected) return;
      window.location.assign("/app");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-3 text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        <GoogleIcon /> {loading ? "Connecting…" : "Continue with Google"}
      </button>
      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {hint}
      </div>
      {children}
    </label>
  );
}

function inputClass(focus = "focus:border-primary") {
  return cn(
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground",
    focus,
  );
}
