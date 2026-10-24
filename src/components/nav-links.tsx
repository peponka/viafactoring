"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };

const ICONS: Record<string, React.ReactNode> = {
  feed: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12z" />,
  doc: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  plus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
};

function iconFor(href: string) {
  if (href.includes("deal-rooms")) return ICONS.chat;
  if (href.endsWith("/nueva")) return ICONS.plus;
  if (href.includes("preferencias")) return ICONS.sliders;
  if (href.includes("perfil")) return ICONS.user;
  if (href.startsWith("/admin")) return ICONS.shield;
  if (href === "/operador") return ICONS.doc;
  return ICONS.feed;
}

function isActive(pathname: string, href: string, all: NavLink[]) {
  if (pathname === href) return true;
  // Un link "raíz" (/fondeador) solo queda activo si ningún otro link más
  // específico coincide con la ruta actual.
  if (!pathname.startsWith(href + "/")) return false;
  return !all.some((l) => l.href !== href && l.href.startsWith(href) && pathname.startsWith(l.href));
}

export function DesktopNavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = isActive(pathname, l.href, links);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`text-sm font-semibold px-3.5 py-2 rounded-full transition ${
              active ? "bg-accent-soft text-accent" : "text-ink-soft hover:text-ink hover:bg-surface-2"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTabBar({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <div
        className="grid px-2 pt-1.5 pb-2"
        style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
      >
        {links.map((l) => {
          const active = isActive(pathname, l.href, links);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`min-h-13 flex flex-col items-center justify-center gap-1 rounded-xl ${
                active ? "text-accent" : "text-ink-soft"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {iconFor(l.href)}
              </svg>
              <span className={`text-[11px] leading-none ${active ? "font-bold" : "font-semibold"}`}>
                {l.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
