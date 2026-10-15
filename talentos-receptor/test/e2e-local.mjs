// Prueba de navegador de punta a punta contra el receptor simulado (Talentos.gs real + simulador de Apps Script).
// Uso: node talentos-receptor/test/e2e-local.mjs <carpeta-de-fixtures>
// Requiere Playwright. Sirve el sitio con los encabezados de _headers (CSP incluida).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { entorno } from './simulador.mjs';

const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const RAIZ = path.resolve(new URL('../..', import.meta.url).pathname);
const FIX = process.argv[2];
const env = entorno();
const fallas = [];
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallas.push(msg); };

// Encabezados reales del sitio
const headers = {};
fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8').split('\n').filter((l) => /^\s+\S+:/.test(l)).forEach((l) => {
  const i = l.indexOf(':'); headers[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
let llamadas = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__receptor' && req.method === 'POST') {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      const contents = Buffer.concat(partes).toString('utf8');
      const cuerpo = JSON.parse(contents);
      llamadas.push(cuerpo.accion);
      const r = env.ctx.doPost({ postData: { contents } });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  if (url.pathname === '/data/talentos.mjs') {
    res.writeHead(200, { 'content-type': 'text/javascript', ...headers });
    return res.end("export const talentEndpoint = '/__receptor';");
  }
  let f = path.join(RAIZ, decodeURIComponent(url.pathname));
  if (!f.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', ...headers });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const consola = [];
page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()); });
page.on('pageerror', (e) => consola.push(e.message));

await page.goto(base + '/perfil-artistico/');
ok(await page.locator('#tal-disciplinas input').count() === 10, 'se muestran las 10 disciplinas');
ok(await page.locator('#tal-off').isHidden(), 'el formulario está activo cuando hay receptor');

// 1) Validaciones: enviar vacío
await page.click('#tal-submit');
ok((await page.textContent('#tal-nombre-error')).includes('nombre y apellido'), 'pide nombre y apellido');
ok((await page.textContent('#tal-fotos-error')).includes('al menos una foto'), 'pide al menos una foto');
ok((await page.textContent('#tal-guardar-error')).length > 0, 'exige autorización para guardar');
ok(llamadas.length === 0, 'no se llamó al receptor con el formulario inválido');

// 2) Archivos rechazados en el navegador
await page.setInputFiles('#tal-foto-input', path.join(FIX, 'chica.jpg'));
await page.waitForFunction(() => /resolución/.test(document.getElementById('tal-fotos-error').textContent), null, { timeout: 5000 }).catch(() => {});
ok((await page.textContent('#tal-fotos-error')).includes('poca resolución'), 'rechaza foto de baja resolución');
await page.setInputFiles('#tal-foto-input', path.join(FIX, 'falsa.jpg'));
await page.waitForFunction(() => /no se puede abrir/.test(document.getElementById('tal-fotos-error').textContent), null, { timeout: 5000 }).catch(() => {});
ok((await page.textContent('#tal-fotos-error')).includes('no se puede abrir como imagen'), 'rechaza un archivo que no es imagen aunque diga .jpg');
await page.setInputFiles('#tal-book-input', path.join(FIX, 'grande.pdf'));
ok((await page.textContent('#tal-book-error')).includes('máximo'), 'rechaza un PDF de más de 15 MB');
await page.setInputFiles('#tal-book-input', path.join(FIX, 'reel.mp4'));
ok((await page.textContent('#tal-book-error')).includes('PDF'), 'rechaza un video en el campo book');

// 3) Menor de edad
const fill = async (datos) => { for (const [k, v] of Object.entries(datos)) await page.fill('#tal-' + k, v); };
await fill({ nombre: 'Prueba Talento', email: 'prueba.talento@example.com', telefono: '221 555-0101', nacimiento: '2012-05-05', experiencia: 'Desfiles en Plaza Moreno y una publicidad local en 2025.' });
await page.selectOption('#tal-localidad', 'La Plata');
await page.check('#tal-d-0', { force: true });
await page.setInputFiles('#tal-foto-input', [path.join(FIX, 'retrato.jpg'), path.join(FIX, 'cuerpo.png')]);
await page.waitForFunction(() => document.querySelectorAll('#tal-foto-list img').length === 2, null, { timeout: 5000 }).catch(() => {});
ok(await page.locator('#tal-foto-list img').count() === 2, 'muestra dos miniaturas de fotos válidas');
await page.check('#tal-mayor'); await page.check('#tal-derechos'); await page.check('#tal-guardar');
await page.click('#tal-submit');
ok((await page.textContent('#tal-nacimiento-error')).includes('mayores de 18'), 'rechaza menores de 18');

