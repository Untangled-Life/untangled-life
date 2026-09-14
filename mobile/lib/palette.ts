import type { Scheme } from "@/theme/tokens";

/**
 * The 24 partner colours.
 *
 * Each carries three values per scheme rather than one hex, because a pastel
 * is only pastel on a white ground. `fill` is the block on the calendar, `ink`
 * is text that stays readable on that fill, and `chip` is the solid dot in the
 * picker and beside a name -- a pastel dot on its own reads as washed out and
 * two adjacent ones become hard to tell apart.
 *
 * Hues are evenly spread so that any two colours a couple happens to pick are
 * distinguishable, and the dark values are the same hue at lower lightness
 * rather than the light ones dimmed, which turns pastels to mud.
 */
export type PaletteColor = {
  name: string;
  label: string;
  light: { fill: string; ink: string; chip: string };
  dark: { fill: string; ink: string; chip: string };
};

export const PALETTE: PaletteColor[] = [
  { name: "blush", label: "Blush", light: { fill: "#F3CDD2", ink: "#6F202B", chip: "#E59EA8" }, dark: { fill: "#512A2F", ink: "#E3A0A9", chip: "#C46471" } },
  { name: "rose", label: "Rose", light: { fill: "#F3CDDB", ink: "#6F203D", chip: "#E59EB8" }, dark: { fill: "#512A38", ink: "#E3A0B9", chip: "#C46487" } },
  { name: "coral", label: "Coral", light: { fill: "#F3D2CD", ink: "#6F2B20", chip: "#E5A89E" }, dark: { fill: "#512F2A", ink: "#E3A9A0", chip: "#C47164" } },
  { name: "peach", label: "Peach", light: { fill: "#F3DACD", ink: "#6F3A20", chip: "#E5B69E" }, dark: { fill: "#51372A", ink: "#E3B7A0", chip: "#C48464" } },
  { name: "apricot", label: "Apricot", light: { fill: "#F3E2CD", ink: "#6F4A20", chip: "#E5C49E" }, dark: { fill: "#513F2A", ink: "#E3C4A0", chip: "#C49764" } },
  { name: "amber", label: "Amber", light: { fill: "#F3E8CD", ink: "#6F5720", chip: "#E5D09E" }, dark: { fill: "#51452A", ink: "#E3CFA0", chip: "#C4A764" } },
  { name: "honey", label: "Honey", light: { fill: "#F3ECCD", ink: "#6F5F20", chip: "#E5D79E" }, dark: { fill: "#51492A", ink: "#E3D6A0", chip: "#C4B164" } },
  { name: "butter", label: "Butter", light: { fill: "#F3F0CD", ink: "#6F6720", chip: "#E5DE9E" }, dark: { fill: "#514D2A", ink: "#E3DDA0", chip: "#C4BA64" } },
  { name: "lemon", label: "Lemon", light: { fill: "#F3F3CD", ink: "#6F6F20", chip: "#E5E59E" }, dark: { fill: "#51512A", ink: "#E3E3A0", chip: "#C4C464" } },
  { name: "lime", label: "Lime", light: { fill: "#E8F3CD", ink: "#576F20", chip: "#D0E59E" }, dark: { fill: "#45512A", ink: "#CFE3A0", chip: "#A7C464" } },
  { name: "fern", label: "Fern", light: { fill: "#DAF3CD", ink: "#3A6F20", chip: "#B6E59E" }, dark: { fill: "#37512A", ink: "#B7E3A0", chip: "#84C464" } },
  { name: "sage", label: "Sage", light: { fill: "#CDF3CD", ink: "#206F20", chip: "#9EE59E" }, dark: { fill: "#2A512A", ink: "#A0E3A0", chip: "#64C464" } },
  { name: "mint", label: "Mint", light: { fill: "#CDF3E0", ink: "#206F47", chip: "#9EE5C2" }, dark: { fill: "#2A513D", ink: "#A0E3C2", chip: "#64C494" } },
  { name: "jade", label: "Jade", light: { fill: "#CDF3EA", ink: "#206F5B", chip: "#9EE5D4" }, dark: { fill: "#2A5147", ink: "#A0E3D3", chip: "#64C4AC" } },
  { name: "seafoam", label: "Seafoam", light: { fill: "#CDF3F0", ink: "#206F68", chip: "#9EE5DF" }, dark: { fill: "#2A514E", ink: "#A0E3DE", chip: "#64C4BC" } },
  { name: "aqua", label: "Aqua", light: { fill: "#CDEEF3", ink: "#20646F", chip: "#9EDCE5" }, dark: { fill: "#2A4C51", ink: "#A0DAE3", chip: "#64B7C4" } },
  { name: "sky", label: "Sky", light: { fill: "#CDE7F3", ink: "#20546F", chip: "#9ECEE5" }, dark: { fill: "#2A4451", ink: "#A0CDE3", chip: "#64A4C4" } },
  { name: "denim", label: "Denim", light: { fill: "#CDDDF3", ink: "#20416F", chip: "#9EBCE5" }, dark: { fill: "#2A3A51", ink: "#A0BCE3", chip: "#648CC4" } },
  { name: "periwinkle", label: "Periwinkle", light: { fill: "#CDD5F3", ink: "#20306F", chip: "#9EADE5" }, dark: { fill: "#2A3151", ink: "#A0AEE3", chip: "#6477C4" } },
  { name: "lavender", label: "Lavender", light: { fill: "#D2CDF3", ink: "#2B206F", chip: "#A89EE5" }, dark: { fill: "#2F2A51", ink: "#A9A0E3", chip: "#7164C4" } },
  { name: "lilac", label: "Lilac", light: { fill: "#DFCDF3", ink: "#45206F", chip: "#BF9EE5" }, dark: { fill: "#3C2A51", ink: "#C0A0E3", chip: "#9164C4" } },
  { name: "orchid", label: "Orchid", light: { fill: "#ECCDF3", ink: "#5F206F", chip: "#D79EE5" }, dark: { fill: "#492A51", ink: "#D6A0E3", chip: "#B164C4" } },
  { name: "mauve", label: "Mauve", light: { fill: "#F3CDED", ink: "#6F2062", chip: "#E59ED9" }, dark: { fill: "#512A4A", ink: "#E3A0D8", chip: "#C464B4" } },
  { name: "plum", label: "Plum", light: { fill: "#F3CDE2", ink: "#6F204A", chip: "#E59EC4" }, dark: { fill: "#512A3F", ink: "#E3A0C4", chip: "#C46497" } },
];

