"use strict";
/* Redes HC Liceo — web del equipo de redes. Sin dependencias.
   Datos en Netlify (funciones /api/*). Vistas por hash: #/inicio, #/calendario, #/tareas, … */

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = (n = 12) => { const a = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(n)); for (const x of r) s += a[x % a.length]; return s; };
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toast(msg, ms = 2400) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }

// ---------- fechas (todo en hora local del móvil; el club está en Madrid) ----------
const pad = (n) => String(n).padStart(2, "0");
const diaStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoyStr = () => diaStr(new Date());
const aFecha = (f) => { if (!f) return null; const [d, h] = f.split("T"); const [y, m, dd] = d.split("-").map(Number); const [hh, mi] = (h || "00:00").split(":").map(Number); return new Date(y, m - 1, dd, hh || 0, mi || 0); };
const sumarDias = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return diaStr(d); };
const DSEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const hora = (f) => (f && f.length > 10 ? f.slice(11, 16) : "");
function fechaCorta(f) { if (!f) return ""; const d = aFecha(f); return `${DSEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${hora(f) ? " · " + hora(f) : ""}`; }
function fechaLarga(s) { const d = aFecha(s); const h = hoyStr(); const pre = s === h ? "Hoy · " : s === sumarDias(h, 1) ? "Mañana · " : ""; return `${pre}${DSEM[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; }
function cuentaAtras(f) {
  const ms = aFecha(f) - new Date(); if (ms < 0) return "en juego / jugado";
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return d > 0 ? `faltan ${d} d ${h} h` : `faltan ${h} h ${Math.floor((ms % 36e5) / 6e4)} min`;
}

// ---------- Markdown sencillo ----------
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
function md(txt) {
  const lineas = esc(txt || "").split("\n"); let html = "", lista = null, parr = [];
  const cerrarP = () => { if (parr.length) { html += `<p>${inline(parr.join("<br>"))}</p>`; parr = []; } };
  const cerrarL = () => { if (lista) { html += `</${lista}>`; lista = null; } };
  for (const l of lineas) {
    let m;
    if (!l.trim()) { cerrarP(); cerrarL(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { cerrarP(); cerrarL(); const n = m[1].length; html += `<h${n}>${inline(m[2])}</h${n}>`; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { cerrarP(); cerrarL(); html += "<hr>"; continue; }
    if ((m = l.match(/^&gt;\s?(.*)/))) { cerrarP(); cerrarL(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { cerrarP(); if (lista !== "ul") { cerrarL(); html += "<ul>"; lista = "ul"; } html += `<li>${inline(m[1].replace(/^\[( |x)\]\s*/i, (x, c) => (c.trim() ? "☑ " : "☐ ")))}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { cerrarP(); if (lista !== "ol") { cerrarL(); html += "<ol>"; lista = "ol"; } html += `<li>${inline(m[1])}</li>`; continue; }
    cerrarL(); parr.push(l);
  }
  cerrarP(); cerrarL(); return html;
}

// ---------- estado ----------
const COLS = ["personas", "partidos", "entrenos", "tareas", "ideas", "contactos", "archivos"];
let D = Object.fromEntries(COLS.map((c) => [c, []]));
let IA = false;
let clave = ls.get("rl-clave", "");
let yoId = ls.get("rl-yo", "");
const yo = () => D.personas.find((p) => p.id === yoId);
const persona = (id) => D.personas.find((p) => p.id === id);
const partido = (id) => D.partidos.find((p) => p.id === id);
const iniciales = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const COLORES = ["#ACD4B7", "#8EC5FF", "#F3C66E", "#F5A3C7", "#C9B8FF", "#FFB38A", "#7FE0D2", "#E6E08A"];
const av = (p) => (p ? `<span class="av" style="--pc:${esc(p.color || "#ACD4B7")}" title="${esc(p.nombre)}">${esc(iniciales(p.nombre))}</span>` : "");
const avs = (ids = []) => `<span class="avs">${ids.map(persona).filter(Boolean).map(av).join("")}</span>`;
const vsTxt = (p) => (p.casa ? `Liceo – ${p.rival}` : `${p.rival} – Liceo`);

async function api(ruta, opts = {}) {
  const r = await fetch(ruta, { ...opts, headers: { "x-clave": clave, ...(opts.body && !(opts.body instanceof Blob) ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) } });
  if (r.status === 401) { ls.del("rl-clave"); clave = ""; render(); throw new Error("clave"); }
  return r;
}
async function cargar() {
  const r = await api("/api/datos"); if (!r.ok) throw new Error("datos");
  const j = await r.json(); IA = !!j.ia; for (const c of COLS) D[c] = j[c] || [];
  asegurarEquipo();
}
// Aplica cambios en local al instante y los manda a Netlify.
async function escribir(lista) {
  for (const w of lista) {
    const arr = D[w.col]; const i = arr.findIndex((x) => x.id === w.id);
    if (w.op === "delete") { if (i >= 0) arr.splice(i, 1); }
    else if (w.op === "set") { const doc = { ...w.data, id: w.id }; i >= 0 ? (arr[i] = doc) : arr.push(doc); }
    else if (w.op === "update") { i >= 0 ? Object.assign(arr[i], w.data) : arr.push({ ...w.data, id: w.id }); }
  }
  try {
    const r = await api("/api/escribir", { method: "POST", body: JSON.stringify({ escrituras: lista }) });
    if (!r.ok) throw new Error();
    marcarGuardado();
  } catch (e) { if (e.message !== "clave") toast("No se pudo guardar. Revisa la conexión."); }
}
const guardar = (col, id, data) => escribir([{ op: "update", col, id, data: { ...data, editado: new Date().toISOString() } }]);
const crear = (col, data) => { const id = uid(); escribir([{ op: "set", col, id, data: { ...data, creado: new Date().toISOString(), creadoPor: yoId } }]); return id; };
const borrar = (col, id) => escribir([{ op: "delete", col, id }]);
function marcarGuardado() { const g = $("#guardado"); if (g) { g.textContent = "Guardado ✓"; clearTimeout(marcarGuardado._t); marcarGuardado._t = setTimeout(() => (g.textContent = ""), 1500); } }

