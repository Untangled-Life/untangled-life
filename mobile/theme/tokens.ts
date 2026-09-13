/**
 * One place for colour, radius and spacing.
 *
 * Every screen was written with hex literals, which is why dark mode couldn't
 * just be switched on. Tokens are semantic (surface, textPrimary) rather than
 * descriptive (cream, nearBlack) so the dark palette can invert meaning without
 * every name becoming a lie.
 */

export type ThemeMode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

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

export const lightTheme: Theme = {
  scheme: "light",
  bg: "#F7F5F0",
  surface: "#FFFFFF",
  surfaceAlt: "#FBFAF7",
  surfaceSunken: "#F0EEE8",
  border: "#E9E7E0",
  textPrimary: "#14140F",
  textSecondary: "#6B6B6B",
  textMuted: "#9A9A9A",
  textOnBrand: "#FFFFFF",
  brand: "#D85A30",
  brandSoft: "#FBE9E1",
  accent: "#1D9E75",
  accentSoft: "#E8F5EF",
  danger: "#B3261E",
  dotPlan: "#D85A30",
  dotKeyDate: "#1D9E75",
  dotWork: "#7A8B99",
  dotBusy: "#D6D2C8",
  radius,
  space,
  shadow: {
    shadowColor: "#14140F",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
};

export const darkTheme: Theme = {
  scheme: "dark",
  // Warm-tinted rather than pure grey, so it still reads as the same brand at
  // night instead of a generic dark app.
  bg: "#14130F",
  surface: "#1E1C17",
  surfaceAlt: "#25221C",
  surfaceSunken: "#2B2822",
  border: "#332F28",
  textPrimary: "#F5F2EB",
  textSecondary: "#A8A196",
  textMuted: "#79736A",
  textOnBrand: "#FFFFFF",
  // Lifted slightly: the light-mode brand tones go muddy on a dark ground.
  brand: "#F0714A",
  brandSoft: "#3A251C",
  accent: "#35B98C",
  accentSoft: "#163026",
  danger: "#E5675E",
  dotPlan: "#F0714A",
  dotKeyDate: "#35B98C",
  dotWork: "#8FA3B2",
  dotBusy: "#4A463E",
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

export function themeFor(mode: ThemeMode, system: Scheme): Theme {
  if (mode === "system") return system === "dark" ? darkTheme : lightTheme;
  return mode === "dark" ? darkTheme : lightTheme;
}
