import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { BellIcon, ChevronRightIcon } from "@/components/icons";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { supabase } from "@/lib/supabase";
import { InboxItem, buildInbox } from "@/lib/inbox";
import { KeyDateRow } from "@/lib/keyDates";
import { UpcomingPlan, loadUpcomingPlans } from "@/lib/plannedEvents";
import { shouldNudge } from "@/lib/dateNudge";
import { Theme } from "@/theme/tokens";

/**
 * The bell.
 *
 * Everything the app is waiting on you for. Before this, each thing had its
 * own card on Home competing for the same space, and anything skipped had
 * nowhere to live at all -- "do this later" quietly meant "never".
 */
export default function Inbox() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session } = useAuth();
  const { me, partner } = useCoupleMembers();
  const { outstanding, load: loadOnboarding, loaded } = useOnboarding();

  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);
  const [plans, setPlans] = useState<UpcomingPlan[]>([]);
  const [lastPlannedAt, setLastPlannedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    await loadOnboarding();

    const [keyRes, upcoming, lastRes] = await Promise.all([
      supabase
        .from("key_dates")
        .select("id, title, date, recurring, kind, subject_user_id, reminder_days, reminders_on, notes, end_date, pinned"),
      loadUpcomingPlans(),
      supabase
        .from("planned_events")
        .select("created_at")
        .eq("cancelled", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (keyRes.data) setKeyDates(keyRes.data as KeyDateRow[]);
    setPlans(upcoming);
    setLastPlannedAt(
      lastRes.data?.created_at ? new Date(lastRes.data.created_at as string) : null
    );
  }, [loadOnboarding]);

  useRefreshOnFocus(load);

  function nameFor(userId: string | null): string {
    if (userId === me.id) return me.display_name ?? "You";
    return partner?.display_name ?? "Your partner";
  }

  const items = buildInbox({
    outstanding,
    keyDates,
    plans,
    nudging: shouldNudge(plans, lastPlannedAt),
    nameFor,
  });

  if (!loaded && !session) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        title="Waiting on you"
        back="Home"
        intro={
          items.length === 0
            ? undefined
            : "Tap anything to deal with it. Nothing here expires or nags you twice."
        }
      />

      {items.length === 0 ? (
        <View style={styles.empty}>
          <BellIcon size={28} color={t.textMuted} />
          <Text style={styles.emptyTitle}>Nothing waiting</Text>
          <Text style={styles.emptyBody}>
            Everything is set up and nothing is coming up in the next little while. This is the
            good state.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item, i) => (
            <Pressable
              key={item.id}
              style={press([styles.item, i > 0 ? styles.itemDivider : null])}
              onPress={() => router.push(item.route as never)}
            >
              <View style={[styles.pip, styles[`pip_${item.kind}` as const]]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDetail} numberOfLines={2}>
                  {item.detail}
                </Text>
              </View>
              <ChevronRightIcon size={18} color={t.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/** The bell itself, for the Home header. */
export function InboxBadge({ count }: { count: number }) {
  const styles = useThemedStyles(createStyles);
  if (count <= 0) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
    container: {
      flexGrow: 1,
      backgroundColor: t.bg,
      paddingHorizontal: t.space(6),
      paddingTop: t.space(16),
      paddingBottom: t.space(12),
    },
    list: { ...t.card, overflow: "hidden" },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(3),
      paddingVertical: t.space(4),
      paddingHorizontal: t.space(4),
    },
    itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.textMuted },
    pip_keyDate: { backgroundColor: t.accent },
    pip_nudge: { backgroundColor: t.brand },
    pip_setup: { backgroundColor: t.dotWork },
    itemTitle: { ...t.type.heading, color: t.textPrimary },
    itemDetail: { ...t.type.caption, color: t.textSecondary, marginTop: 2 },

    empty: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
      padding: t.space(6),
      alignItems: "center",
      gap: t.space(2),
    },
    emptyTitle: { ...t.type.title, color: t.textPrimary, marginTop: t.space(2) },
    emptyBody: { ...t.type.body, color: t.textSecondary, textAlign: "center" },

    badge: {
      position: "absolute",
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: t.brand,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: t.bg,
    },
    badgeText: { ...t.type.eyebrow, fontSize: 10, letterSpacing: 0, color: t.textOnBrand },
  });
