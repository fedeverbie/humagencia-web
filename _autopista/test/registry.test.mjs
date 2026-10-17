import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1, seed, system} from './helpers.mjs';
import {registryD1} from '../src/registry-d1.mjs';
import {hash} from '../src/security.mjs';
import {onRequest} from '../../functions/autopista/api/[[path]].js';

function dbWithEligible(email) {
  const db = new LocalD1();
  return {db, ready: hash(email).then((h) => db.sql.prepare('INSERT INTO cabina_elegibles VALUES(?,?,?)').run(h, 'HUMA-opaco', '2026-10-17'))};
}
const ask = (reg, body, path = 'eligible') => reg.fetch(new Request('https://adapter.internal/' + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})).then(async (r) => ({status: r.status, data: await r.json()}));

test('REGISTRY D1: elegible por hash del email normalizado, sin datos personales', async () => {
  const {db, ready} = dbWithEligible('registrado@example.test'); await ready;
  const reg = registryD1(db);
  assert.deepEqual((await ask(reg, {email: '  Registrado@EXAMPLE.test '})).data, {eligible: true, subject: 'HUMA-opaco'});
  assert.deepEqual((await ask(reg, {email: 'otro@example.test'})).data, {eligible: false, subject: ''});
  assert.deepEqual((await ask(reg, {email: 'mal'})).data, {eligible: false, subject: ''});
  assert.equal(db.sql.prepare("SELECT count(*) n FROM cabina_elegibles WHERE email_hash LIKE '%@%'").get().n, 0);
});


test('Pages Function: catálogo público desde D1 sin contactos y acceso apagado', async () => {
  const s = system(); await seed(s);
  const env = {AUTOPISTA_DB: s.db, APP_ORIGIN: s.env.APP_ORIGIN, ACCESS_ENABLED: 'false', MAIL_ENABLED: 'false', INGEST_ENABLED: 'false'};
  const call = (path, init) => onRequest({request: new Request(s.env.APP_ORIGIN + '/autopista/api' + path, init), env, waitUntil: () => {}});
  const jobs = await (await call('/jobs')).json();
  assert.equal(jobs.jobs.length, 1);
  assert.doesNotMatch(JSON.stringify(jobs), /empresa@|apply/);
  assert.equal((await call('/contacto/HAG-001', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: s.env.APP_ORIGIN}, body: '{}'})).status, 503);
  const acceso = await call('/acceso', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: s.env.APP_ORIGIN}, body: JSON.stringify({email: 'registrado@example.test'})});
  assert.equal(acceso.status, 202);
  assert.equal(s.db.sql.prepare('SELECT count(*) n FROM cabina_enlaces').get().n, 0);
});

// --- Recibos firmados del receptor y MAILER de Apps Script ---
import {verifyReceipt, hmacHex, mailerAppsScript} from '../src/registry-d1.mjs';
const SECRET = 'a'.repeat(64);
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');  // con '=' como Utilities.base64EncodeWebSafe
async function receiptFor(data, secret = SECRET) { const body = b64url(JSON.stringify(data)); return body + '.' + await hmacHex(secret, body); }
function dbWithSecret() { const db = new LocalD1(); db.sql.prepare("INSERT INTO cabina_config VALUES('hmac',?)").run(SECRET); return db; }
const CH = 'c'.repeat(64);

test('recibo válido del receptor: email normalizado, desafío y vencimiento', async () => {
  const db = dbWithSecret(), exp = Date.now() + 600000;
  const r = await verifyReceipt(db, await receiptFor({v: 1, email: ' Nueva@Example.TEST ', challenge: CH, exp, nonce: 'n'}), CH);
  assert.deepEqual(r, {eligible: true, registrationVerified: true, email: 'nueva@example.test', challenge: CH, expiresAt: exp});
});

