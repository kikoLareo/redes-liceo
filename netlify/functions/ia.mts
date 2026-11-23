// Asistente de IA del equipo de redes (Claude).
//   POST /api/ia/chat        { mensajes:[{role,content}], archivos?:[id], quien? }  → texto en streaming
//   POST /api/ia/desarrollar { titulo, texto, instruccion?, quien? }                → texto en streaming
//   POST /api/ia/importar    { texto }                                              → { partidos:[...] }
// Necesita la variable de entorno ANTHROPIC_API_KEY en Netlify.
import Anthropic from "@anthropic-ai/sdk";
import type { Config, Context } from "@netlify/functions";
import { ID_OK, almacen, autorizado, leerTodo } from "../lib/comun.mts";

const MODELO = "claude-opus-5-5";
// Si el modelo rechaza una petición por sus filtros de seguridad, la API la reintenta en otro modelo.
const FALLBACK = (): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } => ({
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
});

const SISTEMA = `Eres el asistente del equipo de redes sociales y comunicación del HC Liceo (Hockey Club Liceo, A Coruña), club de hockey sobre patines que juega la OK Liga, la Copa del Rey y competición europea (WSE Champions League). Su pista es el Pazo dos Deportes de Riazor.

Ayudas al equipo con: su calendario (partidos, entrenos y trabajos), sus tareas, el desarrollo de ideas de contenido (Instagram, TikTok, X, YouTube, web), patrocinadores y contactos, y los archivos que guardan.

Reglas:
- Responde siempre en español, cercano y directo, como un compañero más del equipo. Respuestas breves y prácticas salvo que pidan desarrollo.
- Usa los DATOS DEL EQUIPO que tienes abajo para responder sobre fechas, tareas, personas, contactos o archivos. Si algo no está en los datos, dilo; no lo inventes.
- Las fechas de los datos están en hora de Madrid con formato AAAA-MM-DDTHH:MM (o solo AAAA-MM-DD si es un día completo).
- Cuando propongas contenido, da ideas concretas: formato, gancho, texto del post o guion, cuándo publicarlo respecto al partido y quién del equipo podría encargarse.
- Puedes usar Markdown sencillo (negritas, listas, títulos cortos).`;

function cliente() {
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("sin-clave-ia");
  return new Anthropic({ apiKey: key });
}

async function datosEquipo() {
  const d = await leerTodo(["personas", "partidos", "entrenos", "tareas", "ideas", "contactos", "archivos"]);
  // Fuera lo que no aporta (tokens de calendario, etc.).
  d.personas = d.personas.map(({ calToken, ...p }) => p);
  const ordenar = (a: any, b: any) => String(a.fecha || "").localeCompare(String(b.fecha || ""));
  d.partidos.sort(ordenar);
  d.entrenos.sort(ordenar);
  d.tareas.sort(ordenar);
  return d;
}

