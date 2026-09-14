import { useCallback, useState } from "react";
import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCouplePhotos } from "@/hooks/useCouplePhotos";
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
export function useOnboarding() {
  const { session, profile, refreshProfile } = useAuth();
  const { coverUrl, myAvatarUrl } = useCouplePhotos();

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
      hasAvatar: Boolean(myAvatarUrl),
      hasCover: Boolean(coverUrl),
      dismissed: (profile?.onboarding_done as string[] | undefined) ?? [],
    });
    setLoaded(true);
  }, [userId, myAvatarUrl, coverUrl, profile?.onboarding_done]);

  /** Mark a step finished or dismissed for good. Skipping does not call this. */
  const dismiss = useCallback(
    async (key: OnboardingStepKey) => {
      if (!userId) return;

      const next = [...new Set([...facts.dismissed, key])];

      // Written back in full rather than appended to, because two phones can
      // be in the walkthrough at once and a Postgres array has no merge.
      // Re-reading first would only narrow the race, not close it, and the
      // cost of losing one is that a finished step is offered again.
      setFacts((f) => ({ ...f, dismissed: next }));
      await supabase.from("profiles").update({ onboarding_done: next }).eq("id", userId);
      await refreshProfile();
    },
    [userId, facts.dismissed, refreshProfile]
  );

  /** The walkthrough is over, however it ended. */
  const finish = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", userId);
    await refreshProfile();
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
