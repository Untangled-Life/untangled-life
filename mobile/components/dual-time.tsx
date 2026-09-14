import { Text, StyleSheet } from "react-native";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { offsetMinutesAt, shortZoneName, timeInZone, zonesDifferAt } from "@/lib/timezone";

/**
 * A time, with the partner's clock beside it when that is a different number.
 *
 * The comparison is on OFFSET, not zone name, and it is made against the
 * instant being shown rather than once for the whole app. So there is no
 * "their time" clutter when you are in the same place, none for two zones that
 * happen to agree today, and it appears by itself for an event that falls
 * after a transition puts you an hour apart.
 */
export function DualTime({
  instant,
  myZone,
  theirZone,
  theirName,
  style,
}: {
  instant: Date;
  myZone: string;
  theirZone: string | null;
  theirName: string;
  style?: object;
}) {
  const styles = useThemedStyles(createStyles);
  const differs = zonesDifferAt(instant, myZone, theirZone);

  return (
    <Text style={style}>
      {timeInZone(instant, myZone)}
      {differs && theirZone ? (
        <Text style={styles.theirs}>
          {"  "}
          {timeInZone(instant, theirZone)} for {theirName}
        </Text>
      ) : null}
    </Text>
  );
}

/** The same thing as a plain string, for places that can't nest a Text. */
export function dualTimeText(
  instant: Date,
  myZone: string,
  theirZone: string | null,
  theirName: string
): string {
  const mine = timeInZone(instant, myZone);
  if (!zonesDifferAt(instant, myZone, theirZone) || !theirZone) return mine;
  return `${mine} · ${timeInZone(instant, theirZone)} for ${theirName}`;
}

/** "They're in Perth, 3 hours behind you." Null when there's nothing to say. */
export function zoneGapSentence(
  instant: Date,
  myZone: string,
  theirZone: string | null,
  theirName: string
): string | null {
  if (!theirZone || !zonesDifferAt(instant, myZone, theirZone)) return null;

  // Computed from the same instant the caller is showing, so it stays right
  // when one of you changes clocks and the other doesn't.
  const mine = offsetMinutesAt(instant, myZone);
  const theirs = offsetMinutesAt(instant, theirZone);
  const hours = (theirs - mine) / 60;

  // Half-hour and three-quarter-hour zones are real -- Adelaide, Kathmandu --
  // so this cannot assume whole hours.
  const magnitude = Math.abs(hours);
  const label = magnitude === 1 ? "1 hour" : `${Number(magnitude.toFixed(2))} hours`;

  return `${theirName} is in ${shortZoneName(theirZone)}, ${label} ${hours > 0 ? "ahead of" : "behind"} you.`;
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    theirs: { color: t.textMuted },
  });
