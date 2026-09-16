/**
 * One place for colour, radius and spacing.
 *
 * Every screen was written with hex literals, which is why dark mode couldn't
 * just be switched on. Tokens are semantic (surface, textPrimary) rather than
 * descriptive (cream, nearBlack) so the dark palette can invert meaning without
 * every name becoming a lie.
 */

import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

/**
 * Type.
 *
 * Fraunces carries the display sizes and the numbers; the system font carries
 * everything you actually read. That split is deliberate. A serif at 13px in a
 * dense list is worse than SF Pro at 13px, and the system font also picks up
 * Dynamic Type, the right numerals and the right language coverage for free.
 * What a custom face buys is identity, and identity lives in the four or five
 * large things on each screen, not in the body copy.
 *
 * Sizes were a free-for-all before this -- seventeen distinct values across
 * twenty-three files, including a 19 and a 17 that existed because somebody
 * nudged a number. A scale means a heading is a heading everywhere.
 */
export const FONT_DISPLAY = "Fraunces_600SemiBold";
export const FONT_DISPLAY_STRONG = "Fraunces_700Bold";

export type TypeScale = {
  /** The one big number on a screen: a countdown, a total. */
  hero: TextStyle;
  /** Screen titles. */
  display: TextStyle;
  /** Card and section titles. */
  title: TextStyle;
  /** A row's own heading, inside a card. */
  heading: TextStyle;
  /** Default reading size. */
  body: TextStyle;
  /** A field label, a button. */
  label: TextStyle;
  /** Hints and secondary detail under a row. */
  caption: TextStyle;
  /** Small capitals above a group. */
  eyebrow: TextStyle;
};

/**
 * Fraunces is a display serif, so it needs tighter leading and slightly
 * negative tracking at size -- left at defaults it looks loose and accidental.
 * `fontVariant: ["tabular-nums"]` on anything numeric stops a countdown
 * jittering as it ticks from 341 to 340.
 */
const type: TypeScale = {
  hero: {
    fontFamily: FONT_DISPLAY_STRONG,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  display: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  heading: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, lineHeight: 17, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16 },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
};

export type Theme = {
  scheme: Scheme;
  // Surfaces
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  border: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnBrand: string;
  // Brand
  brand: string;
  brandSoft: string;
  accent: string;
  accentSoft: string;
  danger: string;
  // Calendar entry colours
  dotPlan: string;
  dotKeyDate: string;
  dotWork: string;
  dotBusy: string;
  // Type
  type: TypeScale;
  /**
   * Everything a raised card needs, in one spread: ground, edge and lift.
   *
   * Twenty-three files each rolled their own and none matched -- padding of
   * 16, 18 or 20, some with a shadow and most without. On a cream ground a
   * card with no shadow and no border has no edge at all, which is why the
   * screens read as flat lists of text rather than as a designed surface.
   */
  card: ViewStyle;
  // Shape
  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
  space: (n: number) => number;
  shadow: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
};

const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
const space = (n: number) => n * 4;

// Named so the card token below and the surface token above cannot drift
// apart: a card that keeps the old colour after somebody changes `surface` is
// a bug with no error message.
const LIGHT_SURFACE = "#FFFFFF";
const LIGHT_CARD_EDGE = "rgba(58, 52, 40, 0.08)";
const DARK_SURFACE = "#1E1C17";
const DARK_BORDER = "#332F28";

