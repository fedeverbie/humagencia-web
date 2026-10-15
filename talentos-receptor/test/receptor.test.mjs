// Pruebas locales del receptor de talentos con un simulador mínimo de Apps Script.
// Uso: node --test talentos-receptor/test/receptor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { entorno } from './simulador.mjs';

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3000, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(5000, 2)]);

const datos = (o = {}) => ({
  nombre: 'Lucía Prueba', artistico: 'Lu P', email: 'lucia@example.com', telefono: '221 555-1234',
  localidad: 'La Plata', nacimiento: '1995-04-10', disciplinas: ['Modelo', 'Actuación'],
  experiencia: 'Desfiles locales y dos cortos independientes en 2025.', formacion: 'Taller de teatro',
  habilidades: 'Inglés intermedio', altura: '170', talle: 'M', calzado: '38', instagram: '@lu.prueba',
  links: ['https://youtube.com/watch?v=abc'], mayor: true, derechos: true, guardar: true, clientes: true, promocion: false, ...o,
});
const plan = (arr) => arr.map(([campo, tipo, buf, nombre]) => ({ campo, tipo, bytes: buf.length, nombre }));
const uid = () => crypto.randomUUID();

async function enviarCompleto(env, d, archivos) {
  const envioId = uid();
  const ini = env.post({ accion: 'iniciar', envioId, datos: d, archivos: plan(archivos) });
  assert.equal(ini.ok, true, ini.error);
  archivos.forEach(([, , buf], i) => {
    const r = env.post({ accion: 'archivo', envioId, token: ini.token, indice: i, base64: buf.toString('base64') });
    assert.equal(r.ok, true, r.error);
  });
  const fin = env.post({ accion: 'finalizar', envioId, token: ini.token });
  assert.equal(fin.ok, true, fin.error);
  return { envioId, ini, fin };
}

test('alta completa: registro, legajo, archivos en carpetas por tipo y correos', async () => {
  const env = entorno();
  const { fin, ini } = await enviarCompleto(env, datos(), [['foto', 'image/jpeg', JPG, 'cara.jpg'], ['foto', 'image/jpeg', JPG, 'cuerpo.jpg'], ['book', 'application/pdf', PDF, 'book.pdf'], ['video', 'video/mp4', MP4, 'reel.mp4']]);
  assert.equal(fin.resumen.fotos, 2); assert.equal(fin.resumen.books, 1); assert.equal(fin.resumen.videos, 1);
  assert.equal(fin.actualizado, false);
  const talentos = env.libro().getSheetByName('Talentos').rows;
  assert.equal(talentos.length, 2);
  assert.match(talentos[1][0], /^TAL-\d{8}-[0-9A-F]{4}$/);
  const legajo = env.items.get(talentos[1][11]);
  assert.equal(legajo.nombre, 'Lucía Prueba'); assert.equal(legajo.padre, '1XhGeNhAmrS3HZX8otYG39JM5mxmvCIiY');
  const enCarpeta = (id) => [...env.items.values()].filter(x => x.padre === id && x.tipo === 'file');
  assert.equal(enCarpeta(talentos[1][13]).length, 2);
  assert.equal(enCarpeta(talentos[1][14]).length, 1);
  assert.equal(enCarpeta(talentos[1][15]).length, 1);
  assert.equal(env.items.get(talentos[1][12]).padre, talentos[1][11], 'el Doc vive en el legajo');
  assert.equal(talentos[1][17], 'SÍ'); assert.equal(talentos[1][18], 'NO'); assert.equal(talentos[1][19], 'talentos-2026-10-14');
  assert.equal(env.mails.length, 2);
  assert.ok(env.mails.some(m => m.to === 'consultorahumania@gmail.com'));
  assert.ok(env.mails.some(m => m.to === 'lucia@example.com' && /Recibimos tu perfil/.test(m.subject)));
  const texto = env.docs.get(talentos[1][12]).join('\n');
  assert.match(texto, /ID interno: TAL-/); assert.match(texto, /mayor de 18 años: SÍ/); assert.match(texto, /difusión de HumagencIA \(web y redes\): NO/);
  assert.ok(ini.token.length >= 32);
});

