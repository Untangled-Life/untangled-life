"use client";

import { useEffect, useState } from "react";

const GOAL = 500;

export function WaitlistCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/waitlist", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.count === "number") {
          setCount(data.count);
        }
      })
      .catch(() => {
        // Leave count as null — the counter just won't render.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (count === null) {
    return null;
  }

  const capped = Math.min(count, GOAL);
  const goalReached = count >= GOAL;

  return (
    <div className="mt-1.5">
      <p
        className="text-[13px] font-semibold text-brand-orange"
        aria-live="polite"
      >
        {capped}/{GOAL} registered
      </p>
      {goalReached && (
        <p className="mt-1 text-[13px] font-medium text-brand-green">
          20% off for the first 10,000 users
        </p>
      )}
    </div>
  );
}
