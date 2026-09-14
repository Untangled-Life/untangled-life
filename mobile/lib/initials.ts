/**
 * "Roy Trimarchi" -> "RT", "Alyssa" -> "A".
 *
 * Lives here rather than next to <Avatar> so it can be tested without pulling
 * in the theme context, and through it AsyncStorage and the rest of the
 * native module chain.
 */
export function initialsFor(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
