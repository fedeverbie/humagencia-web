# Costos y cuotas — consulta oficial 16/10/2026 Argentina

No se contrató ni activó ningún servicio y no se introdujeron credenciales. La configuración tiene `ACCESS_ENABLED=false`, `MAIL_ENABLED=false`, `INGEST_ENABLED=false`, sin rutas ni D1 remota.

| Servicio | Referencia gratuita documentada | Riesgo a controlar |
|---|---|---|
| Cloudflare Workers | 100.000 solicitudes/día; 10 ms CPU/invocación | Límites compartidos de la cuenta; medir CPU/errores en entorno real; no prometer capacidad ilimitada |
| Cloudflare D1 | 5 millones filas leídas/día, 100.000 escritas/día, 5 GB totales | Revisar plan/uso actual de cuenta; índices reducen lecturas, también escriben; fallo al superar límites Free |
| Apps Script/Gmail común | 100 destinatarios diarios por usuario, cuota variable y modificable por Google | Compartida con otros proyectos de la cuenta; `getRemainingDailyQuota()` y reserva para CV/postulaciones; no prometer entrega ni ausencia de bloqueos |

Fuentes primarias consultadas:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.google.com/apps-script/guides/services/quotas

Workers Paid tiene suscripción base de USD 5/mes y uso adicional según plan. No se contrató ni se recomienda activarlo sin medir. No se verificó el plan facturado actual de Federico; las cifras Free son referencia, no confirmación de su cuenta.

«Sin límite diario de consultas» significa que el código no impone un cupo comercial por postulante; no elimina límites técnicos de los proveedores ni protecciones contra ataques.

Antes de habilitar emails: seleccionar adaptador, verificar cuota real del día/usuario, costos, límites, seguridad del endpoint e idempotencia. Solo luego prueba real autorizada a consultorahumania@gmail.com. No enviaron correos de acceso ni postulaciones durante las pruebas; el correo de coordinación sí se envió al hilo solicitado.
