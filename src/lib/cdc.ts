// CDC: código de control de 44 dígitos de cada documento electrónico del
// SIFEN (Paraguay). Misma lógica que dv_mod11 / calcular_verificacion en la
// base; acá se usa para avisar en vivo mientras se carga la factura. El
// resultado que cuenta es siempre el que calcula la base.
//
// Estructura: tipo (2) · RUC emisor (8) · DV (1) · establecimiento (3) ·
// punto (3) · número (7) · tipo contribuyente (1) · fecha AAAAMMDD (8) ·
// tipo emisión (1) · código de seguridad (9) · DV del CDC (1).

export function dvMod11(numero: string): number | null {
  if (!/^\d+$/.test(numero)) return null;
  let total = 0;
  let k = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    total += Number(numero[i]) * k;
    k = k === 11 ? 2 : k + 1;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

export function normalizarCdc(cdc: string) {
  return cdc.replace(/\D/g, "");
}

export type CdcInfo = {
  valido: boolean;
  esFactura: boolean;
  ruc: string;
  numero: string; // 001-001-0000006
  fechaEmision: string | null; // YYYY-MM-DD
};

export function leerCdc(entrada: string): CdcInfo | null {
  const cdc = normalizarCdc(entrada);
  if (cdc.length !== 44) return null;
  const dv = dvMod11(cdc.slice(0, 43));
  const f = cdc.slice(25, 33);
  const fecha = /^\d{8}$/.test(f) ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}` : null;
  return {
    valido: dv === Number(cdc[43]),
    esFactura: cdc.startsWith("01"),
    ruc: cdc.slice(2, 10).replace(/^0+/, ""),
    numero: `${cdc.slice(11, 14)}-${cdc.slice(14, 17)}-${cdc.slice(17, 24)}`,
    fechaEmision: fecha,
  };
}

export function formatearCdc(cdc: string) {
  return normalizarCdc(cdc).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** RUC sin DV ni ceros a la izquierda. */
export function rucBase(ruc: string | null | undefined) {
  if (!ruc) return null;
  const base = ruc.replace(/[^\d-]/g, "").split("-")[0].replace(/^0+/, "");
  return base || null;
}

export const CONSULTA_EKUATIA = "https://ekuatia.set.gov.py/consultas/";
