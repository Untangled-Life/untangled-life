import Link from "next/link";

const PAGES = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/cookies", label: "Cookie policy" },
  { href: "/terms", label: "Terms of service" },
] as const;

/**
 * The footer on the three legal pages.
 *
 * Each of them used to carry nothing but a link home, so reading the privacy
 * policy and then wanting the terms meant going back to the front page and
 * hunting for the link. People arrive at these pages from an app store listing
 * or a consent screen rather than from the site, so the other two have to be
 * reachable from wherever they land.
 *
 * The page you are on is shown but not linked, so the row still says what else
 * exists without offering you a link to where you already are.
 */
export function LegalFooter({ current }: { current: "/privacy" | "/cookies" | "/terms" }) {
  return (
    <footer className="border-t border-border px-6 py-8 text-center">
      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px]">
        {PAGES.map((page) =>
          page.href === current ? (
            <span key={page.href} className="text-text-secondary">
              {page.label}
            </span>
          ) : (
            <Link
              key={page.href}
              href={page.href}
              className="text-text-muted underline underline-offset-2 hover:text-text-secondary"
            >
              {page.label}
            </Link>
          )
        )}
      </p>
      <Link
        href="/"
        className="mt-4 inline-block text-[13px] text-text-muted hover:text-text-secondary"
      >
        untangledlife.com.au
      </Link>
    </footer>
  );
}
