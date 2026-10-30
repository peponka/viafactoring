import { SignupForm } from "./signup-form";

// Links de entrada como /signup?rol=operador&origen=licitia: preelegimos el
// rol y guardamos de dónde vino la persona (se lee acá, en el servidor, para
// que el formulario se vea al instante).
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const rolInicial = uno(sp.rol) === "fondeador" ? "fondeador" : "operador";
  const origen = (uno(sp.origen) || uno(sp.utm_source))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
  return <SignupForm rolInicial={rolInicial} origen={origen} />;
}
