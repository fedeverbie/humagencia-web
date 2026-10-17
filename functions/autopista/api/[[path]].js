// Pages Function: publica el Worker de la Autopista bajo /autopista/api/* en el
// mismo origen que la interfaz. La lógica vive en _autopista/src/worker.mjs.
// REGISTRY usa la lista sincronizada en D1 y los recibos firmados del receptor
// de CV; MAILER usa el script "Autopista MAILER" (MAILER_URL). Sin MAILER_URL,
// /acceso responde genérico y no envía nada.
import { handle } from '../../../_autopista/src/worker.mjs';
import { registryD1, mailerAppsScript } from '../../../_autopista/src/registry-d1.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const fullEnv = { ...env };
  if (env.AUTOPISTA_DB && !env.REGISTRY) fullEnv.REGISTRY = registryD1(env.AUTOPISTA_DB);
  if (env.AUTOPISTA_DB && !env.MAILER && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(env.MAILER_URL || '')) {
    fullEnv.MAILER = mailerAppsScript(env.AUTOPISTA_DB, env.MAILER_URL);
  }
  return handle(request, fullEnv, context);
}
