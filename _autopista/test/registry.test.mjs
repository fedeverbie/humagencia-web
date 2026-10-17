import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalD1, seed, system} from './helpers.mjs';
import {registryD1} from '../src/registry-d1.mjs';
import {hash} from '../src/security.mjs';
import {onRequest} from '../../functions/autopista/api/[[path]].js';

function dbWithEligible(email) {
  const db = new LocalD1();
  db.sql.exec(readFileSync(new URL('../migrations/0003_elegibles.sql', import.meta.url), 'utf8'));
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

test('REGISTRY D1: no ofrece recibos de registro (pendiente)', async () => {
  const {db} = dbWithEligible('registrado@example.test');
  assert.equal((await ask(registryD1(db), {receipt: 'x'.repeat(40)}, 'receipt')).status, 404);
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
