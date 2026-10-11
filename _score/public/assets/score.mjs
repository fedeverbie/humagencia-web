// Panel interno de Score. Los datos vienen de /api/score (protegido con Cloudflare Access).
const CATS = [
  { k: "cv", n: "Experiencia según el CV", s: "Exp. CV", max: 10 },
  { k: "ent", n: "Experiencia comprobada en la entrevista", s: "Entre­vista", max: 35 },
  { k: "ref", n: "Referencias comprobables", s: "Refe­rencias", max: 20 },
  { k: "form", n: "Formación y estudios", s: "Forma­ción", max: 10 },
  { k: "cur", n: "Cursos y capacitaciones", s: "Cursos", max: 10 },
  { k: "mov", n: "Movilidad propia con registro", s: "Movi­lidad", max: 5 },
  { k: "disp", n: "Disponibilidad horaria", s: "Dispo­nib.", max: 5 },
  { k: "pres", n: "Presentación y datos completos del CV", s: "Present. CV", max: 5 },
];
let rows = [];
let editing = null;
const $ = (id) => document.getElementById(id);
const total = (p) => CATS.reduce((a, c) => a + Math.min(c.max, Math.max(0, Number((p || {})[c.k]) || 0)), 0);
const tone = (pct) => (pct >= 70 ? "f-high" : pct >= 40 ? "f-mid" : "f-low");
const initials = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function photo(box, r) {
  box.textContent = "";
  if (r.foto) { const i = new Image(); i.alt = ""; i.src = r.foto; box.append(i); }
  else box.textContent = initials(r.nombre);
}
function status(r) {
  if (r.estado === "sin_evaluar") return ["Sin evaluar", "p-none"];
  if ((Number((r.pts || {}).ent) || 0) > 0) return ["Entrevistado", "p-ok"];
  return ["Entrevista pendiente", "p-warn"];
}
function message(text) { const l = $("list"); l.textContent = ""; l.append(el("p", "empty", text)); }

function render() {
  const q = $("q").value.trim().toLowerCase();
  const ord = $("ord").value;
  const pend = (r) => r.estado === "sin_evaluar";
  const v = rows.filter((r) => !q || [r.nombre, r.puesto, r.localidad].join(" ").toLowerCase().includes(q));
  v.sort((a, b) =>
    ord === "nombre" ? a.nombre.localeCompare(b.nombre)
    : ord === "pend" && pend(a) !== pend(b) ? (pend(a) ? -1 : 1)
    : total(b.pts) - total(a.pts));

  const ev = rows.filter((r) => !pend(r));
  const avg = ev.length ? Math.round(ev.reduce((a, r) => a + total(r.pts), 0) / ev.length) : 0;
  const ent = rows.filter((r) => (Number((r.pts || {}).ent) || 0) > 0).length;
  const sum = $("sum"); sum.textContent = "";
  [[rows.length, "Legajos"], [avg, "Promedio"], [ent, "Entrevistados"], [rows.length - ev.length, "Sin evaluar"]].forEach(([n, l]) => {
    const d = el("div"); d.append(el("b", null, n), el("small", null, l)); sum.append(d);
  });

  if (!rows.length) return message("Todavía no hay legajos con score.");
  if (!v.length) return message("Ningún legajo coincide con la búsqueda.");
  const list = $("list"); list.textContent = "";
  for (const r of v) {
    const t = total(r.pts);
    const [st, cls] = status(r);
    const card = el("button", "card"); card.type = "button";
    const ph = el("div", "ph"); photo(ph, r);
    const who = el("div", "who");
    who.append(el("h3", null, r.nombre), el("p", null, [r.puesto, r.localidad].filter(Boolean).join(" · ")), el("span", "pill " + cls, st));
    const tot = el("div", "tot"); tot.append(el("b", null, pend(r) ? "—" : t), el("small", null, "/100"));
    const bars = el("div", "bars");
    for (const c of CATS) {
      const val = Math.min(c.max, Number((r.pts || {})[c.k]) || 0);
      const pct = Math.round((val / c.max) * 100);
      const b = el("div", "bar"); b.title = `${c.n}: ${val} de ${c.max}`;
      const tank = el("div", "tank"); const fill = el("i", tone(pct)); fill.style.height = pct + "%"; tank.append(fill);
      b.append(el("span", "v", pct + "%"), tank, el("span", "l", c.s));
      bars.append(b);
    }
    card.append(ph, who, tot, bars);
    card.setAttribute("aria-label", `${r.nombre}, score ${t} de 100`);
    card.addEventListener("click", () => openEd(r));
    list.append(card);
  }
}

function openEd(r) {
  editing = { ...r, pts: { ...(r.pts || {}) }, nuevaFoto: undefined };
  $("ed-name").textContent = r.nombre;
  $("ed-role").textContent = [r.puesto, r.localidad].filter(Boolean).join(" · ");
  photo($("ed-ph"), r);
  $("ed-nota").value = r.nota || "";
  $("ed-msg").textContent = ""; $("ed-photo-msg").textContent = "";
  const box = $("ed-rows"); box.textContent = "";
  for (const c of CATS) {
    const row = el("div", "row");
    const lab = el("label", null, c.n); lab.htmlFor = "ed-" + c.k; lab.append(el("small", null, "máximo " + c.max));
    const inp = el("input"); inp.type = "range"; inp.id = "ed-" + c.k; inp.min = 0; inp.max = c.max; inp.step = 1;
    inp.value = Math.min(c.max, Number(editing.pts[c.k]) || 0);
    const out = el("output", null, inp.value);
    inp.addEventListener("input", () => { out.textContent = inp.value; editing.pts[c.k] = Number(inp.value); $("ed-total").textContent = total(editing.pts); });
    row.append(lab, inp, out); box.append(row);
  }
  $("ed-total").textContent = total(editing.pts);
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
    const body = { id: editing.id, pts: editing.pts, nota: $("ed-nota").value };
    if (editing.nuevaFoto) body.foto = editing.nuevaFoto;
    try {
      const res = await api("POST", body);
      const i = rows.findIndex((r) => r.id === editing.id);
      if (i >= 0) rows[i] = { ...rows[i], pts: editing.pts, total: res.total, nota: body.nota, estado: "evaluado", foto: editing.foto, actualizado: res.actualizado };
      render(); $("ed-msg").textContent = "Guardado"; setTimeout(closeEd, 400);
    } catch (err) { $("ed-msg").textContent = err.message; btn.disabled = false; }
  });
  load();
});
