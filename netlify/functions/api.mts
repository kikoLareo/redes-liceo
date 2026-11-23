// API de «Redes HC Liceo»: datos del equipo de redes en Netlify Blobs.
// Una entrada por documento: "coleccion/id". Los archivos van aparte ("bin/id").
// Los datos NO van en el repositorio: se crean desde la propia web.
//
// Variables de entorno del proyecto en Netlify:
//   CLAVE_EQUIPO       → la clave que comparte el equipo (ver y cambiar todo)
//   ANTHROPIC_API_KEY  → para el asistente de IA (opcional: sin ella, la IA queda desactivada)
import type { Config, Context } from "@netlify/functions";

import { COLECCIONES, type Col, almacen, autorizado, leerTodo } from "../lib/comun.mts";

const ID_OK = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_ARCHIVO = 5 * 1024 * 1024; // límite de cuerpo de las funciones de Netlify ≈ 6 MB

type Escritura = { op: "set" | "update" | "delete"; col: string; id: string; data?: Record<string, unknown> };

async function aplicar(w: Escritura) {
  if (!COLECCIONES.includes(w.col as Col) || !ID_OK.test(w.id)) throw new Error("ruta no válida");
  const s = almacen();
  const key = `${w.col}/${w.id}`;
  if (w.op === "delete") {
    if (w.col === "archivos") await s.delete(`bin/${w.id}`);
    return s.delete(key);
  }
  if (!w.data || typeof w.data !== "object" || Array.isArray(w.data)) throw new Error("datos no válidos");
  const { id: _ignorado, ...data } = w.data as Record<string, unknown>;
  if (w.op === "set") return s.setJSON(key, data);
  if (w.op === "update") {
    const actual = (await s.get(key, { type: "json" })) || {};
    return s.setJSON(key, { ...actual, ...data });
  }
  throw new Error("operación no válida");
}

export default async (req: Request, _context: Context) => {
  if (!autorizado(req)) return Response.json({ error: "clave" }, { status: 401 });
  const url = new URL(req.url);
  const ruta = url.pathname;

  try {
    if (req.method === "GET" && ruta === "/api/datos") {
      const datos = await leerTodo(COLECCIONES);
      return Response.json(
        { ...datos, ia: !!Netlify.env.get("ANTHROPIC_API_KEY") },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (req.method === "POST" && ruta === "/api/escribir") {
      const cuerpo = await req.json();
      const lista: Escritura[] = Array.isArray(cuerpo?.escrituras) ? cuerpo.escrituras : [];
      if (!lista.length || lista.length > 300) return Response.json({ error: "vacío" }, { status: 400 });
      for (const w of lista) await aplicar(w);
      return Response.json({ ok: true });
    }

    // Subir archivo: cuerpo = bytes del archivo; metadatos en la query.
    if (req.method === "POST" && ruta === "/api/archivo") {
      const id = url.searchParams.get("id") || "";
      if (!ID_OK.test(id)) return Response.json({ error: "id" }, { status: 400 });
      const bytes = await req.arrayBuffer();
      if (!bytes.byteLength) return Response.json({ error: "vacío" }, { status: 400 });
      if (bytes.byteLength > MAX_ARCHIVO) return Response.json({ error: "grande" }, { status: 413 });
      const meta = {
        nombre: (url.searchParams.get("nombre") || "archivo").slice(0, 200),
        tipo: (req.headers.get("content-type") || "application/octet-stream").slice(0, 120),
        tam: bytes.byteLength,
        subidoPor: (url.searchParams.get("por") || "").slice(0, 80),
        notas: (url.searchParams.get("notas") || "").slice(0, 2000),
        carpeta: (url.searchParams.get("carpeta") || "").slice(0, 80),
        creado: new Date().toISOString(),
      };
      const s = almacen();
      await s.set(`bin/${id}`, bytes, { metadata: { tipo: meta.tipo, nombre: meta.nombre } });
      await s.setJSON(`archivos/${id}`, meta);
      return Response.json({ ok: true, id, ...meta });
    }

    // Descargar archivo (admite ?k= para poder abrirlo en una pestaña nueva).
    if (req.method === "GET" && ruta === "/api/archivo") {
      const id = url.searchParams.get("id") || "";
      if (!ID_OK.test(id)) return new Response("id", { status: 400 });
      const r = await almacen().getWithMetadata(`bin/${id}`, { type: "arrayBuffer" });
      if (!r) return new Response("no encontrado", { status: 404 });
      const tipo = String(r.metadata?.tipo || "application/octet-stream");
      const nombre = String(r.metadata?.nombre || "archivo");
      return new Response(r.data, {
        headers: {
          "content-type": tipo,
          "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
          "cache-control": "private, max-age=300",
        },
      });
    }

    return Response.json({ error: "no encontrado" }, { status: 404 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String((e as Error).message || e) }, { status: 400 });
  }
};

export const config: Config = { path: ["/api/datos", "/api/escribir", "/api/archivo"] };
