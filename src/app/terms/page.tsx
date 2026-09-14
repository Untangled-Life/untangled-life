import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Terms of Service - Untangled Life",
  description:
    "The agreement between you and Untangled Life: who can use it, how pairing works, what the app does not promise, the free trial and pricing, and your rights under Australian Consumer Law.",
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

export default function Terms() {
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
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Terms of Service</h1>
          <p className="mt-3 text-[14px] text-text-muted">Last updated {LAST_UPDATED}</p>

          <p className="mt-6 text-[15px] leading-7 text-text-secondary">
            These terms are the agreement between you and the operator of Untangled Life. They sit
            alongside our{" "}
            <Link
              className="text-brand-green underline underline-offset-2"
              href="/privacy"
            >
              Privacy Policy
            </Link>
            , which explains what we collect and what your partner can see. Read the two together.
          </p>

          <div className="mt-6 rounded-xl border border-brand-green/30 bg-brand-green/5 p-5">
            <p className="text-[15px] font-medium text-text-primary">The short version of the money</p>
            <ul className="mt-3 ml-5 list-disc space-y-2 text-[15px] leading-7 text-text-secondary">
              <li>
                <strong>7 days free.</strong> Cancel any time before it ends and you are not
                charged.
              </li>
              <li>
                <strong>$29.99 for the first year</strong>, then <strong>$9.99 a year</strong>{" "}
                after that. Billed by Apple or Google, renews automatically, cancel in your app
                store settings.
              </li>
              <li>
                <strong>The first 100 subscribers pay nothing, ever.</strong> The next 10,000 get
                40% off, and the 10,000 after that get 20% off.
              </li>
            </ul>
            <p className="mt-3 text-[15px] leading-7 text-text-secondary">
              Sections 7 to 10 set all of this out properly, including what happens if you cancel
              and come back.
            </p>
          </div>

          <Section n={1} title="About these terms">
            <p>
              The Untangled Life app and this website are operated by <Fill>legal entity name</Fill>{" "}
              <Fill>ABN, if registered</Fill>, trading as Untangled Life, in New South Wales,
              Australia. In these terms &quot;we&quot;, &quot;us&quot; and &quot;our&quot; mean
              that operator, &quot;the app&quot; means Untangled Life, and &quot;you&quot; means
              the person using it.
            </p>
            <p>
              By creating an account, or by downloading, installing or using the app, you agree to
              these terms. If you do not agree, do not use the app.
            </p>
          </Section>

          <Section n={2} title="Who can use Untangled Life">
            <p>
              You must be at least 16 years old. The app is not intended for anyone younger, and if
              we learn that an account belongs to someone under 16 we will close it and delete the
              information held in it.
            </p>
            <p>
              You must also be able to enter into a binding contract. If you set the app up for
              someone else, you are responsible for their use of it and for making sure they agree
              to these terms.
            </p>
          </Section>

          <Section n={3} title="Your account">
            <p>
              You are responsible for keeping your login details confidential and for everything
              that happens under your account. Email{" "}
              <a
                className="text-brand-green underline underline-offset-2"
                href="mailto:hello@untangledlife.com.au"
              >
                hello@untangledlife.com.au
              </a>{" "}
              straight away if you think someone else has access to it.
            </p>
            <p>
              Give us accurate information when you sign up, and keep it current. Use one account
              per person. Do not share a single login with your partner: pairing two accounts is how
              the app is meant to be used, and it is what gives each of you your own control over
              what is shared.
            </p>
          </Section>

          <Section n={4} title="Pairing with your partner">
            <p>
              The app is built for two people. You pair by generating an invite code and giving it
              to your partner.
            </p>
            <p>
              Only invite someone who knows they are being invited and wants to use the app. Do not
              create or operate an account on another person&apos;s behalf without their knowledge.
            </p>
            <p>
              Once paired, some content is genuinely shared between you, and each of you decides,
              calendar by calendar, how much of your own calendar the other can see. Every calendar
              starts as off. The Privacy Policy sets out exactly what each setting shares.
            </p>
            <p>
              Either of you can unpair at any time. When you do, calendar sharing stops and what it
              shared is deleted. Content the two of you created together, such as planned dates, key
              dates, to-dos, wishlists and shared photos, stays with the remaining partner rather
              than being deleted. Treat anything you put into shared content as something your
              partner keeps.
            </p>
          </Section>

          <Section n={5} title="Your calendars and other services">
            <p>
              The app reads the calendars you choose to connect on your device, and can create
              events in them when you book something. You control which calendars are connected, and
              at what level of detail, both in the app and in your phone&apos;s settings. Revoking
              calendar permission in your phone settings stops the app reading anything further.
            </p>
            <p>
              Where you connect a Google, Apple or other third-party account, your use of that
              service is governed by that provider&apos;s own terms. We are not responsible for
              those services, for their availability, or for changes they make to them.
            </p>
          </Section>

          <Section n={6} title="What the app does not promise">
            <p>Untangled Life is a convenience, not a system of record.</p>
            <p>
              Free-time windows, countdowns, busy blocks and reminders are worked out from what your
              connected calendars reported the last time the app was able to read them. Calendars
              change, phones go offline, permissions get revoked, and push notifications are
              delivered by Apple and Google and can arrive late or not at all.
            </p>
            <p>
              <strong>
                Do not rely on the app alone for anything that matters: appointments, medication,
                work shifts, travel, childcare or custody arrangements.
              </strong>{" "}
              Check the underlying calendar.
            </p>
            <p>
              When you book a date, the app creates an event in each partner&apos;s device calendar.
              If a phone is offline, or calendar permission has been removed on that phone, the
              event may not be created there.
            </p>
          </Section>

          <Section n={7} title="Free trial">
            <p>
              New users get 7 days of full access, free, starting when the trial begins. One trial
              per person.
            </p>
            <p>
              Unless you cancel before the trial ends, it converts into a paid subscription and the
              first payment is taken. You can cancel at any point during the trial through your App
              Store or Google Play subscription settings.
            </p>
            <p>
              We may change or withdraw the trial for new users at any time. Doing so does not
              affect a trial that has already started.
            </p>
          </Section>

          <Section n={8} title="Prices and payment">
            <p>
              Prices are in Australian dollars and include GST where it applies. Your app store may
              display a different amount in other regions.
            </p>
            <p>Standard pricing, once the free trial ends:</p>
            <Bullets
              items={[
                <>
                  <strong>$29.99</strong> for the first 12 months, charged when the trial converts.
                </>,
                <>
                  <strong>$9.99</strong> for each 12 months after that, charged on each anniversary,
                  unless you cancel.
                </>,
              ]}
            />
            <p>
              Payment is handled by Apple or Google, not by us. We never see your card details.
              Subscriptions renew automatically unless you cancel at least 24 hours before the
              renewal date, in your app store account settings.
            </p>
            <p>
              The price shown in your app store when you subscribe or renew is the price that
              applies. We may change our prices. Where a change increases what you pay at renewal,
              we will tell you before it takes effect, and where your app store requires your
              consent to a price rise, your subscription will not renew at the higher price until
              you give it.
            </p>
            <p>
              If a payment cannot be collected, your app store may retry. If it still cannot be
              collected, access to paid features may end.
            </p>
          </Section>

          <Section n={9} title="Founding members and early pricing">
            <p>
              We are offering better pricing to early subscribers. Your place in the order is set
              when your subscription begins, which is when your free trial converts, and is counted
              by us. It is tied to your account, is not transferable, and has no cash value.
            </p>
            <Bullets
              items={[
                <>
                  <strong>The first 100 subscribers</strong> get lifetime free access. No first
                  payment and no renewals, for as long as we offer the app.
                </>,
                <>
                  <strong>The next 10,000 subscribers</strong> get 40% off the first payment and off
                  every renewal.
                </>,
                <>
                  <strong>The next 10,000 after that</strong> get 20% off the first payment and off
                  every renewal.
                </>,
                <>
                  <strong>After that</strong>, standard pricing applies.
                </>,
              ]}
            />
            <p>
              A discount lasts for as long as your subscription runs without a break. If you cancel
              and later subscribe again, you rejoin at whatever pricing is available at that time.
            </p>
            <p>
              These offers depend on the app continuing to be offered. See section 14.
            </p>
          </Section>

          <Section n={10} title="Refunds">
            <p>
              Purchases are made through the App Store or Google Play, so refunds are handled by
              Apple or Google under their own policies. Request a refund through the store you
              bought from.
            </p>
            <p>
              We do not otherwise refund part periods, except where section 16 gives you a right to
              a remedy from us.
            </p>
          </Section>

          <Section n={11} title="Acceptable use">
            <p>
              We grant you a limited, personal, non-exclusive, non-transferable and revocable
              licence to use the app for your own non-commercial purposes. You agree not to:
            </p>
            <Bullets
              items={[
                <>
                  Use the app to monitor, track, pressure or coerce another person. The sharing
                  settings exist so that each person decides for themselves what to share.
                </>,
                <>Set up or operate an account for someone else without their knowledge.</>,
                <>Copy, modify, adapt or distribute any part of the app.</>,
                <>Reverse engineer the app or attempt to extract its source code.</>,
                <>
                  Attempt to gain unauthorised access to our systems, other accounts, or data
                  belonging to another couple.
                </>,
                <>Use automated tools to scrape, bulk-request or overload the service.</>,
                <>Upload or transmit malicious code.</>,
                <>Use the app for anything unlawful, or to harass, abuse or harm anyone.</>,
                <>Resell, sublicense or commercially exploit the app or access to it.</>,
              ]}
            />
            <p>We may suspend or close an account that breaches this section.</p>
          </Section>

          <Section n={12} title="Your content">
            <p>
              You keep ownership of everything you create in the app: events, key dates, to-dos,
              wishlists, notes and photos.
            </p>
            <p>
              You grant us a limited, non-exclusive, worldwide, royalty-free licence to store,
              process, display and back up that content, for the sole purpose of running the service
              for you and your partner. That licence ends when the content is deleted, subject to
              the backup retention periods set out in the Privacy Policy.
            </p>
            <p>
              You are responsible for what you put into the app. Do not add content that is
              unlawful, that you do not have the right to share, or that contains another
              person&apos;s information they would not want shared.
            </p>
            <p>
              The app does not currently include AI features, and we do not use your content to
              train AI models.
            </p>
          </Section>

          <Section n={13} title="Our app">
            <p>
              We own the app, its name, brand, design and content, and nothing in these terms
              transfers any of that to you. You get the licence in section 11 and no other rights.
            </p>
          </Section>

          <Section n={14} title="Availability and changes to the app">
            <p>
              We aim to keep the app available, but we cannot guarantee uninterrupted access.
              Maintenance, outages at our providers, and changes made by Apple, Google or your
              device&apos;s operating system can all interrupt it.
            </p>
            <p>
              We may add, change or remove features. Where we remove or materially reduce something
              you are paying for, we will tell you in advance where we reasonably can.
            </p>
            <p>
              If we discontinue the app altogether, we will give at least 30 days notice where we
              reasonably can, stop charging renewals, and give you time to export your information.
              Lifetime free access, and any discount, ends when the app ends.
            </p>
          </Section>

          <Section n={15} title="Ending your subscription, unpairing and deleting your account">
            <Bullets
              items={[
                <>
                  <strong>Cancel your subscription</strong> in your App Store or Google Play
                  settings. You keep access until the end of the period you have paid for.
                </>,
                <>
                  <strong>Unpair</strong> from your partner in Settings. Section 4 explains what
                  happens to shared content.
                </>,
                <>
                  <strong>Delete your account</strong> in Settings. We action account deletion
                  within 30 days, as set out in the Privacy Policy.
                </>,
              ]}
            />
            <p>
              <strong>Deleting your account does not cancel your subscription.</strong> Billing sits
              with Apple or Google and we cannot cancel it for you, so cancel it separately in your
              app store settings.
            </p>
            <p>
              We may suspend or end your access if you breach these terms, or where we need to for
              legal or security reasons.
            </p>
          </Section>

          <Section n={16} title="Your rights under the Australian Consumer Law">
            <p>
              Nothing in these terms excludes, restricts or modifies any guarantee, right or remedy
              you have under the Australian Consumer Law that cannot lawfully be excluded.
            </p>
            <p>
              Our services come with guarantees that cannot be excluded under the Australian
              Consumer Law. For major failures with the service, you are entitled to cancel your
              service contract with us and to a refund for the unused portion, or to compensation
              for its reduced value. You are also entitled to be compensated for any other
              reasonably foreseeable loss or damage. If the failure does not amount to a major
              failure, you are entitled to have problems with the service rectified in a reasonable
              time and, if this is not done, to cancel your contract and obtain a refund for the
              unused portion of the contract.
            </p>
          </Section>

          <Section n={17} title="Disclaimers and liability">
            <p>
              Subject to section 16, the app is provided &quot;as is&quot; and &quot;as
              available&quot;. We do not warrant that it will be error free, uninterrupted, or that
              it will meet your particular requirements.
            </p>
            <p>
              To the extent permitted by law, we are not liable for indirect, incidental, special or
              consequential loss, loss of profits or opportunity, or loss arising from a missed
              appointment or event, an inaccurate or delayed calendar sync, a notification that was
              late or not delivered, or the acts of your partner or any other person you share with.
            </p>
            <p>
              Where our liability cannot be excluded but can be limited, it is limited, at our
              option, to resupplying the service or paying the cost of having it resupplied.
              Otherwise, our total liability to you is capped at the greater of the amount you paid
              us in the 12 months before the claim and AUD $100.
            </p>
          </Section>

          <Section n={18} title="Changes to these terms">
            <p>
              We may update these terms. Where a change materially affects your rights, we will tell
              you in the app or by email at least 14 days before it takes effect, unless the change
              is needed urgently for legal or security reasons.
            </p>
            <p>
              Continuing to use the app after the effective date means you accept the updated terms.
              If you do not accept them, stop using the app and cancel your subscription.
            </p>
          </Section>

          <Section n={19} title="Governing law">
            <p>
              These terms are governed by the laws of New South Wales, Australia. You and we submit
              to the non-exclusive jurisdiction of the courts of New South Wales.
            </p>
          </Section>

          <Section n={20} title="Contact">
            <p>
              Questions about these terms? Email{" "}
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

      <LegalFooter current="/terms" />
    </>
  );
}
