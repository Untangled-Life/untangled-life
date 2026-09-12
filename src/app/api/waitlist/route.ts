import { NextResponse } from "next/server";
import { mkdir, appendFile } from "fs/promises";
import path from "path";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  // TODO: replace this file-based store with a Supabase insert once the
  // Supabase project is set up (see project notes).
  const dataDir = path.join(process.cwd(), "data");
  await mkdir(dataDir, { recursive: true });
  await appendFile(
    path.join(dataDir, "waitlist.jsonl"),
    JSON.stringify({ email, joinedAt: new Date().toISOString() }) + "\n",
    "utf8"
  );

  return NextResponse.json({ ok: true });
}
