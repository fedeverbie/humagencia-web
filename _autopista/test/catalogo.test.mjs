import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogoPublico,argentinaDay} from '../../assets/autopista/catalogo.mjs';
import {system,seed,job} from './helpers.mjs';
test('adelanto conserva empresa/horario y elimina contactos, resumen y URLs',()=>{
  const r=catalogoPublico([job({company:'Comercio de prueba',schedule:'Turno tarde',summary:'privado',sourceUrl:'https://example.test',applyTarget:'empresa@example.test'})],'2026-10-16')[0];
  assert.equal(r.company,'Comercio de prueba');assert.equal(r.schedule,'Turno tarde');assert.doesNotMatch(JSON.stringify(r),/privado|example.test|applyTarget|sourceUrl/);
});
test('adelanto descarta vencidos y texto de contacto aunque provenga de la carga directa',()=>{
  assert.equal(catalogoPublico([job({reviewAfter:'2026-10-16'})],'2026-10-16').length,0);
  const r=catalogoPublico([job({company:'Enviar CV a mail@example.test',schedule:'Llamar 2215551234'})],'2026-10-16')[0];assert.equal(r.company,'');assert.equal(r.schedule,'');
  assert.equal(catalogoPublico([job({title:'mail@example.test'})],'2026-10-16').length,0);
});
test('API conserva campos nuevos y filtra contactos tras escritura directa a D1',async()=>{
  const s=system();await seed(s,[job({company:'Comercio',schedule:'Turno tarde'})]);let r=(await s.request('/jobs')).data.jobs[0];assert.equal(r.company,'Comercio');assert.equal(r.schedule,'Turno tarde');
  s.db.sql.prepare('UPDATE hag_contactos SET company=?,schedule=?').run('cv@example.test','2215551234');r=(await s.request('/jobs')).data.jobs[0];assert.equal(r.company,'');assert.equal(r.schedule,'');
});
test('fecha Argentina para el listado público',()=>{assert.equal(argentinaDay(new Date('2026-10-17T02:00:00Z')),'2026-10-16');});
