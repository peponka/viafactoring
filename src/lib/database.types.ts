// Hand-written types matching supabase/migrations/0001_init.sql.
// Once the Supabase project is live, you can regenerate the authoritative
// version with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
//
// NOTE: these are declared with `type`, not `interface`, on purpose — an
// `interface` has no implicit index signature, so it fails the
// `extends Record<string, unknown>` check supabase-js's generic types rely
// on internally (silently collapsing every query result to `never`).

export type Rol = "operador" | "fondeador" | "admin";
export type Rubro = "fluvial" | "camiones";
export type Riesgo = "bajo" | "medio" | "alto";
export type EstadoFactura = "disponible" | "cerrada" | "retirada";
export type TipoTransaccion =
  | "bienvenida"
  | "compra"
  | "consumo"
  | "ajuste_admin";
export type EstadoPago = "pendiente" | "confirmado" | "cancelado";
export type EstadoOferta = "pendiente" | "aceptada" | "rechazada";
export type TipoPago = "creditos" | "comision" | "desbloqueo";

export type Profile = {
  id: string;
  role: Rol;
  nombre: string;
  empresa: string | null;
  telefono: string | null;
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
};

export type Reveal = {
  id: string;
  invoice_id: string;
  fondeador_id: string;
  revealed_at: string;
  contactado: boolean;
  bitacora: string | null;
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
        Returns: Invoice;
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
          p_mensaje: string | null;
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