const BY_NAME = new Map(PALETTE.map((c) => [c.name, c]));

/**
 * Two people who have never picked a colour must not be the same colour, or
 * the entire point of colouring the calendar is lost before anyone has touched
 * a setting. Deriving the fallback from the user id gives each of them a
 * stable colour that doesn't move around between app opens, and the two of
 * them land on different ones unless they're extremely unlucky.
 */
function fallbackFor(userId: string | null | undefined): PaletteColor {
  if (!userId) return PALETTE[0];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }

  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** The palette entry for a stored name, or a stable fallback for that user. */
export function colorFor(name: string | null | undefined, userId?: string | null): PaletteColor {
  if (name) {
    const found = BY_NAME.get(name);
    // An unrecognised name means a colour removed in a later build, or data
    // from somewhere else. Falling through to the fallback beats rendering
    // nothing.
    if (found) return found;
  }
  return fallbackFor(userId);
}

/** The three values to actually draw with, for the scheme in play. */
export function shadeFor(color: PaletteColor, scheme: Scheme) {
  return scheme === "dark" ? color.dark : color.light;
}

/**
 * The colour a calendar entry should be drawn in.
 *
 * An event with no owner belongs to both of you, and borrowing either
 * partner's colour for it would say something untrue. `null` here means "use
 * the app's own shared styling" -- the caller draws it in the brand colour.
 */
export function ownerColor(
  ownerUserId: string | null,
  colorsByUser: Map<string, string | null>
): PaletteColor | null {
  if (!ownerUserId) return null;
  return colorFor(colorsByUser.get(ownerUserId) ?? null, ownerUserId);
}