test('sin duplicados: mismo correo o mismo teléfono actualiza el mismo legajo', async () => {
  const env = entorno();
  await enviarCompleto(env, datos(), [['foto', 'image/jpeg', JPG, 'a.jpg']]);
  const r2 = await enviarCompleto(env, datos({ email: 'LUCIA@example.com', telefono: '+54 9 221 444-0000' }), [['foto', 'image/jpeg', JPG, 'b.jpg']]);
  assert.equal(r2.fin.actualizado, true);
  const r3 = await enviarCompleto(env, datos({ email: 'otro@example.com', telefono: '0221 15 555-1234' }), [['foto', 'image/jpeg', JPG, 'c.jpg']]);
  assert.equal(r3.fin.actualizado, true, 'el teléfono con 0 y 15 se reconoce como el mismo');
  const talentos = env.libro().getSheetByName('Talentos').rows;
  assert.equal(talentos.length, 2, 'sigue habiendo un solo talento');
  assert.equal(talentos[1][21], 3, 'tres envíos');
  const legajos = [...env.items.values()].filter(x => x.padre === '1XhGeNhAmrS3HZX8otYG39JM5mxmvCIiY');
  assert.equal(legajos.length, 1);
  const fotos = [...env.items.values()].filter(x => x.padre === talentos[1][13] && x.tipo === 'file');
  assert.equal(fotos.length, 3);
  const docs = [...env.items.values()].filter(x => x.mime === 'doc');
  assert.equal(docs.length, 1, 'un solo Doc de legajo, con secciones de actualización');
  assert.match(env.docs.get(docs[0].id).join('\n'), /Actualización del perfil/);
});

test('homónimo distinto: segunda carpeta con número', async () => {
  const env = entorno();
  await enviarCompleto(env, datos(), [['foto', 'image/jpeg', JPG, 'a.jpg']]);
  await enviarCompleto(env, datos({ email: 'otra.lucia@example.com', telefono: '221 666-7777' }), [['foto', 'image/jpeg', JPG, 'a.jpg']]);
  const nombres = [...env.items.values()].filter(x => x.padre === '1XhGeNhAmrS3HZX8otYG39JM5mxmvCIiY').map(x => x.nombre).sort();
  assert.deepEqual(nombres, ['Lucía Prueba', 'Lucía Prueba 2']);
});

test('reintentos idempotentes: iniciar, archivo y finalizar repetidos no duplican', async () => {
  const env = entorno();
  const envioId = uid();
  const msg = { accion: 'iniciar', envioId, datos: datos(), archivos: plan([['foto', 'image/jpeg', JPG, 'a.jpg']]) };
  const a = env.post(msg), b = env.post(msg);
  assert.equal(a.token, b.token);
  const arch = { accion: 'archivo', envioId, token: a.token, indice: 0, base64: JPG.toString('base64') };
  env.post(arch); env.post(arch);
  const fin = { accion: 'finalizar', envioId, token: a.token };
  env.post(fin); const f2 = env.post(fin);
  assert.equal(f2.ok, true);
  assert.equal(env.libro().getSheetByName('Archivos').rows.length, 2);
  assert.equal(env.libro().getSheetByName('Envíos').rows.length, 2);
  assert.equal(env.mails.length, 2, 'los correos no se repiten');
  const c = env.post({ ...msg, datos: datos({ experiencia: 'Otra experiencia distinta de la primera vez.' }) });
  assert.equal(c.ok, false, 'mismo envioId con otros datos se rechaza');
});

test('validaciones de datos y consentimiento', () => {
  const env = entorno();
  const intentar = (o, archivos = [['foto', 'image/jpeg', JPG, 'a.jpg']]) => env.post({ accion: 'iniciar', envioId: uid(), datos: datos(o), archivos: plan(archivos) });
  assert.match(intentar({ nacimiento: '2012-01-01' }).error, /mayores de 18/);
  assert.match(intentar({ mayor: false }).error, /mayor de 18/);
  assert.match(intentar({ guardar: false }).error, /autorización para guardar/);
  assert.match(intentar({ derechos: false }).error, /compartir este material/);
  assert.match(intentar({ email: 'mal' }).error, /correo/);
  assert.match(intentar({ telefono: '123' }).error, /teléfono/);
  assert.match(intentar({ disciplinas: ['Astronauta'] }).error, /disciplinas/);
  assert.match(intentar({ disciplinas: ['Otra'], otraDisciplina: '' }).error, /otra disciplina/);
  assert.match(intentar({ links: ['http://inseguro.com'] }).error, /https/);
  assert.match(intentar({ altura: '17' }).error, /centímetros/);
  assert.match(intentar({ nombre: 'Lucía' }).error, /nombre y apellido/);
  assert.match(intentar({}, []).error, /al menos 1 foto/);
  assert.equal(env.post({ accion: 'iniciar', envioId: uid(), website: 'x', datos: datos(), archivos: plan([['foto', 'image/jpeg', JPG, 'a.jpg']]) }).ok, false, 'trampa anti-bots');
  assert.equal(env.libro().getSheetByName('Talentos').rows.length, 1, 'ningún intento inválido creó registros');
});

