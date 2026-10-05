import { site } from '../data/site.mjs';

export function whatsappUrl(message) {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}

export function emailUrl(subject, message) {
  const singleLineSubject = String(subject).replace(/[\r\n]+/g, ' ').trim();
  return `mailto:${site.email}?subject=${encodeURIComponent(singleLineSubject)}&body=${encodeURIComponent(message)}`;
}

export function jobStatus(job, today = new Date().toISOString().slice(0, 10)) {
  if (job.status === 'closed') return 'closed';
  if (job.status !== 'published' || !job.checkedAt || !job.reviewAfter || today >= job.reviewAfter) return 'unconfirmed';
  return 'published';
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}

const clean = (value) => String(value ?? '').replace(/\r/g, '').trim();
export function prepareInquiry(values) {
  const fields = {
    business: {label: 'Nombre del comercio o empresa', max: 100},
    name: {label: 'Tu nombre', max: 80},
    role: {label: 'Puesto que necesitás cubrir', max: 100},
    city: {label: 'Localidad', max: 40},
    details: {label: 'Tareas, horarios y requisitos', max: 600},
  };
  const errors = {};
  const data = {};
  for (const [key, spec] of Object.entries(fields)) {
    data[key] = clean(values[key]);
    if (!data[key]) errors[key] = `Completá: ${spec.label.toLowerCase()}.`;
    else if (data[key].length > spec.max) errors[key] = `Usá hasta ${spec.max} caracteres.`;
  }
  if (!['La Plata', 'Berisso', 'Ensenada', 'Gonnet', 'City Bell', 'Otra localidad'].includes(data.city)) errors.city = 'Elegí una localidad de la lista.';
  if (values.consent !== true) errors.consent = 'Necesitamos tu autorización para responder la consulta.';
  if (Object.keys(errors).length) return {ok: false, errors};
  const message = [
    'Hola, HumAgencIA. Quiero solicitar personal.',
    '',
    `Empresa o comercio: ${data.business}`,
    `Contacto: ${data.name}`,
    `Puesto: ${data.role}`,
    `Localidad: ${data.city}`,
    '',
    'Tareas, horarios y requisitos:',
    data.details,
    '',
    `Autorizo a HumAgencIA a usar estos datos para responder y gestionar esta consulta. Leí el aviso de privacidad (${site.privacyVersion}).`,
  ].join('\n');
  return {ok: true, message, whatsapp: whatsappUrl(message), email: emailUrl(`Búsqueda de personal — ${data.role}`, message)};
}
