import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { pasarelaActiva, pasarelaPorNombre } from "./index";
import { siteUrl } from "./sitio";

// Flujo de pagos de ViaFactoring (solo sus tarifas):
//  1. iniciarPago: la base calcula y congela el monto (preparar_pago), la
//     pasarela crea la orden y el servidor guarda su referencia.
//  2. procesarWebhook: se guarda el aviso, se verifica la firma, se
//     confirma el estado consultando a la pasarela y recién ahí la base
//     aplica el resultado (abre el Deal Room o libera el contacto).
// Nada de lo que manda el navegador decide montos, usuarios ni estados.

export type ResultadoInicio =
  | { ok: true; url: string }
  | { ok: true; esperando: true }
  | { ok: false; error: string };

export async function iniciarPago(tipo: "desbloqueo" | "comision", ref: string): Promise<ResultadoInicio> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Iniciá sesión para continuar." };

  const admin = createServiceRoleClient();
  const { data: orden, error } = await supabase.rpc("preparar_pago", { p_tipo: tipo, p_ref: ref });

  if (error || !orden) {
    const mensaje = error?.message ?? "No se pudo preparar el pago.";
    if (mensaje.includes("SIN_TIPO_CAMBIO")) {
      await admin.rpc("abrir_excepcion", {
        p_tipo: "sin_tipo_cambio",
        p_detalle: "Un fondeador no pudo pagar porque no hay cotización USD/PYG vigente.",
        p_invoice_id: tipo === "desbloqueo" ? ref : null,
        p_reveal_id: tipo === "comision" ? ref : null,
        p_user_id: user.id,
      });
      return { ok: false, error: "El pago no está disponible en este momento. Probá de nuevo en unos minutos." };
    }
    return { ok: false, error: mensaje };
  }

  if (orden.estado === "procesando") return { ok: true, esperando: true };
  if (orden.provider_ref && orden.checkout_url) return { ok: true, url: orden.checkout_url };

  const pasarela = pasarelaActiva();
  if (!pasarela) {
    await admin.rpc("abrir_excepcion", {
      p_tipo: "error_tecnico",
      p_detalle: "Hay un pago pendiente pero no hay pasarela configurada (PAYMENT_PROVIDER).",
      p_payment_request_id: orden.id,
      p_invoice_id: orden.invoice_id,
      p_reveal_id: orden.reveal_id,
      p_user_id: user.id,
    });
    return { ok: false, error: "El pago en línea todavía no está habilitado. Ya avisamos al equipo." };
  }

  const { data: perfil } = await supabase.from("profiles").select("nombre, email").eq("id", user.id).single();
  const urlRetorno =
    tipo === "desbloqueo" ? `/fondeador/facturas/${ref}?pago=${orden.id}` : `/deal-room/${ref}?pago=${orden.id}`;

  try {
    const creada = await pasarela.crearOrden({
      requestId: orden.id,
      monto: Number(orden.monto_cobro),
      moneda: orden.moneda_cobro ?? "PYG",
      descripcion: tipo === "desbloqueo" ? "ViaFactoring · desbloqueo de oportunidad" : "ViaFactoring · comisión de cierre",
      venceAt: orden.expires_at ?? new Date(Date.now() + 86_400_000).toISOString(),
      urlRetorno: siteUrl() + urlRetorno,
      comprador: { nombre: perfil?.nombre ?? "Fondeador", email: perfil?.email ?? null },
    });
    const { data: registrada, error: errReg } = await admin.rpc("registrar_orden_proveedor", {
      p_request_id: orden.id,
      p_provider: pasarela.nombre,
      p_provider_ref: creada.providerRef,
      p_checkout_url: creada.checkoutUrl,
    });
    if (errReg || !registrada?.checkout_url) throw new Error(errReg?.message ?? "sin url");
    return { ok: true, url: registrada.checkout_url };
  } catch (e) {
    await admin.rpc("abrir_excepcion", {
      p_tipo: "error_tecnico",
      p_detalle: `La pasarela no pudo crear la orden: ${e instanceof Error ? e.message : "error"}`,
      p_payment_request_id: orden.id,
      p_invoice_id: orden.invoice_id,
      p_reveal_id: orden.reveal_id,
      p_user_id: user.id,
    });
    return { ok: false, error: "No pudimos conectar con la pasarela de pago. Probá de nuevo en unos minutos." };
  }
}

export type RespuestaWebhook = { status: number; body: unknown };

