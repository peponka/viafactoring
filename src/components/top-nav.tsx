import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";

export function TopNav({
  nombre,
  links,
  rightSlot,
}: {
  nombre: string;
  links: { href: string; label: string }[];
  rightSlot?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line">
      <div className="wrap max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-serif font-semibold text-lg"
          >
            <span className="w-7 h-7 rounded-lg bg-accent text-accent-ink flex items-center justify-center font-mono text-xs">
              Vf
            </span>
            ViaFactoring
          </Link>
          <nav className="flex items-center gap-5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-ink-soft hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {rightSlot}
          <span className="text-sm text-ink-soft hidden sm:inline">
            {nombre}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-ink-soft hover:text-critical"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
