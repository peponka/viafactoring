import { Logo } from "@/components/ui";
import Link from "next/link";

export const metadata = {
  title: "Términos y condiciones — ViaFactoring",
};

export default function TerminosPage() {
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
          <h1 className="text-3xl font-semibold mb-2">
            Términos y condiciones
          </h1>
          <p className="text-ink-soft text-sm mb-4">
            Última actualización: octubre de 2026.
          </p>
          <div className="mb-10 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
            <span className="mr-2 inline-block rounded-full bg-warn px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
              Beta
            </span>
            Esta versión de los términos corresponde a la etapa beta de ViaFactoring y todavía
            está en revisión legal. Puede cambiar antes del lanzamiento
            definitivo; te vamos a avisar si hay cambios importantes. No
            reemplaza el asesoramiento de un abogado.
          </div>

          <div className="flex flex-col gap-7 text-sm text-ink-soft">
            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                1. Qué es ViaFactoring
              </h2>
              <p>
                ViaFactoring es una plataforma de información. Publica
                facturas pendientes de cobro, verificadas con controles
                automáticos, y datos públicos de las empresas involucradas,
                para que quienes tienen esas facturas y los fondeadores
                (inversores, empresas, cooperativas, financieras, bancos y
                fondos) cuenten con la información que necesitan para decidir
                por su cuenta. No es una entidad financiera, no presta, no
                capta ni administra fondos de terceros, no intermedia en la
                operación y no brinda asesoramiento financiero. Ofrece además
                un espacio de conversación por factura (Deal Room).
                No es parte del acuerdo de adelanto que operador y fondeador
                cierran entre sí, no recibe ni administra el dinero del
                anticipo —que el fondeador transfiere directamente al
                operador— ni garantiza el resultado de esa negociación.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                2. Cuentas y uso de la plataforma
              </h2>
              <p>
                Para publicar facturas o acceder al detalle completo de una
                operación es necesario crear una cuenta con datos veraces.
                Cada usuario es responsable de la información que carga y de
                mantener segura su contraseña.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                3. Publicar facturas
              </h2>
              <p>
                Publicar y mantener facturas en la plataforma es gratuito
                para los operadores. El operador declara ser el titular
                legítimo del crédito que publica y es responsable de la
                veracidad de los datos y la documentación que carga.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                4. Fondeadores: categorías, verificación e interés
              </h2>
              <p>
                Los fondeadores se registran en una categoría (inversor
                individual, empresa o family office, cooperativa, financiera,
                banco, o fondo de inversión o casa de bolsa) y envían documentación que
                ViaFactoring revisa antes de habilitar la cuenta. Cada
                categoría tiene un rango de montos por factura. Marcar
                interés en una factura no tiene costo: da acceso al deudor,
                la documentación, la ficha de verificación y la sala de
                negociación de esa operación.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                5. Acceso a los datos de contacto
              </h2>
              <p>
                Los datos de contacto de las partes (teléfono, email y la
                factura completa) son información paga. Cuando el operador
                acepta una oferta, el fondeador paga a ViaFactoring el cargo
                por acceso a esos datos, cuyo valor depende del monto de la
                factura y se informa antes de ofertar. Al confirmarse el pago
                se habilitan los datos de contacto de ambas partes. Las
                partes se comprometen a no usar la información obtenida en
                la plataforma para cerrar la operación por fuera de ella.
              </p>
              <p className="mt-2">
                Antes de ese pago no se pueden compartir teléfonos, WhatsApp,
                emails, redes sociales, links ni otros datos para contactarse
                por fuera. ViaFactoring oculta automáticamente esos datos en
                los mensajes y en las ofertas, y puede suspender o dar de
                baja la cuenta de quien insista en compartirlos. Si las
                partes cierran por fuera una operación que se originó en la
                plataforma, el cargo por acceso a los datos se debe igual.
              </p>
              <p className="mt-2">
                Si después de pagado el acceso la PyME no responde en 48
                horas (ni por mensaje ni confirmando la transferencia), el
                fondeador puede pedir la devolución desde la negociación.
                ViaFactoring revisa el caso y, si corresponde, devuelve el
                cargo por el mismo medio de pago.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                6. Responsabilidad
              </h2>
              <p>
                ViaFactoring no evalúa el riesgo crediticio de los deudores,
                no recomienda operaciones ni garantiza el cobro de ninguna
                factura. La ficha de verificación muestra datos recopilados
                automáticamente, que pueden estar incompletos o desactualizados,
                y no constituye una recomendación. Cada fondeador es
                responsable de su propia evaluación antes de acordar un
                adelanto.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                7. Cambios en el servicio
              </h2>
              <p>
                ViaFactoring está en etapa piloto y puede modificar estas
                condiciones, sus tarifas o sus funcionalidades. Los cambios
                relevantes se van a reflejar en esta página.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                8. Contacto
              </h2>
              <p>
                Consultas sobre estos términos:{" "}
                <a
                  href="mailto:contacto@viafactoring.com.py"
                  className="text-accent font-semibold"
                >
                  contacto@viafactoring.com.py
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
