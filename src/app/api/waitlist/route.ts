import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local (see .env.local.example)."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const sharedApp =
    typeof body?.sharedApp === "string" ? body.sharedApp.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (!sharedApp) {
    return NextResponse.json(
      { error: "Let us know if you use a shared calendar app together." },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Waitlist signup is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  try {
    const { error } = await supabase.from("waitlist").insert({
      name,
      email,
      uses_shared_calendar: sharedApp,
    });

    if (error) {
      // Postgres unique_violation on the email column
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "That email is already on the waitlist." },
          { status: 409 }
        );
      }

      console.error("Supabase insert failed:", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Unexpected error inserting waitlist signup:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
