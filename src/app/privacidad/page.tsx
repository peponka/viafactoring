import { Logo } from "@/components/ui";
import Link from "next/link";

export const metadata = {
  title: "Privacidad — ViaFactoring",
};

export default function PrivacidadPage() {
  return (
    <main className="flex-1">
      <div className="wrap max-w-3xl mx-auto px-6">
        <nav className="flex items-center justify-between py-6">
          <Link
            href="/"
            className="flex items-center"
          >
            <Logo size="lg" />
          </Link>
          <Link
            href="/"
            className="text-sm font-semibold text-ink-soft hover:text-ink"
          >
            Volver al inicio
          </Link>
        </nav>

        <div className="py-10">
          <h1 className="text-3xl font-semibold mb-2">Privacidad</h1>
          <p className="text-ink-soft text-sm mb-4">
            Última actualización: octubre de 2026.
          </p>
          <div className="mb-10 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
            <span className="mr-2 inline-block rounded-full bg-warn px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
              Beta
            </span>
            Esta versión de la política corresponde a la etapa beta de ViaFactoring y todavía
            está en revisión legal. Puede cambiar antes del lanzamiento
            definitivo; te vamos a avisar si hay cambios importantes. No
            reemplaza el asesoramiento de un abogado.
          </div>

          <div className="flex flex-col gap-7 text-sm text-ink-soft">
            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                1. Qué datos recolectamos
              </h2>
              <p>
                Datos de la cuenta (nombre, email, rol), los datos de cada
                factura que un operador publica (monto, vencimiento, deudor,
                contacto y, si corresponde, el documento adjunto), los
                mensajes, ofertas y documentos que se comparten en cada Deal
                Room, los registros de pagos de tarifas y comisiones, y un
                registro de actividad (por ejemplo, quién vio o descargó
                cada documento).
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                2. Para qué los usamos
              </h2>
              <p>
                Para mostrar la cartera de facturas disponibles, habilitar
                el Deal Room de una factura al fondeador que confirmó su
                pago, llevar la trazabilidad de cada negociación, y para
                gestionar las cuentas y comunicarnos con los
                usuarios sobre su uso de la plataforma.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                3. Qué se muestra en cada etapa
              </h2>
              <p>
                En el feed, un fondeador verificado solo ve el monto, el
                plazo y datos generales de la operación. El nombre del
                deudor y la documentación se muestran recién cuando marca
                interés en esa factura. Los teléfonos y emails de las partes se habilitan
                solo cuando se confirma el pago del acceso a los datos de contacto. Los
                documentos descargados llevan una marca de agua con el
                nombre de quien los descargó.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                4. Con quién compartimos datos
              </h2>
              <p>
                No vendemos datos de usuarios a terceros. Los datos de una
                factura se comparten únicamente con fondeadores verificados
                que marcaron interés en esa factura en particular, y los
                datos de contacto solo cuando se cierra el acuerdo. Para
                armar la ficha de verificación consultamos fuentes públicas
                (por ejemplo, contrataciones públicas de la DNCP) y un
                servicio de inteligencia artificial que procesa los datos de
                la factura.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                5. Tus derechos
              </h2>
              <p>
                Podés pedirnos en cualquier momento acceder, corregir o
                eliminar tus datos, o retirar una factura publicada,
                escribiéndonos a{" "}
                <a
                  href="mailto:contacto@viafactoring.com.py"
                  className="text-accent font-semibold"
                >
                  contacto@viafactoring.com.py
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                6. Cambios
              </h2>
              <p>
                Estamos en etapa piloto y esta política puede actualizarse a
                medida que crece la plataforma. Los cambios relevantes se
                van a reflejar en esta página.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