test('recibo rechazado: firma ajena, otro desafío, vencido, demasiado largo o mal formado', async () => {
  const db = dbWithSecret(), ok = {v: 1, email: 'n@example.test', challenge: CH, exp: Date.now() + 600000};
  assert.equal(await verifyReceipt(db, await receiptFor(ok, 'b'.repeat(64)), CH), null);
  assert.equal(await verifyReceipt(db, await receiptFor(ok), 'd'.repeat(64)), null);
  assert.equal(await verifyReceipt(db, await receiptFor({...ok, exp: Date.now() - 1}), CH), null);
  assert.equal(await verifyReceipt(db, await receiptFor({...ok, exp: Date.now() + 3600000}), CH), null);
  assert.equal(await verifyReceipt(db, 'sinpunto', CH), null);
  const valid = await receiptFor(ok);
  assert.equal(await verifyReceipt(db, valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0'), CH), null);
});

test('sin clave configurada no hay recibos', async () => {
  const db = new LocalD1();
  await assert.rejects(verifyReceipt(db, await receiptFor({v: 1, email: 'n@example.test', challenge: CH, exp: Date.now() + 600000}), CH));
});

test('MAILER firma el payload y solo confirma con sent:true', async () => {
  const db = dbWithSecret(), calls = [];
  const fake = async (url, init) => { calls.push({url, init}); return Response.json({sent: true}); };
  const m = mailerAppsScript(db, 'https://script.google.com/macros/s/X/exec', fake);
  const res = await m.fetch(new Request('https://adapter.internal/send-login', {method: 'POST', body: JSON.stringify({idempotencyKey: 'k', to: 'A@Example.test', link: 'https://x/autopista/#ingreso=t', subject: 'ignorado', text: 'ignorado'})}));
  assert.deepEqual(await res.json(), {sent: true});
  const sent = JSON.parse(calls[0].init.body), payload = JSON.parse(sent.payload);
  assert.equal(sent.sig, await hmacHex(SECRET, sent.payload));
  assert.equal(payload.to, 'a@example.test');
  assert.equal(payload.action, 'send-login');
  assert.ok(!('text' in payload) && !('subject' in payload));
  const bad = mailerAppsScript(db, 'u', async () => Response.json({sent: false, error: 'CUOTA'}));
  assert.deepEqual(await (await bad.fetch(new Request('https://adapter.internal/send-login', {method: 'POST', body: JSON.stringify({idempotencyKey: 'k', to: 'a@example.test', link: 'l'})}))).json(), {sent: false});
});

test('flujo completo con MAILER y recibo: ingreso por enlace y entrada tras registro', async () => {
  const s = system(); await seed(s);
  s.db.sql.prepare("INSERT INTO cabina_config VALUES('hmac',?)").run(SECRET);
  s.db.sql.prepare('INSERT INTO cabina_elegibles VALUES(?,?,?)').run(await hash('registrado@example.test'), 'HUMA-1', 'hoy');
  const enviados = [];
  s.env.REGISTRY = registryD1(s.db);
  s.env.MAILER = mailerAppsScript(s.db, 'u', async (u, init) => { enviados.push(JSON.parse(JSON.parse(init.body).payload)); return Response.json({sent: true}); });
  await s.request('/acceso', {email: 'registrado@example.test', hagId: 'HAG-001'}); await s.drain();
  await s.request('/acceso', {email: 'nadie@example.test'}); await s.drain();
  assert.equal(enviados.length, 1);
  const token = enviados[0].link.match(/#ingreso=([A-Za-z0-9_-]{43})/)[1];
  assert.equal((await s.request('/canjear', {token})).status, 200);
  assert.equal((await s.request('/contacto/HAG-001', {})).status, 200);
  // Registro nuevo: desafío -> recibo del receptor -> sesión sin mail.
  s.jar.clear();
  const ini = await s.request('/registro/iniciar', {});
  const rec = await receiptFor({v: 1, email: 'nueva@example.test', challenge: ini.data.challenge, exp: Date.now() + 600000});
  assert.equal((await s.request('/registro/canjear', {receipt: rec})).status, 200);
  assert.equal((await s.request('/sesion')).status, 200);
  s.jar.delete('__Host-hag_session');
  assert.equal((await s.request('/registro/canjear', {receipt: rec})).status, 400);
});
