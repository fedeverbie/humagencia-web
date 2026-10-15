import { talentEndpoint } from '../data/talentos.mjs';
import {
  LIMITES, TOTAL_MAX, LADO_MINIMO, DISCIPLINAS, mb, errorArchivo, totalBytes, validarDatos, armarPlan, nuevoId, enviar,
} from './talentos-core.mjs';

const $ = (id) => document.getElementById(id);
const form = $('tal-form');
if (form) iniciar();

function iniciar() {
  const endpoint = talentEndpoint;
  const status = $('tal-status');
  const submit = $('tal-submit');
  const archivos = { foto: [], book: [], video: [] };

  if (!endpoint) {
    $('tal-off').hidden = false;
    submit.disabled = true;
  }

  // Disciplinas como casillas
  const grupo = $('tal-disciplinas');
  DISCIPLINAS.forEach((nombre, i) => {
    const id = `tal-d-${i}`;
    const wrap = document.createElement('div');
    wrap.className = 'tal-chip';
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', id, value: nombre });
    const label = Object.assign(document.createElement('label'), { htmlFor: id, textContent: nombre });
    input.addEventListener('change', () => {
      $('tal-otra-wrap').hidden = !grupo.querySelector('input[value="Otra"]').checked;
      marcar('disciplinas', '');
    });
    wrap.append(input, label);
    grupo.append(wrap);
  });

  function marcar(campo, mensaje) {
    const error = $(`tal-${campo}-error`);
    if (error) error.textContent = mensaje || '';
    const input = $(`tal-${campo}`);
    if (input && 'value' in input) {
      if (mensaje) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
  }

  // ───── Selección de archivos ─────
  const leerComoDataUrl = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No pudimos leer el archivo.'));
    r.readAsDataURL(file);
  });
  const medir = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });

  async function agregar(campo, lista) {
    const errorEl = campo === 'foto' ? 'fotos' : campo;
    const errores = [];
    for (const file of lista) {
      const msg = errorArchivo(campo, file, archivos[campo]);
      if (msg) { errores.push(msg); continue; }
      if (totalBytes(archivos) + file.size > TOTAL_MAX) { errores.push(`"${file.name}" no entra: el total no puede superar ${mb(TOTAL_MAX)}.`); continue; }
      if (campo === 'foto') {
        let src;
        try { src = await leerComoDataUrl(file); } catch (_) { errores.push(`No pudimos leer "${file.name}".`); continue; }
        const dim = await medir(src);
        if (!dim) { errores.push(`"${file.name}" no se puede abrir como imagen. Probá exportarla de nuevo en JPG.`); continue; }
        if (Math.min(dim.w, dim.h) < LADO_MINIMO) { errores.push(`"${file.name}" tiene poca resolución (${dim.w}×${dim.h}). Usá fotos de al menos ${LADO_MINIMO} píxeles de lado.`); continue; }
        file.vista = src;
      }
      archivos[campo].push(file);
    }
    marcar(errorEl, errores.join(' '));
    dibujar(campo);
  }

  function dibujar(campo) {
    const ul = $(`tal-${campo}-list`);
    ul.replaceChildren(...archivos[campo].map((file, i) => {
      const li = document.createElement('li');
      if (campo === 'foto') {
        const img = Object.assign(document.createElement('img'), { src: file.vista, alt: `Foto ${i + 1}: ${file.name}`, width: 120, height: 150 });
        li.append(img);
      } else {
        const nombre = Object.assign(document.createElement('span'), { className: 'tal-file-name', textContent: file.name });
        li.append(nombre);
      }
      const meta = Object.assign(document.createElement('span'), { className: 'tal-file-size', textContent: mb(file.size) });
      const quitar = Object.assign(document.createElement('button'), { type: 'button', className: 'tal-remove', textContent: 'Quitar' });
      quitar.setAttribute('aria-label', `Quitar ${file.name}`);
      quitar.addEventListener('click', () => {
        archivos[campo].splice(i, 1);
        dibujar(campo);
        const siguiente = ul.querySelector('.tal-remove') || $(`tal-${campo}-input`);
        siguiente.focus();
      });
      li.append(meta, quitar);
      return li;
    }));
    $(`tal-${campo}-count`).textContent = `${archivos[campo].length} de ${LIMITES[campo].cantidad}`;
    $('tal-total').textContent = `Total a subir: ${mb(totalBytes(archivos))} de ${mb(TOTAL_MAX)}.`;
  }

  ['foto', 'book', 'video'].forEach((campo) => {
    const input = $(`tal-${campo}-input`);
    input.addEventListener('change', async () => {
      const lista = Array.from(input.files);
      input.value = '';
      await agregar(campo, lista);
    });
  });

  // ───── Envío ─────
  const leer = () => ({
    nombre: $('tal-nombre').value.trim(), artistico: $('tal-artistico').value.trim(),
    email: $('tal-email').value.trim().toLowerCase(), telefono: $('tal-telefono').value.trim(),
    localidad: $('tal-localidad').value, nacimiento: $('tal-nacimiento').value,
    disciplinas: Array.from(grupo.querySelectorAll('input:checked'), (i) => i.value),
    otraDisciplina: $('tal-otraDisciplina').value.trim(),
    experiencia: $('tal-experiencia').value.trim(), formacion: $('tal-formacion').value.trim(),
    habilidades: $('tal-habilidades').value.trim(),
    altura: $('tal-altura').value.trim(), talle: $('tal-talle').value.trim(), calzado: $('tal-calzado').value.trim().replace(',', '.'),
    instagram: $('tal-instagram').value.trim(),
    links: $('tal-links').value.split(/\s+/).map((l) => l.trim()).filter(Boolean),
    mayor: $('tal-mayor').checked, derechos: $('tal-derechos').checked, guardar: $('tal-guardar').checked,
    clientes: $('tal-clientes').checked, promocion: $('tal-promocion').checked,
  });
  const CAMPOS = ['nombre', 'email', 'telefono', 'localidad', 'nacimiento', 'disciplinas', 'otraDisciplina', 'experiencia',
    'altura', 'calzado', 'fotos', 'links', 'instagram', 'mayor', 'derechos', 'guardar'];
  const foco = { disciplinas: 'tal-d-0', fotos: 'tal-foto-input' };
  CAMPOS.forEach((c) => { const el = $(`tal-${c}`); if (el && 'value' in el) el.addEventListener('change', () => marcar(c, '')); });

  const leerBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`No pudimos leer "${file.name}".`));
    r.readAsDataURL(file);
  });

  const progreso = (valor, texto) => {
    $('tal-progress').hidden = false;
    $('tal-progress-bar').value = valor;
    status.textContent = texto;
  };

  let envioId = null;
  let huellaPrevia = null;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!endpoint) return;
    status.textContent = '';
    const datos = leer();
    const errores = validarDatos(datos, archivos);
    let primero = null;
    CAMPOS.forEach((c) => { marcar(c, errores[c]); if (errores[c] && !primero) primero = c; });
    if (primero) {
      ($(foco[primero] || `tal-${primero}`)).focus();
      status.textContent = 'Revisá los campos marcados.';
      return;
    }
    const plan = armarPlan(archivos);
    // Si cambian los datos o los archivos tras un intento fallido, el envío es otro.
    const huella = JSON.stringify([datos, plan.map(({ campo, nombre, bytes }) => [campo, nombre, bytes])]);
    if (huella !== huellaPrevia) { envioId = nuevoId(); huellaPrevia = huella; }

    submit.disabled = true;
    submit.textContent = 'Enviando…';
    form.querySelectorAll('fieldset').forEach((f) => { f.disabled = true; });
    try {
      progreso(3, 'Registrando tu perfil…');
      const ini = await enviar(endpoint, {
        accion: 'iniciar', envioId, website: $('tal-website').value, datos,
        archivos: plan.map(({ campo, nombre, tipo, bytes }) => ({ campo, nombre, tipo, bytes })),
      });
      const listos = new Set(ini.recibidos || []);
      const totalPlan = plan.reduce((s, p) => s + p.bytes, 0) || 1;
      let subido = plan.filter((_, i) => listos.has(i)).reduce((s, p) => s + p.bytes, 0);
      for (let i = 0; i < plan.length; i++) {
        if (listos.has(i)) continue;
        const p = plan[i];
        progreso(5 + Math.round((subido / totalPlan) * 85), `Subiendo ${p.campo === 'foto' ? 'foto' : p.campo === 'book' ? 'book' : 'video'} ${i + 1} de ${plan.length} (${mb(p.bytes)})… No cierres esta página.`);
        const base64 = await leerBase64(p.file);
        await enviar(endpoint, { accion: 'archivo', envioId, token: ini.token, indice: i, base64 }, { intentos: 3, espera: 2500 });
        subido += p.bytes;
      }
      progreso(93, 'Armando tu legajo…');
      const fin = await enviar(endpoint, { accion: 'finalizar', envioId, token: ini.token });
      progreso(100, '');
      mostrarResultado(fin, datos);
    } catch (error) {
      status.textContent = `${error.message} Podés volver a tocar "Enviar": lo que ya subiste no se duplica. Si sigue fallando, escribinos por WhatsApp.`;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Enviar mi perfil artístico';
      form.querySelectorAll('fieldset').forEach((f) => { f.disabled = false; });
    }
  });

  function mostrarResultado(fin, datos) {
    const r = fin.resumen || {};
    if (fin.actualizado) {
      $('tal-result-title').textContent = '¡Listo! Actualizamos tu perfil artístico';
      $('tal-result-text').textContent = 'Ya tenías un perfil con este correo o teléfono: sumamos el material nuevo a tu legajo, sin duplicarlo. Te enviamos un correo con el resumen.';
    }
    const filas = [
      ['Nombre', datos.nombre + (datos.artistico ? ` (${datos.artistico})` : '')],
      ['Disciplinas', datos.disciplinas.join(', ')],
      ['Material', `${r.fotos ?? archivos.foto.length} foto(s), ${r.books ?? archivos.book.length} book(s), ${r.videos ?? archivos.video.length} video(s)${datos.links.length ? `, ${datos.links.length} enlace(s)` : ''}`],
      ['Presentarte a clientes', datos.clientes ? 'Sí, con aviso previo' : 'No por ahora'],
      ['Tus fotos en nuestra difusión', datos.promocion ? 'Sí' : 'No'],
      ['Correo', datos.email],
    ];
    $('tal-summary').replaceChildren(...filas.flatMap(([k, v]) => [
      Object.assign(document.createElement('dt'), { textContent: k }),
      Object.assign(document.createElement('dd'), { textContent: v }),
    ]));
    form.hidden = true;
    const result = $('tal-result');
    result.hidden = false;
    result.focus();
  }
}
