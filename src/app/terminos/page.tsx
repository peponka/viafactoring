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
            className="flex items-center gap-2.5 font-serif font-semibold text-xl"
          >
            <span className="w-8 h-8 rounded-lg bg-accent text-accent-ink flex items-center justify-center font-mono text-sm">
              Vf
            </span>
            ViaFactoring
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
          <p className="text-ink-soft text-sm mb-10">
            Última actualización: septiembre de 2026. Este es un texto
            general para la etapa piloto de la plataforma; no reemplaza el
            asesoramiento de un abogado.
          </p>

          <div className="flex flex-col gap-7 text-sm text-ink-soft">
            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                1. Qué es ViaFactoring
              </h2>
              <p>
                ViaFactoring es un marketplace que conecta a quienes tienen
                facturas pendientes de cobro con fondeadores (financieras,
                bancos, fondos e inversores) interesados en adelantarles ese
                cobro. ViaFactoring facilita el contacto y la negociación
                entre ambas partes a través de un Deal Room por operación.
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
                4. Tarifa de desbloqueo
              </h2>
              <p>
                Los fondeadores pueden ver el monto y el vencimiento de cada
                factura sin costo. Para acceder al deudor, la documentación
                y el Deal Room de la operación (chat y ofertas), el
                fondeador paga una tarifa de desbloqueo cuyo valor depende
                del monto de la factura y se muestra antes de confirmar el
                pago. Esta tarifa no es reembolsable una vez confirmado el
                acceso, incluso si el adelanto finalmente no se concreta
                entre las partes.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                5. Comisión de cierre y contacto directo
              </h2>
              <p>
                Cuando el operador acepta una oferta, el fondeador paga a
                ViaFactoring una comisión de cierre fija, cuyo valor depende
                del monto de la factura y se informa antes de pagarla. Al
                confirmarse ese pago se habilitan los datos de contacto
                directo de las partes para formalizar la operación. Las
                partes se comprometen a no usar la información obtenida en
                la plataforma para cerrar la operación por fuera de ella.
              </p>
            </section>

            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-2">
                6. Responsabilidad
              </h2>
              <p>
                ViaFactoring no evalúa el riesgo crediticio de los deudores
                ni garantiza el cobro de ninguna factura. Cada fondeador es
                responsable de su propia evaluación antes de pagar la
                tarifa de desbloqueo o de acordar un adelanto.
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