test('límites y tipos de archivo', () => {
  const env = entorno();
  const intentar = (archivos) => { const r = env.post({ accion: 'iniciar', envioId: uid(), datos: datos(), archivos }); assert.equal(r.ok, false, 'debía rechazarse: ' + JSON.stringify(archivos).slice(0, 120)); return r; };
  const foto = { campo: 'foto', tipo: 'image/jpeg', bytes: 1000, nombre: 'a.jpg' };
  assert.match(intentar([{ ...foto, bytes: 9 * 1024 * 1024 }]).error, /tamaño/);
  assert.match(intentar(Array(9).fill(foto)).error, /cantidad/);
  assert.match(intentar([foto, { campo: 'book', tipo: 'application/zip', bytes: 10, nombre: 'x.zip' }]).error, /formato/);
  assert.match(intentar([foto, { campo: 'video', tipo: 'video/mp4', bytes: 26 * 1024 * 1024, nombre: 'v.mp4' }]).error, /tamaño/);
  assert.match(intentar([foto, { campo: 'video', tipo: 'video/mp4', bytes: 25 * 2 ** 20, nombre: 'v' }, { campo: 'video', tipo: 'video/mp4', bytes: 25 * 2 ** 20, nombre: 'v' }, { campo: 'book', tipo: 'application/pdf', bytes: 15 * 2 ** 20, nombre: 'b' }, { campo: 'book', tipo: 'application/pdf', bytes: 15 * 2 ** 20, nombre: 'b' }]).error, /80 MB/);
});

test('archivo falsificado, incompleto o con token ajeno se rechaza', () => {
  const env = entorno();
  const envioId = uid();
  const ini = env.post({ accion: 'iniciar', envioId, datos: datos(), archivos: plan([['foto', 'image/jpeg', JPG, 'a.jpg']]) });
  const falso = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(JPG.length - 2)]);
  assert.match(env.post({ accion: 'archivo', envioId, token: ini.token, indice: 0, base64: falso.toString('base64') }).error, /no coincide con su formato/);
  assert.match(env.post({ accion: 'archivo', envioId, token: ini.token, indice: 0, base64: JPG.subarray(0, 1200).toString('base64') }).error, /completo/);
  assert.match(env.post({ accion: 'archivo', envioId, token: 'x'.repeat(32), indice: 0, base64: JPG.toString('base64') }).error, /no es válido/);
  assert.match(env.post({ accion: 'archivo', envioId, token: ini.token, indice: 3, base64: JPG.toString('base64') }).error, /no previsto/);
  assert.match(env.post({ accion: 'finalizar', envioId, token: ini.token }).error, /Faltan 1/);
  assert.equal(env.mails.length, 0);
});

test('límite por correo: más de 3 envíos en una hora', () => {
  const env = entorno();
  const ok = () => env.post({ accion: 'iniciar', envioId: uid(), datos: datos(), archivos: plan([['foto', 'image/jpeg', JPG, 'a.jpg']]) });
  assert.equal(ok().ok, true); assert.equal(ok().ok, true); assert.equal(ok().ok, true);
  assert.match(ok().error, /varios envíos/);
});

test('las celdas no ejecutan fórmulas', async () => {
  const env = entorno();
  await enviarCompleto(env, datos({ nombre: '=HYPERLINK("x") Pérez' }), [['foto', 'image/jpeg', JPG, 'a.jpg']]);
  assert.equal(env.libro().getSheetByName('Talentos').rows[1][3][0], "'");
});