export async function procesarWebhook(nombre: string, rawBody: string, headers: Headers): Promise<RespuestaWebhook> {
  const pasarela = pasarelaPorNombre(nombre);
  if (!pasarela) return { status: 404, body: { error: "pasarela no activa" } };

  const admin = createServiceRoleClient();
  const v = await pasarela.verificarWebhook(rawBody, headers);

  // 1-4. Registrar primero (idempotente por dedupe_key) y verificar la firma
  const { data: reg, error: errReg } = await admin.rpc("registrar_evento_pago", {
    p_provider: pasarela.nombre,
    p_dedupe_key: v.dedupeKey,
    p_provider_ref: v.providerRef,
    p_estado: v.estado,
    p_monto: v.monto,
    p_moneda: v.moneda,
    p_firma_valida: v.valido,
    p_payload: v.payload,
  });
  if (errReg || !reg?.[0]) return { status: 500, body: { error: "no se pudo registrar" } };
  const evento = reg[0];

  if (!v.valido) return { status: 401, body: { error: "firma inválida" } };
  if (!evento.nuevo && evento.resultado) return { status: 200, body: v.respuesta ?? { ok: true, repetido: true } };
  if (!v.providerRef || !v.estado) return { status: 400, body: { error: "aviso incompleto" } };

  // 5-8. Doble chequeo: un "pagado" se confirma consultando a la pasarela
  let monto = v.monto;
  let moneda = v.moneda;
  if (v.estado === "confirmado") {
    const real = await pasarela.consultarEstado(v.providerRef);
    if (!real || real.estado !== "confirmado") {
      await admin.rpc("abrir_excepcion", {
        p_tipo: "pago_inconsistente",
        p_detalle: "El aviso dice pagado pero la pasarela no lo confirma al consultarla.",
        p_payment_event_id: evento.evento_id,
        p_datos: { provider_ref: v.providerRef, consultado: real?.estado ?? null },
      });
      await admin.from("payment_events").update({ resultado: "no_confirmado_por_pasarela", procesado_at: new Date().toISOString() }).eq("id", evento.evento_id);
      return { status: 200, body: v.respuesta ?? { ok: true } };
    }
    monto = real.monto ?? monto;
    moneda = real.moneda ?? moneda;
  }

  // 9-12. La base aplica la transición, el evento del chat, las
  // notificaciones y el audit log en una sola transacción.
  const { error } = await admin.rpc("aplicar_resultado_pago", {
    p_evento_id: evento.evento_id,
    p_provider: pasarela.nombre,
    p_provider_ref: v.providerRef,
    p_estado: v.estado,
    p_monto: monto,
    p_moneda: moneda,
  });
  if (error) {
    await admin.from("payment_events").update({ error: error.message }).eq("id", evento.evento_id);
    // 500 → la pasarela reintenta; el evento queda guardado para revisión
    return { status: 500, body: { error: "no se pudo aplicar" } };
  }
  return { status: 200, body: v.respuesta ?? { ok: true } };
}

// Órdenes sin aviso hace más de 10 minutos: se consulta su estado real.
export async function conciliarOrdenes(): Promise<number> {
  const pasarela = pasarelaActiva();
  if (!pasarela) return 0;
  const admin = createServiceRoleClient();
  const { data: ordenes } = await admin.rpc("ordenes_para_conciliar");
  let aplicadas = 0;
  for (const o of ordenes ?? []) {
    if (o.provider !== pasarela.nombre || !o.provider_ref) continue;
    const real = await pasarela.consultarEstado(o.provider_ref);
    if (!real || real.estado === "procesando" || real.estado === o.estado) continue;
    const { data: reg } = await admin.rpc("registrar_evento_pago", {
      p_provider: pasarela.nombre,
      p_dedupe_key: `conciliacion:${o.provider_ref}:${real.estado}`,
      p_provider_ref: o.provider_ref,
      p_estado: real.estado,
      p_monto: real.monto,
      p_moneda: real.moneda,
      p_firma_valida: true,
      p_payload: { origen: "consulta_de_estado" },
    });
    if (!reg?.[0]?.nuevo) continue;
    await admin.rpc("aplicar_resultado_pago", {
      p_evento_id: reg[0].evento_id,
      p_provider: pasarela.nombre,
      p_provider_ref: o.provider_ref,
      p_estado: real.estado,
      p_monto: real.monto,
      p_moneda: real.moneda,
    });
    aplicadas++;
  }
  return aplicadas;
}
