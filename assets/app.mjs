import { site, jobs } from '../data/site.mjs';
import { whatsappUrl, jobStatus, formatDate, prepareInquiry } from './core.mjs';

const $ = (selector) => document.querySelector(selector);
document.documentElement.classList.add('js');

const menu = $('.menu-toggle');
const nav = $('#navegacion');
if (menu && nav) {
  menu.hidden = false;
  const toggleMenu = (open) => {nav.classList.toggle('is-open', open);menu.setAttribute('aria-expanded', String(open));};
  menu.addEventListener('click', () => toggleMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => {if (event.target.closest('a')) toggleMenu(false);});
  document.addEventListener('keydown', (event) => {if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {toggleMenu(false);menu.focus();}});
  document.addEventListener('click', (event) => {if (!event.target.closest('.site-header')) toggleMenu(false);});
}

document.querySelectorAll('[data-wa]').forEach((anchor) => {anchor.href = whatsappUrl(anchor.dataset.wa);});
document.querySelectorAll('[data-registration]').forEach((anchor) => {anchor.href = site.registrationUrl;});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function externalAnchor(label, url, className) {
  const a = element('a', className, label);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('El enlace externo debe usar HTTPS.');
  a.href = parsed.href;
  a.target = '_blank';a.rel = 'noopener noreferrer';
  a.append(element('span', 'sr-only', ' (se abre en otra pestaña)'));
  return a;
}

// Límite de consultas por WhatsApp: hasta 3 búsquedas distintas por día y por visitante.
const MAX_CONSULTAS = 3;
const CONSULTAS_KEY = 'hag-consultas';
const hoyAR = () => new Date().toLocaleDateString('sv', {timeZone: 'America/Argentina/Buenos_Aires'});
function leerConsultas() {
  try {
    const data = JSON.parse(localStorage.getItem(CONSULTAS_KEY) || '{}');
    return data.fecha === hoyAR() && Array.isArray(data.ids) ? data.ids : [];
  } catch (error) {return [];}
}
function guardarConsultas(ids) {
  try {localStorage.setItem(CONSULTAS_KEY, JSON.stringify({fecha: hoyAR(), ids}));} catch (error) {/* sin almacenamiento */}
}
function actualizarLimite() {
  const ids = leerConsultas();
  const lleno = ids.length >= MAX_CONSULTAS;
  document.querySelectorAll('[data-job-consulta]').forEach((a) => {
    const bloqueado = lleno && !ids.includes(a.dataset.jobConsulta);
    a.classList.toggle('is-disabled', bloqueado);
    a.setAttribute('aria-disabled', String(bloqueado));
    if (bloqueado) a.removeAttribute('href'); else a.href = a.dataset.href;
    const label = a.querySelector('.consulta-label');
    if (label) label.textContent = bloqueado ? 'Límite de 3 consultas por día' : a.dataset.label;
  });
  const aviso = document.getElementById('consultas-aviso');
  if (aviso) aviso.textContent = lleno
    ? 'Ya consultaste 3 búsquedas hoy. Te respondemos por esas y mañana podés consultar otras. Si querés que te postulemos a más, registrate y subí tu CV.'
    : `Podés consultar hasta ${MAX_CONSULTAS} búsquedas por día por WhatsApp (te quedan ${MAX_CONSULTAS - ids.length}).`;
}
document.addEventListener('click', (event) => {
  const a = event.target.closest('[data-job-consulta]');
  if (!a) return;
  const ids = leerConsultas();
  const id = a.dataset.jobConsulta;
  if (!ids.includes(id)) {
    if (ids.length >= MAX_CONSULTAS) {event.preventDefault();actualizarLimite();return;}
    ids.push(id);guardarConsultas(ids);
  }
  setTimeout(actualizarLimite, 0);
});

