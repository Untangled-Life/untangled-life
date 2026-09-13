import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

type Member = { id: string; display_name: string | null };

// Both partners' profile rows, split into "me" and "partner" — relies on the
// "View own or partner profile" RLS policy, which lets each user read both
// rows in their couple (and nothing outside it).
export function useCoupleMembers() {
  const { session, profile } = useAuth();
  const [partner, setPartner] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!profile?.couple_id || !session?.user.id) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("couple_id", profile.couple_id);

      if (!cancelled) {
        const other = data?.find((m) => m.id !== session.user.id) ?? null;
        setPartner(other);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [profile?.couple_id, session?.user.id]);

  const me: Member = {
    id: session?.user.id ?? "",
    display_name: profile?.display_name ?? "Me",
  };

  return { me, partner, loading };
}
