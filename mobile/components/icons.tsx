import type { ColorValue } from "react-native";
import Svg, { Path, Rect, Circle, Line } from "react-native-svg";

/**
 * Stroke icons in the same language as the website's set in
 * src/components/icons.tsx — 24x24 box, 1.75 stroke, round caps and joins — so
 * the app and the landing page look like one product.
 */
export type IconProps = {
  size?: number;
  // ColorValue, not string: React Navigation hands tabBarIcon a ColorValue,
  // which can be an opaque platform colour rather than a hex string.
  color?: ColorValue;
  strokeWidth?: number;
};

function Base({
  size = 24,
  color = "#14140F" as ColorValue,
  strokeWidth = 1.75,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M4 10.5 12 4l8 6.5" />
      <Path d="M6 9.6V20h12V9.6" />
      <Path d="M10 20v-5h4v5" />
    </Base>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <Path d="M10 19a2 2 0 0 0 4 0" />
    </Base>
  );
}

export function CheckSquareIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Rect x="3" y="3" width="18" height="18" rx="5" />
      <Path d="M8 12.2l2.8 2.8L16 9" />
    </Base>
  );
}

export function GiftIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Rect x="3" y="8" width="18" height="4" rx="1.5" />
      <Path d="M5 12v8a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20v-8" />
      <Path d="M12 8v13.5" />
      <Path d="M12 8c-1.5-4-6-4-6-1.5S9 8 12 8Z" />
      <Path d="M12 8c1.5-4 6-4 6-1.5S15 8 12 8Z" />
    </Base>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Rect x="3" y="5" width="18" height="16" rx="4" />
      <Path d="M3 10h18" />
      <Path d="M8 3v4" />
      <Path d="M16 3v4" />
    </Base>
  );
}

export function MenuIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Line x1="4" y1="7" x2="20" y2="7" />
      <Line x1="4" y1="12" x2="20" y2="12" />
      <Line x1="4" y1="17" x2="20" y2="17" />
    </Base>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M6 6l12 12" />
      <Path d="M18 6L6 18" />
    </Base>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6l7-3Z" />
      <Path d="M9 12l2 2 4-4" />
    </Base>
  );
}

export function SlidersIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Line x1="4" y1="8" x2="20" y2="8" />
      <Line x1="4" y1="16" x2="20" y2="16" />
      <Circle cx="9" cy="8" r="2.5" />
      <Circle cx="15" cy="16" r="2.5" />
    </Base>
  );
}

export function StarIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z" />
    </Base>
  );
}

export function HeartIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M12 20s-7-4.35-9.5-8.5C.5 8 2 4.5 5.5 4.5c2 0 3.5 1.2 4.5 2.7C11 5.7 12.5 4.5 14.5 4.5 18 4.5 19.5 8 19.5 11.5 17 15.65 12 20 12 20Z" />
    </Base>
  );
}

export function CogIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Circle cx="12" cy="12" r="3.2" />
      <Path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />
    </Base>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 3" />
    </Base>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M9 5l7 7-7 7" />
    </Base>
  );
}
