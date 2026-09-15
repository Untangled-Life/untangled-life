import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, RefreshControl } from "react-native";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { tapped, warned } from "@/lib/haptics";
import { useAuth } from "@/contexts/auth";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { FreeTimePrefs, DEFAULT_FREE_TIME_PREFS } from "@/lib/freeTime";

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const MINIMUMS = [15, 30, 45, 60, 90, 120, 180];

function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour === 24) return "Midnight";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} hr`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Declared at module level, not in the render body. A component defined inside
 * a render is a new type every render, so React remounts it -- and a
 * horizontal list would jump back to 12am every time you tapped a chip.
 */
function HourRow({ value, onPick }: { value: number; onPick: (hour: number) => void }) {
  const styles = useThemedStyles(createStyles);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
      {HOURS.map((hour) => {
        const on = hour === value;
        return (
          <Pressable
            key={hour}
            style={press([styles.chip, on ? styles.chipOn : null])}
            onPress={() => onPick(hour)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{hourLabel(hour)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function FreeTimeSettings() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { profile } = useAuth();

  const [prefs, setPrefs] = useState<FreeTimePrefs>(DEFAULT_FREE_TIME_PREFS);

  /**
   * Whether these are the couple's settings or just the defaults standing in.
   *
   * Every save writes all three columns, so a tap before the read comes back
   * would take the two settings it was not about from the defaults and write
   * them over whatever the couple had chosen. A screen that quietly resets
   * settings you did not touch is worse than a screen that is briefly
   * unresponsive.
   */
  const [loaded, setLoaded] = useState(false);

  // Inert is right when the read failed -- writing defaults over their real
  // settings is the thing to avoid -- but inert with no explanation is a
  // screen that looks broken.
  const [readFailed, setReadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.couple_id) return;
    const { data, error } = await supabase
      .from("couples")
      .select("day_start_hour, day_end_hour, min_free_minutes")
      .eq("id", profile.couple_id)
      .maybeSingle();

    // A read that failed is not a couple with no preferences. Leaving
    // loaded false keeps the controls out of action rather than offering the
    // defaults as though they were the stored answer.
    if (error) {
      setReadFailed(true);
      return;
    }

    setReadFailed(false);

    if (data) {
      setPrefs({
        dayStartHour: (data.day_start_hour as number) ?? DEFAULT_FREE_TIME_PREFS.dayStartHour,
        dayEndHour: (data.day_end_hour as number) ?? DEFAULT_FREE_TIME_PREFS.dayEndHour,
        minFreeMinutes:
          (data.min_free_minutes as number) ?? DEFAULT_FREE_TIME_PREFS.minFreeMinutes,
      });
    }

    setLoaded(true);
  }, [profile?.couple_id]);

  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  async function save(next: FreeTimePrefs) {
    if (!profile?.couple_id || !loaded) return;

    tapped();
    const previous = prefs;
    setPrefs(next);

    const { error } = await supabase
      .from("couples")
      .update({
        day_start_hour: next.dayStartHour,
        day_end_hour: next.dayEndHour,
        min_free_minutes: next.minFreeMinutes,
      })
      .eq("id", profile.couple_id);

    if (error) {
      setPrefs(previous);
      warned();
      Alert.alert("Couldn't save that", error.message);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      }
    >
      <ScreenHeader
        title="Free together"
        intro={
          <>
          What counts as time worth offering the two of you. These apply to both of you, because there&apos;s
          no useful sense in which one of you thinks 11pm is too late for a window you&apos;d both
          have to be in.
          </>
        }
      />

      <View style={styles.card}>
        <Text style={styles.label}>Your day starts</Text>
        <HourRow value={loaded ? prefs.dayStartHour : -1} onPick={(h) => save({ ...prefs, dayStartHour: h })} />
        <Text style={styles.hint}>
          Nothing before this is offered, however empty the calendar looks.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>And ends</Text>
        <HourRow value={loaded ? prefs.dayEndHour : -1} onPick={(h) => save({ ...prefs, dayEndHour: h })} />
        <Text style={styles.hint}>
          Pick Midnight to run right through to the end of the day. If it lands on or before the
          start, the day is taken as running overnight: 10pm to 6am is tonight into tomorrow
          morning, which is the window that matters if you work nights.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Shortest window worth offering</Text>
        <View style={styles.chips}>
          {MINIMUMS.map((minutes) => {
            const on = loaded && minutes === prefs.minFreeMinutes;
            return (
              <Pressable
                key={minutes}
                style={press([styles.chip, on ? styles.chipOn : null])}
                onPress={() => save({ ...prefs, minFreeMinutes: minutes })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                  {minutesLabel(minutes)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Half an hour is enough for a coffee. Set it to two hours if you only want to hear about
          gaps big enough for dinner.
        </Text>
      </View>

      <Text style={styles.summary}>
        {loaded
          ? `Right now: ${hourLabel(prefs.dayStartHour)} to ${hourLabel(prefs.dayEndHour)}, at least ${minutesLabel(prefs.minFreeMinutes)} free.`
          : readFailed
            ? "Couldn't read your settings just now, so these are left alone rather than guessed at. Pull down to try again."
            : "Reading your settings..."}
      </Text>
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: t.bg,
      paddingHorizontal: t.space(6),
      paddingTop: t.space(16),
      paddingBottom: t.space(12),
    },
    card: {
      ...t.card,
      padding: t.space(4),
      marginBottom: t.space(4)
    },
    label: { ...t.type.label, color: t.textSecondary, marginBottom: t.space(3) },
    hint: { ...t.type.caption, color: t.textMuted, marginTop: t.space(3) },
    chipScroll: { marginHorizontal: -4 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
      backgroundColor: t.surfaceSunken,
      marginHorizontal: 4,
    },
    chipOn: { backgroundColor: t.accentSoft },
    chipText: { ...t.type.label, color: t.textMuted },
    chipTextOn: { color: t.accent },
    summary: { ...t.type.caption, color: t.textSecondary, textAlign: "center", marginTop: t.space(2) },
  });
