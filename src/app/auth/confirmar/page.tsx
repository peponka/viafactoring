import { Card, LinkButton } from "@/components/ui";

export default function ConfirmarPage() {
  return (
    <main className="wrap max-w-md mx-auto py-20 flex-1 w-full px-6 text-center">
      <Card>
        <h1 className="text-2xl font-semibold mb-3">Revisá tu email</h1>
        <p className="text-ink-soft mb-6">
          Te mandamos un link de confirmación. Una vez que confirmes tu
          cuenta, ya podés iniciar sesión.
        </p>
        <LinkButton href="/login">Ir a iniciar sesión</LinkButton>
      </Card>
    </main>
  );
}
