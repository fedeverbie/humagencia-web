// Panel interno de Score v2.0 (un solo Score oficial). Los datos vienen de /api/score (protegido con Cloudflare Access).
import { CATS, EV, ESTADOS, ETIQUETAS, evaluate, classify } from "./rules.mjs";

let rows = [];
let editing = null;
const $ = (id) => document.getElementById(id);
const initials = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function photo(box, r) {
  box.textContent = "";
  if (r.foto) { const i = new Image(); i.alt = ""; i.src = r.foto; box.append(i); }
  else box.textContent = initials(r.nombre);
}
function status(r) {
  const cls = { sin_evaluar: "p-none", preliminar: "p-warn", entrevistado: "p-ok", verificado: "p-ok" }[r.estado] || "p-none";
  return [ESTADOS[r.estado] || "Sin evaluar", cls];
}
function message(text) { const l = $("list"); l.textContent = ""; l.append(el("p", "empty", text)); }

function render() {
  const q = $("q").value.trim().toLowerCase();
  const ord = $("ord").value;
  const pend = (r) => r.estado === "sin_evaluar";
  const v = rows.filter((r) => !q || [r.nombre, r.puesto, r.localidad, ETIQUETAS[r.etiqueta]].join(" ").toLowerCase().includes(q));
  v.sort((a, b) =>
    ord === "nombre" ? a.nombre.localeCompare(b.nombre)
    : ord === "pend" && pend(a) !== pend(b) ? (pend(a) ? -1 : 1)
    : ord === "prio" && (a.etiqueta === "prioritaria") !== (b.etiqueta === "prioritaria") ? (a.etiqueta === "prioritaria" ? -1 : 1)
    : b.total - a.total);

  const ent = rows.filter((r) => r.estado === "entrevistado" || r.estado === "verificado").length;
  const prio = rows.filter((r) => r.etiqueta === "prioritaria").length;
  const sum = $("sum"); sum.textContent = "";
  [[rows.length, "Legajos"], [ent, "Entrevistados"], [prio, "Entrevista prioritaria"], [rows.filter(pend).length, "Sin evaluar"]].forEach(([n, l]) => {
    const d = el("div"); d.append(el("b", null, n), el("small", null, l)); sum.append(d);
  });

  if (!rows.length) return message("Todavía no hay legajos con score.");
  if (!v.length) return message("Ningún legajo coincide con la búsqueda.");
  const list = $("list"); list.textContent = "";
  for (const r of v) {
    const [st, cls] = status(r);
    const card = el("button", "card"); card.type = "button";
    const ph = el("div", "ph"); photo(ph, r);
    const who = el("div", "who");
    const pills = el("div", "pills");
    pills.append(el("span", "pill " + cls, st));
    if (r.etiqueta) pills.append(el("span", "pill p-tag t-" + r.etiqueta, ETIQUETAS[r.etiqueta]));
    who.append(el("h3", null, r.nombre), el("p", null, [r.puesto, r.localidad].filter(Boolean).join(" · ")), pills);
    const tot = el("div", "tot");
    tot.append(el("b", null, pend(r) ? "—" : r.total), el("small", null, pend(r) ? "sin datos" : `evaluado sobre ${r.cobertura}`));
    const bars = el("div", "bars");
    for (const c of CATS) {
      const e = (r.ev || {})[c.k] || "pend";
      const val = Math.min(c.max, Number((r.pts || {})[c.k]) || 0);
      const pct = Math.round((val / c.max) * 100);
      const b = el("div", "bar" + (e === "pend" ? " is-pend" : ""));
      b.title = e === "pend" ? `${c.n}: pendiente` : `${c.n}: ${val} de ${c.max} (${EV[e].toLowerCase()})`;
      const tank = el("div", "tank");
      if (e !== "pend") { const fill = el("i", e === "verif" ? "f-high" : "f-mid"); fill.style.height = pct + "%"; tank.append(fill); }
      b.append(el("span", "v", e === "pend" ? "—" : `${val}/${c.max}`), tank, el("span", "l", c.s));
      bars.append(b);
    }
    card.append(ph, who, tot, bars);
    card.setAttribute("aria-label", `${r.nombre}, ${st}, ${pend(r) ? "sin score" : `${r.total} puntos evaluado sobre ${r.cobertura}`}`);
    card.addEventListener("click", () => openEd(r));
    list.append(card);
  }
}

