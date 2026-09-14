import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

type Member = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  color: string | null;
};

// Both partners' profile rows, split into "me" and "partner" — relies on the
// "View own or partner profile" RLS policy, which lets each user read both
// rows in their couple (and nothing outside it).
//
// `loading` means "we don't know yet" and must stay true until a lookup has
// actually happened for the current couple. Callers gate navigation on
// `!loading && !partner` meaning "definitely not paired", so reporting
// loading:false before the profile has even loaded bounces a properly paired
// user back to the pairing screen.
export function useCoupleMembers() {
  const { session, profile, loading: authLoading } = useAuth();
  const [partner, setPartner] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  const coupleId = profile?.couple_id ?? null;
  const userId = session?.user.id ?? null;

  useEffect(() => {
    let cancelled = false;

    // Auth hasn't settled, so there's no couple to look up yet. Staying
    // loading here is the whole point — "no couple_id" at this moment means
    // "not known", not "not paired".
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!userId || !coupleId) {
      setPartner(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_path, color")
        .eq("couple_id", coupleId);

      if (cancelled) return;

      if (error) {
        console.warn("[useCoupleMembers] partner lookup failed:", error.message);
      }

      setPartner(data?.find((m) => m.id !== userId) ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, coupleId, userId]);

  const me: Member = {
    id: userId ?? "",
    display_name: profile?.display_name ?? "Me",
    avatar_path: profile?.avatar_path ?? null,
    color: profile?.color ?? null,
  };

  return { me, partner, loading };
}
