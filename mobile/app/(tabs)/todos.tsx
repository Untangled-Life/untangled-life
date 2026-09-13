import { useCallback, useState } from "react";
import {
  RefreshControl,
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

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("todos")
      .select("id, title, assigned_to, due_date, completed")
      .eq("completed", false)
      .order("created_at", { ascending: true });
    if (data) setTodos(data as Todo[]);
  }, []);

  // Refreshes whenever this screen comes back into view, not just on
  // mount — otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  const assignedIdForFilter =
    filter === "me" ? me.id : filter === "partner" ? partner?.id ?? null : null;

  const visible = todos.filter((t) =>
    filter === "us" ? t.assigned_to === null : t.assigned_to === assignedIdForFilter
  );

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

  async function toggleComplete(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("todos").update({ completed: true }).eq("id", id);
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

        {BUCKETS.map((bucket) => {
          const items = visible.filter((t) => bucketFor(t.due_date) === bucket);
          return (
            <View key={bucket} style={{ marginBottom: 20 }}>
              <Text style={styles.bucketTitle}>{bucket}</Text>
              {items.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>Nothing here</Text>
                </View>
              ) : (
                items.map((item) => (
                  <Pressable key={item.id} style={press(styles.todoRow)} onPress={() => toggleComplete(item.id)}>
                    <View style={styles.checkbox} />
                    <Text style={styles.todoText}>{item.title}</Text>
                  </Pressable>
                ))
              )}
            </View>
          );
        })}
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
  bucketTitle: { fontSize: 14, fontWeight: "600", color: t.textPrimary, marginBottom: 8 },
  emptyRow: { backgroundColor: t.surface, borderRadius: t.radius.md, padding: 14 },
  emptyText: { fontSize: 13, color: t.textMuted },
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
  },
  addButton: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  addButtonText: { color: t.surface, fontWeight: "600", fontSize: 14 },
  });
