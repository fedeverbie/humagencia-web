# Autopista de Avisos — propuesta para Claude

Estado: enviado al hilo Gmail `1a145a141b0636f1`; respuesta de Work `1a1478db17955ad7`. **Pendiente de confirmación de Claude. No integrar HAG reales aún.**

Origen: main `2f1b3aa`. Definiciones finales de Federico, 16/10/2026 22:31 y 22:38 Argentina. La instrucción de desarrollo reemplaza el «solo planificación» inicial del hilo.

## Propiedad y aislamiento

- Claude administra los HAG y `data/site.mjs`. Work no lo modifica, ni importa contactos desde el repositorio.
- `hag_contactos` pertenece al circuito HAG de Claude. Work solo ofrece una importación transaccional con secreto independiente; nunca ejecuta una búsqueda diaria ni un envío de postulaciones.
- D1 propuesta **humagencia-autopista**, binding **AUTOPISTA_DB**. No reutilizar `humagencia-score`, `SCORE_DB` ni IDs de otras bases. La migración solo se ejecutó en SQLite en memoria para pruebas.
- `cabina_*` son tablas técnicas de acceso e historial. No son una base paralela de candidatos: no almacenan nombre, teléfono, CV, consentimientos, entrevista ni perfil. `cabina_usuarios` conserva un ID técnico y el email verificado necesario para sesión.
- No se modificó la portada, recepción de CV, legajos, Score, consentimientos, Apps Script, Autocrat, tareas de Claude ni producción. La nueva ruta está aislada en `/autopista/`.

## Carga de avisos (propuesta hag-private-v1)

`POST /autopista/api/admin/lote`, `Authorization: Bearer <INGEST_SECRET>`, `Content-Type: application/json`. Solo servidor a servidor. Secreto aleatorio de al menos 32 caracteres en secreto de Worker; nunca en navegador, GitHub ni email. Rotarlo si se expone.

```json
{
  "schema": "hag-private-v1",
  "batchId": "identificador-unico-del-lote",
  "generatedAt": "2026-10-17T11:17:00.000Z",
  "jobs": [{
    "id": "HAG-001",
    "title": "Atención al público",
    "city": "La Plata",
    "category": "Comercio",
    "sourceLabel": "Fuente de origen",
    "checkedAt": "2026-10-17",
    "reviewAfter": "2026-10-20",
    "firstSeenAt": "2026-10-17",
    "status": "published",
    "applyMode": "email",
    "applyTarget": "empleador@example.test",
    "applyInstructions": "Adjuntar CV en PDF."
  }]
}
```

Ejemplo ficticio: no cargar estos destinos como avisos reales. Hasta 500 avisos y 512 KB por lote, tres escrituras SQL en una transacción D1. `generatedAt` debe ser reciente (24 h), no futuro >1 min y monotónico. Repetir `batchId` no duplica. Lote antiguo no modifica ni revive avisos. IDs no se reciclan. Ausentes en lote completo se cierran sin borrar historial. Lote vacío exige `confirmEmpty: true` para evitar cerrar todo por un fallo de extracción. La tarea debe verificar primero que la extracción fue completa.

Modalidades: `email`, `whatsapp` (10–15 dígitos con país, sin +), `web` (HTTPS sin credenciales), `presencial` (destino vacío e instrucciones obligatorias), `consultar` (destino vacío). Ninguna deriva por defecto al WhatsApp de Federico. Verificar manualmente URL/destino contra la fuente y vigencia antes de importar. Un modo `consultar` no cuenta como apertura.

Publicación sin contactos: `GET /autopista/api/jobs` devuelve solo `id,title,city,category,sourceLabel,checkedAt,reviewAfter,status`. No devuelve `applyTarget`, `applyInstructions`, datos de usuarios ni enlaces de contacto. Los campos públicos tampoco pueden contener teléfonos, emails, handles, HTML ni URL. Validación sintáctica no sustituye la revisión de Claude de contactos escritos en palabras. Fuentes con contacto incrustado en URL quedan fuera de la proyección. No se creó `data/jobs.json`: si Claude lo exporta, usar esta misma proyección pública.

Vigencia: día de Argentina. Desde `reviewAfter` el aviso deja de ser consultable, coherente con `jobStatus` actual. `closed` nunca entrega contacto. Conservar la primera fecha de detección del ID.

## Registro existente: REGISTRY (pendiente)

Binding privado con `fetch(Request)` (Service Binding o adaptador equivalente auditado). **No existe ni se instaló aún.** El Worker no tiene acceso directo a Drive, CV ni planillas.

| Ruta interna POST | Entrada | Salida mínima |
|---|---|---|
| `/eligible` | `{email}` normalizado | `{eligible:boolean, subject:string}` identificador opaco si está registrado correctamente con CV |
| `/receipt` | `{receipt,challenge}` | `{eligible:true,registrationVerified:true,email,challenge,expiresAt}` solo si el receptor real confirma recepción de CV |

El adaptador debe autenticar al Worker, consultar la fuente real y respetar cualquier revocación que afecte el acceso. No responder con teléfonos, nombres, archivos, legajos, consentimientos o estados de selección. Nunca ofrecer esta comprobación directamente al navegador ni al catálogo público. Si falla, denegar acceso.

### Acceso inmediato tras nuevo CV

**Dependencia pendiente, no se afirma integrada.** El frontend existente solo obtiene `ok`, `recibido` y un `envioId` elegido por el navegador. Nada de eso es una credencial segura.

La ampliación futura, aislada y autorizada del receptor deberá:

