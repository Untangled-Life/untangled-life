import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Privacy Policy - Untangled Life",
  description:
    "What Untangled Life collects, what your partner can see, what never leaves your phone, how long it is kept, and how to get it back or delete it.",
};

const LAST_UPDATED = "14 September 2026";

/**
 * Details only the operator can supply. Rendered conspicuously so they can't
 * reach the App Store or Google's verification team unnoticed.
 */
function Fill({ children }: { children: React.ReactNode }) {
  return (
    <mark className="rounded bg-brand-orange/15 px-1.5 py-0.5 font-medium text-brand-orange">
      [{children}]
    </mark>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[19px] font-semibold tracking-tight">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-4 text-[15px] leading-7 text-text-secondary">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
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
            with your time, so this policy sets out what we collect, what your partner can see,
            what never leaves your phone, and how to get it all back or delete it. It describes
            what the software actually does.
          </p>

          <div className="mt-6 rounded-xl border border-brand-green/30 bg-brand-green/5 p-5">
            <p className="text-[15px] font-medium text-text-primary">
              The part that matters most
            </p>
            <p className="mt-2 text-[15px] leading-7 text-text-secondary">
              You choose, calendar by calendar, how much of it your partner sees. There are three
              settings and the default is the most private one:
            </p>
            <ul className="mt-3 ml-5 list-disc space-y-2 text-[15px] leading-7 text-text-secondary">
              <li>
                <strong>Off.</strong> The calendar is never read. Nothing from it leaves your
                phone. This is what every calendar starts as, including ones you add later.
              </li>
              <li>
                <strong>Busy only.</strong> We upload the start and end time of each event and
                nothing else. Your partner sees that you are busy, never what you are doing.
              </li>
              <li>
                <strong>Full detail.</strong> Times plus the title, location and notes. Assume
                anything in a calendar set to full detail is something{" "}
                <strong>your partner can read</strong>.
              </li>
            </ul>
            <p className="mt-3 text-[15px] leading-7 text-text-secondary">
              Turn a calendar down or off and what it shared is deleted straight away, not at some
              later sync. Event titles are stripped before they are stored, not merely hidden in
              the app. On <em>busy only</em>, the title never reaches our servers in the first
              place.
            </p>
          </div>

          <Section n={1} title="Who we are">
            <p>
              The Untangled Life app and this website are operated by <Fill>legal entity name</Fill>{" "}
              <Fill>ABN, if registered</Fill>, trading as Untangled Life, in New South Wales,
              Australia. In this policy &quot;we&quot;, &quot;us&quot; and &quot;our&quot; mean
              that operator, and &quot;you&quot; means the person using the app.
            </p>
            <p>
              We handle personal information in accordance with the Privacy Act 1988 (Cth) and the
              Australian Privacy Principles. If you are in the UK or the European Economic Area,
              we act as the controller of the information described here, and we rely on your
              consent for calendar access and photos, and on the performance of our agreement with
              you for everything else.
            </p>
            <p>
              Contact:{" "}
              <a
                className="text-brand-green underline underline-offset-2"
                href="mailto:hello@untangledlife.com.au"
              >
                hello@untangledlife.com.au
              </a>
            </p>
          </Section>

          <Section n={2} title="Information you give us">
            <Bullets
              items={[
                <>
                  <strong>Account information.</strong> Your email address and a securely hashed
                  password, handled by our authentication provider, plus the display name you
                  choose. We never see or store your password itself.
                </>,
                <>
                  <strong>Your partner link.</strong> The invite code you generate or enter, and
                  the fact that the two of you are paired. Pairing is what makes everything below
                  visible to your partner.
                </>,
                <>
                  <strong>Events from the calendars you share.</strong> For each event in a shared
                  calendar we store its start and end time and whether it is an all-day event, and,
                  only for calendars you have set to full detail, its title, location and notes.
                  That is what lets your phone&apos;s calendar appear inside Untangled Life as
                  something you can read rather than an unexplained grey block. Section 4 sets out
                  the three settings and how to change your mind.
                </>,
                <>
                  <strong>Working hours and rosters.</strong> The regular hours, rotating pattern or
                  roster you enter, including any roster text you paste in for us to read. We keep
                  the shifts we work out from it so that time you are at work is not offered as
                  time you are free.
                </>,
                <>
                  <strong>Content you create together.</strong> Dates you book, key dates such as
                  birthdays and anniversaries, countdowns, to-do items and wishlist items,
                  including any titles, notes, locations and links you add to them.
                </>,
                <>
                  <strong>Photos you choose to add.</strong> A profile picture for yourself and a
                  cover photo for your shared home screen. These are uploaded, resized and stored
                  so both of you can see them on every device you sign in from. We only ever
                  receive photos you pick yourself. We do not read your photo library, and the
                  app asks your phone for access to it only at the moment you tap to choose a
                  picture.
                </>,
                <>
                  <strong>Anything you send us.</strong> If you email us for support, we keep that
                  correspondence so we can help you.
                </>,
              ]}
            />
          </Section>

          <Section n={3} title="Information collected automatically">
            <Bullets
              items={[
                <>
                  <strong>Push notification token.</strong> If you turn on notifications, your
                  phone gives us an anonymous token we use to send you alerts, for example when
                  your partner books a date, or adds a key date you might want on your own list.
                  It identifies the phone, not you, and is deleted when you sign out or turn
                  notifications off.
                </>,
                <>
                  <strong>Device and technical information.</strong> Basic details such as the
                  platform (iOS or Android), app version and time zone, so the app shows your times
                  correctly and so we can tell which version a problem came from.
                </>,
                <>
                  <strong>Security and diagnostic logs.</strong> Our hosting and authentication
                  providers keep short-lived logs of connections to the service, including IP
                  address, to detect abuse and to fix faults.
                </>,
              ]}
            />
            <p>
              This website uses no analytics, no advertising tags and no tracking cookies. The app
              contains no third-party advertising or analytics software either. We do not build a
              profile of you and we do not track you across other apps or websites. Our{" "}
              <Link href="/cookies" className="text-brand-green underline underline-offset-2">
                Cookie Policy
              </Link>{" "}
              sets this out in full.
            </p>
          </Section>

          <Section n={4} title="Your calendars">
            <p>
              Calendar access is entirely optional, and it is granted one calendar at a time, at
              whichever of the three levels above you pick.
            </p>
            <Bullets
              items={[
                <>
                  Your phone asks your permission before the app can see any calendar at all. If
                  you decline, the rest of the app still works: you can enter working hours, book
                  dates and use key dates, to-dos and wishlists without ever connecting a calendar.
                </>,
                <>
                  Once permission is granted, you choose a level for each calendar. A calendar left
                  off, which is what every calendar starts as, is never read and never uploaded.
                </>,
                <>
                  For shared calendars we read events in a rolling window around today, the next
                  30 days ahead, and refresh them when you open the app. We do not read your
                  distant past or the far future.
                </>,
                <>
                  What we store is visible to your partner inside your shared calendar: the times
                  for a busy-only calendar, the times and the content for a full-detail one.
                </>,
                <>
                  Turn a calendar off, turn it down from full detail to busy only, or withdraw
                  calendar access entirely, and what that calendar contributed is deleted from our
                  servers immediately and stops appearing for your partner.
                </>,
                <>
                  When you book a date together, the app writes that one event into a calendar on
                  your phone, and your partner&apos;s app writes the same event into theirs. That
                  is the only thing we ever write to your calendar, and cancelling the date removes
                  it again.
                </>,
              ]}
            />
          </Section>

          <Section n={5} title="What we never collect">
            <Bullets
              items={[
                <>
                  <strong>Your location.</strong> The app never asks for it and never records it.
                  A location you type into an event is text you chose to write, not a position we
                  measured.
                </>,
                <>
                  <strong>Your contacts.</strong> We never read your address book. You pair with
                  your partner using a code, not by us scanning who you know.
                </>,
                <>
                  <strong>Your photo library.</strong> We only receive the individual pictures you
                  pick.
                </>,
                <>
                  <strong>Attendees and invitees.</strong> Where a calendar event lists other
                  people, we do not upload them.
                </>,
                <>
                  <strong>Payment details.</strong> The app is free at the time of writing. If that
                  changes, purchases will be handled by Apple or Google, and we will never see your
                  card number.
                </>,
              ]}
            />
          </Section>

          <Section n={6} title="How we use your information">
            <p>We use it to run the app you asked for, and for nothing else:</p>
            <Bullets
              items={[
                <>To show you and your partner a shared calendar of what you both have on.</>,
                <>To work out when you are both genuinely free, and to suggest those times.</>,
                <>To book dates onto both of your phones and keep them in step.</>,
                <>
                  To send you reminders and alerts you have turned on: upcoming key dates, a date
                  your partner just booked, a countdown reaching zero.
                </>,
                <>To keep your lists, wishlists, key dates and photos in sync across your devices.</>,
                <>To answer your support emails, fix faults, and keep the service secure.</>,
                <>To meet our legal obligations.</>,
              ]}
            />
            <p>
              We do not sell your personal information. We do not share it with advertisers, we do
              not use it to target ads, and we do not use your calendar content to train machine
              learning models.
            </p>
          </Section>

          <Section n={7} title="Who can see it">
            <Bullets
              items={[
                <>
                  <strong>Your partner.</strong> Once you are paired, they can see everything the
                  app shares within a couple: your busy times, the content of events from any
                  calendar you set to full detail, your working hours, your shared dates, key dates,
                  countdowns, to-dos, wishlists, your display name and your profile picture. This
                  is symmetrical: you see the same things about them. Our database is built so
                  that the only people who can read your couple&apos;s information are the two of
                  you.
                </>,
                <>
                  <strong>Service providers.</strong> We use Supabase for the database,
                  authentication and photo storage, Expo&apos;s push service to deliver
                  notifications, and Vercel to host this website. They process information on our
                  instructions in order to provide those services, and they are not permitted to
                  use it for their own purposes.
                </>,
                <>
                  <strong>Where the law requires it.</strong> We may disclose information if we are
                  legally compelled to, or where it is necessary to protect someone&apos;s safety
                  or our legal rights.
                </>,
                <>
                  <strong>If the business changes hands.</strong> If Untangled Life is sold or
                  merges with another business, information may transfer to the new owner as part
                  of that. We will tell you in the app before that happens, and the new owner will
                  be bound by this policy until you are given notice of a replacement.
                </>,
              ]}
            />
            <p>Nobody else. There is no public profile, and nothing you enter is visible on the web.</p>
          </Section>

          <Section n={8} title="Where it is stored">
            <p>
              Your information is stored in our Supabase project, hosted in{" "}
              <Fill>Supabase region</Fill>. Push notifications are delivered through Expo&apos;s
              servers in the United States, and a notification carries only the short message you
              see on your lock screen.
            </p>
            <p>
              Where information is handled outside Australia, we take reasonable steps to ensure it
              is protected to a standard comparable to the Australian Privacy Principles.
            </p>
          </Section>

          <Section n={9} title="How long we keep it">
            <Bullets
              items={[
                <>
                  <strong>Calendar events.</strong> Only the current window. Events more than a
                  week in the past are deleted automatically, so the app does not accumulate a
                  history of where you have been.
                </>,
                <>
                  <strong>Everything you created.</strong> Key dates, to-dos, wishlists, dates,
                  photos and working hours are kept until you delete them or delete your account.
                </>,
                <>
                  <strong>Your account.</strong> Kept until you ask us to delete it. Deleting your
                  account removes your profile, your photos, your calendar data and your working
                  hours. Things you created jointly with your partner are removed when the last
                  member of the couple deletes their account.
                </>,
                <>
                  <strong>Logs.</strong> Kept briefly by our providers for security and diagnosis,
                  then discarded.
                </>,
              ]}
            />
          </Section>

          <Section n={10} title="Security">
            <p>
              Everything travels over encrypted connections and is encrypted at rest by our
              hosting provider. Access to your couple&apos;s data is enforced in the database
              itself, row by row, so a bug in the app cannot expose another couple&apos;s
              information. Passwords are hashed by our authentication provider and are never
              visible to us.
            </p>
            <p>
              No service can promise perfect security. If a breach occurs that is likely to cause
              you serious harm, we will notify you and the Office of the Australian Information
              Commissioner as required by law.
            </p>
          </Section>

          <Section n={11} title="Your rights">
            <Bullets
              items={[
                <>
                  <strong>See what we hold.</strong> Most of it is visible in the app. Email us and
                  we will provide the rest.
                </>,
                <>
                  <strong>Correct it.</strong> You can edit your name, photos, key dates, working
                  hours and lists in the app at any time.
                </>,
                <>
                  <strong>Get a copy.</strong> Ask us and we will send you your information in a
                  common machine-readable format.
                </>,
                <>
                  <strong>Withdraw consent.</strong> Turn off calendar access or notifications in
                  your phone&apos;s settings, or disconnect individual calendars in the app,
                  whenever you like.
                </>,
                <>
                  <strong>Delete it.</strong> Delete individual items in the app, or ask us to
                  delete your account entirely. We will action account deletion within 30 days.
                </>,
              ]}
            />
            <p>
              Email{" "}
              <a
                className="text-brand-green underline underline-offset-2"
                href="mailto:hello@untangledlife.com.au"
              >
                hello@untangledlife.com.au
              </a>{" "}
              for any of these and we will respond within 30 days.
            </p>
          </Section>

          <Section n={12} title="Children">
            <p>
              Untangled Life is not intended for anyone under 16, and we do not knowingly collect
              information from them. If you believe a child has given us their information, contact
              us and we will delete it.
            </p>
          </Section>

          <Section n={13} title="Complaints">
            <p>
              If you think we have mishandled your personal information, email us and we will
              respond within 30 days. If you are not satisfied with our response, you can complain
              to the Office of the Australian Information Commissioner at oaic.gov.au.
            </p>
          </Section>

          <Section n={14} title="Changes to this policy">
            <p>
              If this policy changes in a way that affects what we collect, who can see it, or how
              long we keep it, we will update the date at the top and tell you in the app before
              the change takes effect.
            </p>
          </Section>

          <Section n={15} title="Governing law">
            <p>This policy is governed by the laws of New South Wales, Australia.</p>
          </Section>
        </div>
      </main>

      <LegalFooter current="/privacy" />
    </>
  );
}