export const lightTheme: Theme = {
  scheme: "light",
  bg: "#F7F5F0",
  surface: LIGHT_SURFACE,
  surfaceAlt: "#FBFAF7",
  surfaceSunken: "#F0EEE8",
  border: "#E9E7E0",
  textPrimary: "#14140F",
  textSecondary: "#6B6B6B",
  textMuted: "#9A9A9A",
  textOnBrand: "#FFFFFF",
  brand: "#E9705A",
  brandSoft: "#FCEAE5",
  accent: "#1F6B78",
  accentSoft: "#E3F0F2",
  danger: "#B3261E",
  dotPlan: "#E9705A",
  dotKeyDate: "#1F6B78",
  dotWork: "#7A8B99",
  dotBusy: "#D6D2C8",
  type,
  card: {
    backgroundColor: LIGHT_SURFACE,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LIGHT_CARD_EDGE,
    shadowColor: "#3A3428",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  radius,
  space,
  // Two soft shadows read as paper on a cream ground; one hard one reads as a
  // box. The colour is the warm near-black rather than pure black, so the
  // shadow tints with the page instead of greying it.
  shadow: {
    shadowColor: "#3A3428",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};

export const darkTheme: Theme = {
  scheme: "dark",
  // Warm-tinted rather than pure grey, so it still reads as the same brand at
  // night instead of a generic dark app.
  bg: "#14130F",
  surface: DARK_SURFACE,
  surfaceAlt: "#25221C",
  surfaceSunken: "#2B2822",
  border: DARK_BORDER,
  textPrimary: "#F5F2EB",
  textSecondary: "#A8A196",
  textMuted: "#79736A",
  // Dark mode's brand and accent are LIFTED, which is what makes them read on
  // a dark ground -- and it also makes them too bright to put white type on.
  // #35B98C with white is 2.5:1, unreadable; with the near-black ground it is
  // 8.4:1. "On brand" means whatever reads on a filled colour, and in this
  // theme that is dark.
  textOnBrand: "#14130F",
  // Lifted slightly: the light-mode brand tones go muddy on a dark ground.
  brand: "#F58B74",
  brandSoft: "#3E2822",
  accent: "#4FB3C4",
  accentSoft: "#132C30",
  danger: "#E5675E",
  dotPlan: "#F58B74",
  dotKeyDate: "#4FB3C4",
  dotWork: "#8FA3B2",
  dotBusy: "#4A463E",
  // No shadow worth seeing on a dark ground, so the edge does the work.
  card: {
    backgroundColor: DARK_SURFACE,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
  },
  type,
  radius,
  space,
  shadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};

/**
 * The deep teal ground: Coral and Cream on Deep Teal, as a whole app.
 *
 * The icon and the website put the coral-and-cream loop on a deep teal
 * ground, and this is the same idea carried through every screen. It is a
 * dark-ground theme in the way that matters -- light type, a light status
 * bar, lifted accents -- so its `scheme` is "dark", which is what the rest of
 * the app reads to decide those things. It replaces the light look when it is
 * chosen; the warm dark theme is unchanged for night.
 *
 * Coral on deep teal is about 3.3:1, fine for a button but not for a line of
 * small type, so nothing here sets small text in the brand. `textOnBrand` is
 * the near-black rather than cream, because cream on coral is 2.5:1 and
 * unreadable. The accent for links is a light aqua, 8:1 against the ground.
 */
const TEAL_BG = "#1F5F6B";
const TEAL_SURFACE = "#276E7A";
const TEAL_BORDER = "rgba(245, 242, 236, 0.14)";

export const tealTheme: Theme = {
  scheme: "dark",
  bg: TEAL_BG,
  surface: TEAL_SURFACE,
  surfaceAlt: "#2C7683",
  surfaceSunken: "#1A525D",
  border: TEAL_BORDER,
  textPrimary: "#F5F2EC",
  textSecondary: "#CFE3E6",
  textMuted: "#9BC1C7",
  textOnBrand: "#14130F",
  brand: "#EF7A62",
  brandSoft: "#4A6469",
  accent: "#A9DEE6",
  accentSoft: "#2E7683",
  danger: "#F28B82",
  dotPlan: "#EF7A62",
  dotKeyDate: "#A9DEE6",
  dotWork: "#9FB6BE",
  dotBusy: "#3E7883",
  card: {
    backgroundColor: TEAL_SURFACE,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TEAL_BORDER,
  },
  type,
  radius,
  space,
  shadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};

/**
 * Which ground the app sits on: the two colour schemes from Personalisation.
 *
 * "teal" is Coral and Cream on Deep Teal, the scheme the icon and website
 * wear. "cream" is Coral and Teal on Cream, the same colours on the app's
 * original cream page. Per device, like the accent, because it is a matter
 * of taste and the two of you need not agree.
 */
export type GroundName = "teal" | "cream";

export const GROUNDS: { name: GroundName; label: string; blurb: string }[] = [
  { name: "teal", label: "Coral & Cream on Deep Teal", blurb: "The deep teal from the icon, through the whole app." },
  { name: "cream", label: "Coral & Teal on Cream", blurb: "The same colours on the cream page." },
];

export const DEFAULT_GROUND: GroundName = "teal";

export function isGroundName(value: unknown): value is GroundName {
  return GROUNDS.some((g) => g.name === value);
}

/**
 * Accent colours.
 *
 * The brand coral is fixed -- it's the app's identity and it's on the website
 * -- so what's adjustable is the accent: the green used for links, actions,
 * chips and key dates. Each one carries a light and a dark pair, because a
 * colour that works on paper-white goes muddy on a dark ground and a colour
 * lifted for dark mode glares in light.
 *
 * `soft` is the tinted background behind a selected chip or the hero
 * countdown, so it has to sit in the same family as `on` rather than being
 * derived by opacity, which produces a different hue over a warm surface.
 */
export type AccentName = "green" | "teal" | "blue" | "violet" | "rose" | "amber";

type AccentPair = { on: string; soft: string };

export const ACCENTS: {
  name: AccentName;
  label: string;
  light: AccentPair;
  dark: AccentPair;
}[] = [
  {
    name: "teal",
    label: "Teal",
    light: { on: "#1F6B78", soft: "#E3F0F2" },
    dark: { on: "#4FB3C4", soft: "#132C30" },
  },
  {
    name: "green",
    label: "Green",
    light: { on: "#1D9E75", soft: "#E8F5EF" },
    dark: { on: "#35B98C", soft: "#163026" },
  },
  {
    name: "blue",
    label: "Blue",
    light: { on: "#2F6FD0", soft: "#E8F0FC" },
    dark: { on: "#5C96EC", soft: "#17243A" },
  },
  {
    name: "violet",
    label: "Violet",
    light: { on: "#7A4BD0", soft: "#F0EAFB" },
    dark: { on: "#A481EE", soft: "#241B3A" },
  },
  {
    name: "rose",
    label: "Rose",
    light: { on: "#C6407A", soft: "#FBE8F0" },
    dark: { on: "#E9709F", soft: "#351826" },
  },
  {
    name: "amber",
    label: "Amber",
    light: { on: "#B07600", soft: "#FBF1DC" },
    dark: { on: "#DFA53A", soft: "#332614" },
  },
];

export const DEFAULT_ACCENT: AccentName = "teal";

export function isAccentName(value: unknown): value is AccentName {
  return ACCENTS.some((a) => a.name === value);
}

function withAccent(base: Theme, accent: AccentName): Theme {
  // The base theme already carries the default accent in its own tuned
  // shade -- deep teal on cream, lifted teal on the dark theme, aqua on the
  // deep teal ground -- so the default is the base, untouched.
  if (accent === DEFAULT_ACCENT) return base;

  const chosen = ACCENTS.find((a) => a.name === accent);
  if (!chosen) return base;

  const pair = base.scheme === "dark" ? chosen.dark : chosen.light;

  return {
    ...base,
    accent: pair.on,
    accentSoft: pair.soft,
    // Key dates are drawn in the accent everywhere else, so the calendar dot
    // has to move with it or the legend stops matching the grid.
    dotKeyDate: pair.on,
  };
}

export function themeFor(
  mode: ThemeMode,
  system: Scheme,
  accent: AccentName = DEFAULT_ACCENT,
  ground: GroundName = DEFAULT_GROUND
): Theme {
  const wantsDark = mode === "system" ? system === "dark" : mode === "dark";
  // The ground decides what "light" looks like. Night is night either way:
  // the deep teal is a daytime scheme, and the warm dark theme stays for the
  // hours it was made for.
  const light = ground === "teal" ? tealTheme : lightTheme;
  const base = wantsDark ? darkTheme : light;
  return withAccent(base, accent);
}
