// Adaptadores internos de la Autopista sobre D1 y Apps Script.
//
// REGISTRY: lista de registrados elegibles que la tarea de Claude sincroniza
// cada madrugada desde el Índice de legajos (solo con CV y autorización, sin
// pruebas). Guarda solo el SHA-256 del email normalizado y un identificador
// opaco: nunca nombres, teléfonos, CV ni el email en claro.
// También verifica los recibos firmados que emite el receptor de CV justo
// después de un registro nuevo.
//
// MAILER: envía el enlace de ingreso a través del script "Autopista MAILER" de
// la cuenta de la agencia. Plantilla fija del lado de Apps Script.
//
// Firma compartida: HMAC-SHA256 en hex sobre la cadena exacta, con la clave
// guardada en D1 (cabina_config.hmac) y en Script Properties (AUTOPISTA_SECRET).
// La clave se usa como texto UTF-8, igual que Utilities.computeHmacSha256Signature.
import { hash, normalizeEmail, randomToken } from './security.mjs';

const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
const RECEIPT_MAX_MS = 15 * 60 * 1000;

async function secret(db) {
  const row = await db.prepare("SELECT valor FROM cabina_config WHERE clave='hmac'").first();
  if (!row || typeof row.valor !== 'string' || row.valor.length < 32) throw new Error('CLAVE_NO_CONFIGURADA');
  return row.valor;
}

export async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeBase64Url(text) {
  const clean = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
}

export async function verifyReceipt(db, receipt, challenge, now = Date.now()) {
  if (typeof receipt !== 'string' || receipt.length > 4096) return null;
  const dot = receipt.lastIndexOf('.');
  if (dot < 1) return null;
  const body = receipt.slice(0, dot), sig = receipt.slice(dot + 1).toLowerCase();
  if (!/^[A-Za-z0-9_-]+=*$/.test(body) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (!sameHex(await hmacHex(await secret(db), body), sig)) return null;
  let data;
  try { data = JSON.parse(decodeBase64Url(body)); } catch { return null; }
  const email = normalizeEmail(data?.email);
  if (data?.v !== 1 || !email || data.challenge !== challenge || !Number.isFinite(data.exp)) return null;
  if (data.exp <= now || data.exp > now + RECEIPT_MAX_MS) return null;
  return { eligible: true, registrationVerified: true, email, challenge, expiresAt: data.exp };
}

export function registryD1(db) {
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST') return reply({ error: 'NO_DISPONIBLE' }, 404);
      let input = {};
      try { input = await request.json(); } catch { /* cuerpo inválido */ }
      if (path === '/eligible') {
        const email = normalizeEmail(input.email);
        if (!email) return reply({ eligible: false, subject: '' });
        const row = await db.prepare('SELECT subject FROM cabina_elegibles WHERE email_hash=?').bind(await hash(email)).first();
        return reply(row ? { eligible: true, subject: String(row.subject) } : { eligible: false, subject: '' });
      }
      if (path === '/receipt') {
        const ok = await verifyReceipt(db, input.receipt, input.challenge);
        return reply(ok || { eligible: false, registrationVerified: false });
      }
      return reply({ error: 'NO_DISPONIBLE' }, 404);
    },
  };
}

export function mailerAppsScript(db, url, fetcher = fetch) {
  return {
    async fetch(request) {
      if (new URL(request.url).pathname !== '/send-login' || request.method !== 'POST') return reply({ error: 'NO_DISPONIBLE' }, 404);
      const input = await request.json();
      const to = normalizeEmail(input.to);
      if (!to || typeof input.link !== 'string' || typeof input.idempotencyKey !== 'string') return reply({ sent: false, error: 'DATOS_INVALIDOS' }, 400);
      const payload = JSON.stringify({ action: 'send-login', ts: Date.now(), nonce: randomToken(), idempotencyKey: input.idempotencyKey, to, link: input.link });
      const sig = await hmacHex(await secret(db), payload);
      const res = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, sig }), redirect: 'follow' });
      let out = {};
      try { out = await res.json(); } catch { /* respuesta no JSON */ }
      return reply({ sent: res.ok && out.sent === true }, res.ok ? 200 : 502);
    },
  };
}
