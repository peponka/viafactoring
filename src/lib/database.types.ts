// Hand-written types matching supabase/migrations/0001-0012.
// Once the Supabase project is live, you can regenerate the authoritative
// version with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
//
// NOTE: these are declared with `type`, not `interface`, on purpose — an
// `interface` has no implicit index signature, so it fails the
// `extends Record<string, unknown>` check supabase-js's generic types rely
// on internally (silently collapsing every query result to `never`).

export type Rol = "operador" | "fondeador" | "admin";
export type Rubro = string;
export type Riesgo = "bajo" | "medio" | "alto";
export type EstadoFactura = "disponible" | "cerrada" | "retirada";
export type TipoTransaccion =
  | "bienvenida"
  | "compra"
  | "consumo"
  | "ajuste_admin";
export type EstadoPago =
  | "pendiente"
  | "procesando"
  | "confirmado"
  | "fallido"
  | "rechazado"
  | "vencido"
  | "devuelto"
  | "cancelado";
export type EstadoOferta =
  | "pendiente"
  | "aceptada"
  | "rechazada"
  | "reemplazada"
  | "cancelada"
  | "expirada";
export type EstadoDealRoom =
  | "open"
  | "negotiating"
  | "offer_accepted"
  | "closing"
  | "closed"
  | "cancelled";
export type RolDealRoom = "fondeador" | "operador";
export type TipoMensaje =
  | "mensaje"
  | "pregunta"
  | "solicitud"
  | "respuesta"
  | "sistema";
export type TipoDocumento =
  | "factura"
  | "factura_tapada"
  | "remito"
  | "contrato"
  | "certificado"
  | "otro";
export type TipoPago = "creditos" | "comision" | "desbloqueo";

export type Profile = {
  id: string;
  role: Rol;
  nombre: string;
  empresa: string | null;
  telefono: string | null;
  email: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  operador_id: string;
  numero: string | null;
  rubro: Rubro;
  deudor_nombre: string;
  deudor_contacto: string | null;
  monto: number;
  moneda: string;
  plazo_dias: number;
  fecha_vencimiento: string | null;
  riesgo: Riesgo;
  descripcion: string | null;
  documento_url: string | null;
  operador_contacto: string | null;
  estado: EstadoFactura;
  created_at: string;
  industry_id: string | null;
  industry_data: Record<string, unknown>;
  ubicacion: string | null;
};

export type InvoiceTeaser = {
  id: string;
  rubro: Rubro;
  monto: number;
  moneda: string;
  plazo_dias: number;
  fecha_vencimiento: string | null;
  monto_banda: string;
  plazo_banda: string;
  riesgo: Riesgo;
  descripcion: string | null;
  estado: EstadoFactura;
  created_at: string;
  unlock_fee: number;
  ya_revelada: boolean;
  industry_id: string | null;
  industria_slug: string | null;
  industria_nombre: string | null;
  industria_padre_nombre: string | null;
  industry_data_publica: Record<string, unknown>;
  ubicacion: string | null;
};

export type FondeadorCredit = {
  fondeador_id: string;
  balance: number;
  updated_at: string;
};

export type CreditTransaction = {
  id: string;
  fondeador_id: string;
  tipo: TipoTransaccion;
  cantidad: number;
  invoice_id: string | null;
  admin_note: string | null;
  created_by: string | null;
  created_at: string;
};

export type CreditPack = {
  id: string;
  nombre: string;
  cantidad_creditos: number;
  precio: number;
  moneda: string;
  activo: boolean;
  created_at: string;
};

export type PaymentRequest = {
  id: string;
  fondeador_id: string;
  pack_id: string | null;
  monto: number;
  moneda: string;
  estado: EstadoPago;
  payment_link: string | null;
  metodo: string | null;
  external_reference: string | null;
  tipo: TipoPago;
  offer_id: string | null;
  invoice_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  provider: string | null;
  provider_ref: string | null;
  checkout_url: string | null;
  expires_at: string | null;
  paid_at: string | null;
  reveal_id: string | null;
  monto_usd: number | null;
  moneda_cobro: string | null;
  monto_cobro: number | null;
  tipo_cambio: number | null;
  tipo_cambio_fecha: string | null;
  updated_at: string;
};

