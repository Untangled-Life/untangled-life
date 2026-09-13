import { Logo, HeroMark } from "@/components/logo";
import { WaitlistForm } from "@/components/waitlist-form";
import { WaitlistCounter } from "@/components/waitlist-counter";
import {
  CalendarIcon,
  ClockIcon,
  HeartIcon,
  BellIcon,
  HourglassIcon,
  GiftIcon,
  CheckSquareIcon,
} from "@/components/icons";

const features = [
  {
    Icon: CalendarIcon,
    color: "text-brand-green",
    title: "Both diaries, one screen",
    body: "Google, Apple, Outlook and work rosters, side by side. Share what you want, hide the rest.",
  },
  {
    Icon: ClockIcon,
    color: "text-brand-orange",
    title: "Your next free night, found",
    body: "Shift work, late finishes, weekends that don't line up. We find the overlap so you don't have to.",
  },
  {
    Icon: HeartIcon,
    color: "text-brand-green",
    title: "Book it on both phones",
    body: "Add a date once. It lands in both your calendars, with a nudge if it's been a while.",
  },
];

const moreFeatures = [
  {
    Icon: BellIcon,
    color: "text-brand-orange",
    title: "Key dates remembered, for you",
    body: "Anniversaries and birthdays, saved once. A nudge two weeks out gives you time for a proper card, not a rushed one.",
  },
  {
    Icon: HourglassIcon,
    color: "text-brand-green",
    title: "Countdowns for upcoming dates & trips",
    body: "Every important day sits right on your home screen, ticking down together. Nothing sneaks up on either of you.",
  },
  {
    Icon: GiftIcon,
    color: "text-brand-orange",
    title: "Wishlists for Christmas & birthdays",
    body: "Drop in ideas as they come to you, all year round. When the date rolls around, the guessing is already done.",
  },
  {
    Icon: CheckSquareIcon,
    color: "text-brand-green",
    title: "To-dos, split fairly",
    body: "Mine, yours and ours, in one shared list. Nothing falls through the cracks between two calendars.",
  },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-base font-medium">Untangled Life</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 pb-16 pt-16 text-center sm:pt-24">
          <div className="mx-auto max-w-xl">
            <HeroMark />
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Two calendars. One life. No knots.
            </h1>
            <p className="mt-4 text-[15px] leading-7 text-text-secondary">
              Untangled Life pulls both your calendars into one view, spots
              the time that you&apos;re both actually free, and gets the
              date booked before the week swallows it.
            </p>
            <p className="mt-2 text-[15px] leading-7 text-text-secondary">
              You fell in love with each other, not with the logistics.
              Untangled Life takes care of the admin so the two of you can
              get back to the good stuff.
            </p>
            <div className="mt-8">
              <WaitlistForm />
            </div>
            <p className="mt-3 text-[13px] text-text-muted">
              Free for the first 100 registered users.
            </p>
            <WaitlistCounter />
          </div>
        </section>

        <section className="border-y border-border bg-surface-card py-14">
          <div className="mx-auto grid max-w-5xl gap-6 px-6 sm:grid-cols-3">
            {features.map(({ Icon, color, title, body }) => (
              <div key={title} className="rounded-xl bg-surface p-5">
                <Icon className={`h-5 w-5 ${color}`} />
                <p className="mt-3 text-[15px] font-medium">{title}</p>
                <p className="mt-1 text-[13px] leading-6 text-text-secondary">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-14">
          <div className="mx-auto max-w-5xl px-6">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                More than just a shared calendar
              </h2>
              <p className="mt-2 text-[14px] leading-6 text-text-secondary">
                The little things that keep a relationship running, all in
                one place.
              </p>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {moreFeatures.map(({ Icon, color, title, body }) => (
                <div key={title} className="rounded-xl bg-surface-card p-5">
                  <Icon className={`h-5 w-5 ${color}`} />
                  <p className="mt-3 text-[15px] font-medium">{title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-text-secondary">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-14 text-center">
        {/* placeholder testimonial - swap for a real one before launch */}
        <div className="mx-auto max-w-xl">
          <p className="font-voice italic text-[17px] leading-7 text-text-primary">
            Created by a couple that felt their relationship fraying
            in the midst of all the tangles that inevitably pop up in
            life.
          </p>
          <p className="mt-2 text-[13px] text-text-muted">
            The founders of Untangled Life
          </p>
          <p className="mt-6 text-[13px]">
            <a href="/privacy" className="text-text-muted underline underline-offset-2 hover:text-text-secondary">
              Privacy policy
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
