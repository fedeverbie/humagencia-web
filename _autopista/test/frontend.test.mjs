import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('todas las regiones principales conservan Instagram y aviso de CV antes del enlace',()=>{
  const html=read('autopista/index.html');
  assert.ok(html.indexOf('Adjuntá tu CV.')<html.indexOf('id="open-contact"'));
  assert.match(html,/@humagencia.lp/);assert.ok((html.match(/https:\/\/instagram.com\/humagencia.lp/g)||[]).length>=3);
  assert.match(html,/id="open-contact"[^>]*hidden/);assert.match(html,/noindex,nofollow/);
});
test('no hay contactos reales, scripts inline, credenciales de storage ni HTML dinámico',()=>{
  const html=read('autopista/index.html'),js=read('assets/autopista/autopista.mjs');
  assert.doesNotMatch(html,/<script[^>]*>(?!<\/script>)/);
  assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage|document\.cookie/);
  assert.match(js,/textContent/);assert.match(js,/history\.replaceState/);
});
test('credenciales se consumen mediante botón, no por GET ni al cargar automáticamente',()=>{
  const js=read('assets/autopista/autopista.mjs');
  assert.match(js,/\$\('consume'\)\.addEventListener\('click'/);
  assert.match(js,/api\('\/canjear',\{token\}\)/);
  assert.match(js,/location\.hash\.match/);
});
test('formulario de CV: el ingreso a la Autopista es opcional y nunca bloquea el registro (autorizado por Federico 17/10)',()=>{
  const cv=read('assets/cv-upload.mjs');
  assert.match(cv,/registro-bridge\.mjs/);
  assert.match(cv,/try \{ payload\.autopistaChallenge = await Promise\.race/);  // si falla el desafío, sigue sin él
  assert.match(cv,/autopistaChallenge: null/);  // no cambia el envioId en reintentos
  assert.match(cv,/typeof respuesta\.autopistaReceipt === 'string' && payload\.autopistaChallenge/);  // solo con recibo del receptor
  assert.doesNotMatch(cv,/ingresarTrasRegistro\((?!respuesta\.autopistaReceipt)/);  // nunca con email ni envioId
  const bridge=read('assets/autopista/registro-bridge.mjs');assert.match(bridge,/\/registro\/canjear/);assert.match(bridge,/\{receipt\}/);
});
test('configuración sin remoto ni activación accidental ni Score',()=>{
  const config=read('_autopista/wrangler.jsonc');assert.match(config,/"MAIL_ENABLED": "false"/);assert.match(config,/"ACCESS_ENABLED": "false"/);assert.match(config,/"INGEST_ENABLED": "false"/);assert.match(config,/"routes": \[\]/);assert.doesNotMatch(config,/"database_id"|129e5982/);
});
