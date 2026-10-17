// REGISTRY interno sobre D1: lista de registrados elegibles que la tarea de
// Claude sincroniza cada madrugada desde el Índice de legajos (solo con CV y
// autorización, sin pruebas). Guarda solo el SHA-256 del email normalizado y un
// identificador opaco: nunca nombres, teléfonos, CV ni el email en claro.
import { hash, normalizeEmail } from './security.mjs';

const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export function registryD1(db) {
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path !== '/eligible' || request.method !== 'POST') return reply({ error: 'NO_DISPONIBLE' }, 404);
      let email = null;
      try { email = normalizeEmail((await request.json()).email); } catch { /* cuerpo inválido */ }
      if (!email) return reply({ eligible: false, subject: '' });
      const row = await db.prepare('SELECT subject FROM cabina_elegibles WHERE email_hash=?').bind(await hash(email)).first();
      return reply(row ? { eligible: true, subject: String(row.subject) } : { eligible: false, subject: '' });
    },
  };
}
