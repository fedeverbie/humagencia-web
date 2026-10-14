// Score HumagencIA v2.0 — reglas únicas (las usan el panel y la API).
// Un solo Score oficial sobre 100. Lo que no se evaluó queda PENDIENTE: no cuenta como cero.
// No puntúan: edad, género, aspecto, foto, nacionalidad, estado civil ni condición social.

export const VERSION = "2.0";

export const CATS = [
  { k: "ent", n: "Entrevista", s: "Entre­vista", max: 35, fase: "entrevista" },
  { k: "ref", n: "Referencias comprobadas", s: "Refe­rencias", max: 20, fase: "entrevista" },
  { k: "exp", n: "Experiencia relevante", s: "Expe­riencia", max: 15, fase: "cv" },
  { k: "hab", n: "Habilidades demostradas", s: "Habili­dades", max: 10, fase: "entrevista" },
  { k: "form", n: "Formación y cursos", s: "Forma­ción", max: 10, fase: "cv" },
  { k: "disp", n: "Disponibilidad y traslado", s: "Dispo­nib.", max: 5, fase: "cv" },
  { k: "comp", n: "Información completa del CV", s: "CV com­pleto", max: 5, fase: "cv" },
];

// Estado de la evidencia de cada criterio.
export const EV = { pend: "Pendiente", decl: "Declarado", verif: "Verificado" };

export const ETIQUETAS = {
  listo: "Listo para presentar",
  prioritaria: "Entrevista prioritaria",
  desarrollar: "Perfil para desarrollar",
  insuficiente: "Información insuficiente",
};

const num = (v) => Math.max(0, Math.round(Number(v) || 0));

// Normaliza puntos y evidencias: cada criterio entero entre 0 y su máximo.
// Un criterio pendiente no suma, aunque traiga puntos.
export function normalize(pts = {}, ev = {}) {
  const p = {}, e = {};
  for (const c of CATS) {
    e[c.k] = EV[ev[c.k]] ? ev[c.k] : "pend";
    p[c.k] = e[c.k] === "pend" ? 0 : Math.min(c.max, num(pts[c.k]));
  }
  return { pts: p, ev: e };
}

// Puntaje observado, cobertura (máximo de los criterios ya evaluados) y estado general.
export function evaluate(pts = {}, ev = {}) {
  const n = normalize(pts, ev);
  let total = 0, cobertura = 0;
  for (const c of CATS) if (n.ev[c.k] !== "pend") { total += n.pts[c.k]; cobertura += c.max; }
  let estado = "sin_evaluar";
  if (cobertura > 0) estado = "preliminar";
  if (n.ev.ent !== "pend") estado = "entrevistado";
  if (n.ev.ent !== "pend" && n.ev.ref === "verif") estado = "verificado";
  return { ...n, total, cobertura, estado };
}

export const ESTADOS = {
  sin_evaluar: "Sin evaluar",
  preliminar: "Preliminar (solo CV)",
  entrevistado: "Entrevistado",
  verificado: "Verificado",
};

// Clasificación aparte del Score, con acciones concretas y explicables.
export function classify(r) {
  const { pts, ev, total, cobertura, estado } = evaluate(r.pts, r.ev);
  const ratio = cobertura ? total / cobertura : 0;
  const acciones = [];
  if (estado === "sin_evaluar") acciones.push("Conseguir un CV legible o completar los datos del formulario");
  if (ev.comp !== "pend" && pts.comp <= 2) acciones.push("Mejorar el CV: fechas, lugares y contacto");
  if (ev.disp === "pend") acciones.push("Confirmar disponibilidad horaria y cómo se traslada");
  if (ev.ent === "pend") acciones.push("Hacer la entrevista");
  if (ev.hab === "pend") acciones.push("Comprobar habilidades en la entrevista (tareas concretas, herramientas)");
  if (ev.ref !== "verif") acciones.push("Pedir referencias y llamarlas");
  if (ev.form !== "pend" && pts.form <= 3) acciones.push("Sugerir un curso o capacitación del rubro");
  if (ev.exp !== "pend" && pts.exp <= 4) acciones.push("Sumar experiencia: changas, prácticas o primer empleo");

  let etiqueta;
  if (cobertura < 20 || (ev.comp !== "pend" && pts.comp <= 1 && ev.ent === "pend")) etiqueta = "insuficiente";
  else if (ev.ent !== "pend" && ratio >= 0.7) etiqueta = "listo";
  else if (ev.ent === "pend" && ratio >= 0.6) etiqueta = "prioritaria";
  else etiqueta = "desarrollar";
  return { etiqueta, acciones };
}

// Traducción del Score v1.0 al v2.0 (solo para la migración de la base).
export function fromV1(p = {}, estadoV1 = "") {
  const v = (k) => num(p[k]);
  if (estadoV1 === "sin_evaluar") return { pts: {}, ev: {} };
  const pts = {
    ent: v("ent"),
    ref: v("ref"),
    exp: Math.round(v("cv") * 1.5),
    form: Math.round((v("form") + v("cur")) / 2),
    disp: Math.round((v("mov") + v("disp")) / 2),
    comp: v("pres"),
  };
  const ev = {
    ent: v("ent") > 0 ? "verif" : "pend",
    ref: v("ref") > 0 ? "verif" : "pend",
    exp: "decl",
    hab: "pend",
    form: "decl",
    disp: v("mov") + v("disp") > 0 ? "decl" : "pend",
    comp: "decl",
  };
  return { pts, ev };
}
