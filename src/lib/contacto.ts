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
  if (/(\+?5959[5-9]\d{7}(?!\d)|(?<!\d)09[5-9]\d{7}(?!\d)|(?<!\d)021\d{6,7}(?!\d)|\+\d{9,15})/.test(d)) r.push("telefono");
  if (/(\b(whatsapp|whatsap|watsap|wasap|guasap|wsp|wpp)\b|wa\.me)/.test(t)) r.push("whatsapp");
  if (/(\b(telegram|telegran)\b|t\.me\/)/.test(t)) r.push("telegram");
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(t) || /\barroba\b/.test(t) || /\b(gmail|hotmail|outlook|yahoo)\b/.test(t)) r.push("email");
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|py)\b)/.test(t)) r.push("url");
  if (/(^|\s)@[a-z0-9_.]{3,}/.test(t)) r.push("usuario");
  return r;
}
