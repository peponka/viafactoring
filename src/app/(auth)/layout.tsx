import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="ViaFactoring, inicio">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-sm font-semibold text-ink-soft hover:text-ink min-h-11 flex items-center"
          >
            Volver al inicio
          </Link>
        </div>
      </header>
      <div className="flex-1 anim-in">{children}</div>
    </>
  );
}
