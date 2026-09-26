import "server-only";
import { createHash } from "node:crypto";
import type { EstadoConsultado, PaymentProvider, WebhookVerificado } from "./tipos";

// Adaptador de Pagopar, armado según su documentación pública:
//   https://soporte.pagopar.com/portal/es/kb/articles/api-integracion-medios-pagos
//   https://cdn.pagopar.com/assets/documentos/Documentacion_Pagopar.pdf
// BLOQUEO EXTERNO: sin credenciales de comercio no se pudo probar contra su
// sandbox. Endpoints, tokens y el formato del aviso deben validarse con la
// cuenta real antes de activar PAYMENT_PROVIDER=pagopar.

const API = "https://api.pagopar.com/api";

function claves() {
  const publica = process.env.PAGOPAR_PUBLIC_KEY;
  const privada = process.env.PAGOPAR_PRIVATE_KEY;
  if (!publica || !privada) throw new Error("Faltan PAGOPAR_PUBLIC_KEY / PAGOPAR_PRIVATE_KEY");
  return { publica, privada };
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

// id numérico estable a partir del id de la orden (Pagopar pide un entero)
function idPedido(requestId: string) {
  return parseInt(requestId.replace(/-/g, "").slice(0, 12), 16);
}

export const pagoparProvider: PaymentProvider = {
  nombre: "pagopar",

  async crearOrden(orden) {
    const { publica, privada } = claves();
    const id = idPedido(orden.requestId);
    const monto = Math.round(orden.monto);
    const vence = new Date(orden.venceAt).toISOString().replace("T", " ").slice(0, 19);
    const res = await fetch(`${API}/comercios/1.1/iniciar-transaccion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: sha1(privada + "VENTA-COMERCIO"),
        public_key: publica,
        id_pedido_comercio: id,
        monto_total: monto,
        tipo_pedido: "VENTA-COMERCIO",
        fecha_maxima_pago: vence,
        descripcion_resumen: orden.descripcion,
        comprador: {
          nombre: orden.comprador.nombre,
          email: orden.comprador.email,
          ciudad_id: 1, // A CONFIRMAR con Pagopar
        },
        compras_items: [
          {
            nombre: orden.descripcion,
            cantidad: 1,
            precio_total: monto,
            ciudad_id: 1,
            categoria: "909",
            producto_id: id,
          },
        ],
      }),
    });
    const json = (await res.json()) as { respuesta?: boolean; resultado?: { data?: string }[] };
    const hash = json.resultado?.[0]?.data;
    if (!res.ok || !json.respuesta || !hash) {
      throw new Error("Pagopar no aceptó la orden");
    }
    return { providerRef: hash, checkoutUrl: `https://www.pagopar.com/pagos/${hash}` };
  },

  async verificarWebhook(rawBody): Promise<WebhookVerificado> {
    const { privada } = claves();
    let body: { resultado?: Record<string, unknown>[] } = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { valido: false, dedupeKey: sha1(rawBody), providerRef: null, estado: null, monto: null, moneda: null, payload: {} };
    }
    const r = body.resultado?.[0] ?? {};
    const hash = String(r.hash_pedido ?? "");
    const valido = !!hash && r.token === sha1(privada + hash);
    const pagado = r.pagado === true || r.pagado === "true";
    const cancelado = r.cancelado === true || r.cancelado === "true";
    const estado = pagado ? "confirmado" : cancelado ? "rechazado" : "procesando";
    return {
      valido,
      dedupeKey: `${hash}:${estado}`,
      providerRef: hash || null,
      estado,
      monto: r.monto != null ? Number(r.monto) : null,
      moneda: "PYG",
      payload: body as Record<string, unknown>,
      // Pagopar espera que se le devuelva el mismo `resultado`
      respuesta: body.resultado,
    };
  },

  async consultarEstado(providerRef): Promise<EstadoConsultado | null> {
    const { publica, privada } = claves();
    const res = await fetch(`${API}/pedidos/1.1/traer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash_pedido: providerRef, token: sha1(privada + "CONSULTA"), token_publico: publica }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { respuesta?: boolean; resultado?: Record<string, unknown>[] };
    const r = json.resultado?.[0];
    if (!json.respuesta || !r) return null;
    const pagado = r.pagado === true || r.pagado === "true";
    const cancelado = r.cancelado === true || r.cancelado === "true";
    return {
      estado: pagado ? "confirmado" : cancelado ? "rechazado" : "procesando",
      monto: r.monto != null ? Number(r.monto) : null,
      moneda: "PYG",
    };
  },

  // BLOQUEO EXTERNO: la documentación pública no describe devoluciones por
  // API. Se hacen desde el panel de Pagopar y el admin lo registra acá.
  async devolver() {
    return { ok: false, detalle: "Devolver desde el panel de Pagopar y registrar la devolución." };
  },
};
