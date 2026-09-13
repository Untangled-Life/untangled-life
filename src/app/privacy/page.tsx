import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Privacy Policy — Untangled Life",
  description:
    "What Untangled Life stores, what it never stores, and who can see it. Written from what the app actually does.",
};

const LAST_UPDATED = "14 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-4 text-[15px] leading-7 text-text-secondary">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-base font-medium">Untangled Life</span>
          </Link>
          <Link href="/" className="text-[14px] text-text-secondary hover:text-text-primary">
            Back to site
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-[14px] text-text-muted">Last updated {LAST_UPDATED}</p>

          <p className="mt-6 text-[15px] leading-7 text-text-secondary">
            Untangled Life is a shared calendar for two people. That only works if you trust it
            with your time, so this policy describes exactly what the app stores and what it
            deliberately does not. It is written to match what the software actually does, not
            what would be convenient to claim.
          </p>

          <Section title="The short version">
            <p>
              The app learns <strong>when</strong> you are busy. It never learns{" "}
              <strong>what</strong> you are doing. When it reads your phone&apos;s calendar, only
              the start and end times of your events leave your phone — never the title, the
              location, the notes, or who else is invited. Those stay on your device.
            </p>
            <p>
              Everything you can see about your partner, they can see about you. There is no
              asymmetry, and nothing is shared with anyone outside your couple.
            </p>
          </Section>

          <Section title="What we store">
            <p>
              <strong>Your account.</strong> Your email address and a securely hashed password,
              handled by our authentication provider, plus the display name you choose. We never
              see or store your password itself.
            </p>
            <p>
              <strong>Busy times from your calendar.</strong> If you connect your phone&apos;s
              calendar, we read your events for the next 30 days and store only the start and end
              time of each one. This is what lets the app work out when you and your partner are
              both free. No titles, locations, notes, attendees, or descriptions are uploaded.
            </p>
            <p>
              <strong>Your working hours.</strong> The shifts or pattern you enter, so time you
              are at work is not offered as time you are free.
            </p>
            <p>
              <strong>Things you create in the app.</strong> Dates you book (with the title,
              location and notes you give them), key dates such as anniversaries and birthdays,
              to-dos, and wishlists including any links you add. These exist because you typed
              them and are shared with your partner by design.
            </p>
            <p>
              <strong>A notification token.</strong> If you allow notifications, a token
              identifying your device, so we can tell you when your partner books something. It
              identifies the device, not you.
            </p>
            <p>
              <strong>Waitlist details.</strong> If you signed up on this website before the app
              launched: your name, email, and your answer about whether you already use a shared
              calendar.
            </p>
          </Section>

          <Section title="What we never store">
            <ul className="list-disc space-y-2 pl-5">
              <li>The content of your calendar events — titles, locations, notes, attendees</li>
              <li>Your contacts, photos, messages, or location</li>
              <li>Your password</li>
              <li>Payment details — the app does not take payments</li>
            </ul>
          </Section>

          <Section title="Who can see it">
            <p>
              <strong>Your partner.</strong> Once you pair, both of you can see the couple&apos;s
              shared information: booked dates, key dates, to-dos, wishlists, and when each of you
              is busy or working. Your partner sees that you are busy from 2pm to 4pm; they do not
              see what you are doing.
            </p>
            <p>
              <strong>Nobody else.</strong> Access is enforced at the database level, so data is
              restricted to the couple it belongs to rather than merely hidden by the app. We do
              not sell your data, and we do not use it for advertising.
            </p>
            <p>
              <strong>Service providers we rely on.</strong> Supabase hosts our database and
              handles sign-in. Expo delivers push notifications, which means your notification
              token and the text of a notification pass through their service. Vercel hosts this
              website. Each is used only to run the app.
            </p>
          </Section>

          <Section title="Your phone's calendar">
            <p>
              The app asks for calendar access for two reasons: to read when you are busy, and to
              add dates you book so they appear in your normal calendar app. It only removes
              events it created itself.
            </p>
            <p>
              You can withdraw calendar access at any time in your phone&apos;s settings. The app
              will keep working; it will simply no longer know when you are busy.
            </p>
          </Section>

          <Section title="Deleting your data">
            <p>
              Email{" "}
              <a
                className="text-brand-green underline underline-offset-2"
                href="mailto:hello@untangledlife.com.au"
              >
                hello@untangledlife.com.au
              </a>{" "}
              and we will delete your account and the data attached to it.
            </p>
            <p>
              Some information belongs to a couple rather than one person. If you delete your
              account, shared items your partner still relies on may remain visible to them; tell
              us if you want those removed too.
            </p>
          </Section>

          <Section title="Children">
            <p>
              Untangled Life is not intended for anyone under 16, and we do not knowingly collect
              information from children.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If this policy changes in a way that affects what we collect or who can see it, we
              will update the date at the top and say so in the app.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about any of this:{" "}
              <a
                className="text-brand-green underline underline-offset-2"
                href="mailto:hello@untangledlife.com.au"
              >
                hello@untangledlife.com.au
              </a>
              .
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-8 text-center">
        <Link href="/" className="text-[13px] text-text-muted hover:text-text-secondary">
          untangledlife.com.au
        </Link>
      </footer>
    </>
  );
}
