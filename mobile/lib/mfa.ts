import { supabase } from "@/lib/supabase";

/**
 * Two-factor, on top of Supabase Auth's own MFA.
 *
 * An authenticator app rather than SMS. A text message costs money per
 * message and is the weakest second factor there is; a six-digit code from
 * an app on the same phone costs nothing and is what every bank has moved
 * to. The QR code is Supabase's, the check is Supabase's, and the database
 * refuses a session that has enrolled but not entered the code (see
 * supabase/two-factor.sql), so this is a real lock rather than a screen.
 */

export type Factor = {
  id: string;
  friendly_name?: string;
  status: "verified" | "unverified";
};

/** The verified factors on this account. One is all anybody needs. */
export async function verifiedFactors(): Promise<Factor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return data.totp.filter((f) => f.status === "verified") as Factor[];
}

/**
 * Whether this session still owes a code.
 *
 * "Next level is aal2 and we are not there" is the one honest way to ask.
 * A session with no factors is already at its ceiling, so it never owes one;
 * a session that has enrolled a factor but signed in fresh is at aal1 with a
 * next level of aal2, which is exactly the gap the code fills.
 */
export async function needsChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel;
}

export type Enrolment = {
  factorId: string;
  /** The otpauth:// URI, for a QR code and for the manual-entry secret. */
  uri: string;
  /** The base32 secret, shown so it can be typed into an app that cannot scan. */
  secret: string;
};

/**
 * Begin enrolling an authenticator.
 *
 * Nothing is protected yet: the factor exists as "unverified" until a code
 * proves the phone and the app agree. A friendly name is required to be
 * unique per user, so a stale unverified factor from an abandoned attempt is
 * cleared first rather than colliding.
 */
export async function beginEnrolment(): Promise<{ enrolment: Enrolment | null; error: string | null }> {
  await clearUnverified();

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Authenticator",
  });

  if (error || !data) return { enrolment: null, error: error?.message ?? "Couldn't start setup." };

  return {
    enrolment: { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret },
    error: null,
  };
}

/**
 * Finish enrolling, or answer a challenge at sign-in: the same two calls
 * either way, because Supabase models both as challenge-then-verify.
 */
export async function submitCode(
  factorId: string,
  code: string
): Promise<{ ok: boolean; error: string | null }> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    return { ok: false, error: challenge.error?.message ?? "Couldn't check that code." };
  }

  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });

  if (verify.error) return { ok: false, error: verify.error.message };
  return { ok: true, error: null };
}

/** Answer the challenge at sign-in, against whichever factor is verified. */
export async function challengeExisting(code: string): Promise<{ ok: boolean; error: string | null }> {
  const factors = await verifiedFactors();
  if (factors.length === 0) return { ok: false, error: "No authenticator set up." };
  return submitCode(factors[0].id, code);
}

/** Turn it off. Removing every verified factor drops the account back to one step. */
export async function disableTotp(): Promise<{ ok: boolean; error: string | null }> {
  const factors = await verifiedFactors();
  for (const factor of factors) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/**
 * Clear a half-finished enrolment.
 *
 * An unverified factor left lying around blocks the next attempt on the
 * unique friendly name, and worse, it is not yet enforced by the database,
 * so it protects nothing while getting in the way. Removed on the way into a
 * fresh attempt rather than trusted to tidy itself.
 */
export async function clearUnverified(): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  if (!data) return;
  const stale = data.all.filter((f) => f.status === "unverified");
  for (const factor of stale) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {});
  }
}

/**
 * Recovery codes: the way back in when the authenticator is gone.
 *
 * Generated at enrolment and shown once. Redeeming one removes the factor, so
 * the account is usable again at the password's level, and the person is told
 * to set two-factor up afresh. The server holds only hashes; see
 * supabase/mfa-recovery.sql.
 */
export async function generateRecoveryCodes(): Promise<{ codes: string[]; error: string | null }> {
  const { data, error } = await supabase.rpc("generate_mfa_recovery_codes");
  if (error) return { codes: [], error: error.message };
  return { codes: (data as string[] | null) ?? [], error: null };
}

export async function redeemRecoveryCode(code: string): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("redeem_mfa_recovery_code", { code });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That recovery code is not valid, or has already been used." };
  return { ok: true, error: null };
}
