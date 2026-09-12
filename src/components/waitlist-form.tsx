"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }

      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <p className="text-sm font-medium text-brand-green">
        You&apos;re on the list — we&apos;ll be in touch.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 rounded-full border border-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-brand-orange/40"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="whitespace-nowrap rounded-full bg-brand-orange px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#c14f28] disabled:opacity-60"
        >
          {status === "loading" ? "Joining…" : "Join the waitlist"}
        </button>
      </form>
      {status === "error" && message && (
        <p className="mt-2 text-sm text-red-600">{message}</p>
      )}
    </div>
  );
}