function hoy() {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid", weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

async function sistemaConDatos(): Promise<Anthropic.Beta.BetaTextBlockParam[]> {
  const d = await datosEquipo();
  return [
    { type: "text", text: SISTEMA },
    {
      type: "text",
      text: `DATOS DEL EQUIPO (JSON):\n${JSON.stringify(d)}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

const IMAGENES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

async function bloquesArchivos(ids: string[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const s = almacen();
  const bloques: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const id of ids.slice(0, 5)) {
    if (!ID_OK.test(id)) continue;
    const r = await s.getWithMetadata(`bin/${id}`, { type: "arrayBuffer" });
    if (!r) continue;
    const tipo = String(r.metadata?.tipo || "");
    const nombre = String(r.metadata?.nombre || id);
    const buf = Buffer.from(r.data);
    if (tipo === "application/pdf") {
      bloques.push({
        type: "document", title: nombre,
        source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
      });
    } else if ((IMAGENES as readonly string[]).includes(tipo)) {
      bloques.push({ type: "text", text: `Imagen adjunta: ${nombre}` });
      bloques.push({
        type: "image",
        source: { type: "base64", media_type: tipo as (typeof IMAGENES)[number], data: buf.toString("base64") },
      });
    } else if (tipo.startsWith("text/") || /json|csv|xml|markdown/.test(tipo) || /\.(txt|md|csv|json)$/i.test(nombre)) {
      bloques.push({
        type: "document", title: nombre,
        source: { type: "text", media_type: "text/plain", data: buf.toString("utf8") },
      });
    } else {
      bloques.push({ type: "text", text: `(El archivo «${nombre}» es de tipo ${tipo || "desconocido"} y no se puede leer; solo sabes su nombre.)` });
    }
  }
  return bloques;
}

// Devuelve el texto de Claude en streaming como text/plain.
function respuestaEnStreaming(params: Anthropic.Beta.MessageCreateParamsStreaming | any) {
  const client = cliente();
  const cuerpo = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const enc = new TextEncoder();
      try {
        const stream = client.beta.messages.stream({ ...FALLBACK(), ...params });
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") ctrl.enqueue(enc.encode("\n\n_(La IA no ha querido responder a esto. Prueba a reformularlo.)_"));
        if (final.stop_reason === "max_tokens") ctrl.enqueue(enc.encode("\n\n_(Respuesta cortada por longitud.)_"));
      } catch (e) {
        console.error(e);
        const msg = e instanceof Anthropic.RateLimitError
          ? "Demasiadas peticiones a la IA ahora mismo. Espera un momento y vuelve a probar."
          : e instanceof Anthropic.AuthenticationError
            ? "La clave de la IA (ANTHROPIC_API_KEY) no es válida."
            : "Error al hablar con la IA. Vuelve a intentarlo.";
        ctrl.enqueue(enc.encode(`\n\n⚠️ ${msg}`));
      }
      ctrl.close();
    },
  });
  return new Response(cuerpo, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

// Descarga una página pública y la deja en texto plano (sin scripts ni estilos).
async function textoDeWeb(enlace: string) {
  const u = new URL(enlace);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("solo enlaces web");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))
    throw new Error("enlace no permitido");
  const r = await fetch(u, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; RedesLiceo/1.0)", accept: "text/html,*/*" },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`la página respondió ${r.status}`);
  const html = await r.text();
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d|table|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

type MsgIn ={ role: "user" | "assistant"; content: string };

const PARTIDO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["partidos"],
  properties: {
    partidos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fecha", "rival", "casa", "competicion", "lugar", "jornada"],
        properties: {
          fecha: { type: "string", description: "AAAA-MM-DDTHH:MM en hora de Madrid, o AAAA-MM-DD si no hay hora" },
          rival: { type: "string" },
          casa: { type: "boolean", description: "true si el Liceo juega en casa" },
          competicion: { type: "string", enum: ["OK Liga", "Copa del Rey", "Champions", "Supercopa", "Copa Continental", "Intercontinental", "Liga Gallega", "Amistoso", "Otra"] },
          lugar: { type: "string", description: "Pabellón y ciudad, o cadena vacía si no se sabe" },
          jornada: { type: "string", description: "p. ej. 'Jornada 7', 'Cuartos ida', o cadena vacía" },
        },
      },
    },
  },
} as const;

export default async (req: Request, _context: Context) => {
  if (!autorizado(req)) return Response.json({ error: "clave" }, { status: 401 });
  if (req.method !== "POST") return Response.json({ error: "método" }, { status: 405 });
  if (!Netlify.env.get("ANTHROPIC_API_KEY")) return Response.json({ error: "sin-clave-ia" }, { status: 503 });
  const ruta = new URL(req.url).pathname;
  const b = await req.json().catch(() => ({}));
  const quien = typeof b.quien === "string" ? b.quien.slice(0, 80) : "";

  try {
    if (ruta === "/api/ia/chat") {
      const mensajes: MsgIn[] = (Array.isArray(b.mensajes) ? b.mensajes : [])
        .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .slice(-30);
      if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user")
        return Response.json({ error: "vacío" }, { status: 400 });
      while (mensajes[0]?.role !== "user") mensajes.shift();

      const adjuntos = Array.isArray(b.archivos) ? await bloquesArchivos(b.archivos.map(String)) : [];
      const ultimo = mensajes.pop()!;
      const contexto = `(Ahora es ${hoy()}.${quien ? ` Te escribe ${quien}.` : ""})\n\n`;
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        ...mensajes.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: [...adjuntos, { type: "text", text: contexto + ultimo.content }] },
      ];
      return respuestaEnStreaming({
        model: MODELO, max_tokens: 16000,
        output_config: { effort: "low" },
        system: await sistemaConDatos(),
        messages,
      });
    }

    if (ruta === "/api/ia/desarrollar") {
      const titulo = String(b.titulo || "").slice(0, 300);
      const texto = String(b.texto || "").slice(0, 20000);
      const instruccion = String(b.instruccion || "").slice(0, 2000);
      const peticion = `(Ahora es ${hoy()}.${quien ? ` Te lo pide ${quien}.` : ""})

Desarrolla esta idea/tarea del equipo de redes para que se pueda ejecutar. Incluye, según aplique: objetivo, formato y redes, gancho, guion o textos de los posts (con hashtags del club), planificación respecto al partido o fecha, qué material hay que grabar/preparar, quién podría encargarse y pasos concretos. Ten en cuenta el calendario y las tareas del equipo. Escribe en Markdown, directo al contenido, sin introducción.

TÍTULO: ${titulo}
LO QUE HAY ESCRITO:
${texto || "(nada todavía)"}
${instruccion ? `\nPETICIÓN CONCRETA: ${instruccion}` : ""}`;
      return respuestaEnStreaming({
        model: MODELO, max_tokens: 16000,
        output_config: { effort: "medium" },
        system: await sistemaConDatos(),
        messages: [{ role: "user", content: peticion }],
      });
    }

    // Devuelve en streaming el JSON { partidos: [...] } (la web lo junta y lo lee al final).
    if (ruta === "/api/ia/importar") {
      let texto = String(b.texto || "");
      const enlace = String(b.url || "").trim();
      if (enlace) {
        try {
          texto = `Página ${enlace}:\n${await textoDeWeb(enlace)}\n\n${texto}`;
        } catch (e) {
          return Response.json({ error: "enlace", detalle: String((e as Error).message || e) }, { status: 422 });
        }
      }
      texto = texto.slice(0, 120000);
      if (!texto.trim()) return Response.json({ error: "vacío" }, { status: 400 });
      return respuestaEnStreaming({
        model: MODELO, max_tokens: 32000,
        output_config: { effort: "low", format: { type: "json_schema", schema: PARTIDO_SCHEMA as unknown as Record<string, unknown> } },
        system: "Extraes partidos del primer equipo del HC Liceo (hockey sobre patines, A Coruña; también aparece como 'Liceo', 'HC Liceo' o 'Deportivo Liceo') a partir de texto (calendarios, webs, notas). Solo partidos en los que juega el Liceo, de todas las jornadas o fases que aparezcan (ida y vuelta). La competición se deduce de la página o de la pista que se te dé: la liga española es 'OK Liga'; la WSE Champions League europea es 'Champions'. En 'jornada' pon 'Jornada N' o la fase (p. ej. 'Fase de grupos J3', 'Cuartos ida'). 'casa' = true si el Liceo es local (aparece primero). Si el texto no da el año, deduce la temporada 2026-27 (septiembre 2026 a junio 2027). Si no hay hora, usa solo la fecha. Si en casa y no se dice lugar, pon 'Pazo dos Deportes de Riazor, A Coruña'. Si es fuera y no se dice lugar, pon la ciudad del rival si la sabes con seguridad o deja vacío.",
        messages: [{ role: "user", content: `(Hoy es ${hoy()}.)\n\n${texto}` }],
      });
    }

    return Response.json({ error: "no encontrado" }, { status: 404 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
};

export const config: Config = { path: ["/api/ia/chat", "/api/ia/desarrollar", "/api/ia/importar"] };
