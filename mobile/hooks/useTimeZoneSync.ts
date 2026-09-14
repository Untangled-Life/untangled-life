import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { deviceTimeZone } from "@/lib/timezone";

/**
 * Keeps this person's stored time zone matching the phone they are holding.
 *
 * Checked on mount and whenever the app comes back to the foreground, because
 * the moment it matters most is the one where it changed while the app was
 * closed: you land, your phone moves itself to the new zone, and your partner
 * needs to know before they suggest a 9pm call.
 *
 * Only writes when it has actually changed, so opening the app is not a
 * database round trip.
 */
export function useTimeZoneSync() {
  const { session, profile, refreshProfile } = useAuth();

  const userId = session?.user.id ?? null;

  // Read through refs rather than the dependency list. Both of these change as
  // a RESULT of a successful sync, so depending on them tears down the
  // foreground listener and rebuilds it on every profile refresh -- churn in
  // the one place that has to survive the app being backgrounded.
  const storedRef = useRef<string | null>(profile?.time_zone ?? null);
  storedRef.current = profile?.time_zone ?? null;

  const refreshRef = useRef(refreshProfile);
  refreshRef.current = refreshProfile;

  useEffect(() => {
    if (!userId) return;

    async function sync() {
      const current = deviceTimeZone();
      if (!current || current === storedRef.current) return;

      const { error } = await supabase
        .from("profiles")
        .update({ time_zone: current })
        .eq("id", userId as string);

      if (error) {
        // Not worth interrupting anyone for. The consequence is that times are
        // shown in the last zone we knew about, which is the old behaviour.
        console.warn("[timezone] couldn't save:", error.message);
        return;
      }

      await refreshRef.current();
    }

    sync();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });

    return () => subscription.remove();
  }, [userId]);
}