export type Offer = {
  id: string;
  invoice_id: string;
  fondeador_id: string;
  monto_ofrecido: number;
  mensaje: string | null;
  estado: EstadoOferta;
  created_at: string;
  respondida_at: string | null;
  reveal_id: string | null;
  parent_offer_id: string | null;
  autor_rol: RolDealRoom;
  con_recurso: boolean | null;
  notifica_deudor: boolean | null;
  fecha_pago_prevista: string | null;
  fondos_enviados_at: string | null;
  fondos_recibidos_at: string | null;
  expira_at: string | null;
};

export type Reveal = {
  id: string;
  invoice_id: string;
  fondeador_id: string;
  revealed_at: string;
  contactado: boolean;
  bitacora: string | null;
  estado: EstadoDealRoom;
  checklist: ChecklistItem[];
  contacto_liberado_at: string | null;
  cerrado_at: string | null;
  cancelado_motivo: string | null;
  ultima_actividad_at: string;
  comision_vence_at: string | null;
};

export type ChecklistItem = {
  key: string;
  label: string;
  auto: boolean;
  hecho: boolean;
  hecho_at?: string | null;
  hecho_por?: string | null;
};

export type Message = {
  id: string;
  reveal_id: string;
  invoice_id: string;
  autor_id: string | null;
  autor_rol: RolDealRoom | "sistema";
  tipo: TipoMensaje;
  cuerpo: string;
  reply_to: string | null;
  document_id: string | null;
  solicitud_estado: "abierta" | "resuelta" | null;
  contacto_detectado: boolean;
  patrones: string[];
  meta: MessageMeta;
  leido_at: string | null;
  created_at: string;
};

// Tarjetas del chat: el mensaje del sistema dice qué representa y apunta al
// registro real (la oferta o el pago siguen siendo la fuente de verdad).
export type MessageMeta = {
  kind?:
    | "desbloqueo"
    | "oferta"
    | "oferta_aceptada"
    | "oferta_rechazada"
    | "oferta_vencida"
    | "comision"
    | "pago_fallido"
    | "comision_vencida"
    | "contacto"
    | "desembolso"
    | "fin"
    | "cerrada"
    | "reabierta";
  offer_id?: string;
  payment_request_id?: string;
  autor_rol?: RolDealRoom;
  lado?: "envio" | "recepcion";
};

export type Notification = {
  id: string;
  user_id: string;
  reveal_id: string | null;
  message_id: string | null;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  accion_label: string;
  url: string;
  cantidad: number;
  leida_at: string | null;
  email_estado: "pendiente" | "enviado" | "omitido" | "error";
  created_at: string;
  updated_at: string;
};

export type NotificationPrefs = {
  user_id: string;
  email: boolean;
  whatsapp: boolean;
  whatsapp_numero: string | null;
  updated_at: string;
};

export type TipoExcepcion =
  | "pago_inconsistente"
  | "webhook_invalido"
  | "orden_desconocida"
  | "pago_sin_aviso"
  | "pago_duplicado"
  | "sin_tipo_cambio"
  | "reclamo"
  | "error_tecnico";

export type ExceptionRow = {
  id: string;
  tipo: TipoExcepcion;
  estado: "abierta" | "resuelta" | "descartada";
  reveal_id: string | null;
  invoice_id: string | null;
  payment_request_id: string | null;
  payment_event_id: string | null;
  user_id: string | null;
  detalle: string;
  datos: Record<string, unknown>;
  resolucion: string | null;
  resuelta_por: string | null;
  resuelta_at: string | null;
  created_at: string;
};

export type PaymentEvent = {
  id: string;
  provider: string;
  dedupe_key: string;
  provider_ref: string | null;
  estado_informado: string | null;
  monto: number | null;
  moneda: string | null;
  firma_valida: boolean;
  payload: Record<string, unknown>;
  payment_request_id: string | null;
  resultado: string | null;
  error: string | null;
  recibido_at: string;
  procesado_at: string | null;
};

