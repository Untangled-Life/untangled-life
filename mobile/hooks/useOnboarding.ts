import { useCallback, useEffect, useRef, useState } from "react";
import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { listCalendars } from "@/lib/calendarPrefs";
import {
  OnboardingFacts,
  OnboardingStepKey,
  allDone,
  nextStep,
  onboardingSteps,
  outstandingSteps,
  progress,
} from "@/lib/onboarding";

/**
 * What the walkthrough and the bell both read.
 *
 * One hook because they have to agree: a bell that says two things are
 * outstanding while the walkthrough shows three is worse than either on its
 * own. Everything is derived from the same facts, gathered here.
 */
export function useOnboarding(photos?: { myAvatarUrl: string | null; coverUrl: string | null }) {
  const { session, profile, refreshProfile } = useAuth();

  // Passed in rather than mounted here. Calling useCouplePhotos() inside this
  // hook created a SECOND instance: the screen's reload() touched its own copy
  // and this one never heard about it, so the photo steps could never tick and
  // an uploaded picture never appeared. Two copies of the same state in one
  // tree cannot be kept in step.
  //
  // Held in a ref as well, so uploading a photo does not change this hook's
  // identity and set every caller's focus effect running again.
  const photosRef = useRef(photos);

  const [facts, setFacts] = useState<OnboardingFacts>({
    calendarAccess: false,
    calendarsShared: 0,
    hasWorkPattern: false,
    hasAvatar: false,
    hasCover: false,
    dismissed: [],
  });
  const [loaded, setLoaded] = useState(false);

  const userId = session?.user.id ?? null;

  const profileRef = useRef(profile);

  // Assigned in an effect rather than during render. Writing a ref while
  // rendering is what react-hooks/refs objects to, and these are only ever
  // read from load() and dismiss(), both of which run after a render has
  // committed.
  useEffect(() => {
    photosRef.current = photos;
    profileRef.current = profile;
  });

  // The authority on what has been dismissed, so two dismissals in quick
  // succession do not both build their list from the same stale snapshot and
  // lose the first one.
  const dismissedRef = useRef<string[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;

    const permission = await Calendar.getCalendarPermissionsAsync();
    const access = permission.status === "granted";

    const [calendars, patternRes] = await Promise.all([
      access ? listCalendars(userId) : Promise.resolve([]),
      supabase.from("work_patterns").select("shifts, mode").eq("user_id", userId).maybeSingle(),
    ]);

    const shifts = patternRes.data?.shifts;

    setFacts({
      calendarAccess: access,
      calendarsShared: calendars.filter((c) => c.shareLevel !== "off").length,
      // A pattern row with no shifts in it is somebody who opened the screen
      // and left, which is not the same as having told us their hours.
      hasWorkPattern: Array.isArray(shifts) && shifts.length > 0,
      hasAvatar: Boolean(photosRef.current?.myAvatarUrl),
      hasCover: Boolean(photosRef.current?.coverUrl),
      dismissed: (profileRef.current?.onboarding_done as string[] | undefined) ?? [],
    });
    setLoaded(true);
    // Deliberately only userId. Everything else is read through a ref, so this
    // callback keeps one identity for the life of the session -- otherwise
    // every screen calling useRefreshOnFocus(load) re-runs its whole refresh
    // each time a signed photo URL resolves.
  }, [userId]);

  /** Mark a step finished or dismissed for good. Skipping does not call this. */
  const dismiss = useCallback(
    async (key: OnboardingStepKey) => {
      if (!userId) return;

      const next = [...new Set([...dismissedRef.current, key])];
      dismissedRef.current = next;

      // Written back in full rather than appended to, because two phones can
      // be in the walkthrough at once and a Postgres array has no merge.
      // Re-reading first would only narrow the race, not close it, and the
      // cost of losing one is that a finished step is offered again.
      setFacts((f) => ({ ...f, dismissed: next }));
      await supabase.from("profiles").update({ onboarding_done: next }).eq("id", userId);
      await refreshProfile();
    },
    [userId, refreshProfile]
  );

  /**
   * The walkthrough is over, however it ended.
   *
   * Returns whether it actually stuck. The caller cannot navigate away on
   * faith: if this write fails, onboarded_at stays null and the layout sends
   * them straight back here, so a silent failure is somebody trapped on the
   * welcome screen with no way out.
   */
  const finish = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;

    const { error } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) return false;

    await refreshProfile();
    return true;
  }, [userId, refreshProfile]);

  return {
    facts,
    loaded,
    load,
    dismiss,
    finish,
    steps: onboardingSteps(facts),
    outstanding: outstandingSteps(facts),
    next: nextStep(facts),
    complete: allDone(facts),
    progress: progress(facts),
    /** Null until they have been through it once, whatever the outcome. */
    onboardedAt: (profile?.onboarded_at as string | null | undefined) ?? null,
  };
}
