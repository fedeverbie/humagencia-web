import { evaluate, classify, fromV1, normalize } from "../public/assets/rules.mjs";
import assert from "node:assert";
// pendiente no suma aunque traiga puntos
let r = evaluate({ ent: 30, exp: 10 }, { exp: "decl" });
assert.equal(r.total, 10); assert.equal(r.cobertura, 15); assert.equal(r.estado, "preliminar");
// límites
r = evaluate({ ent: 99, ref: -4 }, { ent: "verif", ref: "verif" });
assert.equal(r.pts.ent, 35); assert.equal(r.pts.ref, 0); assert.equal(r.estado, "verificado");
// sin datos
r = evaluate({}, {}); assert.equal(r.estado, "sin_evaluar"); assert.equal(classify({ pts: {}, ev: {} }).etiqueta, "insuficiente");
// suma máxima 100
const all = { ent: 35, ref: 20, exp: 15, hab: 10, form: 10, disp: 5, comp: 5 };
const ev = Object.fromEntries(Object.keys(all).map(k => [k, "verif"]));
r = evaluate(all, ev); assert.equal(r.total, 100); assert.equal(r.cobertura, 100);
assert.equal(classify({ pts: all, ev }).etiqueta, "listo");
// migración v1
let m = fromV1({ cur: 8, cv: 10, disp: 5, ent: 0, form: 8, mov: 4, pres: 5, ref: 0 }, "preliminar");
r = evaluate(m.pts, m.ev);
assert.deepEqual(r.pts, { ent: 0, ref: 0, exp: 15, hab: 0, form: 8, disp: 5, comp: 5 }); assert.equal(r.total, 33); assert.equal(r.cobertura, 35);
assert.equal(classify(m).etiqueta, "prioritaria");
m = fromV1({ cv: 4, disp: 5, ent: 18, pres: 3 }, "evaluado"); r = evaluate(m.pts, m.ev);
assert.equal(r.estado, "entrevistado"); assert.equal(r.cobertura, 70);
m = fromV1({ cv: 10, form: 9, cur: 8, pres: 5 }, "preliminar"); assert.equal(m.ev.disp, "pend");
assert.equal(fromV1({}, "sin_evaluar").ev.ent, undefined);
console.log("tests OK");