export type FxRate = {
  fecha: string;
  moneda: "USD";
  pyg_por_unidad: number;
  fuente: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_rol: string | null;
  accion: string;
  invoice_id: string | null;
  reveal_id: string | null;
  entidad: string | null;
  entidad_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

// La ruta en Storage no es legible desde el cliente (permiso por columna).
export type DocumentRow = {
  id: string;
  invoice_id: string;
  reveal_id: string | null;
  subido_por: string | null;
  nombre: string;
  mime: string | null;
  tipo: TipoDocumento;
  nivel_minimo: number;
  created_at: string;
};

export type Industry = {
  id: string;
  slug: string;
  nombre: string;
  parent_id: string | null;
  activo: boolean;
  orden: number;
  config: Record<string, unknown>;
  created_at: string;
};

export type IndustryField = {
  id: string;
  industry_id: string;
  key: string;
  label: string;
  tipo: "text" | "textarea" | "number" | "date" | "select" | "boolean";
  requerido: boolean;
  opciones: string[] | null;
  orden: number;
  activo: boolean;
  visibilidad: 1 | 2;
  filtrable: boolean;
  created_at: string;
};

// Lo que devuelve get_deal_room_detail (armado por la base según rol y nivel)
export type DealRoomInvoice = {
  id: string;
  numero: string | null;
  rubro: string;
  industry_id: string | null;
  industry_data: Record<string, unknown>;
  ubicacion: string | null;
  deudor_nombre: string;
  monto: number;
  moneda: string;
  plazo_dias: number;
  fecha_vencimiento: string | null;
  riesgo: Riesgo;
  estado: EstadoFactura;
  descripcion: string | null;
  documento_url: string | null;
  operador_contacto: string | null;
  deudor_contacto: string | null;
  nivel: number;
};

export type DealRoomOferta = {
  id: string;
  autor_rol: RolDealRoom;
  monto_ofrecido: number;
  mensaje: string | null;
  estado: EstadoOferta;
  parent_offer_id: string | null;
  con_recurso: boolean | null;
  notifica_deudor: boolean | null;
  fecha_pago_prevista: string | null;
  created_at: string;
  expira_at: string | null;
  fondos_enviados_at: string | null;
  fondos_recibidos_at: string | null;
};

// "Ahora te toca a vos": lo calcula la base (turno_deal_room).
export type Turno =
  | { accion: "conversar" | "negociar" | "finalizada" | "cerrada"; actor: null }
  | {
      accion: "responder_oferta";
      actor: RolDealRoom;
      offer_id: string;
      monto: number;
      autor_rol: RolDealRoom;
      expira_at: string | null;
    }
  | {
      accion: "pagar_comision" | "reintentar_comision" | "esperando_pago";
      actor: "fondeador";
      offer_id: string;
      payment_request_id: string | null;
      monto_usd: number | null;
      monto_cobro: number | null;
      moneda_cobro: string | null;
      vence_at: string | null;
    }
  | {
      accion: "desembolso";
      actor: RolDealRoom | "ambos" | null;
      offer_id: string;
      enviado: boolean;
      recibido: boolean;
    };

export type EtapaVisible = "negociacion" | "oferta" | "cierre" | "finalizada" | "cerrada";

export type DealRoomDetail = {
  reveal_id: string;
  rol: RolDealRoom | "admin";
  estado: EstadoDealRoom;
  etapa: EtapaVisible;
  turno: Turno;
  industria: string | null;
  nivel: number;
  checklist: ChecklistItem[];
  revealed_at: string;
  contacto_liberado_at: string | null;
  cerrado_at: string | null;
  cancelado_motivo: string | null;
  invoice: DealRoomInvoice;
  contraparte: {
    nombre: string | null;
    empresa: string | null;
    email?: string | null;
    telefono?: string | null;
  };
  ofertas: DealRoomOferta[];
  comision: {
    id: string;
    monto: number;
    moneda: string;
    monto_usd: number | null;
    monto_cobro: number | null;
    moneda_cobro: string | null;
    estado: EstadoPago;
  } | null;
};

export type AppConfig = {
  key: string;
  value: string | null;
};

type TableDef<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<
        Profile,
        Partial<Profile> & { id: string; role: Rol; nombre: string }
      >;
      invoices: TableDef<
        Invoice,
        Partial<Invoice> & {
          operador_id: string;
          rubro: Rubro;
          deudor_nombre: string;
          monto: number;
          plazo_dias: number;
        }
      >;
      fondeador_credits: TableDef<
        FondeadorCredit,
        Partial<FondeadorCredit> & { fondeador_id: string }
      >;
      credit_transactions: TableDef<
        CreditTransaction,
        Partial<CreditTransaction> & {
          fondeador_id: string;
          tipo: TipoTransaccion;
          cantidad: number;
        }
      >;
      credit_packs: TableDef<
        CreditPack,
        Partial<CreditPack> & {
          nombre: string;
          cantidad_creditos: number;
          precio: number;
        }
      >;
      payment_requests: TableDef<
        PaymentRequest,
        Partial<PaymentRequest> & { fondeador_id: string; monto: number }
      >;
      reveals: TableDef<Reveal, Partial<Reveal> & { invoice_id: string }>;
      offers: TableDef<
        Offer,
        Partial<Offer> & {
          invoice_id: string;
          fondeador_id: string;
          monto_ofrecido: number;
        }
      >;
      app_config: TableDef<AppConfig, AppConfig>;
      messages: TableDef<Message, never>;
      documents: TableDef<DocumentRow, never>;
      industries: TableDef<Industry, Partial<Industry> & { slug: string; nombre: string }>;
      notifications: TableDef<Notification, never, Pick<Notification, "leida_at">>;
      notification_prefs: TableDef<
        NotificationPrefs,
        Pick<NotificationPrefs, "user_id" | "email">,
        Pick<NotificationPrefs, "email">
      >;
      exceptions: TableDef<ExceptionRow, never>;
      payment_events: TableDef<PaymentEvent, never, Partial<Pick<PaymentEvent, "resultado" | "procesado_at" | "error">>>;
      fx_rates: TableDef<FxRate, never>;
      audit_logs: TableDef<AuditLog, never>;
      industry_fields: TableDef<
        IndustryField,
        Partial<IndustryField> & { industry_id: string; key: string; label: string; tipo: IndustryField["tipo"] }
      >;
    };
    Views: {
      invoice_teasers: {
        Row: InvoiceTeaser;
        Relationships: [];
      };
    };
    Functions: {
      reveal_invoice: {
        Args: { p_invoice_id: string };
        Returns: DealRoomInvoice & { reveal_id: string; deal_room_estado: EstadoDealRoom };
      };
      get_deal_room_detail: {
        Args: { p_reveal_id: string };
        Returns: DealRoomDetail;
      };
      deal_room_rol: {
        Args: { p_reveal_id: string };
        Returns: string | null;
      };
      is_deal_room_member: {
        Args: { p_reveal_id: string };
        Returns: boolean;
      };
      nivel_deal_room: {
        Args: { p_reveal_id: string };
        Returns: number;
      };
      send_message: {
        Args: {
          p_reveal_id: string;
          p_cuerpo: string;
          p_tipo?: string;
          p_reply_to?: string | null;
        };
        Returns: Message;
      };
      resolver_solicitud: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      marcar_leidos: {
        Args: { p_reveal_id: string };
        Returns: undefined;
      };
      actualizar_checklist: {
        Args: { p_reveal_id: string; p_key: string; p_hecho: boolean };
        Returns: undefined;
      };
      counter_offer: {
        Args: {
          p_offer_id: string;
          p_monto_ofrecido: number;
          p_mensaje?: string | null;
          p_con_recurso?: boolean | null;
          p_notifica_deudor?: boolean | null;
          p_fecha_pago_prevista?: string | null;
        };
        Returns: Offer;
      };
      cancelar_deal_room: {
        Args: { p_reveal_id: string; p_motivo?: string | null };
        Returns: undefined;
      };
      declarar_transferencia: {
        Args: { p_offer_id: string };
        Returns: undefined;
      };
      can_access_document: {
        Args: { p_document_id: string };
        Returns: boolean;
      };
      registrar_documento_deal_room: {
        Args: {
          p_reveal_id: string;
          p_storage_path: string;
          p_nombre: string;
          p_mime: string;
          p_tipo?: string;
          p_nivel_minimo?: number;
        };
        Returns: string;
      };
      log_event: {
        Args: {
          p_accion: string;
          p_invoice_id?: string | null;
          p_reveal_id?: string | null;
          p_entidad?: string | null;
          p_entidad_id?: string | null;
          p_meta?: Record<string, unknown>;
          p_actor_id?: string | null;
        };
        Returns: string;
      };
      confirm_payment_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      admin_adjust_credit: {
        Args: {
          p_fondeador_id: string;
          p_cantidad: number;
          p_nota: string | null;
        };
        Returns: undefined;
      };
      create_offer: {
        Args: {
          p_invoice_id: string;
          p_monto_ofrecido: number;
          p_mensaje?: string | null;
          p_con_recurso?: boolean | null;
          p_notifica_deudor?: boolean | null;
          p_fecha_pago_prevista?: string | null;
        };
        Returns: Offer;
      };
      respond_offer: {
        Args: { p_offer_id: string; p_accept: boolean };
        Returns: Offer;
      };
      deal_fee_for_monto: {
        Args: { p_monto: number };
        Returns: number;
      };
      unlock_fee_for_monto: {
        Args: { p_monto: number };
        Returns: number;
      };
      solicitar_desbloqueo: {
        Args: { p_invoice_id: string };
        Returns: PaymentRequest;
      };
      preparar_pago: {
        Args: { p_tipo: "desbloqueo" | "comision"; p_ref: string };
        Returns: PaymentRequest;
      };
      registrar_orden_proveedor: {
        Args: { p_request_id: string; p_provider: string; p_provider_ref: string; p_checkout_url: string };
        Returns: PaymentRequest;
      };
      registrar_evento_pago: {
        Args: {
          p_provider: string;
          p_dedupe_key: string;
          p_provider_ref: string | null;
          p_estado: string | null;
          p_monto: number | null;
          p_moneda: string | null;
          p_firma_valida: boolean;
          p_payload: Record<string, unknown>;
        };
        Returns: { evento_id: string; nuevo: boolean; resultado: string | null }[];
      };
      aplicar_resultado_pago: {
        Args: {
          p_evento_id: string | null;
          p_provider: string;
          p_provider_ref: string;
          p_estado: string;
          p_monto: number | null;
          p_moneda: string | null;
        };
        Returns: string;
      };
      abrir_excepcion: {
        Args: {
          p_tipo: string;
          p_detalle: string;
          p_reveal_id?: string | null;
          p_invoice_id?: string | null;
          p_payment_request_id?: string | null;
          p_payment_event_id?: string | null;
          p_user_id?: string | null;
          p_datos?: Record<string, unknown>;
        };
        Returns: string;
      };
      guardar_tipo_cambio: {
        Args: { p_fecha: string; p_pyg: number; p_fuente: string };
        Returns: undefined;
      };
      tipo_cambio_vigente: {
        Args: Record<string, never>;
        Returns: FxRate | null;
      };
      estado_desbloqueo: {
        Args: { p_invoice_id: string };
        Returns: {
          reveal_id: string | null;
          pago: {
            id: string;
            estado: EstadoPago;
            monto_cobro: number | null;
            moneda_cobro: string | null;
            monto_usd: number | null;
          } | null;
        };
      };
      vencer_y_recordar: {
        Args: Record<string, never>;
        Returns: Record<string, number>;
      };
      reportar_problema: {
        Args: { p_reveal_id: string; p_detalle: string };
        Returns: string;
      };
      admin_resolver_excepcion: {
        Args: { p_id: string; p_estado: "resuelta" | "descartada"; p_resolucion: string };
        Returns: undefined;
      };
      admin_aplicar_pago_verificado: {
        Args: { p_exception_id: string; p_motivo: string };
        Returns: string;
      };
      admin_marcar_devuelto: {
        Args: { p_exception_id: string; p_motivo: string };
        Returns: undefined;
      };
      notificaciones_para_email: {
        Args: { p_limite?: number };
        Returns: {
          id: string;
          email: string | null;
          nombre: string | null;
          titulo: string;
          cuerpo: string | null;
          accion_label: string;
          url: string;
        }[];
      };
      marcar_email_notificacion: {
        Args: { p_id: string; p_estado: "enviado" | "omitido" | "error" };
        Returns: undefined;
      };
      ordenes_para_conciliar: {
        Args: Record<string, never>;
        Returns: PaymentRequest[];
      };
    };
  };
};
