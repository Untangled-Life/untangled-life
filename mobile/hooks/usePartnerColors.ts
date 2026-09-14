import { useMemo } from "react";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { PaletteColor, colorFor } from "@/lib/palette";

/**
 * Both partners' colours, and a lookup by user id.
 *
 * `colorFor(null)` is a stable per-user fallback rather than a fixed default,
 * so a couple who have never opened the colour picker still get two different
 * colours on their calendar.
 */
export function usePartnerColors(): {
  mine: PaletteColor;
  theirs: PaletteColor | null;
  /** Null for a shared event, which is neither partner's colour. */
  forOwner: (ownerUserId: string | null) => PaletteColor | null;
} {
  const { profile } = useAuth();
  const { me, partner } = useCoupleMembers();

  const myColor = profile?.color ?? null;
  const theirColor = partner?.color ?? null;
  const myId = me.id;
  const theirId = partner?.id ?? null;

  return useMemo(() => {
    const mine = colorFor(myColor, myId);
    const theirs = theirId ? colorFor(theirColor, theirId) : null;

    return {
      mine,
      theirs,
      forOwner: (ownerUserId: string | null) => {
        if (!ownerUserId) return null;
        if (ownerUserId === myId) return mine;
        if (theirId && ownerUserId === theirId) return theirs;
        return colorFor(null, ownerUserId);
      },
    };
  }, [myColor, theirColor, myId, theirId]);
}
