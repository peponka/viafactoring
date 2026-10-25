// Réplica en el navegador de public.detectar_contacto (migración 0007).
// Solo sirve para AVISAR antes de enviar; la detección que cuenta es la de
// la base, que no se puede saltear.
const NUMEROS: Record<string, string> = {
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4",
  cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
};

export function detectarContacto(texto: string): string[] {
  if (!texto || !texto.trim()) return [];
  let t = texto.toLowerCase();
  t = t.replace(/\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, (m) => NUMEROS[m]);
  const d = t.replace(/(\d)[\s.()/-]+(?=\d)/g, "$1");
  const r: string[] = [];
  const d2 = t.replace(/(\d)[\s()/-]+(?=\d)/g, "$1");
  if (
    /(\+?5959[5-9]\d{7}(?!\d)|(?<!\d)09[5-9]\d{7}(?!\d)|(?<!\d)021\d{6,7}(?!\d)|\+\d{9,15})/.test(d) ||
    /(?<!\d)9[5-9]\d{7}(?!\d)/.test(d2)
  )
    r.push("telefono");
  if (/(\b(whatsapp|whatsap|watsap|wasap|guasap|wsp|wpp|whats|wapp)\b|wa\.me)/.test(t)) r.push("whatsapp");
  if (/(\b(telegram|telegran)\b|t\.me\/)/.test(t)) r.push("telegram");
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(t) || /\barroba\b/.test(t) || /\b(gmail|hotmail|outlook|yahoo|icloud)\b/.test(t)) r.push("email");
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|py)\b)/.test(t)) r.push("url");
  if (/(^|\s)@[a-z0-9_.]{3,}/.test(t)) r.push("usuario");
  if (/\b(instagram|insta|facebook|linkedin|tiktok|signal|skype|messenger)\b/.test(t)) r.push("redes");
  if (
    /\bmi\s+(cel|celu|celular|tel[eé]fono|correo|mail|contacto|perfil|whats\w*|wsp)\b/.test(t) ||
    /\b(llamame|llámame|llamenme)\b/.test(t) ||
    /\bescribime\s+(al|a\s+mi|por)\b/.test(t) ||
    /\bte\s+paso\s+mi\b/.test(t) ||
    /fuera\s+de\s+(la\s+)?(plataforma|viafactoring|app|aplicaci[oó]n)/.test(t) ||
    /\bpor\s+(privado|afuera)\b/.test(t)
  )
    r.push("invitacion");
  return r;
}