function refreshEd() {
  const r = evaluate(editing.pts, editing.ev);
  const { etiqueta, acciones } = classify(r);
  $("ed-total").textContent = r.cobertura ? r.total : "—";
  $("ed-cob").textContent = r.cobertura ? `evaluado sobre ${r.cobertura}` : "sin datos";
  $("ed-state").textContent = `${ESTADOS[r.estado]} · ${ETIQUETAS[etiqueta]}`;
  const ul = $("ed-acc"); ul.textContent = "";
  for (const a of acciones) ul.append(el("li", null, a));
}

function openEd(r) {
  editing = { ...r, pts: { ...(r.pts || {}) }, nuevaFoto: undefined };
  $("ed-name").textContent = r.nombre;
  $("ed-role").textContent = [r.puesto, r.localidad].filter(Boolean).join(" · ");
  photo($("ed-ph"), r);
  $("ed-nota").value = r.nota || "";
  $("ed-msg").textContent = ""; $("ed-photo-msg").textContent = "";
  editing.ev = { ...(r.ev || {}) };
  const box = $("ed-rows"); box.textContent = "";
  for (const c of CATS) {
    const row = el("div", "row");
    const lab = el("label", null, c.n); lab.htmlFor = "ed-" + c.k;
    lab.append(el("small", null, `máximo ${c.max} · ${c.fase === "cv" ? "sale del CV" : "sale de la entrevista"}`));
    const sel = el("select"); sel.setAttribute("aria-label", "Evidencia de " + c.n);
    for (const [k, n] of Object.entries(EV)) { const o = el("option", null, n); o.value = k; sel.append(o); }
    sel.value = editing.ev[c.k] || "pend";
    const inp = el("input"); inp.type = "range"; inp.id = "ed-" + c.k; inp.min = 0; inp.max = c.max; inp.step = 1;
    inp.value = Math.min(c.max, Number(editing.pts[c.k]) || 0);
    const out = el("output", null, inp.value);
    const sync = () => { const p = sel.value === "pend"; inp.disabled = p; out.textContent = p ? "—" : inp.value; };
    inp.addEventListener("input", () => { editing.pts[c.k] = Number(inp.value); sync(); refreshEd(); });
    sel.addEventListener("change", () => { editing.ev[c.k] = sel.value; sync(); refreshEd(); });
    sync();
    row.append(lab, sel, inp, out); box.append(row);
  }
  refreshEd();
  $("ed-save").disabled = false;
  $("scrim").hidden = false;
  $("ed-save").focus();
}
function closeEd() { $("scrim").hidden = true; editing = null; }

function shrink(file) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const s = 240, c = document.createElement("canvas"); c.width = c.height = s;
      const m = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 4, m, m, 0, 0, s, s);
      URL.revokeObjectURL(img.src); ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => fail(new Error("img"));
    img.src = URL.createObjectURL(file);
  });
}

async function api(method, body) {
  const r = await fetch("/api/score", {
    method, credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {}; try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || "No se pudo conectar.");
  return data;
}

async function load() {
  try { rows = (await api("GET")).legajos || []; render(); }
  catch (e) { message(e.message); }
}

document.addEventListener("DOMContentLoaded", () => {
  $("q").addEventListener("input", render);
  $("ord").addEventListener("change", render);
  $("ed-cancel").addEventListener("click", closeEd);
  $("scrim").addEventListener("click", (e) => { if (e.target === $("scrim")) closeEd(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("scrim").hidden) closeEd(); });
  $("ed-photo").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f || !editing) return;
    try { editing.nuevaFoto = await shrink(f); editing.foto = editing.nuevaFoto; photo($("ed-ph"), editing); $("ed-photo-msg").textContent = "Se guarda al tocar Guardar."; }
    catch { $("ed-photo-msg").textContent = "No se pudo leer esa imagen."; }
  });
  $("ed-save").addEventListener("click", async () => {
    if (!editing) return;
    const btn = $("ed-save"); btn.disabled = true; $("ed-msg").textContent = "Guardando…";
    const body = { id: editing.id, pts: editing.pts, ev: editing.ev, nota: $("ed-nota").value };
    if (editing.nuevaFoto) body.foto = editing.nuevaFoto;
    try {
      const res = await api("POST", body);
      const i = rows.findIndex((r) => r.id === editing.id);
      if (i >= 0) rows[i] = { ...rows[i], pts: res.pts, ev: res.ev, total: res.total, cobertura: res.cobertura, estado: res.estado, etiqueta: res.etiqueta, acciones: res.acciones, nota: body.nota, foto: editing.foto, actualizado: res.actualizado };
      render(); $("ed-msg").textContent = "Guardado"; setTimeout(closeEd, 400);
    } catch (err) { $("ed-msg").textContent = err.message; btn.disabled = false; }
  });
  load();
});
