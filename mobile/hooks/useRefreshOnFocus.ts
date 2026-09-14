import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Re-run a screen's loader whenever it comes back into view.
 *
 * Every screen loaded once on mount and never again, so anything changed
 * elsewhere -- a key date added on another tab, a date your partner booked --
 * simply wasn't there until the app was restarted. That reads as the app being
 * broken rather than stale.
 *
 * Also returns pull-to-refresh state, since a screen worth refreshing on focus
 * is usually one worth being able to refresh by hand.
 */
export function useRefreshOnFocus(load: () => void | Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Deliberately not awaited: focus effects run synchronously and a
      // rejected load shouldn't take the screen down with it.
      Promise.resolve(load()).catch(() => {});
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch {
      // A failed manual refresh leaves what's on screen; surfacing it here
      // would mean an alert on every flaky connection.
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return { refreshing, onRefresh };
}
