"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The six app screenshots, in the order they appear.
 *
 * `src` is null until a real screenshot exists, and the slot renders a labelled
 * placeholder instead. Dropping a file into /public/screenshots and filling in
 * the src is the whole job -- nothing else here needs to change.
 *
 * The labels are not decoration. They say which screen each slot is waiting
 * for, so the placeholder doubles as the shot list: six specific screens,
 * chosen to walk someone through the product in the order the landing page
 * copy introduces it.
 */
type Slide = {
  src: string | null;
  /** Which screen this is. Becomes the image's alt text. */
  label: string;
  /** One line of what it shows, under the label. */
  blurb: string;
};

const SLIDES: Slide[] = [
  {
    src: null,
    label: "Home",
    blurb: "Your photo, the countdown that matters, and what's coming up",
  },
  {
    src: null,
    label: "Free together",
    blurb: "The next few windows you're both actually free, ready to book",
  },
  {
    src: null,
    label: "The shared calendar",
    blurb: "Both of you on one day, hour by hour, colour-coded",
  },
  {
    src: null,
    label: "Key dates",
    blurb: "Anniversaries and birthdays with reminders in good time",
  },
  {
    src: null,
    label: "Working hours",
    blurb: "Shifts and rosters, so free time is honest",
  },
  {
    src: null,
    label: "Wishlists",
    blurb: "Gift ideas collected all year, ready when the date arrives",
  },
];

const ADVANCE_MS = 4500;

/**
 * The width is fixed rather than `w-full max-w-[...]`.
 *
 * The wrapper in the hero is a shrink-to-fit flex item with no width of its
 * own, so a percentage width here resolves against nothing and the whole
 * carousel collapses to a sliver with its text clipped.
 */
export function ScreenshotCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;

    // Somebody who has asked their system for less movement should not be
    // handed an animation that runs forever in the corner of their eye.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <div
      className="w-[220px] shrink-0 sm:w-[240px]"
      // Pausing on hover and on focus, not just hover: someone tabbing through
      // the dots should not have the thing move under them.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="group"
      aria-roledescription="carousel"
      aria-label="Screenshots of the app"
    >
      <div
        className="relative aspect-[9/19.5] overflow-hidden rounded-[1.75rem] border border-border bg-surface-card shadow-sm"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          if (start === null) return;

          const dx = e.changedTouches[0].clientX - start;
          // A deliberate swipe, not a tap that wandered a few pixels.
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        {SLIDES.map((slide, i) => (
          <div
            key={slide.label}
            className={`absolute inset-0 transition-opacity duration-500 ${
              i === index ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={i !== index}
          >
            {slide.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.src}
                alt={`${slide.label}: ${slide.blurb}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <Placeholder slide={slide} position={i + 1} />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.label}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show ${slide.label}`}
            aria-current={i === index}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-5 bg-brand-orange" : "w-2 bg-border hover:bg-text-muted"
            }`}
          />
        ))}
      </div>

      {/* Announced rather than drawn: the label is already in the slide, and a
          second copy underneath would just repeat itself. */}
      <p className="sr-only" aria-live="polite">
        {SLIDES[index].label}, {index + 1} of {SLIDES.length}
      </p>
    </div>
  );
}

/**
 * What a slot looks like before its screenshot exists.
 *
 * Deliberately finished-looking rather than a grey box with a cross through
 * it. This is on a live page collecting sign-ups, so it has to read as "coming
 * soon" and not as "broken site".
 */
function Placeholder({ slide, position }: { slide: Slide; position: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-gradient-to-b from-surface-card to-surface px-5 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange/10 text-[12px] font-semibold text-brand-orange">
        {position}
      </span>
      <p className="text-[14px] font-medium text-text-primary">{slide.label}</p>
      <p className="text-[12px] leading-5 text-text-secondary">{slide.blurb}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted">Screenshot coming</p>
    </div>
  );
}
