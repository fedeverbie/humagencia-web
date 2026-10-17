// Pages Function: publica el Worker de la Autopista bajo /autopista/api/* en el
// mismo origen que la interfaz. La lógica vive en _autopista/src/worker.mjs.
// REGISTRY usa la lista sincronizada en D1; MAILER sigue pendiente (sin él,
// /acceso responde genérico y no envía nada).
import { handle } from '../../../_autopista/src/worker.mjs';
import { registryD1 } from '../../../_autopista/src/registry-d1.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const fullEnv = env.AUTOPISTA_DB && !env.REGISTRY
    ? { ...env, REGISTRY: registryD1(env.AUTOPISTA_DB) }
    : env;
  return handle(request, fullEnv, context);
}
