import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Face ID / Touch ID over the top of the app.
 *
 * This is not a second account password and it is not two-factor. It is the
 * lock on the phone's own hardware, asked for again when the app opens, so
 * that a phone handed over or picked up off a table does not show a year of
 * the two of you. The session underneath is untouched: this gates the UI, not
 * the data, which is what makes it instant and what makes it honest about
 * what it is.
 *
 * The preference lives per device, not in the profile, because the answer is
 * about THIS phone. Your partner's phone, or your own tablet, decides for
 * itself.
 */

const ENABLED_KEY = "app-lock-enabled";

export type LockCapability =
  | { available: true; kind: "face" | "fingerprint" | "generic" }
  | { available: false; reason: "no-hardware" | "not-enrolled" };

/** What this phone can actually do, so the setting is only offered when it means something. */
export async function lockCapability(): Promise<LockCapability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return { available: false, reason: "no-hardware" };

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return { available: false, reason: "not-enrolled" };

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

  return { available: true, kind: face ? "face" : finger ? "fingerprint" : "generic" };
}

export async function isLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === "1";
  } catch {
    // A phone that cannot read the flag is not a phone to lock a couple out
    // of. Fail open: the account password is still the real gate.
    return false;
  }
}

export async function setLockEnabled(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    // Best effort. The toggle re-reads on next mount and will show the truth.
  }
}

/**
 * Ask for the face or the finger. Returns whether it passed.
 *
 * `disableDeviceFallback` is deliberately NOT set: an old passcode is a valid
 * way past your own phone, and refusing it would lock out somebody whose Face
 * ID stopped recognising them behind sunglasses with no way back in.
 */
export async function authenticate(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Untangled Life",
      cancelLabel: "Cancel",
    });
    return result.success;
  } catch {
    return false;
  }
}
