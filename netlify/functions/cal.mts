// Calendario suscribible (.ics) para cada persona del equipo.
// URL: /cal/<token-personal>.ics?ver=partidos,entrenos,tareas,seguimientos&todo=1
//   ver   → qué tipos incluir (por defecto: todos)
//   todo  → 1 = tareas de todo el equipo; si no, solo las asignadas a esa persona
// El iPhone se suscribe con webcal:// y va actualizando solo.
import type { Config, Context } from "@netlify/functions";
import { leerTodo } from "../lib/comun.mts";

const TZ = "Europe/Madrid";
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", `TZID:${TZ}`,
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
  "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
  "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

const esc = (t: unknown) =>
  String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Plegado de líneas a 75 octetos (RFC 5545)
function plegar(linea: string) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;
  const partes: string[] = [];
  let actual = "";
  let tam = 0;
  for (const ch of linea) {
    const n = new TextEncoder().encode(ch).length;
    if (tam + n > (partes.length ? 74 : 75)) {
      partes.push(actual);
      actual = "";
      tam = 0;
    }
    actual += ch;
    tam += n;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const compacto = (s: string) => s.replace(/[-:]/g, "");
// "2026-11-29T18:00" → "20261129T180000"
const local = (f: string) => compacto(f.slice(0, 16)) + "00";
function sumarMin(f: string, min: number) {
  const d = new Date(f.slice(0, 16) + ":00Z");
  d.setUTCMinutes(d.getUTCMinutes() + min);
  return d.toISOString().slice(0, 16);
}
function diaSiguiente(fecha: string) {
  const d = new Date(fecha.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type Ev = { uid: string; titulo: string; fecha: string; min?: number; lugar?: string; desc?: string; cat: string };

function vevent(e: Ev, sello: string) {
  const l = ["BEGIN:VEVENT", `UID:${e.uid}@redes-liceo`, `DTSTAMP:${sello}`];
  if (e.fecha.length > 10) {
    l.push(`DTSTART;TZID=${TZ}:${local(e.fecha)}`, `DTEND;TZID=${TZ}:${local(sumarMin(e.fecha, e.min ?? 60))}`);
  } else {
    l.push(`DTSTART;VALUE=DATE:${compacto(e.fecha)}`, `DTEND;VALUE=DATE:${compacto(diaSiguiente(e.fecha))}`);
  }
  l.push(`SUMMARY:${esc(e.titulo)}`, `CATEGORIES:${esc(e.cat)}`);
  if (e.lugar) l.push(`LOCATION:${esc(e.lugar)}`);
  if (e.desc) l.push(`DESCRIPTION:${esc(e.desc)}`);
  l.push("END:VEVENT");
  return l;
}

const FECHA_OK = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/;

export default async (req: Request, context: Context) => {
  const token = String(context.params?.token || "");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return new Response("no", { status: 404 });
  const url = new URL(req.url);
  const ver = new Set((url.searchParams.get("ver") || "partidos,entrenos,tareas,seguimientos").split(","));
  const todoEquipo = url.searchParams.get("todo") === "1";

  const d = await leerTodo(["personas", "partidos", "entrenos", "tareas", "contactos"]);
  const yo = d.personas.find((p) => p.calToken === token);
  if (!yo) return new Response("no", { status: 404 });
  const nombre = (id: string) => d.personas.find((p) => p.id === id)?.nombre || "";
  const partido = (id: string) => d.partidos.find((p) => p.id === id);

  const evs: Ev[] = [];
  if (ver.has("partidos"))
    for (const p of d.partidos) {
      if (!FECHA_OK.test(p.fecha || "")) continue;
      const vs = p.casa ? `Liceo – ${p.rival}` : `${p.rival} – Liceo`;
      evs.push({
        uid: `partido-${p.id}`,
        titulo: `🏑 ${vs}${p.competicion ? ` · ${p.competicion}` : ""}`,
        fecha: p.fecha, min: 120,
        lugar: p.lugar || (p.casa ? "Pazo dos Deportes de Riazor, A Coruña" : ""),
        desc: [p.casa ? "En casa" : "Fuera", p.jornada, p.tv && `TV: ${p.tv}`, p.notas].filter(Boolean).join("\n"),
        cat: "Partido",
      });
    }
  if (ver.has("entrenos"))
    for (const e of d.entrenos) {
      if (!FECHA_OK.test(e.fecha || "")) continue;
      evs.push({
        uid: `entreno-${e.id}`, titulo: `Entreno${e.titulo ? ` · ${e.titulo}` : ""}`,
        fecha: e.fecha, min: Number(e.duracion) || 90, lugar: e.lugar, desc: e.notas, cat: "Entreno",
      });
    }
  if (ver.has("tareas"))
    for (const t of d.tareas) {
      if (!FECHA_OK.test(t.fecha || "") || t.estado === "hecho") continue;
      const asignados: string[] = Array.isArray(t.asignados) ? t.asignados : [];
      if (!todoEquipo && !asignados.includes(yo.id)) continue;
      const pa = t.partidoId ? partido(t.partidoId) : null;
      evs.push({
        uid: `tarea-${t.id}`, titulo: `✅ ${t.titulo}`, fecha: t.fecha, min: Number(t.duracion) || 60,
        desc: [
          asignados.length ? `Quién: ${asignados.map(nombre).join(", ")}` : "",
          pa ? `Partido: ${pa.casa ? "Liceo – " + pa.rival : pa.rival + " – Liceo"}` : "",
          t.descripcion,
        ].filter(Boolean).join("\n"),
        cat: "Trabajo",
      });
    }
  if (ver.has("seguimientos"))
    for (const c of d.contactos) {
      if (!FECHA_OK.test(c.fechaSeguimiento || "")) continue;
      if (!todoEquipo && c.responsable !== yo.id) continue;
      evs.push({
        uid: `seguimiento-${c.id}-${c.fechaSeguimiento}`,
        titulo: `📞 ${c.nombre}${c.empresa ? ` (${c.empresa})` : ""}`,
        fecha: c.fechaSeguimiento, desc: [c.proximoPaso, c.telefono, c.email].filter(Boolean).join("\n"),
        cat: "Seguimiento",
      });
    }

  const sello = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lineas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HC Liceo//Redes//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`Redes Liceo · ${yo.nombre}`)}`, `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
    ...evs.flatMap((e) => vevent(e, sello)),
    "END:VCALENDAR",
  ];
  return new Response(lineas.map(plegar).join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="redes-liceo.ics"',
      "cache-control": "no-store",
    },
  });
};

export const config: Config = { path: "/cal/:token.ics" };
