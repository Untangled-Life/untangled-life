export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M6 30 C 14 30, 14 14, 22 14 C 30 14, 30 30, 38 30 L 44 30"
        fill="none"
        stroke="var(--color-logo-a)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M6 14 C 14 14, 14 30, 22 30 C 30 30, 30 14, 38 14 L 44 14"
        fill="none"
        stroke="var(--color-logo-b)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The looped mark above the headline.
 *
 * Centred on a phone and left-aligned once the hero splits into two columns,
 * so it sits over the copy rather than floating between the text and the
 * carousel beside it.
 */
export function HeroMark() {
  return (
    <svg
      width="120"
      height="72"
      viewBox="0 0 120 72"
      aria-hidden="true"
      className="mx-auto mb-4 lg:mx-0"
    >
      <path
        d="M8 52 C 24 52, 26 20, 42 20 C 58 20, 60 52, 76 52 C 92 52, 100 52, 112 52"
        fill="none"
        stroke="var(--color-logo-a)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M8 20 C 24 20, 26 52, 42 52 C 58 52, 60 20, 76 20 C 92 20, 100 20, 112 20"
        fill="none"
        stroke="var(--color-logo-b)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
