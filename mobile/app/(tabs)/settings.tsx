import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { press } from "@/components/press";
import { router } from "expo-router";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { ChevronRightIcon } from "@/components/icons";
import { Avatar } from "@/components/avatar";
import { useAuth } from "@/contexts/auth";
import { useCouplePhotos } from "@/hooks/useCouplePhotos";
import { pickPhoto, uploadPhoto, removePhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import { succeeded, warned, tapped } from "@/lib/haptics";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { leaveCouple, deleteOwnAccount } from "@/lib/leaving";

export default function Settings() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session, profile, refreshProfile } = useAuth();
  const { myAvatarUrl, reload: reloadPhotos } = useCouplePhotos();
  const { partner } = useCoupleMembers();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const partnerName = partner?.display_name ?? "your partner";

  function confirmUnpair() {
    Alert.alert(
      `Unpair from ${partnerName}?`,
      `You'll keep your account and can pair again with a new code. ${partnerName} keeps your key dates, to-dos, wishlists and booked dates. They don't disappear from their phone. Your calendar data and working hours are removed; your profile photo stays, because you keep your account.`,
      [
        { text: "Stay paired", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: async () => {
            if (!session?.user.id) return;
            setLeaving(true);
            const { error } = await leaveCouple(session.user.id, profile?.couple_id ?? null);
            if (error) {
              setLeaving(false);
              warned();
              Alert.alert("Couldn't unpair", error);
              return;
            }
            // The tabs gate sends an unpaired user to /pair on its own once
            // the profile no longer has a couple_id.
            await refreshProfile();
            succeeded();
          },
        },
      ]
    );
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      partner
        ? `This can't be undone. Your sign-in, your calendar data, your working hours and your photo are deleted. ${partnerName} keeps the key dates, to-dos, wishlists and booked dates you both built, except your birthday, which goes with you.`
        : "This can't be undone. Your sign-in and everything in the app is deleted. Nobody else is in your couple, so nothing is kept.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: () => {
            // Two taps. The first is easy to hit by accident from a list of
            // settings rows; this one names the thing being destroyed.
            Alert.alert("Last chance", "Delete your Untangled Life account permanently?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  if (!session?.user.id) return;
                  setLeaving(true);
                  const { error } = await deleteOwnAccount(session.user.id, profile?.couple_id ?? null);
                  if (error) {
                    setLeaving(false);
                    warned();
                    Alert.alert("Couldn't delete your account", error);
                  }
                  // On success the sign-out inside deleteOwnAccount drops the
                  // session and the app returns to the sign-in screen.
                },
              },
            ]);
          },
        },
      ]
    );
  }


  async function setAvatar(path: string | null) {
    if (!session?.user.id) return;
    const previous = profile?.avatar_path ?? null;

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: path })
      .eq("id", session.user.id);

    if (error) {
      // Undo the upload rather than leaving a file nothing points at.
      if (path) await removePhoto(path);
      warned();
      Alert.alert("Couldn't save that", error.message);
      return;
    }

    await removePhoto(previous);
    await refreshProfile();
    await reloadPhotos();
    succeeded();
  }

  async function changePhoto() {
    if (!session?.user.id || busy) return;

    const { photo, error } = await pickPhoto("avatar");
    if (error) {
      warned();
      Alert.alert("Couldn't use that photo", error);
      return;
    }
    if (!photo) return;

    setBusy(true);
    const upload = await uploadPhoto("avatar", session.user.id, photo);
    if (upload.error || !upload.path) {
      setBusy(false);
      warned();
      Alert.alert("Couldn't save that photo", upload.error ?? "Please try again.");
      return;
    }
    await setAvatar(upload.path);
    setBusy(false);
  }

  function confirmRemove() {
    Alert.alert("Remove your photo?", "Your initials will show instead.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          await setAvatar(null);
          setBusy(false);
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Menu</Text>
      </Pressable>

      <Text style={styles.title}>Settings</Text>

      <Text style={styles.groupTitle}>You</Text>
      <View style={[styles.card, styles.profileCard]}>
        <Avatar url={myAvatarUrl} name={profile?.display_name ?? null} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{profile?.display_name ?? "You"}</Text>
          <Text style={styles.rowHint}>
            {myAvatarUrl ? "Your partner sees this beside your events." : "No photo yet."}
          </Text>
          {busy ? (
            <ActivityIndicator style={{ alignSelf: "flex-start", marginTop: 8 }} />
          ) : (
            <View style={styles.profileActions}>
              <Pressable onPress={changePhoto} hitSlop={8}>
                <Text style={styles.action}>{myAvatarUrl ? "Change photo" : "Add a photo"}</Text>
              </Pressable>
              {myAvatarUrl ? (
                <Pressable onPress={confirmRemove} hitSlop={8}>
                  <Text style={[styles.action, styles.actionDanger]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </View>

      {/* Appearance, the accent, your calendar colour and the Home
          arrangement all moved to Personalisation. This screen is what the app
          DOES; that one is what it looks like. Holding both meant "change the
          accent" and "delete my account" shared a scroll. */}
      <Pressable style={press(styles.card)} onPress={() => router.push("/personalisation")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Personalisation</Text>
            <Text style={styles.rowHint}>Appearance, colours and your Home screen</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>

      {/* Working hours and Calendars used to sit on Home as well. They are
          set up once and then true, and a card repeating "2-week rotation, 10
          shifts" every day forever is furniture. Home is for what changed. */}
      <Text style={styles.groupTitle}>Set up</Text>
      <Pressable style={press(styles.card)} onPress={() => router.push("/calendars")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Calendars</Text>
            <Text style={styles.rowHint}>What your partner sees of each one</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>

      <Pressable style={press(styles.card)} onPress={() => router.push("/free-time")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Free together</Text>
            <Text style={styles.rowHint}>Which hours count, and how short a gap is worth it</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>

      <Pressable style={press(styles.card)} onPress={() => router.push("/work-hours")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Working hours</Text>
            <Text style={styles.rowHint}>Your shifts, so free time is honest</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>

      <Text style={styles.groupTitle}>Leaving</Text>
      <View style={styles.card}>
        {leaving ? (
          <View style={styles.row}>
            <ActivityIndicator />
            <Text style={styles.rowHint}>Working on it…</Text>
          </View>
        ) : (
          <>
            <Pressable onPress={confirmUnpair} style={press(styles.row)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Unpair from {partnerName}</Text>
                <Text style={styles.rowHint}>Keep your account, start again with a new code</Text>
              </View>
              <ChevronRightIcon size={18} color={t.textMuted} />
            </Pressable>

            <Pressable onPress={confirmDelete} style={press([styles.row, styles.rowDivider])}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Delete my account</Text>
                <Text style={styles.rowHint}>Permanent. Everything of yours goes.</Text>
              </View>
              <ChevronRightIcon size={18} color={t.textMuted} />
            </Pressable>
          </>
        )}
      </View>

      <Text style={styles.footnote}>
        More will land here before launch. See the pre-launch checklist in the repo for what&apos;s
        still outstanding.
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
    back: { ...t.type.label, color: t.accent, marginBottom: t.space(3) },
    title: { ...t.type.display, color: t.textPrimary, marginBottom: t.space(6) },
    groupTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: t.textMuted,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: t.space(2),
      marginTop: t.space(4),
      marginLeft: t.space(1),
    },
    card: {
      ...t.card,
      overflow: "hidden",
      marginBottom: t.space(3)
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: t.space(4),
      paddingHorizontal: t.space(4),
      gap: t.space(3),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    rowLabel: { ...t.type.heading, color: t.textPrimary },
    rowLabelDanger: { color: t.danger },
    rowHint: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(4),
      padding: t.space(4),
    },
    profileActions: { flexDirection: "row", gap: t.space(4), marginTop: t.space(2) },
    action: { ...t.type.label, color: t.accent },
    actionDanger: { color: t.danger },
    footnote: {
      ...t.type.caption,
      color: t.textMuted,
      marginTop: t.space(3),
      marginLeft: t.space(1),
    },
  });
