import { Logo, HeroMark } from "@/components/logo";
import { WaitlistForm } from "@/components/waitlist-form";
import { WaitlistCounter } from "@/components/waitlist-counter";
import { CalendarIcon, ClockIcon, HeartIcon } from "@/components/icons";

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
              Let Untangled Life handle the groundwork so you don&apos;t
              have to.
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
        </div>
      </footer>
    </>
  );
}
