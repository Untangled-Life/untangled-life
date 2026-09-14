import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Cookie Policy - Untangled Life",
  description:
    "What this website and the Untangled Life app store in your browser and on your phone: no cookies, no analytics, and only the small amount of on-device storage the app needs to work.",
};

const LAST_UPDATED = "14 September 2026";

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

export default function Cookies() {
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
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Cookie Policy</h1>
          <p className="mt-3 text-[14px] text-text-muted">Last updated {LAST_UPDATED}</p>

          <p className="mt-6 text-[15px] leading-7 text-text-secondary">
            Most cookie policies are long because most websites set a lot of cookies. This one is
            short because we set none. It explains what cookies are, confirms what this website
            does and does not store in your browser, and covers the small amount of information
            the Untangled Life app keeps on your phone so that it works.
          </p>

          <div className="mt-6 rounded-xl border border-brand-green/30 bg-brand-green/5 p-5">
            <p className="text-[15px] font-medium text-text-primary">The short version</p>
            <ul className="mt-3 ml-5 list-disc space-y-2 text-[15px] leading-7 text-text-secondary">
              <li>This website sets no cookies of any kind.</li>
              <li>
                There is no analytics, no advertising and no tracking, on the website or in the
                app.
              </li>
              <li>
                The app keeps you signed in and remembers your theme by storing a few settings on
                your phone. They stay on your phone, and deleting the app removes them.
              </li>
            </ul>
          </div>

          <Section n={1} title="What cookies are">
            <p>
              Cookies are small text files a website stores on your device so that it can
              recognise you between pages or between visits. Browsers offer similar tools, such as
              local storage and session storage, which websites use for the same purposes. This
              policy covers all of them. Cookies are commonly used to keep you signed in, to
              remember preferences, and, on many sites, to track what you do for analytics or
              advertising.
            </p>
          </Section>

          <Section n={2} title="Cookies on this website">
            <p>
              untangledlife.com.au does not set any cookies, and it does not write anything to
              local storage or session storage. There is nothing to accept or decline, which is
              why you have not seen a cookie banner.
            </p>
            <p>In particular:</p>
            <Bullets
              items={[
                <>
                  <strong>No analytics cookies.</strong> We do not use Google Analytics, Mixpanel,
                  Plausible or any other analytics service. We do not measure how you use the site
                  and we do not know which pages you have visited.
                </>,
                <>
                  <strong>No advertising or tracking cookies.</strong> There are no ad network tags,
                  no social media pixels and no cross-site tracking of any description.
                </>,
                <>
                  <strong>No sign-in cookies.</strong> The website has no account or login. The app
                  is where you sign in, and that is covered in section 4.
                </>,
                <>
                  <strong>No preference cookies.</strong> The website follows your browser&apos;s
                  light or dark setting and does not need to remember anything to do that.
                </>,
              ]}
            />
            <p>
              Joining the waitlist sends the name and email you type straight to our server. That
              request does not set a cookie, and the site does not remember afterwards that you
              signed up.
            </p>
          </Section>

          <Section n={3} title="Third parties">
            <p>
              The website is hosted by Vercel, and the waitlist is stored by Supabase. Neither
              places cookies in your browser on our behalf when you visit this site. We embed no
              third-party widgets, videos, fonts served from tracking networks, or social media
              buttons, so no other company has the opportunity to set a cookie here.
            </p>
            <p>
              Our hosting provider keeps short-lived connection logs, including IP addresses, to
              detect abuse and diagnose faults. That happens on the server, not in your browser,
              and is described in our{" "}
              <Link href="/privacy" className="text-brand-green underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
          </Section>

          <Section n={4} title="What the app stores on your phone">
            <p>
              The Untangled Life app is not a website, and it does not use cookies. It does keep a
              small amount of information on your phone so that it works the way you expect. None
              of it is used to track you, and none of it is shared with anyone.
            </p>
            <Bullets
              items={[
                <>
                  <strong>Your sign-in session.</strong> A token from our authentication provider
                  that keeps you signed in so you do not have to enter your password every time you
                  open the app. It is stored in the app&apos;s private storage on your phone and is
                  removed when you sign out.
                </>,
                <>
                  <strong>Your appearance settings.</strong> Whether you have chosen light, dark or
                  system appearance, and which accent colour you picked. These are stored on the
                  device only, which is why they do not follow you to a second phone.
                </>,
              ]}
            />
            <p>
              Everything else you set up, such as your working hours, calendar sharing levels and
              the layout of your home screen, is stored in your account so that both of your
              devices agree. That information is covered by the Privacy Policy, not this one.
            </p>
            <p>
              The app contains no analytics or advertising software, so there is no advertising
              identifier collected and no usage tracking. Deleting the app deletes everything it
              stored on your phone.
            </p>
          </Section>

          <Section n={5} title="Managing cookies">
            <p>
              Because this site sets no cookies, there is nothing of ours to manage. If you would
              like to control cookies from other sites, every major browser lets you view, block or
              delete them:
            </p>
            <Bullets
              items={[
                <>
                  <strong>Chrome:</strong> Settings, then Privacy and security, then Third-party
                  cookies or Site settings.
                </>,
                <>
                  <strong>Safari:</strong> Settings, then Privacy. On iPhone: Settings, then Apps,
                  then Safari.
                </>,
                <>
                  <strong>Firefox:</strong> Settings, then Privacy &amp; Security.
                </>,
                <>
                  <strong>Edge:</strong> Settings, then Cookies and site permissions.
                </>,
              ]}
            />
            <p>
              Blocking all cookies in your browser will not affect this website, because it does
              not rely on any.
            </p>
          </Section>

          <Section n={6} title="If this changes">
            <p>
              If we ever add a cookie or a similar technology, whether for a web version of the app,
              for sign-in on this site, or for analytics, we will list it here with what it does and
              how long it lasts, update the date at the top of this page, and, where the law
              requires it, ask for your consent before it is set. We will not add advertising or
              cross-site tracking cookies.
            </p>
          </Section>

          <Section n={7} title="Contact">
            <p>
              Questions about cookies or about what the app stores? Email{" "}
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

      <LegalFooter current="/cookies" />
    </>
  );
}