// ---------- eventos unificados (calendario) ----------
const TIPOS = { partido: "Partidos", entreno: "Entrenos", tarea: "Trabajos", seguimiento: "Seguimientos" };
function eventos() {
  const ev = [];
  for (const p of D.partidos) if (p.fecha) ev.push({ tipo: "partido", id: p.id, fecha: p.fecha, titulo: vsTxt(p), sub: [p.competicion, p.casa ? "Casa" : "Fuera", p.lugar].filter(Boolean).join(" · "), href: `#/partido/${p.id}`, mio: true });
  for (const e of D.entrenos) if (e.fecha) ev.push({ tipo: "entreno", id: e.id, fecha: e.fecha, titulo: "Entreno" + (e.titulo ? ` · ${e.titulo}` : ""), sub: e.lugar || "", accion: () => formEntreno(e), mio: true });
  for (const t of D.tareas) if (t.fecha) ev.push({ tipo: "tarea", id: t.id, fecha: t.fecha, titulo: t.titulo || "Sin título", sub: (t.asignados || []).map((a) => persona(a)?.nombre).filter(Boolean).join(", "), href: `#/tarea/${t.id}`, hecho: t.estado === "hecho", mio: (t.asignados || []).includes(yoId), avs: t.asignados });
  for (const c of D.contactos) if (c.fechaSeguimiento) ev.push({ tipo: "seguimiento", id: c.id, fecha: c.fechaSeguimiento, titulo: `Seguimiento · ${c.nombre}`, sub: c.proximoPaso || c.empresa || "", accion: () => formContacto(c), mio: c.responsable === yoId });
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
function evHTML(e) {
  return `<${e.href ? `a href="${e.href}"` : `button type="button" data-ev="${e.tipo}:${e.id}" style="width:100%;text-align:left;font:inherit;cursor:pointer"`} class="ev t-${e.tipo}${e.hecho ? " hecho" : ""}">
    <span class="hora">${hora(e.fecha) || "día"}</span>
    <span><span class="tit">${esc(e.titulo)}</span>${e.sub ? `<br><span class="sub">${esc(e.sub)}</span>` : ""}</span>
    <span class="row"><span class="dot"></span></span></${e.href ? "a" : "button"}>`;
}
function enganchaEventos(el, lista) {
  $$("[data-ev]", el).forEach((b) => b.addEventListener("click", () => { const [t, id] = b.dataset.ev.split(":"); lista.find((x) => x.tipo === t && x.id === id)?.accion?.(); }));
}
function agendaHTML(lista, { vacia = "Nada por aquí." } = {}) {
  if (!lista.length) return `<div class="vacio">${vacia}</div>`;
  let html = "", dia = ""; const h = hoyStr();
  for (const e of lista) { const d = e.fecha.slice(0, 10); if (d !== dia) { dia = d; html += `<div class="ag-dia${d === h ? " hoy" : ""}">${fechaLarga(d)}</div>`; } html += evHTML(e); }
  return `<div class="agenda">${html}</div>`;
}

// ---------- router ----------
const app = $("#app");
let limpiar = null; // función de limpieza de la vista actual
function ruta() { const h = location.hash.replace(/^#\/?/, "") || "inicio"; const [r, id] = h.split("/"); return { r, id }; }
function titulo(t) { $("#topTit").textContent = t || ""; }

async function render() {
  if (limpiar) { limpiar(); limpiar = null; }
  $("#nav").hidden = true; $("#btnYo").hidden = true;
  if (!clave) return vistaLogin();
  if (!D._cargado) {
    try { await cargar(); D._cargado = true; } catch (e) { if (e.message !== "clave") app.innerHTML = `<div class="aviso">No se pudieron cargar los datos. <button class="btn sm" onclick="location.reload()">Reintentar</button></div>`; return; }
  }
  if (!yo()) return vistaQuienEres();
  $("#nav").hidden = false;
  const b = $("#btnYo"); b.hidden = false; b.textContent = iniciales(yo().nombre); b.style.background = yo().color || "";
  const { r, id } = ruta();
  const base = { tarea: "tareas", idea: "ideas", partido: "mas", partidos: "mas", contactos: "mas", archivos: "mas", equipo: "mas", sincronizar: "mas", instalar: "mas", entrenos: "mas" }[r] || r;
  $$("#nav a").forEach((a) => (a.dataset.r === base ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  const V = { inicio: vistaInicio, calendario: vistaCalendario, tareas: vistaTareas, tarea: vistaTarea, ideas: vistaIdeas, idea: vistaIdea, asistente: vistaAsistente, mas: vistaMas, partidos: vistaPartidos, partido: vistaPartido, contactos: vistaContactos, archivos: vistaArchivos, equipo: vistaEquipo, sincronizar: vistaSincronizar, instalar: vistaInstalar, entrenos: vistaEntrenos };
  (V[r] || vistaInicio)(id);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);
$("#btnYo").addEventListener("click", () => (location.hash = "#/mas"));

// ---------- acceso ----------
function vistaLogin() {
  titulo("");
  app.innerHTML = `<form class="login" id="fLogin">
    <img src="/icon-192.png" alt="">
    <h1>Redes HC Liceo</h1>
    <p class="muted">Calendario, tareas, ideas y contactos del equipo de redes.</p>
    <input class="inp" type="password" id="kIn" placeholder="Clave del equipo" autocomplete="current-password" required>
    <button class="btn pri full">Entrar</button>
  </form>`;
  $("#fLogin").addEventListener("submit", async (e) => {
    e.preventDefault(); clave = $("#kIn").value.trim(); ls.set("rl-clave", clave);
    try { await cargar(); D._cargado = true; render(); } catch { toast("Clave incorrecta"); }
  });
}
// El equipo de redes: se crea solo la primera vez (ids fijos, así no se duplica).
const EQUIPO_BASE = [
  { id: "kiko", nombre: "Kiko", color: "#ACD4B7" },
  { id: "adri", nombre: "Adri", color: "#8EC5FF" },
  { id: "gonga", nombre: "Gonga", color: "#F3C66E" },
];
function asegurarEquipo() {
  const faltan = EQUIPO_BASE.filter((b) => !D.personas.some((p) => p.id === b.id || (p.nombre || "").trim().toLowerCase() === b.nombre.toLowerCase()));
  if (faltan.length) escribir(faltan.map((b) => ({ op: "set", col: "personas", id: b.id, data: { nombre: b.nombre, color: b.color, calToken: uid(24), creado: new Date().toISOString() } })));
}
function vistaQuienEres() {
  titulo("");
  app.innerHTML = `<div class="login" style="max-width:560px">
    <h1>¿Quién eres?</h1>
    <p class="muted">Así sabremos qué tareas son tuyas y te prepararemos tu calendario.</p>
    <div class="personas-ini">${D.personas.map((p) => `<button data-p="${p.id}">${av(p)}${esc(p.nombre)}</button>`).join("")}</div>
    <details class="small muted"><summary>No estoy en la lista</summary>
    <form id="fNueva" class="row" style="justify-content:center;margin-top:10px"><input class="inp" id="nNom" placeholder="Mi nombre" style="flex:1" required><button class="btn pri">Añadirme</button></form></details>
  </div>`;
  $$("[data-p]").forEach((b) => b.addEventListener("click", () => { yoId = b.dataset.p; ls.set("rl-yo", yoId); render(); }));
  $("#fNueva").addEventListener("submit", (e) => {
    e.preventDefault(); const nombre = $("#nNom").value.trim(); if (!nombre) return;
    yoId = crear("personas", { nombre, color: COLORES[D.personas.length % COLORES.length], calToken: uid(24) });
    ls.set("rl-yo", yoId); render();
  });
}

// ---------- INICIO ----------
// ---------- INICIO: calendario de los próximos días + próximas tareas ----------
const inicioEstado = Object.assign({ quien: "mias" }, ls.get("rl-inicio", {}));
function filtroPersonaTareas(ts, quien) {
  if (quien === "mias") return ts.filter((t) => (t.asignados || []).includes(yoId));
  if (quien === "todas") return ts;
  if (quien === "compartidas") return ts.filter((t) => (t.asignados || []).length > 1);
  if (quien === "sin") return ts.filter((t) => !(t.asignados || []).length);
  return ts.filter((t) => (t.asignados || []).includes(quien));
}
function chipsPersonas(sel, extra = []) {
  const otros = D.personas.filter((p) => p.id !== yoId);
  return [["mias", "Mías"], ...otros.map((p) => [p.id, p.nombre.split(" ")[0]]), ["compartidas", "🤝 Compartidas"], ["todas", "👥 Todas"], ...extra]
    .map(([k, v]) => `<button class="chip" data-quien="${esc(k)}" aria-pressed="${sel === k}">${k === "mias" ? av(yo()) : persona(k) ? av(persona(k)) : ""}${esc(v)}</button>`).join("");
}
function vistaInicio() {
  titulo("");
  const ahora = new Date(); const h = hoyStr();
  if (!inicioEstado.dia || inicioEstado.dia < h) inicioEstado.dia = h;
  const saludo = ahora.getHours() < 13 ? "Buenos días" : ahora.getHours() < 21 ? "Buenas tardes" : "Buenas noches";
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const evs = eventos().filter((e) => !(e.tipo === "tarea" && e.hecho));
  const porDia = {}; for (const e of evs) (porDia[e.fecha.slice(0, 10)] ||= []).push(e);
  const proximo = D.partidos.filter((p) => p.fecha && aFecha(p.fecha) > new Date(ahora - 3 * 36e5)).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];

  const pinta = () => {
    let tira = "";
    for (let i = 0; i < 21; i++) {
      const s = sumarDias(h, i); const d = aFecha(s); const lista = porDia[s] || []; const pa = lista.find((e) => e.tipo === "partido");
      tira += `<button class="tdia${s === inicioEstado.dia ? " sel" : ""}${s === h ? " hoy" : ""}" data-dia="${s}">
        <span class="ds">${i === 0 ? "hoy" : DSEM[d.getDay()]}</span><b>${d.getDate()}</b>
        <span class="dots">${pa ? `<span class="dot t-partido gordo"></span>` : ""}${lista.filter((e) => e.tipo !== "partido").slice(0, 4).map((e) => `<span class="dot t-${e.tipo}"></span>`).join("")}</span></button>`;
    }
    const delDia = porDia[inicioEstado.dia] || [];
    const ts = filtroPersonaTareas(D.tareas.filter((t) => t.estado !== "hecho"), inicioEstado.quien)
      .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999") || (b.prioridad === "alta") - (a.prioridad === "alta"));
    app.innerHTML = `
      <p class="eyebrow">${esc(fechaLarga(h))}</p><h1>${saludo}, ${esc(yo().nombre.split(" ")[0])}</h1>
      ${!instalada && /iPhone|iPad/.test(navigator.userAgent) ? `<a class="aviso row" href="#/instalar" style="margin-top:12px;text-decoration:none">📲 <span>Añádela a tu pantalla de inicio</span></a>` : ""}
      <div class="sec">
        <div class="between"><h2>Calendario</h2><a class="btn sm ghost" href="#/calendario">Ver mes ›</a></div>
        <div class="tira" id="tira">${tira}</div>
        <div class="between" style="margin:12px 0 8px"><h3>${esc(fechaLarga(inicioEstado.dia))}</h3><button class="btn sm" id="anadirDia">+ Añadir</button></div>
        ${delDia.length ? `<div class="agenda">${delDia.map(evHTML).join("")}</div>` : `<div class="vacio">Nada este día.</div>`}
      </div>
      <div class="sec">
        <div class="between"><h2>Próximas tareas</h2><button class="btn sm pri" id="nuevaT">+ Tarea</button></div>
        <div class="chips">${chipsPersonas(inicioEstado.quien)}</div>
        <div class="stack" style="margin-top:10px">${ts.slice(0, 10).map(tareaHTML).join("") || `<div class="vacio">No hay tareas pendientes aquí. 🎉</div>`}</div>
        ${ts.length > 10 ? `<a class="btn sm ghost full" href="#/tareas" style="margin-top:8px">Ver las ${ts.length} ›</a>` : ""}
      </div>
      <div class="sec">
        <div class="between"><h2>Próximo partido</h2><a class="btn sm ghost" href="#/partidos">Todos ›</a></div>
        ${proximo ? partidoCard(proximo, true) : `<div class="vacio">No hay partidos próximos. <a href="#/partidos">Añádelos</a>.</div>`}
      </div>`;
    $$("[data-dia]").forEach((b) => b.addEventListener("click", () => { inicioEstado.dia = b.dataset.dia; const x = $("#tira").scrollLeft; pinta(); $("#tira").scrollLeft = x; }));
    $$("[data-quien]").forEach((b) => b.addEventListener("click", () => { inicioEstado.quien = b.dataset.quien; ls.set("rl-inicio", { quien: inicioEstado.quien }); const y = scrollY; pinta(); scrollTo(0, y); }));
    $("#anadirDia").addEventListener("click", () => menuAnadir(inicioEstado.dia));
    $("#nuevaT").addEventListener("click", () => { const asig = persona(inicioEstado.quien) ? [inicioEstado.quien] : [yoId]; const id = crear("tareas", { titulo: "", estado: "pendiente", asignados: asig }); location.hash = `#/tarea/${id}`; });
    enganchaTareas(app); enganchaEventos(app, delDia);
  };
  pinta();
}
function partidoCard(p, destacado) {
  const nT = D.tareas.filter((t) => t.partidoId === p.id); const hechas = nT.filter((t) => t.estado === "hecho").length;
  return `<a class="card${destacado ? " prox" : ""}" href="#/partido/${p.id}">
    <div class="row"><span class="badge ${p.casa ? "casa" : "fuera"}">${p.casa ? "Casa" : "Fuera"}</span>${p.competicion ? `<span class="badge comp">${esc(p.competicion)}</span>` : ""}${p.jornada ? `<span class="muted small">${esc(p.jornada)}</span>` : ""}</div>
    <div class="vs">${esc(vsTxt(p))}</div>
    <div class="meta"><span>📅 ${esc(fechaCorta(p.fecha))}</span>${p.lugar ? `<span>📍 ${esc(p.lugar)}</span>` : ""}${p.tv ? `<span>📺 ${esc(p.tv)}</span>` : ""}${p.resultado ? `<b>${esc(p.resultado)}</b>` : ""}</div>
    ${destacado ? `<div class="between" style="margin-top:8px"><span class="cuenta">${cuentaAtras(p.fecha)}</span>${nT.length ? `<span class="muted small">${hechas}/${nT.length} tareas hechas</span>` : ""}</div>` : ""}
  </a>`;
}

// ---------- CALENDARIO ----------
const calEstado = Object.assign({ modo: "mes", filtros: ["partido", "entreno", "tarea", "seguimiento"], soloMias: false }, ls.get("rl-cal", {}));
function vistaCalendario() {
  titulo("Calendario");
  calEstado.mes ||= hoyStr().slice(0, 7); calEstado.sel ||= hoyStr();
  const guardaEstado = () => ls.set("rl-cal", { modo: calEstado.modo, filtros: calEstado.filtros, soloMias: calEstado.soloMias });
  const pinta = () => {
    const todos = eventos().filter((e) => calEstado.filtros.includes(e.tipo) && (!calEstado.soloMias || e.mio || e.tipo === "partido"));
    let cuerpo = "";
    if (calEstado.modo === "mes") {
      const [y, m] = calEstado.mes.split("-").map(Number);
      const primero = new Date(y, m - 1, 1); const ini = new Date(primero); ini.setDate(1 - ((primero.getDay() + 6) % 7));
      const porDia = {}; for (const e of todos) (porDia[e.fecha.slice(0, 10)] ||= []).push(e);
      let celdas = ["L", "M", "X", "J", "V", "S", "D"].map((d) => `<div class="dsem">${d}</div>`).join("");
      for (let i = 0; i < 42; i++) {
        const d = new Date(ini); d.setDate(ini.getDate() + i); const s = diaStr(d); const evs = porDia[s] || [];
        if (i >= 35 && d.getMonth() !== m - 1) break;
        const pa = evs.find((e) => e.tipo === "partido");
        celdas += `<button class="dia${d.getMonth() !== m - 1 ? " fuera" : ""}${s === hoyStr() ? " hoy" : ""}${s === calEstado.sel ? " sel" : ""}" data-d="${s}">
          <b>${d.getDate()}</b>${pa ? `<span class="escu">${esc(partido(pa.id)?.casa ? "🏠" : "✈️")}${esc((partido(pa.id)?.rival || "").slice(0, 8))}</span>` : ""}
          <span class="dots">${evs.filter((e) => e.tipo !== "partido").slice(0, 6).map((e) => `<span class="dot t-${e.tipo}"></span>`).join("")}</span></button>`;
      }
      const delDia = porDia[calEstado.sel] || [];
      cuerpo = `<div class="mes-cab"><button class="btn sm" data-mes="-1" aria-label="Mes anterior">‹</button><h2>${MESES[m - 1]} ${y}</h2><button class="btn sm" data-mes="1" aria-label="Mes siguiente">›</button></div>
        <div class="mes">${celdas}</div>
        <div class="sec" style="margin-top:16px"><div class="between"><h3>${fechaLarga(calEstado.sel)}</h3><button class="btn sm" data-hoy>Hoy</button></div>
        ${delDia.length ? `<div class="agenda" style="margin-top:8px">${delDia.map(evHTML).join("")}</div>` : `<div class="vacio" style="margin-top:8px">Nada este día.</div>`}</div>`;
    } else {
      const desde = sumarDias(hoyStr(), -1);
      cuerpo = agendaHTML(todos.filter((e) => e.fecha.slice(0, 10) >= desde).slice(0, 150), { vacia: "No hay nada próximo con estos filtros." });
    }
    app.innerHTML = `
      <div class="between"><div class="seg"><button data-modo="mes" aria-pressed="${calEstado.modo === "mes"}">Mes</button><button data-modo="lista" aria-pressed="${calEstado.modo === "lista"}">Lista</button></div>
      <a class="btn sm" href="#/sincronizar">📲 En mi calendario</a></div>
      <div class="chips" style="margin-top:12px">
        ${Object.entries(TIPOS).map(([k, v]) => `<button class="chip t-${k}" data-f="${k}" aria-pressed="${calEstado.filtros.includes(k)}"><i class="dot"></i>${v}</button>`).join("")}
        <button class="chip" data-mias aria-pressed="${calEstado.soloMias}">👤 Solo lo mío</button>
      </div>
      ${cuerpo}
      <div style="height:72px"></div>
      <button class="fab" id="fab" aria-label="Añadir">+</button>`;
    $$("[data-modo]").forEach((b) => b.addEventListener("click", () => { calEstado.modo = b.dataset.modo; guardaEstado(); pinta(); }));
    $$("[data-f]").forEach((b) => b.addEventListener("click", () => { const f = b.dataset.f; calEstado.filtros = calEstado.filtros.includes(f) ? calEstado.filtros.filter((x) => x !== f) : [...calEstado.filtros, f]; guardaEstado(); pinta(); }));
    $("[data-mias]").addEventListener("click", () => { calEstado.soloMias = !calEstado.soloMias; guardaEstado(); pinta(); });
    $$("[data-mes]").forEach((b) => b.addEventListener("click", () => { const [y, m] = calEstado.mes.split("-").map(Number); const d = new Date(y, m - 1 + Number(b.dataset.mes), 1); calEstado.mes = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; pinta(); }));
    $$("[data-d]").forEach((b) => b.addEventListener("click", () => { calEstado.sel = b.dataset.d; if (b.dataset.d.slice(0, 7) !== calEstado.mes) calEstado.mes = b.dataset.d.slice(0, 7); pinta(); }));
    $("[data-hoy]")?.addEventListener("click", () => { calEstado.sel = hoyStr(); calEstado.mes = hoyStr().slice(0, 7); pinta(); });
    enganchaEventos(app, todos);
    $("#fab").addEventListener("click", () => menuAnadir(calEstado.modo === "mes" ? calEstado.sel : hoyStr()));
  };
  pinta();
  calEstado._repinta = pinta;
}
function menuAnadir(dia) {
  abrirModal(`<h2>Añadir al calendario</h2><div class="menu">
    <button data-a="tarea"><span class="ico t-tarea">✅</span><span>Trabajo / tarea<small>Con fecha y quién se encarga</small></span></button>
    <button data-a="partido"><span class="ico t-partido">🏑</span><span>Partido<small>OK Liga, Copa del Rey, Champions…</small></span></button>
    <button data-a="entreno"><span class="ico t-entreno">⏱️</span><span>Entreno<small>Uno o varios recurrentes</small></span></button>
  </div><button class="btn ghost" data-cerrar>Cancelar</button>`, (m) => {
    $("[data-a=tarea]", m).addEventListener("click", () => { const id = crear("tareas", { titulo: "", estado: "pendiente", asignados: [yoId], fecha: dia }); cerrarModal(); location.hash = `#/tarea/${id}`; });
    $("[data-a=partido]", m).addEventListener("click", () => formPartido({ fecha: dia + "T18:00", casa: true, competicion: "OK Liga" }));
    $("[data-a=entreno]", m).addEventListener("click", () => formEntreno({ fecha: dia + "T20:00", duracion: 90 }));
  });
}

// ---------- TAREAS ----------
const ESTADOS_T = { pendiente: "Pendiente", curso: "En curso", hecho: "Hecho" };
const tareaEstado = Object.assign({ quien: "mias" }, ls.get("rl-tareas", {}));
function tareaHTML(t) {
  const tarde = t.fecha && t.estado !== "hecho" && t.fecha.slice(0, 10) < hoyStr();
  const pa = t.partidoId && partido(t.partidoId);
  const ck = (t.checklist || []); const ckH = ck.filter((c) => c.ok).length;
  return `<div class="tarea ${t.estado === "hecho" ? "hecho" : t.estado === "curso" ? "curso" : ""}">
    <button class="check" data-check="${t.id}" aria-label="Cambiar estado">✓</button>
    <a href="#/tarea/${t.id}"><span class="tt">${esc(t.titulo || "Sin título")}</span>
    <span class="meta">${t.estado === "curso" ? `<span class="lbl curso">En curso</span>` : ""}${t.prioridad === "alta" ? `<span class="lbl alta">Alta</span>` : ""}${t.fecha ? `<span class="${tarde ? "lbl tarde" : ""}">📅 ${esc(fechaCorta(t.fecha))}</span>` : ""}${pa ? `<span>🏑 ${esc(pa.rival)}</span>` : ""}${ck.length ? `<span>☑ ${ckH}/${ck.length}</span>` : ""}${avs(t.asignados)}</span></a>
  </div>`;
}
function enganchaTareas(el) {
  $$("[data-check]", el).forEach((b) => b.addEventListener("click", () => {
    const t = D.tareas.find((x) => x.id === b.dataset.check); if (!t) return;
    const sig = t.estado === "hecho" ? "pendiente" : "hecho";
    guardar("tareas", t.id, { estado: sig, ...(sig === "hecho" ? { hechoPor: yoId, hechoEn: new Date().toISOString() } : {}) });
    if (sig === "hecho") toast("¡Hecho! ✓");
    render();
  }));
}
function vistaTareas() {
  titulo("Tareas");
  const pinta = () => {
    const ts = filtroPersonaTareas(D.tareas.slice(), tareaEstado.quien);
    const orden = (a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999") || (b.prioridad === "alta") - (a.prioridad === "alta");
    const grupo = (k, lista, max) => lista.length ? `<div class="grupo-cab">${ESTADOS_T[k]} <span>· ${lista.length}</span></div><div class="stack">${lista.slice(0, max).map(tareaHTML).join("")}</div>` : "";
    const hechas = ts.filter((t) => t.estado === "hecho").sort((a, b) => (b.hechoEn || b.editado || "").localeCompare(a.hechoEn || a.editado || ""));
    app.innerHTML = `
      <div class="between"><h1>Tareas</h1><button class="btn pri sm" id="nueva">+ Nueva</button></div>
      <div class="chips" style="margin-top:12px">${chipsPersonas(tareaEstado.quien, [["sin", "Sin asignar"]])}</div>
      ${grupo("curso", ts.filter((t) => t.estado === "curso").sort(orden), 999)}
      ${grupo("pendiente", ts.filter((t) => (t.estado || "pendiente") === "pendiente").sort(orden), 999)}
      ${grupo("hecho", hechas, 15)}
      ${ts.length ? "" : `<div class="vacio" style="margin-top:16px">No hay tareas aquí.</div>`}`;
    $$("[data-quien]").forEach((b) => b.addEventListener("click", () => { tareaEstado.quien = b.dataset.quien; ls.set("rl-tareas", tareaEstado); pinta(); }));
    $("#nueva").addEventListener("click", () => { const id = crear("tareas", { titulo: "", estado: "pendiente", asignados: [yoId] }); location.hash = `#/tarea/${id}`; });
    enganchaTareas(app);
  };
  pinta();
}

// Editor de página (tarea o idea), al estilo Notion: título, propiedades, cuerpo con Markdown, checklist e IA.
function selPersonas(nombre, sel = []) {
  return `<div class="pick">${D.personas.map((p) => `<label><input type="checkbox" name="${nombre}" value="${p.id}" ${sel.includes(p.id) ? "checked" : ""}>${av(p)} ${esc(p.nombre.split(" ")[0])}</label>`).join("")}</div>`;
}
function opcionesPartido(sel) {
  const ps = D.partidos.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  return `<option value="">—</option>` + ps.map((p) => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(fechaCorta(p.fecha).split(" · ")[0])} · ${esc(vsTxt(p))}</option>`).join("");
}
function campoFecha(valor = "") {
  return `<span class="row" style="gap:4px;flex-wrap:nowrap"><input type="date" data-fd value="${esc(valor.slice(0, 10))}"><input type="time" data-fh value="${esc(hora(valor))}" style="max-width:96px"></span>`;
}
const leeFecha = (el) => { const d = $("[data-fd]", el).value; const h = $("[data-fh]", el).value; return d ? (h ? `${d}T${h}` : d) : ""; };

function vistaTarea(id) { editorPagina("tareas", id); }
function vistaIdea(id) { editorPagina("ideas", id); }
function editorPagina(col, id) {
  const doc = D[col].find((x) => x.id === id);
  if (!doc) { app.innerHTML = `<div class="vacio">No existe (o se ha borrado). <a href="#/${col}">Volver</a></div>`; return; }
  const esTarea = col === "tareas"; titulo(esTarea ? "Tarea" : "Idea");
  const campoTexto = esTarea ? "descripcion" : "cuerpo";
  const REDES = ["Instagram", "TikTok", "X", "YouTube", "Facebook", "Web", "WhatsApp"];
  const EST_I = { idea: "💡 Idea", desarrollo: "🛠️ En desarrollo", aprobada: "👍 Aprobada", publicada: "✅ Publicada", descartada: "🗑️ Descartada" };
  let editando = !doc[campoTexto];
  app.innerHTML = `<div class="pagina">
    <div class="between"><a class="btn sm ghost" href="#/${col}">‹ ${esTarea ? "Tareas" : "Ideas"}</a><span class="guardado" id="guardado"></span></div>
    <textarea class="pag-tit" id="tit" rows="1" placeholder="${esTarea ? "¿Qué hay que hacer?" : "Título de la idea"}">${esc(doc.titulo || "")}</textarea>
    <div class="props">
      <div class="prop"><span>Estado</span><select id="pEstado">${Object.entries(esTarea ? ESTADOS_T : EST_I).map(([k, v]) => `<option value="${k}" ${(doc.estado || (esTarea ? "pendiente" : "idea")) === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      ${esTarea ? `<div class="prop"><span>Quién</span>${selPersonas("asig", doc.asignados || [])}</div>
      <div class="prop"><span>Fecha</span><span id="pFecha">${campoFecha(doc.fecha || "")}</span></div>
      <div class="prop"><span>Prioridad</span><select id="pPrio">${["baja", "normal", "alta"].map((p) => `<option ${(doc.prioridad || "normal") === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>`
      : `<div class="prop"><span>Redes</span><div class="pick">${REDES.map((r) => `<label><input type="checkbox" name="redes" value="${r}" ${(doc.redes || []).includes(r) ? "checked" : ""}>${r}</label>`).join("")}</div></div>
      <div class="prop"><span>De</span><select id="pAutor"><option value="">—</option>${D.personas.map((p) => `<option value="${p.id}" ${p.id === (doc.autor || doc.creadoPor) ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></div>`}
      <div class="prop"><span>Partido</span><select id="pPartido">${opcionesPartido(doc.partidoId)}</select></div>
    </div>
    <div class="between"><h3>${esTarea ? "Explicación" : "Desarrollo"}</h3><span class="row"><button class="btn sm" id="tEdit"></button>${IA ? `<button class="btn sm ia" id="iaDes">✨ Desarrollar con IA</button>` : ""}</span></div>
    <div id="cuerpoBox"></div>
    <div id="iaBox"></div>
    ${esTarea ? `<div><div class="between"><h3>Checklist</h3><button class="btn sm" id="ckAdd">+ Paso</button></div><div class="checklist" id="ck" style="margin-top:6px"></div></div>` : ""}
    <div class="pie" style="margin-top:10px">
      ${esTarea ? "" : `<button class="btn" id="aTarea">➜ Convertir en tarea</button>`}
      ${doc.ideaId && D.ideas.find((i) => i.id === doc.ideaId) ? `<a class="btn sm" href="#/idea/${doc.ideaId}">💡 Ver idea original</a>` : ""}
      <button class="btn danger" id="borrar">Borrar</button>
    </div>
    <p class="muted small">${doc.creadoPor && persona(doc.creadoPor) ? `Creado por ${esc(persona(doc.creadoPor).nombre)}` : ""}${doc.creado ? ` · ${esc(fechaCorta(doc.creado.slice(0, 10)))}` : ""}</p>
  </div>`;

  const guarda = (data) => guardar(col, id, data);
  const tit = $("#tit"); const ajusta = () => { tit.style.height = "auto"; tit.style.height = tit.scrollHeight + "px"; }; ajusta();
  tit.addEventListener("input", () => { ajusta(); guardaTit(); });
  const guardaTit = debounce(() => guarda({ titulo: tit.value.trim() }), 500);
  if (!doc.titulo) tit.focus();
  $("#pEstado").addEventListener("change", (e) => guarda({ estado: e.target.value, ...(e.target.value === "hecho" ? { hechoPor: yoId, hechoEn: new Date().toISOString() } : {}) }));
  $("#pPartido").addEventListener("change", (e) => guarda({ partidoId: e.target.value }));
  if (esTarea) {
    $$("input[name=asig]").forEach((i) => i.addEventListener("change", () => guarda({ asignados: $$("input[name=asig]:checked").map((x) => x.value) })));
    $$("#pFecha input").forEach((i) => i.addEventListener("change", () => guarda({ fecha: leeFecha($("#pFecha")) })));
    $("#pPrio").addEventListener("change", (e) => guarda({ prioridad: e.target.value }));
  } else {
    $$("input[name=redes]").forEach((i) => i.addEventListener("change", () => guarda({ redes: $$("input[name=redes]:checked").map((x) => x.value) })));
    $("#pAutor").addEventListener("change", (e) => guarda({ autor: e.target.value }));
    $("#aTarea").addEventListener("click", () => {
      const tid = crear("tareas", { titulo: doc.titulo || "Tarea", descripcion: doc.cuerpo || "", estado: "pendiente", asignados: [yoId], partidoId: doc.partidoId || "", ideaId: id });
      guarda({ estado: doc.estado === "idea" ? "aprobada" : doc.estado, tareaId: tid }); location.hash = `#/tarea/${tid}`;
    });
  }

  // cuerpo: vista Markdown o edición
  const pintaCuerpo = () => {
    $("#tEdit").textContent = editando ? "Ver" : "✏️ Editar";
    const box = $("#cuerpoBox");
    if (editando) {
      box.innerHTML = `<textarea class="cuerpo" id="cuerpo" placeholder="${esTarea ? "Explica la tarea: qué, cómo, para cuándo, material…" : "Desarrolla la idea…"}&#10;&#10;Admite Markdown: # Título, **negrita**, - listas">${esc(doc[campoTexto] || "")}</textarea>`;
      const ta = $("#cuerpo"); const guardaC = debounce(() => guarda({ [campoTexto]: ta.value }), 600);
      const alto = () => { ta.style.height = "auto"; ta.style.height = Math.max(180, ta.scrollHeight + 4) + "px"; }; alto();
      ta.addEventListener("input", () => { alto(); guardaC(); });
    } else {
      box.innerHTML = doc[campoTexto] ? `<div class="card md">${md(doc[campoTexto])}</div>` : `<div class="vacio">Sin texto todavía.</div>`;
    }
  };
  $("#tEdit").addEventListener("click", () => { editando = !editando; pintaCuerpo(); });
  pintaCuerpo();

  // checklist
  if (esTarea) {
    const pintaCk = () => {
      const ck = doc.checklist || [];
      $("#ck").innerHTML = ck.map((c, i) => `<div class="ck ${c.ok ? "ok" : ""}"><input type="checkbox" data-i="${i}" ${c.ok ? "checked" : ""}><input type="text" data-t="${i}" value="${esc(c.t)}" placeholder="Paso…"><button class="btn sm ghost" data-x="${i}" aria-label="Quitar">✕</button></div>`).join("") || `<p class="muted small">Divide la tarea en pasos si hace falta.</p>`;
      $$("[data-i]", $("#ck")).forEach((b) => b.addEventListener("change", () => { ck[b.dataset.i].ok = b.checked; guarda({ checklist: ck }); pintaCk(); }));
      $$("[data-t]", $("#ck")).forEach((b) => b.addEventListener("input", debounce(() => { ck[b.dataset.t].t = b.value; guarda({ checklist: ck }); }, 500)));
      $$("[data-x]", $("#ck")).forEach((b) => b.addEventListener("click", () => { ck.splice(b.dataset.x, 1); guarda({ checklist: ck }); pintaCk(); }));
    };
    $("#ckAdd").addEventListener("click", () => { doc.checklist = [...(doc.checklist || []), { t: "", ok: false }]; guarda({ checklist: doc.checklist }); pintaCk(); $$("[data-t]").pop()?.focus(); });
    pintaCk();
  }

  // IA
  $("#iaDes")?.addEventListener("click", () => {
    const box = $("#iaBox");
    box.innerHTML = `<div class="ia-caja"><label class="f">¿Algo concreto? (opcional)<input class="inp" id="iaInstr" placeholder="Ej.: hazlo para Reels, con 3 opciones de copy"></label><button class="btn ia" id="iaGo">✨ Generar</button></div>`;
    $("#iaGo").addEventListener("click", async () => {
      const instr = $("#iaInstr").value; const pa = doc.partidoId && partido(doc.partidoId);
      box.innerHTML = `<div class="ia-caja"><div class="eyebrow">✨ Propuesta de la IA</div><div class="md escribiendo" id="iaOut"></div><div class="row" id="iaAcc" hidden><button class="btn sm pri" id="iaAdd">Añadir al texto</button><button class="btn sm" id="iaRep">Reemplazar texto</button><button class="btn sm ghost" id="iaNo">Descartar</button></div></div>`;
      const texto = await streamIA("/api/ia/desarrollar", { titulo: doc.titulo, texto: (doc[campoTexto] || "") + (pa ? `\n\n(Relacionado con el partido ${vsTxt(pa)}, ${pa.competicion || ""}, ${fechaCorta(pa.fecha)})` : ""), instruccion: instr, quien: yo().nombre }, $("#iaOut"));
      $("#iaOut").classList.remove("escribiendo"); $("#iaAcc").hidden = false;
      $("#iaAdd").addEventListener("click", () => { doc[campoTexto] = ((doc[campoTexto] || "").trim() + "\n\n" + texto).trim(); guarda({ [campoTexto]: doc[campoTexto] }); box.innerHTML = ""; editando = false; pintaCuerpo(); if (!esTarea && doc.estado === "idea") { guarda({ estado: "desarrollo" }); $("#pEstado").value = "desarrollo"; } });
      $("#iaRep").addEventListener("click", () => { doc[campoTexto] = texto; guarda({ [campoTexto]: texto }); box.innerHTML = ""; editando = false; pintaCuerpo(); });
      $("#iaNo").addEventListener("click", () => (box.innerHTML = ""));
    });
  });

  confirmarBorrado($("#borrar"), () => { borrar(col, id); location.hash = `#/${col}`; });
}
function confirmarBorrado(btn, fn) {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("arm")) return fn();
    btn.classList.add("arm"); const txt = btn.textContent; btn.textContent = "¿Seguro? Toca otra vez";
    setTimeout(() => { btn.classList.remove("arm"); btn.textContent = txt; }, 3000);
  });
}

// ---------- IDEAS ----------
const ideaEstado = Object.assign({ f: "activas" }, ls.get("rl-ideas", {}));
function vistaIdeas() {
  titulo("Ideas");
  const pinta = () => {
    let is = D.ideas.slice().sort((a, b) => (b.editado || b.creado || "").localeCompare(a.editado || a.creado || ""));
    if (ideaEstado.f === "activas") is = is.filter((i) => !["publicada", "descartada"].includes(i.estado));
    else if (ideaEstado.f !== "todas") is = is.filter((i) => (i.estado || "idea") === ideaEstado.f);
    const EST = { idea: "Idea", desarrollo: "En desarrollo", aprobada: "Aprobada", publicada: "Publicada", descartada: "Descartada" };
    app.innerHTML = `
      <div class="between"><h1>Ideas</h1><button class="btn pri sm" id="nueva">+ Nueva idea</button></div>
      <p class="muted small" style="margin:6px 0 0">Apunta cualquier idea de contenido y desarróllala (con la IA si quieres). Cuando esté lista, conviértela en tarea.</p>
      <div class="chips" style="margin-top:12px">${[["activas", "Activas"], ["idea", "💡 Ideas"], ["desarrollo", "🛠️ En desarrollo"], ["aprobada", "👍 Aprobadas"], ["publicada", "✅ Publicadas"], ["todas", "Todas"]].map(([k, v]) => `<button class="chip" data-f="${k}" aria-pressed="${ideaEstado.f === k}">${v}</button>`).join("")}</div>
      <div class="stack" style="margin-top:14px">${is.map((i) => {
        const pa = i.partidoId && partido(i.partidoId); const aut = persona(i.autor || i.creadoPor);
        return `<a class="card" href="#/idea/${i.id}"><div class="between"><b>${esc(i.titulo || "Sin título")}</b><span class="estado e-${esc(i.estado || "idea")}">${EST[i.estado || "idea"]}</span></div>
          ${i.cuerpo ? `<p class="muted small" style="margin:6px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(i.cuerpo.replace(/[#*_>`-]/g, "").slice(0, 220))}</p>` : ""}
          <div class="meta" style="margin-top:6px">${(i.redes || []).map((r) => `<span class="lbl">${esc(r)}</span>`).join("")}${pa ? `<span>🏑 ${esc(pa.rival)}</span>` : ""}${aut ? av(aut) : ""}</div></a>`;
      }).join("") || `<div class="vacio">No hay ideas aquí todavía.</div>`}</div>`;
    $$("[data-f]").forEach((b) => b.addEventListener("click", () => { ideaEstado.f = b.dataset.f; ls.set("rl-ideas", ideaEstado); pinta(); }));
    $("#nueva").addEventListener("click", () => { const id = crear("ideas", { titulo: "", estado: "idea", autor: yoId }); location.hash = `#/idea/${id}`; });
  };
  pinta();
}

// ---------- ASISTENTE (chat) ----------
let chat = ls.get("rl-chat", []);
let adjuntos = [];
async function streamIA(ruta, cuerpo, destino, alTrozo) {
  let texto = "";
  try {
    const r = await api(ruta, { method: "POST", body: JSON.stringify(cuerpo) });
    if (r.status === 503) { texto = "La IA no está activada todavía: falta poner la clave ANTHROPIC_API_KEY en Netlify."; destino.innerHTML = md(texto); return texto; }
    if (!r.ok || !r.body) throw new Error();
    const lector = r.body.getReader(); const dec = new TextDecoder(); let pendiente = false;
    for (;;) {
      const { value, done } = await lector.read(); if (done) break;
      texto += dec.decode(value, { stream: true });
      if (!pendiente) { pendiente = true; requestAnimationFrame(() => { pendiente = false; destino.innerHTML = md(texto); alTrozo?.(); }); }
    }
  } catch (e) { if (e.message !== "clave") texto += "\n\n⚠️ No se pudo conectar con la IA."; }
  destino.innerHTML = md(texto); alTrozo?.();
  return texto;
}
function vistaAsistente() {
  titulo("Asistente");
  const SUGS = ["¿Qué tengo esta semana?", "Ideas de contenido para el próximo partido", "¿Qué tareas están sin asignar?", "Resume el estado de los patrocinadores", "Prepara un calendario de posts para la semana"];
  app.innerHTML = `
    ${!IA ? `<div class="aviso">La IA no está activada todavía: hay que añadir la variable <b>ANTHROPIC_API_KEY</b> en Netlify.</div>` : ""}
    <div class="chat" id="chat"></div>
    <div class="compositor"><div class="wrap">
      ${chat.length ? "" : `<div class="sugs">${SUGS.map((s) => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>`}
      <div class="chips" id="adjs"></div>
      <form id="fChat"><button type="button" class="adj-btn" id="bAdj" aria-label="Adjuntar archivo">📎</button><textarea id="txt" rows="1" placeholder="Pregunta lo que sea…"></textarea><button class="enviar" aria-label="Enviar">↑</button></form>
    </div></div>`;
  const cont = $("#chat");
  const pintaChat = () => {
    cont.innerHTML = chat.length ? chat.map((m) => `<div class="msg ${m.role}">${m.adj?.length ? `<div class="adj">📎 ${m.adj.map(esc).join(", ")}</div>` : ""}${m.role === "user" ? esc(m.content) : md(m.content)}</div>`).join("") + `<div class="row" style="justify-content:center"><button class="btn sm ghost" id="borrarChat">Empezar conversación nueva</button></div>`
      : `<div class="card" style="text-align:center"><div style="font-size:34px">✨</div><h2 style="margin:6px 0">Asistente del equipo</h2><p class="muted small" style="margin:0">Conoce el calendario, las tareas, las ideas, los contactos y los archivos. Pregúntale, pídele ideas o adjunta un archivo con 📎 para que lo lea.</p></div>`;
    $("#borrarChat")?.addEventListener("click", () => { chat = []; ls.set("rl-chat", chat); render(); });
    window.scrollTo(0, document.body.scrollHeight);
  };
  const pintaAdj = () => { $("#adjs").innerHTML = adjuntos.map((a) => `<button class="chip" data-quita="${a}">📎 ${esc(D.archivos.find((x) => x.id === a)?.nombre || "archivo")} ✕</button>`).join(""); $$("[data-quita]").forEach((b) => b.addEventListener("click", () => { adjuntos = adjuntos.filter((x) => x !== b.dataset.quita); pintaAdj(); })); };
  pintaChat(); pintaAdj();
  const txt = $("#txt"); txt.addEventListener("input", () => { txt.style.height = "auto"; txt.style.height = txt.scrollHeight + "px"; });
  txt.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); $("#fChat").requestSubmit(); } });
  $$("[data-s]").forEach((b) => b.addEventListener("click", () => { txt.value = b.dataset.s; $("#fChat").requestSubmit(); }));
  $("#bAdj").addEventListener("click", () => elegirArchivos(adjuntos, (ids) => { adjuntos = ids; pintaAdj(); }));
  let ocupado = false;
  $("#fChat").addEventListener("submit", async (e) => {
    e.preventDefault(); const q = txt.value.trim(); if (!q || ocupado) return;
    ocupado = true; txt.value = ""; txt.style.height = "auto";
    const adjNombres = adjuntos.map((a) => D.archivos.find((x) => x.id === a)?.nombre || "archivo");
    chat.push({ role: "user", content: q, adj: adjNombres }); pintaChat(); $(".sugs")?.remove();
    const burbuja = document.createElement("div"); burbuja.className = "msg assistant md escribiendo"; cont.insertBefore(burbuja, cont.lastElementChild);
    const enviados = adjuntos; adjuntos = []; pintaAdj();
    const resp = await streamIA("/api/ia/chat", { mensajes: chat.map(({ role, content }) => ({ role, content })), archivos: enviados, quien: yo().nombre }, burbuja, () => window.scrollTo(0, document.body.scrollHeight));
    chat.push({ role: "assistant", content: resp || "(sin respuesta)" }); chat = chat.slice(-40); ls.set("rl-chat", chat);
    ocupado = false; pintaChat();
  });
}
function elegirArchivos(sel, fn) {
  const elegidos = new Set(sel);
  abrirModal(`<h2>Adjuntar archivos</h2><p class="muted small" style="margin:0">La IA puede leer PDF, imágenes y textos (máx. 5 a la vez).</p>
    <label class="btn full">⬆️ Subir uno nuevo<input type="file" id="subeAdj" hidden></label>
    <div class="stack" id="lAdj">${D.archivos.slice().sort((a, b) => (b.creado || "").localeCompare(a.creado || "")).map((a) => `<label class="item"><span class="ico">${icono(a.tipo, a.nombre)}</span><span class="tt">${esc(a.nombre)}</span><input type="checkbox" value="${a.id}" ${elegidos.has(a.id) ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--accent)"></label>`).join("") || `<div class="vacio">Aún no hay archivos.</div>`}</div>
    <div class="pie"><button class="btn ghost" data-cerrar>Cancelar</button><button class="btn pri" id="okAdj">Adjuntar</button></div>`, (m) => {
    $("#okAdj", m).addEventListener("click", () => { fn($$("#lAdj input:checked", m).map((i) => i.value).slice(0, 5)); cerrarModal(); });
    $("#subeAdj", m).addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; const id = await subirArchivo(f); if (id) { fn([...sel, id].slice(0, 5)); cerrarModal(); } });
  });
}

// ---------- MÁS ----------
function vistaMas() {
  titulo("");
  const tema = document.documentElement.dataset.tema;
  app.innerHTML = `
    <div class="row" style="gap:14px">${av(yo()).replace('class="av"', 'class="av" style="width:52px;height:52px;font-size:18px;border:0;--pc:' + esc(yo().color || "#ACD4B7") + '"')}<div><h1>${esc(yo().nombre)}</h1><button class="btn sm ghost" id="cambiar" style="padding-left:0">No soy yo · cambiar</button></div></div>
    <div class="menu sec">
      <a href="#/partidos"><span class="ico t-partido">🏑</span><span>Partidos<small>Casa y fuera · OK Liga, Copa, Champions</small></span></a>
      <a href="#/entrenos"><span class="ico t-entreno">⏱️</span><span>Entrenos<small>Calendario de entrenamientos</small></span></a>
      <a href="#/contactos"><span class="ico t-seguimiento">🤝</span><span>Contactos y patrocinadores<small>Seguimiento, teléfonos, próximos pasos</small></span></a>
      <a href="#/archivos"><span class="ico">📁</span><span>Archivos<small>Documentos, fotos, dosieres…</small></span></a>
      <a href="#/equipo"><span class="ico">👥</span><span>Equipo<small>${D.personas.length} personas</small></span></a>
    </div>
    <div class="menu sec">
      <a href="#/sincronizar"><span class="ico">📅</span><span>Sincronizar con mi calendario<small>Partidos y tus trabajos en el calendario del iPhone</small></span></a>
      <a href="#/instalar"><span class="ico">📲</span><span>Instalar en el iPhone<small>Acceso directo en la pantalla de inicio</small></span></a>
      <button id="tema"><span class="ico">${tema === "claro" ? "🌙" : "☀️"}</span><span>Tono ${tema === "claro" ? "oscuro" : "claro"}<small>Cambiar los colores de la app</small></span></button>
      <button id="salir"><span class="ico">🚪</span><span>Cerrar sesión<small>Olvidar la clave en este móvil</small></span></button>
    </div>`;
  $("#cambiar").addEventListener("click", () => { ls.del("rl-yo"); yoId = ""; render(); });
  $("#tema").addEventListener("click", () => { const t = tema === "claro" ? "oscuro" : "claro"; document.documentElement.dataset.tema = t; ls.set("rl-tema", t); try { localStorage.setItem("rl-tema", t); } catch {} render(); });
  $("#salir").addEventListener("click", () => { ls.del("rl-clave"); clave = ""; D._cargado = false; render(); });
}

// ---------- PARTIDOS ----------
const COMPETICIONES = ["OK Liga", "Copa del Rey", "Champions", "Supercopa", "Copa Continental", "Intercontinental", "Liga Gallega", "Amistoso", "Otra"];
function vistaPartidos() {
  titulo("Partidos");
  const f = ls.get("rl-partidos", "prox");
  const ahora = new Date(Date.now() - 3 * 36e5);
  let ps = D.partidos.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  ps = f === "prox" ? ps.filter((p) => !p.fecha || aFecha(p.fecha) >= ahora) : f === "jugados" ? ps.filter((p) => p.fecha && aFecha(p.fecha) < ahora).reverse() : ps.filter((p) => p.competicion === f);
  app.innerHTML = `
    <a class="btn sm ghost" href="#/mas">‹ Más</a>
    <div class="between" style="margin-top:6px"><h1>Partidos</h1><span class="row"><button class="btn sm" id="imp">${IA ? "✨ " : ""}Importar</button><button class="btn pri sm" id="nuevo">+ Partido</button></span></div>
    <div class="chips" style="margin-top:12px">${[["prox", "Próximos"], ["jugados", "Jugados"], ...["OK Liga", "Copa del Rey", "Champions"].map((c) => [c, c])].map(([k, v]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${v}</button>`).join("")}</div>
    <div class="stack" style="margin-top:14px">${ps.map((p) => partidoCard(p)).join("") || `<div class="vacio">No hay partidos aquí. Añádelos uno a uno o impórtalos pegando el calendario.</div>`}</div>`;
  $$("[data-f]").forEach((b) => b.addEventListener("click", () => { ls.set("rl-partidos", b.dataset.f); render(); }));
  $("#nuevo").addEventListener("click", () => formPartido({ casa: true, competicion: "OK Liga" }));
  $("#imp").addEventListener("click", importarPartidos);
}
function vistaPartido(id) {
  const p = partido(id); if (!p) { app.innerHTML = `<div class="vacio">Partido no encontrado. <a href="#/partidos">Volver</a></div>`; return; }
  titulo(p.rival);
  const ts = D.tareas.filter((t) => t.partidoId === id).sort((a, b) => (a.fecha || "9").localeCompare(b.fecha || "9"));
  const is = D.ideas.filter((i) => i.partidoId === id);
  const mapa = p.lugar ? `https://maps.apple.com/?q=${encodeURIComponent(p.lugar)}` : "";
  app.innerHTML = `
    <a class="btn sm ghost" href="#/partidos">‹ Partidos</a>
    <div class="card prox" style="margin-top:8px">
      <div class="row"><span class="badge ${p.casa ? "casa" : "fuera"}">${p.casa ? "Casa" : "Fuera"}</span>${p.competicion ? `<span class="badge comp">${esc(p.competicion)}</span>` : ""}${p.jornada ? `<span class="muted small">${esc(p.jornada)}</span>` : ""}</div>
      <h1 style="margin:8px 0">${esc(vsTxt(p))}</h1>
      <div class="stack small">
        <span>📅 ${esc(fechaLarga(p.fecha.slice(0, 10)))}${hora(p.fecha) ? ` · ${hora(p.fecha)}` : ""} · <span class="cuenta">${cuentaAtras(p.fecha)}</span></span>
        ${p.lugar ? `<span>📍 <a href="${mapa}" target="_blank" rel="noopener">${esc(p.lugar)}</a></span>` : ""}
        ${p.tv ? `<span>📺 ${esc(p.tv)}</span>` : ""}${p.resultado ? `<span>🏁 Resultado: <b>${esc(p.resultado)}</b></span>` : ""}
        ${p.notas ? `<div class="md">${md(p.notas)}</div>` : ""}
      </div>
      <div class="row" style="margin-top:12px"><button class="btn sm" id="editar">✏️ Editar</button>${IA ? `<button class="btn sm ia" id="plan">✨ Plan de redes</button>` : ""}</div>
    </div>
    <div id="iaBox"></div>
    <div class="sec"><div class="between"><h2>Tareas del partido</h2><button class="btn sm" id="nT">+ Tarea</button></div><div class="stack">${ts.map(tareaHTML).join("") || `<div class="vacio">Sin tareas para este partido.</div>`}</div></div>
    <div class="sec"><div class="between"><h2>Ideas</h2><button class="btn sm" id="nI">+ Idea</button></div><div class="stack">${is.map((i) => `<a class="item" href="#/idea/${i.id}"><span class="ico">💡</span><span class="tt">${esc(i.titulo || "Sin título")}</span><span></span></a>`).join("") || `<div class="vacio">Sin ideas todavía.</div>`}</div></div>`;
  enganchaTareas(app);
  $("#editar").addEventListener("click", () => formPartido(p));
  $("#nT").addEventListener("click", () => { const tid = crear("tareas", { titulo: "", estado: "pendiente", asignados: [yoId], partidoId: id, fecha: p.fecha.slice(0, 10) }); location.hash = `#/tarea/${tid}`; });
  $("#nI").addEventListener("click", () => { const iid = crear("ideas", { titulo: "", estado: "idea", autor: yoId, partidoId: id }); location.hash = `#/idea/${iid}`; });
  $("#plan")?.addEventListener("click", async () => {
    const box = $("#iaBox");
    box.innerHTML = `<div class="ia-caja sec"><div class="eyebrow">✨ Plan de redes para el partido</div><div class="md escribiendo" id="iaOut"></div><div class="row" id="iaAcc" hidden><button class="btn sm pri" id="guardaIdea">Guardar como idea</button><button class="btn sm ghost" id="iaNo">Descartar</button></div></div>`;
    const texto = await streamIA("/api/ia/desarrollar", { titulo: `Plan de redes · ${vsTxt(p)}`, texto: `Partido ${p.casa ? "en casa" : "fuera"} de ${p.competicion || "competición"} contra ${p.rival}, ${fechaLarga(p.fecha.slice(0, 10))} ${hora(p.fecha)}${p.lugar ? ", en " + p.lugar : ""}. Haz un plan de publicaciones: previa (días antes), día de partido (antes, durante, después) y post-partido. Reparte tareas entre el equipo.`, quien: yo().nombre }, $("#iaOut"));
    $("#iaOut").classList.remove("escribiendo"); $("#iaAcc").hidden = false;
    $("#guardaIdea").addEventListener("click", () => { const iid = crear("ideas", { titulo: `Plan de redes · ${vsTxt(p)}`, cuerpo: texto, estado: "desarrollo", autor: yoId, partidoId: id }); location.hash = `#/idea/${iid}`; });
    $("#iaNo").addEventListener("click", () => (box.innerHTML = ""));
  });
}

// formulario genérico
function formulario({ titulo: t, campos, datos = {}, onGuardar, onBorrar, extra = "" }) {
  const campo = (c) => {
    const v = datos[c.k] ?? c.def ?? "";
    if (c.t === "fecha") return `<label class="f">${c.l}<span class="dos"><input class="inp" type="date" name="${c.k}__d" value="${esc(String(v).slice(0, 10))}" ${c.req ? "required" : ""}><input class="inp" type="time" name="${c.k}__h" value="${esc(hora(v))}"></span></label>`;
    if (c.t === "textarea") return `<label class="f">${c.l}<textarea class="inp" name="${c.k}" placeholder="${esc(c.ph || "")}">${esc(v)}</textarea></label>`;
    if (c.t === "select") return `<label class="f">${c.l}<select class="inp" name="${c.k}">${c.ops.map((o) => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(txt)}</option>`; }).join("")}</select></label>`;
    if (c.t === "check") return `<label class="ck-lbl"><input type="checkbox" name="${c.k}" ${v ? "checked" : ""}>${c.l}</label>`;
    if (c.t === "persona") return `<label class="f">${c.l}<select class="inp" name="${c.k}"><option value="">—</option>${D.personas.map((p) => `<option value="${p.id}" ${p.id === v ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></label>`;
    return `<label class="f">${c.l}<input class="inp" name="${c.k}" type="${c.t || "text"}" value="${esc(v)}" placeholder="${esc(c.ph || "")}" ${c.req ? "required" : ""} ${c.t === "tel" ? 'inputmode="tel"' : ""}></label>`;
  };
  const filas = campos.map((c) => (Array.isArray(c) ? `<div class="dos">${c.map(campo).join("")}</div>` : campo(c))).join("");
  abrirModal(`<form id="fGen" class="stack"><h2>${t}</h2>${filas}${extra}<div class="pie">${onBorrar ? `<button type="button" class="btn danger" id="fBorrar">Borrar</button>` : "<span></span>"}<span class="row"><button type="button" class="btn ghost" data-cerrar>Cancelar</button><button class="btn pri">Guardar</button></span></div></form>`, (m) => {
    $("#fGen", m).addEventListener("submit", (e) => {
      e.preventDefault(); const fd = new FormData(e.target); const out = {};
      for (const c of campos.flat()) {
        if (c.t === "fecha") { const d = fd.get(c.k + "__d"); const h = fd.get(c.k + "__h"); out[c.k] = d ? (h ? `${d}T${h}` : d) : ""; }
        else if (c.t === "check") out[c.k] = fd.get(c.k) === "on";
        else if (c.t === "number") out[c.k] = Number(fd.get(c.k)) || 0;
        else out[c.k] = String(fd.get(c.k) ?? "").trim();
      }
      onGuardar(out, m); cerrarModal(); render();
    });
    if (onBorrar) confirmarBorrado($("#fBorrar", m), () => { onBorrar(); cerrarModal(); render(); });
  });
}
function formPartido(p = {}) {
  formulario({
    titulo: p.id ? "Editar partido" : "Nuevo partido", datos: p,
    campos: [{ k: "rival", l: "Rival", req: true, ph: "Ej.: Barça" }, { k: "fecha", l: "Fecha y hora", t: "fecha", req: true }, [{ k: "competicion", l: "Competición", t: "select", ops: COMPETICIONES }, { k: "jornada", l: "Jornada / ronda", ph: "Jornada 7" }], { k: "casa", l: "Jugamos en casa (Riazor)", t: "check" }, { k: "lugar", l: "Lugar", ph: "Pabellón, ciudad" }, [{ k: "tv", l: "TV / streaming", ph: "OKLiga TV, TVG…" }, { k: "resultado", l: "Resultado", ph: "4-2" }], { k: "notas", l: "Notas", t: "textarea" }],
    onGuardar: (o) => { if (o.casa && !o.lugar) o.lugar = "Pazo dos Deportes de Riazor, A Coruña"; p.id ? guardar("partidos", p.id, o) : crear("partidos", o); toast("Partido guardado"); },
    onBorrar: p.id ? () => { borrar("partidos", p.id); if (location.hash.includes(p.id)) location.hash = "#/partidos"; } : null,
  });
}
// Calendarios oficiales: se pueden volver a importar para recoger cambios de fecha u hora.
const FUENTES = [
  { nombre: "OK Liga", url: "https://www.hockeypatines.fep.es/?liga=3568&vista=calendar" },
  { nombre: "Champions", url: "https://www.wse.sidgad.com/?liga=339&vista=calendar" },
];
const normaliza = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// ¿Ya tenemos este partido? Mismo rival y competición, y misma jornada (o misma fecha si no hay jornada).
function partidoExistente(x) {
  const r = normaliza(x.rival);
  return D.partidos.find((p) => {
    const pr = normaliza(p.rival);
    if (!(pr === r || pr.includes(r) || r.includes(pr)) || p.competicion !== x.competicion || !!p.casa !== !!x.casa) return false;
    if (p.jornada && x.jornada) return normaliza(p.jornada) === normaliza(x.jornada);
    return (p.fecha || "").slice(0, 10) === (x.fecha || "").slice(0, 10);
  });
}
async function leerImportacion(cuerpo) {
  const r = await api("/api/ia/importar", { method: "POST", body: JSON.stringify(cuerpo) });
  if (r.status === 422) { const j = await r.json().catch(() => ({})); throw new Error(j.detalle ? `No se pudo abrir la página (${j.detalle}). Copia el calendario y pégalo.` : "No se pudo leer"); }
  if (!r.ok) throw new Error("No se pudo analizar");
  const txt = await r.text();
  const ini = txt.indexOf("{"); const fin = txt.lastIndexOf("}");
  if (ini < 0) throw new Error(txt.replace(/[_*⚠️]/g, "").trim() || "Respuesta vacía");
  return JSON.parse(txt.slice(ini, fin + 1)).partidos || [];
}
function importarPartidos() {
  abrirModal(`<h2>Importar partidos</h2>
    ${IA ? `<div class="stack"><span class="muted small">Desde los calendarios oficiales (puedes repetirlo cuando cambien horarios: actualiza los que ya están):</span>
      <div class="row">${FUENTES.map((f, i) => `<button class="btn sm" data-fuente="${i}">🔄 ${esc(f.nombre)}</button>`).join("")}</div>
      <label class="f">O pega un enlace<input class="inp" id="impUrl" type="url" placeholder="https://…"></label>
      <label class="f">O pega el calendario en texto<textarea class="inp" id="impTxt" style="min-height:110px" placeholder="Copiado de una web, un PDF, un WhatsApp…"></textarea></label></div>`
    : `<p class="muted small" style="margin:0">Sin IA: una línea por partido con el formato <code>2026-12-06 18:00; Rival; casa|fuera; Competición; Lugar</code>.</p><textarea class="inp" id="impTxt" style="min-height:180px"></textarea>`}
    <div id="impPrev"></div>
    <div class="pie"><button class="btn ghost" data-cerrar>Cancelar</button><button class="btn pri" id="impGo">${IA ? "✨ Analizar" : "Analizar"}</button></div>`, (m) => {
    let encontrados = [];
    const b = $("#impGo", m);
    const analizar = async (cuerpo, etiqueta) => {
      b.disabled = true; $$("[data-fuente]", m).forEach((x) => (x.disabled = true));
      $("#impPrev", m).innerHTML = `<div class="vacio escribiendo">${esc(etiqueta)}: leyendo el calendario (puede tardar un poco)</div>`;
      try {
        if (IA) encontrados = await leerImportacion(cuerpo);
        else encontrados = cuerpo.texto.split("\n").map((l) => l.split(";").map((x) => x.trim())).filter((c) => c.length >= 3).map(([f, rival, cf, competicion = "OK Liga", lugar = ""]) => ({ fecha: f.replace(" ", "T"), rival, casa: /casa/i.test(cf), competicion, lugar: lugar || (/casa/i.test(cf) ? "Pazo dos Deportes de Riazor, A Coruña" : ""), jornada: "" }));
      } catch (e) { encontrados = []; toast(e.message || "No se pudo analizar", 5000); }
      b.disabled = false; $$("[data-fuente]", m).forEach((x) => (x.disabled = false));
      encontrados.sort((a, c) => (a.fecha || "").localeCompare(c.fecha || ""));
      const filas = encontrados.map((x, i) => {
        const ex = partidoExistente(x); x._ex = ex;
        const cambia = ex && (ex.fecha !== x.fecha || (x.lugar && ex.lugar !== x.lugar));
        const nota = !ex ? "nuevo" : cambia ? `cambia: ${fechaCorta(ex.fecha)} → ${fechaCorta(x.fecha)}` : "ya estaba";
        return `<label class="item"><input type="checkbox" id="imp${i}" ${!ex || cambia ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--accent)"><span><span class="tt">${esc(vsTxt(x))}</span><br><span class="muted small">${esc(fechaCorta(x.fecha))} · ${esc(x.competicion)}${x.jornada ? " · " + esc(x.jornada) : ""}</span><br><span class="small" style="color:${!ex ? "var(--accent)" : cambia ? "var(--warn)" : "var(--muted)"}">${esc(nota)}</span></span><span></span></label>`;
      });
      $("#impPrev", m).innerHTML = encontrados.length ? `<div class="stack"><b>${encontrados.length} partidos encontrados</b>${filas.join("")}</div>` : `<div class="vacio">No he encontrado partidos.</div>`;
      b.textContent = encontrados.length ? "Guardar los marcados" : "✨ Analizar";
    };
    $$("[data-fuente]", m).forEach((x) => x.addEventListener("click", () => { const f = FUENTES[x.dataset.fuente]; encontrados = []; analizar({ url: f.url, texto: `(Calendario de ${f.nombre})` }, f.nombre); }));
    b.addEventListener("click", async () => {
      if (encontrados.length) {
        const ops = [];
        encontrados.forEach((x, i) => {
          if (!$(`#imp${i}`, m)?.checked) return;
          const { _ex, ...datos } = x;
          if (_ex) ops.push({ op: "update", col: "partidos", id: _ex.id, data: { fecha: datos.fecha, lugar: datos.lugar || _ex.lugar, jornada: datos.jornada || _ex.jornada, editado: new Date().toISOString() } });
          else ops.push({ op: "set", col: "partidos", id: uid(), data: { ...datos, creado: new Date().toISOString(), creadoPor: yoId } });
        });
        if (ops.length) escribir(ops);
        toast(`${ops.length} partidos guardados`); cerrarModal(); render(); return;
      }
      const url = $("#impUrl", m)?.value.trim(); const texto = $("#impTxt", m).value.trim();
      if (!url && !texto) return toast("Elige un calendario, pega un enlace o pega el texto");
      analizar({ url, texto }, "Analizando");
    });
  });
}

// ---------- ENTRENOS ----------
function vistaEntrenos() {
  titulo("Entrenos");
  const desde = sumarDias(hoyStr(), -1);
  const es = D.entrenos.filter((e) => e.fecha && e.fecha.slice(0, 10) >= desde).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const lista = es.slice(0, 60).map((e) => ({ tipo: "entreno", id: e.id, fecha: e.fecha, titulo: "Entreno" + (e.titulo ? ` · ${e.titulo}` : ""), sub: [e.lugar, e.duracion ? `${e.duracion} min` : ""].filter(Boolean).join(" · "), accion: () => formEntreno(e) }));
  app.innerHTML = `<a class="btn sm ghost" href="#/mas">‹ Más</a>
    <div class="between" style="margin-top:6px"><h1>Entrenos</h1><span class="row"><button class="btn sm" id="rec">🔁 Recurrentes</button><button class="btn pri sm" id="nuevo">+ Entreno</button></span></div>
    <p class="muted small">Más adelante los traeremos automáticamente del calendario del club. Mientras, puedes crearlos aquí (también semanas enteras de golpe).</p>
    ${agendaHTML(lista, { vacia: "No hay entrenos próximos." })}`;
  enganchaEventos(app, lista);
  $("#nuevo").addEventListener("click", () => formEntreno({ fecha: hoyStr() + "T20:00", duracion: 90 }));
  $("#rec").addEventListener("click", entrenosRecurrentes);
}
function formEntreno(e = {}) {
  formulario({
    titulo: e.id ? "Editar entreno" : "Nuevo entreno", datos: { duracion: 90, ...e },
    campos: [{ k: "fecha", l: "Día y hora", t: "fecha", req: true }, [{ k: "duracion", l: "Duración (min)", t: "number" }, { k: "titulo", l: "Tipo", ph: "Pista, físico, vídeo…" }], { k: "lugar", l: "Lugar", ph: "Riazor" }, { k: "notas", l: "Notas", t: "textarea" }],
    onGuardar: (o) => (e.id ? guardar("entrenos", e.id, o) : crear("entrenos", o)),
    onBorrar: e.id ? () => borrar("entrenos", e.id) : null,
  });
}
function entrenosRecurrentes() {
  const DS = ["L", "M", "X", "J", "V", "S", "D"];
  abrirModal(`<form id="fRec" class="stack"><h2>Entrenos recurrentes</h2>
    <div class="pick">${DS.map((d, i) => `<label><input type="checkbox" name="d" value="${(i + 1) % 7}">${d}</label>`).join("")}</div>
    <div class="dos"><label class="f">Hora<input class="inp" type="time" name="h" value="20:00" required></label><label class="f">Duración (min)<input class="inp" type="number" name="dur" value="90"></label></div>
    <div class="dos"><label class="f">Desde<input class="inp" type="date" name="desde" value="${hoyStr()}" required></label><label class="f">Hasta<input class="inp" type="date" name="hasta" value="${sumarDias(hoyStr(), 28)}" required></label></div>
    <label class="f">Lugar<input class="inp" name="lugar" placeholder="Riazor"></label>
    <div class="pie"><button type="button" class="btn ghost" data-cerrar>Cancelar</button><button class="btn pri">Crear</button></div></form>`, (m) => {
    $("#fRec", m).addEventListener("submit", (ev) => {
      ev.preventDefault(); const fd = new FormData(ev.target); const dias = fd.getAll("d").map(Number);
      if (!dias.length) return toast("Elige al menos un día");
      const out = []; for (let s = fd.get("desde"); s <= fd.get("hasta") && out.length < 300; s = sumarDias(s, 1)) if (dias.includes(aFecha(s).getDay())) out.push({ op: "set", col: "entrenos", id: uid(), data: { fecha: `${s}T${fd.get("h")}`, duracion: Number(fd.get("dur")) || 90, lugar: String(fd.get("lugar") || ""), creado: new Date().toISOString() } });
      if (out.length) escribir(out); toast(`${out.length} entrenos creados`); cerrarModal(); render();
    });
  });
}

// ---------- CONTACTOS ----------
const TIPOS_C = ["Patrocinador", "Prensa", "Club / Federación", "Proveedor", "Creador / Fotógrafo", "Afición / Peñas", "Institución", "Otro"];
const EST_C = [["porcontactar", "Por contactar"], ["contactado", "Contactado"], ["negociando", "Negociando"], ["cerrado", "Cerrado ✓"], ["descartado", "Descartado"], ["activo", "Activo"]];
function vistaContactos() {
  titulo("Contactos");
  const f = ls.get("rl-contactos", "Todos"); const q = (vistaContactos._q || "").toLowerCase();
  let cs = D.contactos.slice().sort((a, b) => (a.fechaSeguimiento || "9").localeCompare(b.fechaSeguimiento || "9") || a.nombre.localeCompare(b.nombre));
  if (f !== "Todos") cs = cs.filter((c) => c.tipo === f);
  if (q) cs = cs.filter((c) => [c.nombre, c.empresa, c.notas, c.cargo].join(" ").toLowerCase().includes(q));
  const pats = D.contactos.filter((c) => c.tipo === "Patrocinador");
  const resumen = EST_C.slice(0, 5).map(([k, v]) => [v, pats.filter((c) => c.estado === k).length]).filter(([, n]) => n);
  app.innerHTML = `<a class="btn sm ghost" href="#/mas">‹ Más</a>
    <div class="between" style="margin-top:6px"><h1>Contactos</h1><button class="btn pri sm" id="nuevo">+ Contacto</button></div>
    ${pats.length ? `<div class="card" style="margin-top:12px"><div class="eyebrow">Patrocinadores</div><div class="row" style="margin-top:6px">${resumen.map(([v, n]) => `<span class="estado">${esc(v)}: <b>${n}</b></span>`).join("")}</div></div>` : ""}
    <input class="inp" id="busca" placeholder="Buscar…" value="${esc(vistaContactos._q || "")}" style="margin-top:12px">
    <div class="chips" style="margin-top:10px">${["Todos", ...TIPOS_C].map((t) => `<button class="chip" data-f="${esc(t)}" aria-pressed="${f === t}">${esc(t)}</button>`).join("")}</div>
    <div class="stack" style="margin-top:12px">${cs.map((c) => {
      const tarde = c.fechaSeguimiento && c.fechaSeguimiento.slice(0, 10) <= hoyStr();
      return `<div class="item" data-c="${c.id}" style="cursor:pointer"><span class="ico">${c.tipo === "Patrocinador" ? "💼" : c.tipo === "Prensa" ? "🎙️" : "👤"}</span>
        <span><span class="tt">${esc(c.nombre)}</span>${c.empresa ? ` <span class="muted small">· ${esc(c.empresa)}</span>` : ""}
        <span class="meta">${c.estado ? `<span class="estado e-${esc(c.estado)}">${esc(EST_C.find((x) => x[0] === c.estado)?.[1] || c.estado)}</span>` : ""}${c.fechaSeguimiento ? `<span class="${tarde ? "lbl tarde" : ""}">📞 ${esc(fechaCorta(c.fechaSeguimiento))}</span>` : ""}${c.responsable ? avs([c.responsable]) : ""}</span>
        ${c.proximoPaso ? `<span class="muted small">➜ ${esc(c.proximoPaso)}</span>` : ""}</span>
        <span class="row" style="flex-wrap:nowrap">${c.telefono ? `<a class="btn sm" href="tel:${esc(c.telefono.replace(/\s/g, ""))}" aria-label="Llamar">📞</a>` : ""}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}" aria-label="Email">✉️</a>` : ""}</span></div>`;
    }).join("") || `<div class="vacio">No hay contactos aquí.</div>`}</div>`;
  $$("[data-f]").forEach((b) => b.addEventListener("click", () => { ls.set("rl-contactos", b.dataset.f); render(); }));
  $("#busca").addEventListener("input", debounce((e) => { vistaContactos._q = e.target.value; render(); setTimeout(() => { const i = $("#busca"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350));
  $$("[data-c]").forEach((el) => el.addEventListener("click", (e) => { if (e.target.closest("a")) return; formContacto(D.contactos.find((c) => c.id === el.dataset.c)); }));
  $("#nuevo").addEventListener("click", () => formContacto({ tipo: f !== "Todos" ? f : "Patrocinador", estado: "porcontactar", responsable: yoId }));
}
function formContacto(c = {}) {
  formulario({
    titulo: c.id ? c.nombre : "Nuevo contacto", datos: c,
    campos: [{ k: "nombre", l: "Nombre", req: true }, [{ k: "empresa", l: "Empresa / medio" }, { k: "cargo", l: "Cargo" }], [{ k: "tipo", l: "Tipo", t: "select", ops: TIPOS_C }, { k: "estado", l: "Estado", t: "select", ops: EST_C }], [{ k: "telefono", l: "Teléfono", t: "tel" }, { k: "email", l: "Email", t: "email" }], { k: "instagram", l: "Instagram / web" }, { k: "responsable", l: "Quién lo lleva", t: "persona" }, { k: "fechaSeguimiento", l: "Próximo seguimiento", t: "fecha" }, { k: "proximoPaso", l: "Próximo paso", ph: "Enviar dosier, llamar el lunes…" }, { k: "importe", l: "Importe / acuerdo", ph: "Opcional" }, { k: "notas", l: "Notas e historial", t: "textarea", ph: "Qué se habló, cuándo…" }],
    onGuardar: (o) => (c.id ? guardar("contactos", c.id, o) : crear("contactos", o)),
    onBorrar: c.id ? () => borrar("contactos", c.id) : null,
  });
}

// ---------- ARCHIVOS ----------
function icono(tipo = "", nombre = "") {
  if (tipo.startsWith("image/")) return "🖼️"; if (tipo === "application/pdf") return "📕"; if (tipo.startsWith("video/")) return "🎬";
  if (/sheet|excel|csv/.test(tipo + nombre)) return "📊"; if (/presentation|powerpoint|key$/.test(tipo + nombre)) return "📽️"; if (/word|document|text/.test(tipo)) return "📄"; return "📎";
}
const tamano = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
async function comprimirImagen(f) {
  if (!f.type.startsWith("image/") || f.size < 3.5 * 1048576 || f.type === "image/gif") return f;
  try {
    const bmp = await createImageBitmap(f); const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return f; }
}
async function subirArchivo(f0, notas = "") {
  const f = await comprimirImagen(f0);
  if (f.size > 5 * 1048576) { toast("Máximo 5 MB por archivo. Para vídeos o archivos grandes, guarda el enlace de Drive en las notas."); return null; }
  toast("Subiendo…", 20000);
  const id = uid(); const q = new URLSearchParams({ id, nombre: f.name, por: yoId, notas });
  try {
    const r = await api(`/api/archivo?${q}`, { method: "POST", body: f, headers: { "content-type": f.type || "application/octet-stream" } });
    if (!r.ok) throw new Error(); const j = await r.json(); delete j.ok;
    D.archivos.push(j); toast("Archivo subido ✓"); return id;
  } catch { toast("No se pudo subir el archivo"); return null; }
}
function vistaArchivos() {
  titulo("Archivos");
  const q = (vistaArchivos._q || "").toLowerCase();
  const as = D.archivos.slice().sort((a, b) => (b.creado || "").localeCompare(a.creado || "")).filter((a) => !q || [a.nombre, a.notas].join(" ").toLowerCase().includes(q));
  app.innerHTML = `<a class="btn sm ghost" href="#/mas">‹ Más</a>
    <div class="between" style="margin-top:6px"><h1>Archivos</h1><label class="btn pri sm">⬆️ Subir<input type="file" id="sube" multiple hidden></label></div>
    <p class="muted small">Dosieres, logos, fotos, contratos… (máx. 5 MB cada uno). La IA puede leer PDF, imágenes y textos.</p>
    <input class="inp" id="busca" placeholder="Buscar…" value="${esc(vistaArchivos._q || "")}">
    <div class="stack" style="margin-top:12px">${as.map((a) => `<div class="item"><span class="ico">${icono(a.tipo, a.nombre)}</span>
      <a href="/api/archivo?id=${a.id}&k=${encodeURIComponent(clave)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;min-width:0"><span class="tt">${esc(a.nombre)}</span><br><span class="muted small">${tamano(a.tam || 0)} · ${esc(fechaCorta((a.creado || "").slice(0, 10)))}${persona(a.subidoPor) ? " · " + esc(persona(a.subidoPor).nombre) : ""}</span>${a.notas ? `<br><span class="small">${esc(a.notas)}</span>` : ""}</a>
      <span class="row" style="flex-wrap:nowrap">${IA ? `<button class="btn sm" data-preg="${a.id}" aria-label="Preguntar a la IA">✨</button>` : ""}<button class="btn sm" data-ed="${a.id}" aria-label="Editar">✏️</button></span></div>`).join("") || `<div class="vacio">Aún no hay archivos.</div>`}</div>`;
  $("#sube").addEventListener("change", async (e) => { for (const f of e.target.files) await subirArchivo(f); render(); });
  $("#busca").addEventListener("input", debounce((e) => { vistaArchivos._q = e.target.value; render(); setTimeout(() => { const i = $("#busca"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350));
  $$("[data-preg]").forEach((b) => b.addEventListener("click", () => { adjuntos = [b.dataset.preg]; location.hash = "#/asistente"; }));
  $$("[data-ed]").forEach((b) => b.addEventListener("click", () => {
    const a = D.archivos.find((x) => x.id === b.dataset.ed);
    formulario({ titulo: "Archivo", datos: a, campos: [{ k: "nombre", l: "Nombre", req: true }, { k: "notas", l: "Notas", t: "textarea" }], onGuardar: (o) => guardar("archivos", a.id, o), onBorrar: () => borrar("archivos", a.id) });
  }));
}

// ---------- EQUIPO ----------
function vistaEquipo() {
  titulo("Equipo");
  app.innerHTML = `<a class="btn sm ghost" href="#/mas">‹ Más</a>
    <div class="between" style="margin-top:6px"><h1>Equipo</h1><button class="btn pri sm" id="nuevo">+ Persona</button></div>
    <div class="stack" style="margin-top:14px">${D.personas.map((p) => { const n = D.tareas.filter((t) => t.estado !== "hecho" && (t.asignados || []).includes(p.id)).length; return `<button class="item" data-p="${p.id}" style="font:inherit;text-align:left;cursor:pointer">${av(p).replace('class="av"', 'class="av" style="width:40px;height:40px;font-size:14px;margin:0;border:0;--pc:' + esc(p.color || "#ACD4B7") + '"')}<span><span class="tt">${esc(p.nombre)}</span>${p.rol ? `<br><span class="muted small">${esc(p.rol)}</span>` : ""}</span><span class="muted small">${n} pendientes</span></button>`; }).join("")}</div>`;
  const form = (p = {}) => formulario({
    titulo: p.id ? p.nombre : "Nueva persona", datos: { color: COLORES[D.personas.length % COLORES.length], ...p },
    campos: [{ k: "nombre", l: "Nombre", req: true }, { k: "rol", l: "Rol", ph: "Fotografía, diseño, community…" }, [{ k: "telefono", l: "Teléfono", t: "tel" }, { k: "color", l: "Color", t: "color" }]],
    onGuardar: (o) => (p.id ? guardar("personas", p.id, o) : crear("personas", { ...o, calToken: uid(24) })),
    onBorrar: p.id && p.id !== yoId ? () => borrar("personas", p.id) : null,
  });
  $("#nuevo").addEventListener("click", () => form());
  $$("[data-p]").forEach((b) => b.addEventListener("click", () => form(persona(b.dataset.p))));
}

// ---------- SINCRONIZAR CALENDARIO ----------
function vistaSincronizar() {
  titulo("Sincronizar");
  const p = yo();
  if (!p.calToken) { p.calToken = uid(24); guardar("personas", p.id, { calToken: p.calToken }); }
  const pref = Object.assign({ partidos: true, entrenos: false, tareas: true, seguimientos: true, todo: false }, ls.get("rl-sync", {}));
  const pinta = () => {
    const ver = ["partidos", "entrenos", "tareas", "seguimientos"].filter((k) => pref[k]).join(",");
    const ruta = `${location.host}/cal/${p.calToken}.ics?ver=${ver}${pref.todo ? "&todo=1" : ""}`;
    app.innerHTML = `<a class="btn sm ghost" href="#/mas">‹ Más</a>
      <h1 style="margin-top:6px">Tu calendario</h1>
      <p class="muted">Suscríbete una vez y los partidos y tus trabajos aparecerán en el calendario de tu iPhone, junto a tus cosas. Se actualiza solo cuando cambiamos algo aquí.</p>
      <div class="card stack">
        <b>¿Qué quieres ver?</b>
        ${[["partidos", "🏑 Partidos del Liceo"], ["entrenos", "⏱️ Entrenos"], ["tareas", "✅ Mis trabajos con fecha"], ["seguimientos", "📞 Mis seguimientos de contactos"], ["todo", "👥 Trabajos de todo el equipo (no solo los míos)"]].map(([k, v]) => `<label class="ck-lbl"><input type="checkbox" data-k="${k}" ${pref[k] ? "checked" : ""}>${v}</label>`).join("")}
      </div>
      <a class="btn pri full" style="margin-top:16px" href="webcal://${ruta}">📅 Suscribirme en el iPhone</a>
      <ol class="pasos sec">
        <li><span>Toca el botón de arriba <b>desde el iPhone</b>. Se abrirá Calendario.</span></li>
        <li><span>Pulsa <b>Suscribirse</b> y luego <b>Añadir</b>. Puedes cambiarle el color.</span></li>
        <li><span>Si no se actualiza a menudo: <b>Ajustes › Calendario › Cuentas › Obtener datos</b> y elige “Cada 15 minutos” o “Cada hora”.</span></li>
      </ol>
      <div class="sec stack"><b>¿Google Calendar u otro?</b><span class="muted small">En Google Calendar (desde el ordenador): Otros calendarios › + › Desde URL, y pega este enlace:</span>
        <div class="url">https://${esc(ruta)}</div><button class="btn sm" id="copiar">Copiar enlace</button>
        <p class="muted small">Si cambias las opciones de arriba, tendrás que volver a suscribirte (y borrar la suscripción antigua). El enlace es personal: no lo compartas.</p></div>`;
    $$("[data-k]").forEach((i) => i.addEventListener("change", () => { pref[i.dataset.k] = i.checked; ls.set("rl-sync", pref); pinta(); }));
    $("#copiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText("https://" + ruta); toast("Enlace copiado"); } catch { toast("Mantén pulsado el enlace para copiarlo"); } });
  };
  pinta();
}

// ---------- INSTALAR ----------
function vistaInstalar() {
  titulo("Instalar");
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  app.innerHTML = `<a class="btn sm ghost" href="#/mas">‹ Más</a>
    <h1 style="margin-top:6px">Instalar en el iPhone</h1>
    ${instalada ? `<div class="aviso" style="margin-top:12px">✓ Ya la estás usando como app.</div>` : ""}
    <p class="muted">Queda como una app más en la pantalla de inicio, con el escudo del Liceo y a pantalla completa.</p>
    <ol class="pasos sec">
      <li><span>Abre esta web en <b>Safari</b>.</span></li>
      <li><span>Toca el botón <b>Compartir</b> <svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:-3px;fill:none;stroke:currentColor;stroke-width:2"><path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9"/></svg> (abajo, o arriba a la derecha).</span></li>
      <li><span>Baja y elige <b>Añadir a pantalla de inicio</b>. Si no aparece, toca “Editar acciones” y añádelo.</span></li>
      <li><span>Pulsa <b>Añadir</b>. La primera vez que la abras desde el icono te pedirá la clave del equipo otra vez (el iPhone guarda la app aparte de Safari).</span></li>
    </ol>
    <div class="card sec small">💡 Truco: en el ordenador con Chrome o Edge también se puede instalar desde el icono de la barra de direcciones.</div>`;
}

// ---------- modal ----------
function abrirModal(html, enganchar) {
  const bg = $("#modal"), m = $("#modalIn"); m.innerHTML = html; bg.hidden = false; document.body.style.overflow = "hidden";
  $$("[data-cerrar]", m).forEach((b) => b.addEventListener("click", cerrarModal));
  enganchar?.(m); setTimeout(() => $("input:not([type=checkbox]):not([type=file]),textarea", m)?.focus?.({ preventScroll: true }), 50);
}
function cerrarModal() { $("#modal").hidden = true; $("#modalIn").innerHTML = ""; document.body.style.overflow = ""; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") cerrarModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) cerrarModal(); });

// ---------- arranque ----------
(function inicio() {
  const k = new URLSearchParams(location.search).get("k");
  if (k) { clave = k; ls.set("rl-clave", k); history.replaceState(null, "", location.pathname + location.hash); }
  render();
  // Al volver a la app (p. ej. desde otra app del iPhone), recarga datos por si alguien cambió algo.
  let oculto = 0;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { oculto = Date.now(); return; }
    if (clave && D._cargado && Date.now() - oculto > 60000 && $("#modal").hidden && !document.activeElement?.matches("input,textarea")) { try { await cargar(); render(); } catch {} }
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
