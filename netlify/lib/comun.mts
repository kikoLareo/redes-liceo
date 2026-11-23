// Utilidades compartidas por las funciones.
import { getStore } from "@netlify/blobs";

export const COLECCIONES = [
  "personas", "partidos", "entrenos", "tareas", "ideas", "contactos", "archivos",
] as const;
export type Col = (typeof COLECCIONES)[number];
export const ID_OK = /^[A-Za-z0-9_-]{1,80}$/;

export const almacen = () => getStore({ name: "redes-liceo", consistency: "strong" });

export function autorizado(req: Request) {
  const clave = req.headers.get("x-clave") || new URL(req.url).searchParams.get("k") || "";
  const equipo = Netlify.env.get("CLAVE_EQUIPO");
  return !!equipo && clave === equipo;
}

export async function leerTodo(cols: readonly Col[] = COLECCIONES) {
  const s = almacen();
  const res: Record<string, any[]> = {};
  await Promise.all(
    cols.map(async (col) => {
      const { blobs } = await s.list({ prefix: `${col}/` });
      const docs = await Promise.all(
        blobs.map(async (b) => {
          const d = await s.get(b.key, { type: "json" });
          return d ? { ...d, id: b.key.slice(col.length + 1) } : null;
        }),
      );
      res[col] = docs.filter(Boolean);
    }),
  );
  return res;
}

