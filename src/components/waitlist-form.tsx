"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

const SHARED_APP_OPTIONS = [
  { value: "", label: "Select an option" },
  { value: "yes", label: "Yes, we use one" },
  { value: "tried", label: "We've tried, but it didn't stick" },
  { value: "no", label: "No, we don't" },
];

export function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sharedApp, setSharedApp] = useState("");
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
        body: JSON.stringify({ name, email, sharedApp }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }

      setStatus("success");
      setName("");
      setEmail("");
      setSharedApp("");
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
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-2.5 text-left"
    >
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="rounded-full border border-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-brand-orange/40"
      />
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="rounded-full border border-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-brand-orange/40"
      />
      <div>
        <label
          htmlFor="sharedApp"
          className="mb-1 block px-1 text-xs font-medium text-text-secondary"
        >
          Do you currently use a shared calendar app together?
        </label>
        <select
          id="sharedApp"
          value={sharedApp}
          onChange={(e) => setSharedApp(e.target.value)}
          className="w-full rounded-full border border-border bg-surface-card px-4 py-2.5 text-sm text-text-secondary outline-none focus:ring-2 focus:ring-brand-orange/40"
        >
          {SHARED_APP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-1 rounded-full bg-brand-orange px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#c14f28] disabled:opacity-60"
      >
        {status === "loading" ? "Joining…" : "Join the waitlist"}
      </button>
      {status === "error" && message && (
        <p className="text-sm text-red-600">{message}</p>
      )}
    </form>
  );
}
