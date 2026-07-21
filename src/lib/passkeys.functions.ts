import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// --- helpers ---------------------------------------------------------------

function deriveOrigin(): { origin: string; rpID: string } {
  const originHeader = getRequestHeader("origin") || getRequestHeader("referer") || "";
  let origin = originHeader.replace(/\/$/, "");
  if (!origin) {
    const host = getRequestHeader("host") ?? "localhost";
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    origin = `${proto}://${host}`;
  }
  const rpID = new URL(origin).hostname;
  return { origin, rpID };
}

const RP_NAME = "IT-360 CashApp";

// --- registration options --------------------------------------------------

export const getPasskeyRegistrationOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    const { rpID } = deriveOrigin();

    // Existing credentials so the authenticator won't create a duplicate.
    const { data: existing } = await supabaseAdmin
      .from("user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", userId);

    const excludeCredentials = (existing ?? []).map((r) => ({
      id: r.credential_id as string,
      transports: (r.transports as string[] | null) ?? undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: claims.email ?? userId,
      userDisplayName: claims.email ?? "IT-360 member",
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: excludeCredentials as never,
    });

    // Store the challenge server-side for later verification.
    await supabaseAdmin.from("passkey_challenges").insert({
      user_id: userId,
      challenge: options.challenge,
      kind: "registration",
    });

    return options;
  });

// --- verify registration ---------------------------------------------------

const verifySchema = z.object({
  response: z.any(),
  deviceLabel: z.string().max(120).optional(),
});

export const verifyPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context as { userId: string };
    const { origin, rpID } = deriveOrigin();

    // Pull the newest unexpired registration challenge for this user.
    const { data: challengeRow, error: chErr } = await supabaseAdmin
      .from("passkey_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", userId)
      .eq("kind", "registration")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (chErr || !challengeRow) throw new Error("No active passkey challenge — please retry");

    const verification = await verifyRegistrationResponse({
      response: data.response,
      expectedChallenge: challengeRow.challenge as string,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Passkey verification failed");
    }

    const info = verification.registrationInfo as unknown as {
      credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] };
      credentialBackedUp?: boolean;
    };
    const publicKeyB64 = Buffer.from(info.credential.publicKey).toString("base64");

    const { error: insErr } = await supabaseAdmin.from("user_passkeys").insert({
      user_id: userId,
      credential_id: info.credential.id,
      public_key: publicKeyB64,
      counter: info.credential.counter ?? 0,
      transports: info.credential.transports ?? [],
      backed_up: info.credentialBackedUp ?? false,
      device_label: data.deviceLabel ?? deviceLabelFromUA(),
    });
    if (insErr) throw new Error(insErr.message);

    // Cleanup: delete used + expired challenges for this user.
    await supabaseAdmin
      .from("passkey_challenges")
      .delete()
      .eq("user_id", userId)
      .eq("kind", "registration");

    return { ok: true };
  });

function deviceLabelFromUA(): string {
  const ua = getRequestHeader("user-agent") ?? "";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS device";
  if (/mac os x/i.test(ua)) return "Mac";
  if (/android/i.test(ua)) return "Android device";
  if (/windows/i.test(ua)) return "Windows device";
  return "Passkey";
}

// --- list & delete ---------------------------------------------------------

export type PasskeyRow = {
  id: string;
  device_label: string | null;
  backed_up: boolean;
  transports: string[];
  created_at: string;
  last_used_at: string | null;
};

export const listMyPasskeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
    };
    const { data, error } = await supabase
      .from("user_passkeys")
      .select("id, device_label, backed_up, transports, created_at, last_used_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PasskeyRow[];
  });

export const deleteMyPasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
    };
    const { error } = await supabase.from("user_passkeys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- authentication (sign-in) ---------------------------------------------

export const beginPasskeyAuthentication = createServerFn({ method: "POST" })
  .handler(async () => {
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rpID } = deriveOrigin();

    // Usernameless / discoverable-credential flow — the authenticator picks
    // the account and returns a userHandle we resolve in the finish step.
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: [],
    });

    await supabaseAdmin.from("passkey_challenges").insert({
      user_id: null,
      challenge: options.challenge,
      kind: "authentication",
    });

    return options;
  });

export const finishPasskeyAuthentication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ response: z.any() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { origin, rpID } = deriveOrigin();

    const credentialId: string | undefined = data.response?.id;
    if (!credentialId) throw new Error("Missing credential id");

    // Load the stored credential
    const { data: cred, error: credErr } = await supabaseAdmin
      .from("user_passkeys")
      .select("id, user_id, credential_id, public_key, counter, transports")
      .eq("credential_id", credentialId)
      .maybeSingle();
    if (credErr || !cred) throw new Error("Passkey not recognised on this account");

    // Fetch most recent authentication challenge for this user (or unbound)
    const { data: challengeRow } = await supabaseAdmin
      .from("passkey_challenges")
      .select("id, challenge, expires_at, user_id")
      .eq("kind", "authentication")
      .gt("expires_at", new Date().toISOString())
      .or(`user_id.eq.${cred.user_id},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!challengeRow) throw new Error("Passkey challenge expired — please try again");

    const publicKey = Buffer.from(cred.public_key as string, "base64");

    const verification = await verifyAuthenticationResponse({
      response: data.response,
      expectedChallenge: challengeRow.challenge as string,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id as string,
        publicKey,
        counter: Number(cred.counter ?? 0),
        transports: ((cred.transports as string[] | null) ?? undefined) as never,
      },
    } as never);

    if (!verification.verified) throw new Error("Passkey verification failed");

    // Update counter + last_used_at
    await supabaseAdmin
      .from("user_passkeys")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", cred.id);

    // Clean up challenge
    await supabaseAdmin.from("passkey_challenges").delete().eq("id", challengeRow.id);

    // Resolve email for this user + mint a magic-link token the client can exchange for a session
    const { data: userInfo, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(cred.user_id as string);
    if (userErr || !userInfo?.user?.email) throw new Error("Unable to resolve account email");
    const email = userInfo.user.email;

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(linkErr?.message ?? "Unable to establish session");
    }

    return {
      email,
      tokenHash: linkData.properties.hashed_token,
    };
  });
