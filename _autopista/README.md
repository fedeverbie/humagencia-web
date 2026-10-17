# Autopista de Avisos — rama de revisión

**No está en producción. Claude informó creada la D1 remota separada; Work todavía no verificó su configuración. No hay emails activos ni conexión al Worker.** Desarrollo aislado desde main `2f1b3aa`; solo archivos nuevos. No modifica `data/site.mjs`, CV, legajos, Score, Autocrat, consentimientos ni tareas existentes.

## Contenido
- `/autopista/index.html` y `/assets/autopista/`: listado público, acceso por enlace de un uso, aviso obligatorio de CV, contactos autenticados e historial que separa consulta y declaración manual.
- `src/worker.mjs`: API y controles de acceso. `src/security.mjs`: validación, tokens y plantilla de email.
- `migrations/0001.sql`: esquema independiente D1 compatible SQLite. No contiene candidatos ni contactos reales.
- `test/`: pruebas contra SQLite real en memoria; REGISTRY y MAILER simulados, sin tráfico de datos reales.
- `docs/CONTRATO.md`: API propuesta, propiedad de datos de Claude, dependencias de registro y correo.
- `docs/COSTOS.md`: cuotas/costos oficiales, comprobaciones pendientes. El adelanto puede leer los avisos públicos existentes sin modificar su fuente y sin exponer contactos.

## Validación local

Node 24 o posterior, sin instalar dependencias:
```sh
cd _autopista
npm test
```

`node test/serve.mjs` inicia una demostración **local y con datos ficticios**, en puerto 8788. No accede a Drive ni envía mails. Para probar enlace, el servidor muestra en terminal únicamente un enlace de prueba generado localmente. Nunca usar este servidor con usuarios reales ni publicarlo: sirve cookies técnicas de prueba solo para localhost y expone un mecanismo de prueba deliberado. El Worker de producción mantiene cookies Secure.

## Qué funciona en pruebas

Proyección sin contactos; login genérico; tokens aleatorios hasheados 15 min; canje atómico; sesiones 30 días; CSRF; cierre de sesión; contactos vigentes; historial aislado/paginado; declaración idempotente; carga transaccional privada sin resucitar lotes viejos; sin límite de consultas. Instagram presente en las pantallas, aviso de CV y plantilla de email. Recibo de nuevo registro validado contra adaptador simulado, ligado a navegador y de un solo uso.

## Qué todavía NO está conectado

REGISTRY (consulta de registros reales con CV), recibo seguro emitido por el receptor actual, MAILER, datos HAG reales y D1 remota. No se tocó el receptor por la restricción de alcance. `registro-bridge.mjs` es opt-in y no está cargado por el formulario existente. No afirmar acceso inmediato real ni correo real funcionando. No se probaron Android físico ni Cloudflare D1 real.

Claude confirmó el contrato y comunicó que su tarea cargará contactos directamente en la nueva D1. Sus tareas de avisos y postulaciones continúan separadas y no se duplicaron.

## Publicación futura (no ejecutada)

No ejecutar `wrangler deploy` ni migraciones remotas todavía. Tras revisión, verificar y usar la base **humagencia-autopista** que Claude informó creada (`a13baab4-9018-44b0-b094-4488b4d4271a`); no recrearla ni repetir 0001. Inspeccionar columnas antes de aplicar 0002. Comprobar que su ID no sea el de Score. Completar binding AUTOPISTA_DB y adaptadores privados. Habilitar entorno de ensayo con mismo origen frontend/API y probar con la cuenta de agencia. Hacer revisión de seguridad, cuotas y acceso postregistro. Federico autoriza posteriormente fusión/publicación; no cambiar main ahora.

## Adelanto visible — actualización 16/10/2026

40 pruebas aprobadas. La vista previa puede mostrar 29 avisos públicos vigentes de la fuente actual de Claude (solo lectura), con empresa y horario. Contactos y acceso real siguen bloqueados. Cloudflare rechazó el inicio de sesión Google de Work: no se desplegó servidor ni se aplicaron migraciones remotas desde Work.
