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
import { warned } from "@/lib/haptics";
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

type Filter = "me" | "partner" | "us";

function bucketFor(dueDate: string | null): "Today" | "Tomorrow" | "This Week" | "Someday" {
  if (!dueDate) return "Someday";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return "This Week";
  return "Someday";
}

const BUCKETS = ["Today", "Tomorrow", "This Week", "Someday"] as const;

export default function Todos() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { profile } = useAuth();
  const { me, partner } = useCoupleMembers();
  const [filter, setFilter] = useState<Filter>("me");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("todos")
      .select("id, title, assigned_to, due_date, completed")
      .order("created_at", { ascending: true });
    if (data) setTodos(data as Todo[]);
  }, []);

  // Refreshes whenever this screen comes back into view, not just on
  // mount -- otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  const assignedIdForFilter =
    filter === "me" ? me.id : filter === "partner" ? partner?.id ?? null : null;

  const forFilter = todos.filter((t) =>
    filter === "us" ? t.assigned_to === null : t.assigned_to === assignedIdForFilter
  );
  const visible = forFilter.filter((t) => !t.completed);
  const done = forFilter.filter((t) => t.completed);

  async function addTodo() {
    if (!newTitle.trim() || !profile?.couple_id || !me.id) return;
    const assignedTo = filter === "us" ? null : assignedIdForFilter;

    const { error } = await supabase.from("todos").insert({
      couple_id: profile.couple_id,
      created_by: me.id,
      title: newTitle.trim(),
      assigned_to: assignedTo,
      due_date: null,
    });

    if (!error) {
      setNewTitle("");
      load();
    }
  }

  // Ticking used to be one-way and the item vanished, so a mis-tap lost it
  // with no way back. It now toggles, and done items stay visible below.
  async function toggleComplete(id: string, completed: boolean) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
    const { error } = await supabase.from("todos").update({ completed: !completed }).eq("id", id);
    if (error) {
      warned();
      Alert.alert("Couldn't update that", error.message);
      load();
    }
  }

  async function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
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

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    setEditingId(null);

    const { error } = await supabase.from("todos").update({ title }).eq("id", id);
    if (error) {
      warned();
      Alert.alert("Couldn't rename that", error.message);
      load();
    }
  }

  function itemActions(id: string, title: string) {
    Alert.alert(title, undefined, [
      { text: "Edit", onPress: () => startEdit(id, title) },
      { text: "Delete", style: "destructive", onPress: () => deleteTodo(id) },
      { text: "Cancel", style: "cancel" },
    ]);
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

        <View style={styles.filterRow}>
          <FilterChip label={me.display_name ?? "Me"} active={filter === "me"} onPress={() => setFilter("me")} />
          <FilterChip
            label={partner?.display_name ?? "Partner"}
            active={filter === "partner"}
            onPress={() => setFilter("partner")}
          />
          <FilterChip label="Us" active={filter === "us"} onPress={() => setFilter("us")} />
        </View>

        {/* Four buckets each saying "Nothing here" is a wall of nothing. When
            the list is genuinely empty, say so once. */}
        {visible.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {filter === "us"
                ? "Nothing shared yet"
                : filter === "me"
                  ? "Nothing on your list"
                  : `Nothing on ${partner?.display_name ?? "their"}'s list`}
            </Text>
            <Text style={styles.emptyBody}>
              Add one below: anything either of you would otherwise be carrying around in your
              head.
            </Text>
          </View>
        ) : null}

        {BUCKETS.map((bucket) => {
          const items = visible.filter((t) => bucketFor(t.due_date) === bucket);
          // An empty bucket is hidden rather than labelled: the one empty
          // state above already says there's nothing on this list.
          if (items.length === 0) return null;

          return (
            <View key={bucket} style={{ marginBottom: 20 }}>
              <Text style={styles.bucketTitle}>{bucket}</Text>
              {items.map((item) => (
                <View key={item.id} style={styles.todoRow}>
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
                      onLongPress={() => itemActions(item.id, item.title)}
                    >
                      <Text style={styles.todoText}>{item.title}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          );
        })}
        {done.length > 0 ? (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.bucketTitle}>Done</Text>
            {done.map((item) => (
              <View key={item.id} style={styles.todoRow}>
                <Pressable
                  onPress={() => toggleComplete(item.id, item.completed)}
                  hitSlop={10}
                  accessibilityLabel="Put back on the list"
                >
                  <View style={[styles.checkbox, styles.checkboxDone]}>
                    <Text style={styles.checkboxTick}>✓</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={{ flex: 1 }}
                  onLongPress={() => itemActions(item.id, item.title)}
                >
                  <Text style={[styles.todoText, styles.todoTextDone]}>{item.title}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {visible.length > 0 || done.length > 0 ? (
          <Text style={styles.hint}>
            Tap the circle to tick off · tap the text to rename · hold for more
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.addBar}>
        <TextInput
          style={styles.addInput}
          placeholder="To-do..."
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={addTodo}
          returnKeyType="done"
        />
        <Pressable style={press(styles.addButton)} onPress={addTodo}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable style={press([styles.chip, active && styles.chipActive])} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "600", color: t.textPrimary, marginBottom: 20 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: t.radius.pill,
    backgroundColor: t.surface,
    alignItems: "center",
  },
  chipActive: { backgroundColor: t.accent },
  chipText: { fontSize: 13, fontWeight: "600", color: t.textSecondary },
  chipTextActive: { color: t.surface },
  editInput: {
    flex: 1,
    fontSize: 15,
    color: t.textPrimary,
    paddingVertical: 0,
  },
  checkboxDone: {
    backgroundColor: t.accent,
    borderColor: t.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxTick: { color: t.textOnBrand, fontSize: 13, fontWeight: "700" },
  todoTextDone: { color: t.textMuted, textDecorationLine: "line-through" },
  hint: { fontSize: 12, color: t.textMuted, textAlign: "center", marginBottom: 8 },
  bucketTitle: { fontSize: 14, fontWeight: "600", color: t.textPrimary, marginBottom: 8 },
  emptyCard: {
    backgroundColor: t.surface,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(5),
    ...t.shadow,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: t.textPrimary, marginBottom: t.space(1.5) },
  emptyBody: { fontSize: 13, color: t.textSecondary, lineHeight: 19 },
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
  todoText: { fontSize: 14, color: t.textPrimary, flex: 1 },
  addBar: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    backgroundColor: t.bg,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  addInput: {
    flex: 1,
    backgroundColor: t.surface,
    borderRadius: t.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: t.textPrimary,
  },
  addButton: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  addButtonText: { color: t.surface, fontWeight: "600", fontSize: 14 },
  });
