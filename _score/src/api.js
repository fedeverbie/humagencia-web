// API privada del Score de legajos.
// Solo responde si la petición pasó por Cloudflare Access y el mail está autorizado.
// Configuración en wrangler.jsonc (variables) y en Cloudflare Zero Trust (aplicación de Access).

const CATS = { cv: 10, ent: 35, ref: 20, form: 10, cur: 10, mov: 5, disp: 5, pres: 5 };
const MAX_FOTO = 400_000; // data URL de la foto, ya reducida en el navegador

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

let certCache = { at: 0, keys: null };
async function accessKeys(team) {
  if (certCache.keys && Date.now() - certCache.at < 3_600_000) return certCache.keys;
  const r = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs");
  certCache = { at: Date.now(), keys: (await r.json()).keys };
  return certCache.keys;
}
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function verify(request, env) {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD || !env.SCORE_EMAILS) return { error: "Falta configurar el acceso privado.", status: 503 };
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { error: "Acceso no autorizado.", status: 401 };
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return { error: "Acceso no autorizado.", status: 401 };
  try {
    const header = JSON.parse(new TextDecoder().decode(b64u(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64u(p)));
    const jwk = (await accessKeys(env.ACCESS_TEAM)).find((k) => k.kid === header.kid);
    if (!jwk) return { error: "Acceso no autorizado.", status: 401 };
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const allowed = env.SCORE_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const email = String(payload.email || "").toLowerCase();
    if (!ok || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now() || !allowed.includes(email))
      return { error: "Acceso no autorizado.", status: 403 };
    return { email };
  } catch {
    return { error: "Acceso no autorizado.", status: 401 };
  }
}

const clean = (v, n) => String(v ?? "").slice(0, n);

export async function handleApi(request, env) {
  const auth = await verify(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);
  if (!env.SCORE_DB) return json({ error: "Falta conectar la base de datos." }, 503);

  if (request.method === "GET") {
    const { results } = await env.SCORE_DB.prepare(
      "SELECT id,nombre,puesto,localidad,pts,total,estado,nota,foto,actualizado FROM legajos ORDER BY total DESC"
    ).all();
    return json({ legajos: results.map((r) => ({ ...r, pts: JSON.parse(r.pts || "{}") })) });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Datos inválidos." }, 400); }
    const id = clean(body.id, 80);
    const row = await env.SCORE_DB.prepare("SELECT id FROM legajos WHERE id=?").bind(id).first();
    if (!row) return json({ error: "No existe ese legajo." }, 404);
    const pts = {};
    for (const [k, max] of Object.entries(CATS)) pts[k] = Math.max(0, Math.min(max, Math.round(Number(body.pts?.[k]) || 0)));
    const total = Object.values(pts).reduce((a, b) => a + b, 0);
    const now = new Date().toISOString();
    const sets = ["pts=?", "total=?", "nota=?", "estado='evaluado'", "actualizado=?", "actualizado_por=?"];
    const vals = [JSON.stringify(pts), total, clean(body.nota, 2000), now, auth.email];
    if (typeof body.foto === "string") {
      if (body.foto && (!/^data:image\/(jpeg|png|webp);base64,/.test(body.foto) || body.foto.length > MAX_FOTO))
        return json({ error: "La foto no es válida o es muy pesada." }, 400);
      sets.push("foto=?"); vals.push(body.foto);
    }
    await env.SCORE_DB.prepare(`UPDATE legajos SET ${sets.join(",")} WHERE id=?`).bind(...vals, id).run();
    return json({ ok: true, total, actualizado: now });
  }

  return json({ error: "Método no permitido." }, 405);
}
