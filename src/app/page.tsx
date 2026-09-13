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
    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-base font-medium">Untangled Life</span>
          </div>
        </header>

        <section className="px-6 pb-9 pt-11 text-center sm:px-10">
          <HeroMark />
          <h1 className="mx-auto text-2xl font-semibold tracking-tight sm:text-[26px]">
            Two calendars. One life. No knots.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-text-secondary">
            Untangled Life pulls both your calendars into one view, spots the
            evenings you&apos;re actually both free, and gets the date booked
            before the week swallows it.
          </p>
          <div className="mt-6">
            <WaitlistForm />
          </div>
          <p className="mt-3 text-[13px] text-text-muted">
            Free for the first 100 registered users.
          </p>
          <WaitlistCounter />
        </section>

        <section className="grid gap-3 px-6 pb-6 sm:grid-cols-3 sm:px-10">
          {features.map(({ Icon, color, title, body }) => (
            <div key={title} className="rounded-xl bg-surface p-4">
              <Icon className={`h-5 w-5 ${color}`} />
              <p className="mt-2 text-[15px] font-medium">{title}</p>
              <p className="mt-1 text-[13px] leading-6 text-text-secondary">
                {body}
              </p>
            </div>
          ))}
        </section>

        <footer className="border-t border-border px-6 py-5 text-center sm:px-10">
          {/* placeholder testimonial - swap for a real one before launch */}
          <p className="font-voice italic text-[16px] leading-7 text-text-primary">
            &ldquo;Created by a couple that felt their relationship fraying
            in the midst of all the tangles that inevitably pop up in
            life.&rdquo;
          </p>
          <p className="mt-1.5 text-[13px] text-text-muted">
            The founders of Untangled Life
          </p>
        </footer>
      </div>
    </div>
  );
}
