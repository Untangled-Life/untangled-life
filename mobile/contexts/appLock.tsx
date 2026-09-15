import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { authenticate, isLockEnabled } from "@/lib/appLock";

/**
 * Holds the app behind Face ID when the setting is on.
 *
 * The rule is: locked whenever the setting is on and we have not authenticated
 * since the app was last properly away. "Properly away" is the subtlety. iOS
 * throws a brief `inactive` state at the app for the Face ID sheet itself, for
 * the app switcher's peek, for a dropped-down notification shade -- and
 * treating those as "left the app" would lock the phone the instant the unlock
 * prompt appeared, an unwinnable loop. So only a move to `background` arms the
 * lock; `inactive` is ignored.
 */

type LockState = {
  /** Whether to hold the biometric lock screen (with its Unlock button). */
  locked: boolean;
  /**
   * Whether to cover the app at all. Wider than `locked`: also true before
   * the setting has been read (so nothing flashes on a cold start) and while
   * the app is merely inactive with the lock on (so the app-switcher snapshot
   * shows the cover, not the couple's diary). The cover in this second case
   * carries no Unlock button, because there is nothing to unlock yet.
   */
  covered: boolean;
  /** Try the biometric prompt now. The lock screen's one button. */
  unlock: () => Promise<void>;
  /** Re-read the setting after it is changed in Settings. */
  refresh: () => Promise<void>;
};

const AppLockContext = createContext<LockState | undefined>(undefined);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  // Whether the app is the foreground app. Anything but `active` covers it
  // when the lock is on, which is what keeps the OS app-switcher snapshot
  // from showing the diary.
  const [foreground, setForeground] = useState(true);

  // Whether a prompt is already up, so overlapping AppState events and taps
  // do not stack three Face ID sheets.
  const authing = useRef(false);

  const refresh = useCallback(async () => {
    const on = await isLockEnabled();
    setEnabled(on);
    // Turning it OFF unlocks immediately; turning it on locks until the next
    // successful prompt.
    if (!on) setLocked(false);
    setReady(true);
  }, []);

  useEffect(() => {
    refresh().then(() => {
      // Locked on cold start if the setting is on: the first thing anybody
      // sees is the prompt, not a flash of the app behind it.
      isLockEnabled().then((on) => setLocked(on));
    });
  }, [refresh]);

  const unlock = useCallback(async () => {
    if (authing.current) return;
    authing.current = true;
    const ok = await authenticate();
    authing.current = false;
    if (ok) setLocked(false);
  }, []);

  // Arm on background, and prompt the moment we come back locked.
  useEffect(() => {
    if (!enabled) return;

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      setForeground(state === "active");
      if (state === "background") {
        setLocked(true);
      } else if (state === "active") {
        // Re-read the flag from the ref through isLockEnabled indirectly:
        // enabled is fresh here because the effect re-subscribes when it
        // changes. If we are locked, ask straight away.
        setLocked((wasLocked) => {
          if (wasLocked && !authing.current) void unlock();
          return wasLocked;
        });
      }
    });

    return () => sub.remove();
  }, [enabled, unlock]);

  // Auto-prompt on first arriving locked (cold start with the setting on).
  useEffect(() => {
    if (ready && enabled && locked && !authing.current) void unlock();
  }, [ready, enabled, locked, unlock]);

  const locking = enabled && locked;
  // Held until the setting is known, so a cold start never paints the app
  // behind the lock for a frame; plus the inactive-cover case above.
  const covered = !ready || locking || (enabled && !foreground);

  return (
    <AppLockContext.Provider value={{ locked: locking, covered, unlock, refresh }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within an AppLockProvider");
  return ctx;
}