// 4) Envío completo
await fill({ nacimiento: '1998-03-21', altura: '172', calzado: '38', instagram: '@prueba.talento', links: 'https://www.youtube.com/watch?v=prueba' });
await page.check('#tal-d-1', { force: true });
await page.setInputFiles('#tal-book-input', path.join(FIX, 'book.pdf'));
await page.setInputFiles('#tal-video-input', path.join(FIX, 'reel.mp4'));
ok((await page.textContent('#tal-total')).includes('de 80 MB'), 'muestra el total a subir');
// quitar y volver a agregar una foto
await page.click('#tal-foto-list li:nth-child(2) .tal-remove');
ok(await page.locator('#tal-foto-list img').count() === 1, 'se puede quitar una foto');
await page.setInputFiles('#tal-foto-input', path.join(FIX, 'cuerpo.png'));
await page.waitForFunction(() => document.querySelectorAll('#tal-foto-list img').length === 2, null, { timeout: 5000 });
await page.check('#tal-clientes');
llamadas = [];
await page.click('#tal-submit');
await page.waitForSelector('#tal-result:not([hidden])', { timeout: 15000 });
ok(JSON.stringify(llamadas) === JSON.stringify(['iniciar', 'archivo', 'archivo', 'archivo', 'archivo', 'finalizar']), 'secuencia iniciar → 4 archivos → finalizar: ' + llamadas.join(','));
ok((await page.textContent('#tal-summary')).includes('2 foto(s), 1 book(s), 1 video(s), 1 enlace(s)'), 'el resumen muestra el material');
const libro = env.libro();
const talentos = libro.getSheetByName('Talentos').rows;
ok(talentos.length === 2 && talentos[1][17] === 'SÍ' && talentos[1][18] === 'NO', 'registro con autorizaciones correctas');
ok(libro.getSheetByName('Archivos').rows.length === 5, 'cuatro archivos registrados');
const bytesFoto = [...env.items.values()].filter((x) => x.padre === talentos[1][13] && x.bytes).map((x) => x.bytes).sort();
ok(JSON.stringify(bytesFoto) === JSON.stringify([fs.statSync(path.join(FIX, 'cuerpo.png')).size, fs.statSync(path.join(FIX, 'retrato.jpg')).size].sort()), 'las fotos llegaron completas, byte a byte');
ok(env.mails.length === 2, 'se enviaron los dos correos');

// 5) Segundo envío de la misma persona → actualiza, no duplica
await page.goto(base + '/perfil-artistico/');
await fill({ nombre: 'Prueba Talento', email: 'PRUEBA.TALENTO@example.com', telefono: '0221 15 555-0101', nacimiento: '1998-03-21', experiencia: 'Sumé un videoclip de una banda platense en 2026.' });
await page.selectOption('#tal-localidad', 'Berisso');
await page.check('#tal-d-4', { force: true });
await page.setInputFiles('#tal-foto-input', path.join(FIX, 'retrato.jpg'));
await page.waitForFunction(() => document.querySelectorAll('#tal-foto-list img').length === 1, null, { timeout: 5000 });
await page.check('#tal-mayor'); await page.check('#tal-derechos'); await page.check('#tal-guardar');
await page.click('#tal-submit');
await page.waitForSelector('#tal-result:not([hidden])', { timeout: 15000 });
ok((await page.textContent('#tal-result-title')).includes('Actualizamos'), 'el segundo envío avisa que actualizó el perfil');
ok(env.libro().getSheetByName('Talentos').rows.length === 2, 'sigue habiendo un único talento');
ok([...env.items.values()].filter((x) => x.padre === '1XhGeNhAmrS3HZX8otYG39JM5mxmvCIiY').length === 1, 'una sola carpeta de legajo');

// 6) Corte de red durante una subida → reintento sin duplicar
await page.goto(base + '/perfil-artistico/');
await fill({ nombre: 'Otra Persona', email: 'otra@example.com', telefono: '221 444-9999', nacimiento: '1990-01-01', experiencia: 'Promotora en eventos deportivos y ferias.' });
await page.selectOption('#tal-localidad', 'Ensenada');
await page.check('#tal-d-2', { force: true });
await page.setInputFiles('#tal-foto-input', [path.join(FIX, 'retrato.jpg'), path.join(FIX, 'cuerpo.png')]);
await page.waitForFunction(() => document.querySelectorAll('#tal-foto-list img').length === 2, null, { timeout: 5000 });
await page.check('#tal-mayor'); await page.check('#tal-derechos'); await page.check('#tal-guardar');
let cortes = 0;
await page.route('**/__receptor', async (route) => {
  const cuerpo = JSON.parse(route.request().postData());
  if (cuerpo.accion === 'archivo' && cuerpo.indice === 1 && cortes < 3) { cortes++; return route.abort('connectionreset'); }
  return route.continue();
});
await page.click('#tal-submit');
await page.waitForFunction(() => /Podés volver a tocar/.test(document.getElementById('tal-status').textContent), null, { timeout: 30000 });
ok(true, 'ante un corte de red, el formulario invita a reintentar');
await page.unroute('**/__receptor');
await page.click('#tal-submit');
await page.waitForSelector('#tal-result:not([hidden])', { timeout: 15000 });
const archivosOtra = env.libro().getSheetByName('Archivos').rows.slice(1).filter((r) => r[2] !== talentos[1][0]);
ok(archivosOtra.length === 2, 'tras reintentar quedan exactamente 2 archivos (sin duplicar el ya subido)');

// 7) Escritorio y página de inicio
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(base + '/');
ok(await page.locator('a[href="./perfil-artistico/"]').count() >= 2, 'el inicio enlaza al Perfil artístico');
ok(await page.locator('#cv-form').count() === 1 && await page.locator('#employer-form').count() === 1, 'siguen los formularios de CV y de empresas');
await page.waitForFunction(() => document.querySelectorAll('#jobs-list .job-card').length > 0, null, { timeout: 5000 });
ok(true, 'los avisos se siguen mostrando');
await page.goto(base + '/privacidad/#talentos');
ok(await page.locator('#talentos').count() === 1, 'privacidad tiene la sección de talentos');
await page.goto(base + '/perfil-artistico/');
await page.screenshot({ path: path.join(FIX, 'perfil-escritorio.png'), fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(FIX, 'perfil-celular.png'), fullPage: true });
const anchoExtra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(anchoExtra <= 0, 'sin desplazamiento horizontal en celular');
ok(consola.filter((c) => !/Failed to load resource|ERR_CONNECTION_RESET/.test(c)).length === 0, 'sin errores de consola ni de CSP: ' + consola.join(' | '));

await browser.close();
server.close();
console.log(fallas.length ? `\n${fallas.length} FALLA(S)` : '\nTODAS LAS PRUEBAS OK');
process.exit(fallas.length ? 1 : 0);
