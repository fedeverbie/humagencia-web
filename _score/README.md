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

## Score (máximo 100)
Experiencia según CV 10 · Experiencia comprobada en entrevista 35 · Referencias comprobables 20 ·
Formación 10 · Cursos 10 · Movilidad propia con registro 5 · Disponibilidad horaria 5 · Presentación del CV 5.
