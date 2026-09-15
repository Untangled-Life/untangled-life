import { useCallback, useState } from "react";
import {
  RefreshControl,
  Alert,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { press } from "@/components/press";
import { tapped, warned } from "@/lib/haptics";
import { BUCKETS, bucketFor, byDueDate, dueLabel, isoToday } from "@/lib/todos";
import { usePartnerColors } from "@/hooks/usePartnerColors";
import { shadeFor } from "@/lib/palette";
import { DatePickerSheet } from "@/components/fields";
import { SwipeRow } from "@/components/swipe-row";
import { ActionSheet, type SheetAction } from "@/components/action-sheet";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";

type Todo = {
  id: string;
  title: string;
  assigned_to: string | null;
  due_date: string | null;
  completed: boolean;
};

/** Whose a to-do is. Null assigned_to means it belongs to the couple. */
type Whose = "me" | "partner" | "us";

export default function Todos() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { profile } = useAuth();
  const { me, partner } = useCoupleMembers();
  const partnerColors = usePartnerColors();

  // Kept as what is HIDDEN rather than what is shown, so all three are on to
  // begin with and a group nobody has touched is visible. The three used to
  // be one choice at a time, which meant you could never see your own list
  // and the shared one together -- and the shared one is where most of the
  // things that actually matter to both of you live.
  const [hidden, setHidden] = useState<Whose[]>([]);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");

  // What the box at the bottom will make. Whose it is used to be inherited
  // from whichever filter happened to be selected, which is no longer a
  // single answer -- and was a guess even when it was.
  const [newWhose, setNewWhose] = useState<Whose>("me");
  const [newDue, setNewDue] = useState<string | null>(null);
  const [picking, setPicking] = useState<null | { id: string | null; value: string | null }>(null);

  // The row whose menu is open. Held as the id rather than the row itself,
  // so the sheet reads the current version of it rather than the copy that
  // existed when the finger went down.
  //
  // Two pieces of state rather than one, because a sheet takes a third of a
  // second to slide away and has to keep saying what it is about the whole
  // time. Open is "visible"; forgetting which row it was waits until the
  // sheet reports that it has actually gone.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // An empty list and a list nobody has read yet look identical, and the
  // one that gets shown on every cold open is the wrong one: somebody with
  // eleven of these should never be told they have none.
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("todos")
      .select("id, title, assigned_to, due_date, completed")
      .order("created_at", { ascending: true });
    // A read that failed is not a list with nothing in it. Marking it loaded
    // would put "you have none of these" in front of somebody who has
    // eleven, which is the sentence this flag was added to prevent.
    if (error) return;

    if (data) setTodos(data as Todo[]);
    setLoaded(true);
  }, []);

  // Refreshes whenever this screen comes back into view, not just on
  // mount -- otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  const whoseOf = useCallback(
    (todo: Todo): Whose =>
      todo.assigned_to === null ? "us" : todo.assigned_to === me.id ? "me" : "partner",
    [me.id]
  );

  // Unpairing mid-session takes the chip away but not what it was hiding,
  // and a hidden group with no chip is a part of the list with no way to
  // bring it back.
  const hiddenNow = hidden.filter((w) => w !== "partner" || Boolean(partner));

  const forFilter = todos.filter((todo) => !hiddenNow.includes(whoseOf(todo)));
  const visible = forFilter.filter((todo) => !todo.completed);
  const done = forFilter.filter((todo) => todo.completed);

  // Hidden by the chips rather than genuinely absent: two different things,
  // and only one of them means "you have nothing to do".
  const filteredOut = todos.filter((todo) => !todo.completed).length - visible.length;

  const assignedIdFor = (whose: Whose) =>
    whose === "me" ? me.id : whose === "partner" ? (partner?.id ?? null) : null;

  const tintFor = (whose: Whose) => {
    if (whose === "us") return null;
    const color = whose === "me" ? partnerColors.mine : partnerColors.theirs;
    return color ? shadeFor(color, t.scheme) : null;
  };

  function toggleWhose(whose: Whose) {
    tapped();
    setHidden((h) => (h.includes(whose) ? h.filter((x) => x !== whose) : [...h, whose]));
  }

  const newWhoseNow: Whose = newWhose === "partner" && !partner ? "me" : newWhose;

  // Looked up rather than stored, so a to-do renamed or moved while its menu
  // is open shows what it is now.
  const menuItem = todos.find((todo) => todo.id === menuFor) ?? null;

  async function addTodo() {
    if (!newTitle.trim() || !profile?.couple_id || !me.id) return;

    const { error } = await supabase.from("todos").insert({
      couple_id: profile.couple_id,
      created_by: me.id,
      title: newTitle.trim(),
      assigned_to: assignedIdFor(newWhoseNow),
      due_date: newDue,
    });

    if (error) {
      warned();
      Alert.alert("Couldn't add that", error.message);
      return;
    }

    setNewTitle("");
    // Same reasoning as moving one: adding to a group you have switched off
    // otherwise adds nothing you can see.
    setHidden((h) => h.filter((w) => w !== newWhoseNow));
    // The date is cleared and whose it is is not. Adding three things for
    // the same person in a row is ordinary; three things all due on the same
    // day is not, and a date left set is the one that gets added by mistake.
    setNewDue(null);
    load();
  }

  async function setDue(id: string, due: string | null) {
    // Read inside the updater, not from the closure: this function is built
    // when the sheet renders and a refresh can land between then and the
    // tap, so `todos` out here may already be a version behind.
    //
    // Kept so it can be put back. Reloading is not a rollback -- the read
    // fails for the same reason the write did, load() returns early on
    // error, and the wrong date stays on screen under an alert saying it did
    // not save.
    let before: string | null = null;

    setTodos((prev) =>
      prev.map((todo) => {
        if (todo.id !== id) return todo;
        before = todo.due_date;
        return { ...todo, due_date: due };
      })
    );

    const { error } = await supabase.from("todos").update({ due_date: due }).eq("id", id);
    if (error) {
      warned();
      setTodos((prev) =>
        prev.map((todo) => (todo.id === id ? { ...todo, due_date: before } : todo))
      );
      Alert.alert("Couldn't change that date", error.message);
    }
  }

  async function setWhose(id: string, whose: Whose) {
    const assigned = assignedIdFor(whose);
    let before: string | null = null;

    // Moving something into a group that is switched off would otherwise
    // look exactly like deleting it: the write succeeds and the row
    // disappears, with nothing on screen saying where it went.
    setHidden((h) => h.filter((w) => w !== whose));

    setTodos((prev) =>
      prev.map((todo) => {
        if (todo.id !== id) return todo;
        before = todo.assigned_to;
        return { ...todo, assigned_to: assigned };
      })
    );

    const { error } = await supabase.from("todos").update({ assigned_to: assigned }).eq("id", id);
    if (error) {
      warned();
      setTodos((prev) =>
        prev.map((todo) => (todo.id === id ? { ...todo, assigned_to: before } : todo))
      );
      Alert.alert("Couldn't move that", error.message);
    }
  }

  // Ticking used to be one-way and the item vanished, so a mis-tap lost it
  // with no way back. It now toggles, and done items stay visible below.
  async function toggleComplete(id: string, completed: boolean) {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, completed: !completed } : todo))
    );
    const { error } = await supabase.from("todos").update({ completed: !completed }).eq("id", id);
    if (error) {
      warned();
      Alert.alert("Couldn't update that", error.message);
      load();
    }
  }

  async function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      warned();
      Alert.alert("Couldn't delete that", error.message);
      load();
    }
  }

  function startEdit(id: string, title: string) {
    setEditingId(id);
    setEditingTitle(title);
  }

  async function saveEdit() {
    const id = editingId;
    const title = editingTitle.trim();
    if (!id) return;

    if (!title) {
      setEditingId(null);
      return;
    }

    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, title } : todo)));
    setEditingId(null);

    const { error } = await supabase.from("todos").update({ title }).eq("id", id);
    if (error) {
      warned();
      Alert.alert("Couldn't rename that", error.message);
      load();
    }
  }

  function confirmDelete(id: string, title: string) {
    Alert.alert(`Delete "${title}"?`, "It goes for both of you.", [
      { text: "Keep it", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteTodo(id) },
    ]);
  }

  function actionsFor(item: Todo): SheetAction[] {
    const whose = whoseOf(item);

    const actions: SheetAction[] = [];

    // Only while it is still on the list. The Done rows have no editing
    // state, so Rename there did nothing visible -- and left editingId set,
    // so the row opened into a keyboard nobody asked for the moment it was
    // put back on the list.
    if (!item.completed) {
      actions.push({ label: "Rename", onPress: () => startEdit(item.id, item.title) });
    }

    actions.push(
      // No deferring here: the sheet holds the action until it has gone,
      // which is the only reliable moment to put another modal on screen.
      {
        label: item.due_date ? "Change the date" : "Add a date",
        onPress: () => setPicking({ id: item.id, value: item.due_date }),
      }
    );

    if (item.due_date) {
      actions.push({ label: "Clear the date", onPress: () => setDue(item.id, null) });
    }

    // Moving it is offered as the other two, named. There are only ever two.
    if (whose !== "me") {
      actions.push({
        label: `Move to ${me.display_name ?? "me"}`,
        onPress: () => setWhose(item.id, "me"),
      });
    }
    if (partner && whose !== "partner") {
      actions.push({
        label: `Move to ${partner.display_name ?? "them"}`,
        onPress: () => setWhose(item.id, "partner"),
      });
    }
    if (whose !== "us") {
      actions.push({ label: "Make it both of yours", onPress: () => setWhose(item.id, "us") });
    }

    actions.push({
      label: "Delete",
      destructive: true,
      // The same confirmation the swipe gets. Long-press is the easier of
      // the two to hit by accident, so it is the one that least deserves a
      // delete with no question asked.
      onPress: () => confirmDelete(item.id, item.title),
    });

    return actions;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
        <Text style={styles.title}>To-dos</Text>

        {/* Switches rather than a choice of one: all three are on until you
            turn one off, so your list and the shared one can be read
            together. The colours are the same ones the calendar uses for
            each of you, which is what makes the dot on each row mean
            something without a legend. */}
        <View style={styles.filterRow}>
          <WhoseChip
            label={me.display_name ?? "Me"}
            tint={tintFor("me")}
            on={!hiddenNow.includes("me")}
            onPress={() => toggleWhose("me")}
          />
          {partner ? (
            <WhoseChip
              label={partner.display_name ?? "Partner"}
              tint={tintFor("partner")}
              on={!hiddenNow.includes("partner")}
              onPress={() => toggleWhose("partner")}
            />
          ) : null}
          <WhoseChip
            label="Us"
            tint={null}
            on={!hiddenNow.includes("us")}
            onPress={() => toggleWhose("us")}
          />
        </View>

        {/* Four buckets each saying "Nothing here" is a wall of nothing. When
            the list is genuinely empty, say so once. */}
        {loaded && visible.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {filteredOut > 0
                ? `${filteredOut} thing${filteredOut === 1 ? "" : "s"} on the list, hidden`
                : "Nothing on the list"}
            </Text>
            <Text style={styles.emptyBody}>
              {filteredOut > 0
                ? "Turn a name back on above to see them."
                : "Add one below: anything either of you would otherwise be carrying around in your head."}
            </Text>
          </View>
        ) : null}

        {BUCKETS.map((bucket) => {
          const items = visible
            .filter((todo) => bucketFor(todo.due_date) === bucket)
            .sort(byDueDate);

          // An empty bucket is hidden rather than labelled: the one empty
          // state above already says there's nothing on this list.
          if (items.length === 0) return null;

          return (
            <View key={bucket} style={{ marginBottom: 20 }}>
              <Text style={[styles.bucketTitle, bucket === "Overdue" ? styles.bucketOverdue : null]}>
                {bucket}
              </Text>
              {items.map((item) => {
                const whose = whoseOf(item);
                const tint = tintFor(whose);
                const overdue = bucketFor(item.due_date) === "Overdue";

                return (
                  <SwipeRow
                    key={item.id}
                    actionLabel="Delete"
                    onAction={() => confirmDelete(item.id, item.title)}
                  >
                    <View style={styles.todoRow}>
                      {/* Whose it is, down the side. With all three groups
                          showing at once the list is a mix, and a name at
                          the end of every line would be noise. */}
                      <View
                        style={[
                          styles.whoseBar,
                          tint ? { backgroundColor: tint.ink } : styles.whoseBarUs,
                        ]}
                      />

                      <Pressable
                        onPress={() => toggleComplete(item.id, item.completed)}
                        hitSlop={10}
                        accessibilityLabel="Tick off"
                      >
                        <View style={styles.checkbox} />
                      </Pressable>

                      {editingId === item.id ? (
                        <TextInput
                          style={styles.editInput}
                          value={editingTitle}
                          onChangeText={setEditingTitle}
                          onSubmitEditing={saveEdit}
                          onBlur={saveEdit}
                          autoFocus
                          returnKeyType="done"
                        />
                      ) : (
                        <Pressable
                          style={{ flex: 1 }}
                          onPress={() => startEdit(item.id, item.title)}
                          onLongPress={() => {
                            setMenuFor(item.id);
                            setMenuOpen(true);
                          }}
                        >
                          <Text style={styles.todoText}>{item.title}</Text>
                          {item.due_date ? (
                            <Text style={[styles.dueText, overdue ? styles.dueOverdue : null]}>
                              {dueLabel(item.due_date)}
                            </Text>
                          ) : null}
                        </Pressable>
                      )}
                    </View>
                  </SwipeRow>
                );
              })}
            </View>
          );
        })}
        {done.length > 0 ? (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.bucketTitle}>Done</Text>
            {done.map((item) => (
              <SwipeRow
                key={item.id}
                actionLabel="Delete"
                onAction={() => confirmDelete(item.id, item.title)}
              >
                <View style={styles.todoRow}>
                  <View
                    style={[
                      styles.whoseBar,
                      tintFor(whoseOf(item))
                        ? { backgroundColor: tintFor(whoseOf(item))?.ink }
                        : styles.whoseBarUs,
                      styles.whoseBarDone,
                    ]}
                  />
                  <Pressable
                    onPress={() => toggleComplete(item.id, item.completed)}
                    hitSlop={10}
                    accessibilityLabel="Put back on the list"
                  >
                    <View style={[styles.checkbox, styles.checkboxDone]}>
                      <Text style={styles.checkboxTick}>✓</Text>
                    </View>
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onLongPress={() => {
                            setMenuFor(item.id);
                            setMenuOpen(true);
                          }}>
                    <Text style={[styles.todoText, styles.todoTextDone]}>{item.title}</Text>
                  </Pressable>
                </View>
              </SwipeRow>
            ))}
          </View>
        ) : null}

        {visible.length > 0 || done.length > 0 ? (
          <Text style={styles.hint}>
            Tap the circle to tick off · tap the text to rename · swipe to delete · hold for more
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.addBar}>
        {/* Who it is for and when it is due, decided before it is typed
            rather than afterwards. Whose it is used to be inherited from the
            filter, which was a guess even when the filter was a single
            choice -- and half the things on a shared list are for the other
            person. */}
        <View style={styles.addOptions}>
          <AddOption
            label={me.display_name ?? "Me"}
            on={newWhoseNow === "me"}
            tint={tintFor("me")}
            onPress={() => {
              tapped();
              setNewWhose("me");
            }}
          />
          {partner ? (
            <AddOption
              label={partner.display_name ?? "Partner"}
              on={newWhoseNow === "partner"}
              tint={tintFor("partner")}
              onPress={() => {
                tapped();
                setNewWhose("partner");
              }}
            />
          ) : null}
          <AddOption
            label="Us"
            on={newWhoseNow === "us"}
            tint={null}
            onPress={() => {
              tapped();
              setNewWhose("us");
            }}
          />

          <View style={styles.addSpacer} />

          {/* Today and tomorrow are most of what anybody picks, so they are
              one tap rather than a trip through a calendar. */}
          <AddOption
            label="Today"
            on={newDue === isoToday()}
            tint={null}
            onPress={() => {
              tapped();
              setNewDue(newDue === isoToday() ? null : isoToday());
            }}
          />
          <AddOption
            label={newDue && newDue !== isoToday() ? dueLabel(newDue) : "Date"}
            on={Boolean(newDue) && newDue !== isoToday()}
            tint={null}
            onPress={() => {
              tapped();
              setPicking({ id: null, value: newDue });
            }}
          />
          {newDue ? (
            <AddOption
              label="✕"
              on={false}
              tint={null}
              onPress={() => {
                tapped();
                setNewDue(null);
              }}
            />
          ) : null}
        </View>

        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="To-do..."
            placeholderTextColor={t.textMuted}
            value={newTitle}
            onChangeText={setNewTitle}
            onSubmitEditing={addTodo}
            returnKeyType="done"
          />
          <Pressable style={press(styles.addButton)} onPress={addTodo}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <ActionSheet
        visible={menuOpen && Boolean(menuItem)}
        title={menuItem?.title ?? ""}
        subtitle={
          menuItem ? (menuItem.due_date ? `Due ${dueLabel(menuItem.due_date)}` : "No date on it") : null
        }
        actions={menuItem ? actionsFor(menuItem) : []}
        onClose={() => setMenuOpen(false)}
        onDismissed={() => setMenuFor(null)}
      />

      {/* One picker for both jobs: the date on the thing being typed, and
          the date on a row reached through its hold menu. */}
      {picking ? (
        <DatePickerSheet
          value={picking.value}
          title={picking.id ? "Due date for this one" : "Due date"}
          onPick={(iso) => {
            if (picking.id) setDue(picking.id, iso);
            else setNewDue(iso);
          }}
          onClear={() => {
            if (picking.id) setDue(picking.id, null);
            else setNewDue(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * One of the three groups, on or off.
 *
 * On carries that person's own colour rather than a single app-wide accent,
 * so the chip and the dot down the side of their rows are visibly the same
 * fact. Off is an outline: a pale fill at half opacity still reads as a
 * fill, so the two states looked like one colour and a paler version of it.
 */
/** One of the small pills above the box: whose it is, or when it is due. */
function AddOption({
  label,
  on,
  tint,
  onPress,
}: {
  label: string;
  on: boolean;
  tint: { fill: string; ink: string } | null;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      style={press([
        styles.addOption,
        on ? styles.addOptionOn : null,
        on && tint ? { backgroundColor: tint.fill, borderColor: tint.fill } : null,
      ])}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text
        style={[
          styles.addOptionText,
          on ? styles.addOptionTextOn : null,
          on && tint ? { color: tint.ink } : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function WhoseChip({
  label,
  tint,
  on,
  onPress,
}: {
  label: string;
  tint: { fill: string; ink: string } | null;
  on: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      style={press([
        styles.chip,
        on ? styles.chipOn : null,
        on && tint ? { backgroundColor: tint.fill } : null,
      ])}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}, ${on ? "shown" : "hidden"}`}
    >
      <Text
        style={[styles.chipText, on ? styles.chipTextOn : null, on && tint ? { color: tint.ink } : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 16 },
  title: { ...t.type.display, color: t.textPrimary, marginBottom: 20 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.surfaceSunken,
    alignItems: "center",
  },
  chipOn: { backgroundColor: t.brandSoft, borderColor: t.brandSoft },
  chipText: { ...t.type.label, color: t.textMuted },
  chipTextOn: { color: t.textPrimary },
  editInput: {
    flex: 1,
    ...t.type.body,
    color: t.textPrimary,
    paddingVertical: 0,
  },
  checkboxDone: {
    backgroundColor: t.accent,
    borderColor: t.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxTick: { color: t.textOnBrand, ...t.type.label },
  todoTextDone: { color: t.textMuted, textDecorationLine: "line-through" },
  hint: { ...t.type.caption, color: t.textMuted, textAlign: "center", marginBottom: 8 },
  bucketTitle: { ...t.type.heading, color: t.textPrimary, marginBottom: 8 },
  bucketOverdue: { color: t.danger },
  // Down the side rather than a dot at the end: at a glance it groups the
  // rows by whose they are without anybody having to read anything.
  whoseBar: { width: 4, alignSelf: "stretch", borderRadius: 2, marginRight: 10, minHeight: 20 },
  whoseBarUs: { backgroundColor: t.brand },
  // Still there once it is ticked off, but quieter: the row is history now.
  whoseBarDone: { opacity: 0.4 },
  dueText: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
  dueOverdue: { color: t.danger },
  emptyCard: {
    ...t.card,
    padding: t.space(5),
    marginBottom: t.space(5)
  },
  emptyTitle: { ...t.type.heading, color: t.textPrimary, marginBottom: t.space(1.5) },
  emptyBody: { ...t.type.caption, color: t.textSecondary },
  todoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surface,
    borderRadius: t.radius.md,
    padding: 14,
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: t.brand,
    marginRight: 12,
  },
  todoText: { ...t.type.body, color: t.textPrimary, flex: 1 },
  addBar: {
    padding: 16,
    gap: 10,
    backgroundColor: t.bg,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  addRow: { flexDirection: "row", gap: 8 },
  addOptions: { flexDirection: "row", alignItems: "center", gap: 6 },
  addSpacer: { flex: 1 },
  addOption: {
    paddingHorizontal: t.space(3),
    paddingVertical: t.space(2),
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.surfaceSunken,
  },
  addOptionOn: { backgroundColor: t.brandSoft, borderColor: t.brandSoft },
  addOptionText: { ...t.type.caption, color: t.textMuted, fontWeight: "600" },
  addOptionTextOn: { color: t.textPrimary },
  addInput: {
    flex: 1,
    backgroundColor: t.surface,
    borderRadius: t.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...t.type.body,
    color: t.textPrimary,
  },
  addButton: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  addButtonText: { color: t.textOnBrand, ...t.type.heading },
  });
