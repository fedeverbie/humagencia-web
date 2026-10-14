# Score — panel interno

Panel privado con el score de 100 puntos de cada legajo. Vive en **https://score.humagencia.com.ar**
(y **humagencia.com.ar/score** redirige ahí). Es un Worker de Cloudflare con una base D1.

- `public/` — la página (HTML, CSS y JS).
- `src/` — el Worker: sirve la página y la API `/api/score` (leer y guardar puntajes).
- `schema.sql` — tabla `legajos` de la base `humagencia-score`.

## Seguridad
La API solo responde si la visita pasó por **Cloudflare Access** (login con código al mail) y el mail
está en `SCORE_EMAILS`. Sin `ACCESS_TEAM` y `ACCESS_AUD` configurados, no devuelve datos.

## Puesta en marcha (una sola vez)
1. Cloudflare → Workers & Pages → Create → Import a repository → `humagencia-web`, carpeta raíz `_score`.
   Cada push a `main` lo vuelve a publicar.
2. Zero Trust → Access → Applications → Self-hosted: dominio `score.humagencia.com.ar`,
   política "Allow" con tu mail, método de login "One-time PIN".
3. Copiar el nombre del equipo (`<equipo>.cloudflareaccess.com`) y el "Application Audience (AUD) Tag"
   a `ACCESS_TEAM` y `ACCESS_AUD` en `wrangler.jsonc`, y hacer push.

## Score oficial v2.0 (máximo 100)
Entrevista 35 · Referencias comprobadas 20 · Experiencia relevante 15 · Habilidades demostradas 10 ·
Formación y cursos 10 · Disponibilidad y traslado 5 · Información completa del CV 5.

- Reglas en `public/assets/rules.mjs` (las usan el panel y la API). Pruebas: `node test/rules.test.mjs`.
- Cada criterio tiene evidencia: pendiente, declarado (CV) o verificado. Pendiente no suma y no es cero.
- `total` es el puntaje observado y `cobertura` sobre cuántos puntos se evaluó (con el CV solo, 35).
- Estados: sin evaluar, preliminar, entrevistado, verificado. Etiqueta aparte: listo para presentar,
  entrevista prioritaria, perfil para desarrollar, información insuficiente, con próximos pasos.
- No puntúan edad, género, aspecto, foto, nacionalidad, estado civil ni condición social.
- Migración desde v1.0: `migrations_v2.sql`; el puntaje anterior queda en `pts_v1`.
