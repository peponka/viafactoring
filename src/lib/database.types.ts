// Hand-written types matching supabase/migrations/0001-0011.
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
export type EstadoPago = "pendiente" | "confirmado" | "cancelado";
export type EstadoOferta =
  | "pendiente"
  | "aceptada"
  | "rechazada"
  | "reemplazada"
  | "cancelada";
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
  meta: Record<string, unknown>;
  leido_at: string | null;
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
  fondos_enviados_at: string | null;
  fondos_recibidos_at: string | null;
};

export type DealRoomDetail = {
  reveal_id: string;
  rol: RolDealRoom | "admin";
  estado: EstadoDealRoom;
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
    estado: EstadoPago;
    payment_link: string | null;
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
    };
  };
};
