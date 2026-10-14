# Plantillas de mail — HumagencIA

- `empresas.html`: presentación de perfiles a empresas (2 visibles + el mejor reservado con candado).
- `postulantes.html`: aviso al candidato de que fue presentado.

Imágenes (servidas desde humagencia.com.ar):
- `assets/mail-top.jpg` — banner superior, 1200 × 400 px (provisorio hasta el banner definitivo).
- `assets/mail-avatar.jpg` — Federico, Uma y Botito, para el pie.
- `assets/mail-equipo.jpg` — banner del mail al postulante.

## Puntaje en los mails: Score oficial HumagencIA v2.0

Ya no hay un segundo puntaje. En `{{SCORE}}` va el Score oficial del legajo (base `humagencia-score`,
panel score.humagencia.com.ar): el puntaje observado sobre 100. En `{{DESGLOSE}}` va sobre cuánto se
evaluó y qué falta, por ejemplo: "evaluado sobre 35 (CV) · entrevista y referencias pendientes" o
"evaluado sobre 90 · entrevista y referencias comprobadas".

Criterios: entrevista 35 · referencias comprobadas 20 · experiencia relevante 15 · habilidades 10 ·
formación y cursos 10 · disponibilidad y traslado 5 · información completa del CV 5.
La compatibilidad con cada aviso se explica con palabras (ALTA o MEDIA y el motivo), sin otro número.

No puntúan la edad, el género, el aspecto, la foto, la nacionalidad, el estado civil ni la condición social.
Lo que no se evaluó queda pendiente: no se supone ni cuenta como cero.