function renderJobs() {
  const list = $('#jobs-list');
  if (!list) return;
  const fragment = document.createDocumentFragment();
  const visible = jobs.filter((job) => jobStatus(job) !== 'closed');
  if (!visible.length) {
    const empty = element('div', 'registration-card');
    empty.append(element('h3', '', 'Estamos actualizando los avisos.'));
    empty.append(element('p', '', 'Podés registrarte o consultarnos por las búsquedas disponibles.'));
    empty.append(externalAnchor('Consultar por WhatsApp ↗', whatsappUrl('Hola, HumAgencIA. Quisiera consultar las búsquedas laborales disponibles.'), 'button primary'));
    fragment.append(empty);
  }
  visible.forEach((job) => {
    const status = jobStatus(job);
    const article = element('article', 'job-card');
    article.setAttribute('aria-labelledby', `title-${job.id}`);
    const top = element('div', 'job-top');
    top.append(element('span', 'job-category', job.category), element('span', 'job-code', job.id));
    const title = element('h3', '', job.title);title.id = `title-${job.id}`;
    const facts = element('div', 'job-facts');
    facts.append(element('strong', '', job.city), element('span', '', job.schedule));
    const statusBox = element('p', `job-status ${status}`, status === 'published' ? `Fuente consultada el ${formatDate(job.checkedAt)}. Consultá disponibilidad.` : 'Vigencia pendiente de confirmar.');
    const source = element('p', 'job-source');
    if (job.sourceUrl) source.append(externalAnchor(job.sourceLabel, job.sourceUrl, ''));
    else source.textContent = job.sourceLabel;
    const actions = element('div', 'job-actions');
    const message = `Hola, HumAgencIA. Quisiera consultar ${status === 'published' ? 'por' : 'la vigencia de'} la búsqueda ${job.id}: ${job.title}, en ${job.city}.`;
    const etiqueta = status === 'published' ? 'Consultar esta búsqueda ↗' : 'Consultar vigencia ↗';
    const consulta = externalAnchor('', whatsappUrl(message), 'button secondary');
    consulta.prepend(element('span', 'consulta-label', etiqueta));
    consulta.dataset.jobConsulta = job.id;consulta.dataset.href = consulta.href;consulta.dataset.label = etiqueta;
    actions.append(consulta);
    article.append(top, title, element('p', 'job-company', job.company), facts, element('p', 'job-summary', job.summary), statusBox, source, actions);
    fragment.append(article);
  });
  list.replaceChildren(fragment);
  if (visible.length) {
    let aviso = document.getElementById('consultas-aviso');
    if (!aviso) {aviso = element('p', 'consultas-aviso');aviso.id = 'consultas-aviso';aviso.setAttribute('aria-live', 'polite');list.before(aviso);}
    actualizarLimite();
  }
}
try {renderJobs();} catch (error) {
  const list = $('#jobs-list');
  if (list) {
    list.replaceChildren(element('p', '', 'No pudimos mostrar los avisos en este momento.'));
    list.append(externalAnchor('Consultar por WhatsApp', whatsappUrl('Hola, quisiera consultar las ofertas de HumAgencIA.'), 'text-link'));
  }
}

const form = $('#employer-form');
if (form) {
  const fields = $('#inquiry-fields');
  const resultPanel = $('#inquiry-result');
  const status = $('#inquiry-status');
  let prepared = null;
  const keys = ['business', 'name', 'role', 'city', 'details', 'consent'];
  const clearErrors = () => keys.forEach((key) => {
    const field = document.getElementById(key);
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-errormessage');
    field.setAttribute('aria-describedby', key === 'details' ? 'details-hint' : `${key}-error`);
    document.getElementById(`${key}-error`).textContent = '';
  });
  const invalidatePrepared = () => {
    if (!prepared) return;
    prepared = null;resultPanel.hidden = true;
    $('#prepared-message').value = '';
    $('#send-whatsapp').removeAttribute('href');$('#send-email').removeAttribute('href');
    status.textContent = 'Cambiaste los datos. Prepará la solicitud otra vez antes de enviarla.';
  };
  form.addEventListener('input', invalidatePrepared);
  form.addEventListener('change', invalidatePrepared);
  form.addEventListener('submit', (event) => {
    event.preventDefault();clearErrors();
    const values = Object.fromEntries(new FormData(form).entries());
    values.consent = $('#consent').checked;
    const result = prepareInquiry(values);
    if (!result.ok) {
      resultPanel.hidden = true;prepared = null;
      for (const [key, message] of Object.entries(result.errors)) {
        const field = document.getElementById(key);
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-errormessage', `${key}-error`);
        field.setAttribute('aria-describedby', `${key === 'details' ? 'details-hint ' : ''}${key}-error`);
        document.getElementById(`${key}-error`).textContent = message;
      }
      status.textContent = 'Revisá los campos señalados para preparar tu solicitud.';
      document.getElementById(Object.keys(result.errors)[0]).focus();
      return;
    }
    prepared = result;
    $('#prepared-message').value = result.message;
    $('#send-whatsapp').href = result.whatsapp;
    $('#send-email').href = result.email;
    resultPanel.hidden = false;
    status.textContent = 'Solicitud preparada. Falta enviarla por el canal que elijas.';
    resultPanel.focus({preventScroll: true});
    resultPanel.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'center'});
  });
  $('#copy-message').addEventListener('click', async () => {
    if (!prepared) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(prepared.message);
      status.textContent = 'Solicitud copiada. Pegala y enviala a HumAgencIA por el canal que prefieras.';
    } catch {
      $('#prepared-message').focus();$('#prepared-message').select();
      status.textContent = 'Seleccionamos el mensaje. Usá la opción Copiar de tu dispositivo.';
    }
  });
  $('#send-whatsapp').addEventListener('click', () => {status.textContent = 'Completá el envío desde WhatsApp. HumAgencIA recibe la solicitud cuando enviás el mensaje.';});
  $('#send-email').addEventListener('click', () => {status.textContent = 'Se abre tu aplicación de correo. Revisá y enviá el mensaje; si no abre, usá WhatsApp o copiá la solicitud.';});
  clearErrors();fields.disabled = false;
}