1. Antes de enviar CV, llamar `prepararIngresoTrasRegistro()` del módulo opt-in `assets/autopista/registro-bridge.mjs`. Genera desafío con cookie HttpOnly y devuelve su hash.
2. El receptor asocia ese hash al registro que efectivamente guardó con CV; emite un recibo aleatorio/firmado de uso único y TTL ≤15 min. No aceptar solo un email o `envioId` como evidencia. No reutilizar secretos del receptor ni devolver enlaces al Drive.
3. Tras éxito, llamar `ingresarTrasRegistro(receipt)`. El Worker valida el recibo contra REGISTRY, el desafío de ese navegador, vencimiento y no reutilización; crea sesión y dirige a `/autopista/` sin email adicional.
4. Si falla el canje, el CV ya recibido debe seguir registrado; ofrecer acceso por enlace, sin reenviar CV ni crear otro legajo.

Este módulo **no se carga en el formulario actual** y no intercepta sus eventos. No se agregó un «puente» ficticio que acepte datos declarados por el cliente. Conectar sin tocar el receptor exige que su responsable proporcione primero el contrato verificable. Requiere autorización específica para esa ampliación fuera del alcance actual.

## Correo: MAILER (pendiente)

Binding privado `POST /send-login` con `{idempotencyKey,to,subject,text}`; respuesta `{sent:true}` exclusivamente después de aceptación real del proveedor. El texto se genera en `loginMail()` e incluye Instagram y vencimiento. Servicio todavía no seleccionado/instalado. No usa Gmail API ni MailApp en este desarrollo.

Si se elige Apps Script: crear adaptador aislado, nunca reemplazar el receptor CV. Verificar firma servidor-servidor, timestamp, nonce, destinatario único validado, plantilla fija (no relay genérico), idempotencia persistida y bloqueo simultáneo; comprobar `MailApp.getRemainingDailyQuota()` antes de cada envío y reservar cuota para otros scripts de la misma cuenta. No reintentar automáticamente un envío de resultado incierto sin deduplicación. No asumir que la cuota es por proyecto. Aprobar costos y remitente antes de habilitarlo.

## API de acceso e historial

| Método/ruta bajo `/autopista/api` | Protección/comportamiento |
|---|---|
| GET `/jobs` | Público, proyección sin contactos |
| POST `/acceso` | Respuesta genérica 202, sea registrado o no; correo en segundo plano; no divulga elegibilidad |
| POST `/canjear` | Token 256 bits + cookie del navegador solicitante; consume atómicamente una vez; TTL 15 min |
| GET `/sesion` | Cookie de sesión, no devuelve email ni token |
| POST `/salir` | Invalida sesión servidor y cookie |
| POST `/contacto/HAG-NNN` | Sesión, vigencia, un contacto por petición; registra consulta, no envío |
| POST `/postule/HAG-NNN` | Solo si abrió contacto antes; declaración manual idempotente |
| GET `/historial` | Solo su historial, páginas de 100; cursor compuesto `before` + `id` para no perder timestamps iguales |
| POST `/registro/iniciar` y `/registro/canjear` | Desafío/recibo verificado; integración pendiente |

Cookie `__Host-hag_session`: Secure, HttpOnly, SameSite=Lax, Path=/, 30 días absolutos (no infinitos). Token se guarda solo hasheado. Salir revoca ese dispositivo. Enlace de email va en fragmento, se quita de la barra al cargar y requiere toque «Ingresar» para no consumir con lectores automáticos de correo. Debe abrirse en el navegador que lo solicitó: si una app de email usa otro navegador, pedir otro enlace allí. No debilitar esta protección para resolver ese caso sin revisión.

POST del navegador exige Origin exacto. No CORS permisivo. Sin localStorage de credenciales, sin analítica de emails/tokens. Respuestas `no-store`, referrer `no-referrer`. D1 con sesión first-primary por petición para lecturas consistentes. No se registran cuerpos, emails, contactos ni tokens en logs.

No hay límite diario de consultas de contactos. Antispam solo para *pedir enlaces*: tres por email/15 min, veinte por IP/15 min, presupuesto técnico 50 mails/día UTC por defecto (revisar junto con cuota real). No se publica diferencia de respuesta por cuenta o cuota. Integrar protección de borde antes de producción para no permitir abuso de volumen del catálogo/login.

## Pendientes de revisión de seguridad antes de activar

- Confirmar REGISTRY y fuente autoritativa real, incluyendo CV recibido, pruebas excluidas y acceso revocado.
- Aprobar recibos y conexión opt-in al registro actual; no confiar en `envioId`.
- Confirmar MAILER, remitente, presupuesto compartido, idempotencia y prueba real al email de la agencia.
- Crear D1 separada, configurar bindings y rutas solo de ensayo; luego probar en Cloudflare real (D1 SQLite local no sustituye esa prueba).
- Configurar retención/limpieza de enlaces, sesiones y límites expirados. No se crearon cron ni triggers automáticos. Acordar retención del historial con Federico antes de borrar datos.
- Probar enlace desde Android y app de correo, cookies y correo real. Revisar doble toque, recuperación si se pierde respuesta tras consumir un token y accesibilidad con lector.
- Confirmar que el historial manual no se utilice como prueba de envío ni impida indebidamente el circuito diario de Claude. Ambos circuitos siguen separados: no se afirma deduplicación entre una acción externa del candidato y la tarea diaria, porque el navegador no puede probar el envío.
- Los cambios no se fusionan ni publican en producción sin Federico.
