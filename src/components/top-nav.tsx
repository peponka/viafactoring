import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui";
import { DesktopNavLinks, MobileTabBar, type NavLink } from "@/components/nav-links";
import { InstalarApp } from "@/components/pwa";

export function TopNav({
  nombre,
  links,
  rightSlot,
  logoHref = "/",
}: {
  nombre: string;
  logoHref?: string;
  links: NavLink[];
  rightSlot?: React.ReactNode;
}) {
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <>
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link href={logoHref} aria-label="ViaFactoring, inicio">
              <Logo />
            </Link>
            <DesktopNavLinks links={links} />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {rightSlot}
            <span
              aria-hidden="true"
              className="hidden sm:flex w-9 h-9 rounded-full bg-ink text-white items-center justify-center text-sm font-semibold"
            >
              {inicial}
            </span>
            <span className="text-sm font-medium text-ink-soft hidden lg:inline max-w-[16ch] truncate">
              {nombre}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-sm font-semibold text-ink-soft hover:text-critical min-h-11 px-2"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      {links.length > 1 && links.length <= 5 && <MobileTabBar links={links} />}
      {links.length > 1 && links.length <= 5 && <InstalarApp />}
      {links.length > 5 && (
        <nav
          aria-label="Secciones"
          className="md:hidden border-b border-line bg-background overflow-x-auto"
        >
          <div className="flex gap-1 px-4 py-2 w-max">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm font-semibold text-ink-soft px-3 py-2 rounded-full whitespace-nowrap hover:bg-surface-2"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
