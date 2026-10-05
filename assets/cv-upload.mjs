import { site } from '../data/site.mjs';

const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};

const form = document.getElementById('cv-form');
if (form) iniciar(form);

function iniciar(form) {
  const $ = (id) => document.getElementById(id);
  const status = $('cv-status');
  const submit = $('cv-submit');
  const campos = ['nombre', 'telefono', 'email', 'localidad', 'puesto', 'archivo', 'acepta'];

  const marcar = (campo, mensaje) => {
    const input = $(`cv-${campo}`);
    const error = $(`cv-${campo}-error`);
    error.textContent = mensaje || '';
    if (mensaje) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    return !mensaje;
  };

  const tipoArchivo = (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return TIPOS[ext] || (Object.values(TIPOS).includes(file.type) ? file.type : '');
  };

  const validar = () => {
    const v = (id) => $(`cv-${id}`).value.trim();
    const file = $('cv-archivo').files[0];
    const errores = {
      nombre: v('nombre').length < 3 ? 'Escribí tu nombre y apellido.' : '',
      telefono: v('telefono').replace(/\D/g, '').length < 8 ? 'Revisá tu teléfono: incluí la característica.' : '',
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')) ? '' : 'Revisá tu correo electrónico.',
      localidad: v('localidad') ? '' : 'Elegí una localidad.',
      puesto: v('puesto').length < 2 ? 'Contanos qué trabajo buscás.' : '',
      archivo: !file ? 'Adjuntá tu CV.' : !tipoArchivo(file) ? 'El CV tiene que ser PDF, Word o una foto (JPG o PNG).' : file.size > MAX_BYTES ? 'El archivo pesa más de 5 MB.' : '',
      acepta: $('cv-acepta').checked ? '' : 'Necesitamos tu autorización para guardar tus datos.',
    };
    let primero = null;
    for (const campo of campos) {
      if (!marcar(campo, errores[campo]) && !primero) primero = campo;
    }
    if (primero) $(`cv-${primero}`).focus();
    return !primero;
  };

  campos.forEach((campo) => $(`cv-${campo}`).addEventListener('change', () => marcar(campo, '')));

  const leerBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('No pudimos leer el archivo.'));
    reader.readAsDataURL(file);
  });

  const mostrarResultado = (datos) => {
    $('cv-result-email').textContent = datos.email;
    const dl = $('cv-summary');
    const filas = [['Nombre', datos.nombre], ['Teléfono', datos.telefono], ['Localidad', datos.localidad], ['Busca', datos.puesto],
      ['Empresas', datos.compartir ? 'Autorizaste compartir tu CV' : 'No compartimos tu CV por ahora']];
    dl.replaceChildren(...filas.flatMap(([k, val]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = val;
      return [dt, dd];
    }));
    form.hidden = true;
    const result = $('cv-result');
    result.hidden = false;
    result.focus();
  };

  let envioId = null;
  let ultimoPayload = null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    if (!validar()) return;
    if (!site.cvEndpoint) {
      status.textContent = 'El envío de CV se está activando. Mientras tanto, escribinos por WhatsApp.';
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Enviando…';
    status.textContent = 'Subiendo tu CV. No cierres esta página.';
    try {
      const file = $('cv-archivo').files[0];
      envioId = envioId || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join(''));
      const datos = {
        nombre: $('cv-nombre').value.trim(),
        telefono: $('cv-telefono').value.trim(),
        email: $('cv-email').value.trim(),
        localidad: $('cv-localidad').value,
        puesto: $('cv-puesto').value.trim(),
        acepta: $('cv-acepta').checked,
        compartir: $('cv-compartir').checked,
        website: $('cv-website').value,
        envioId,
      };
      const payload = { ...datos, archivo: { nombre: file.name, tipo: tipoArchivo(file), base64: await leerBase64(file) } };
      const contenido = JSON.stringify({ ...payload, envioId: null });
      if (ultimoPayload !== null && ultimoPayload !== contenido) {
        envioId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
        payload.envioId = envioId;
      }
      ultimoPayload = contenido;
      const res = await fetch(site.cvEndpoint, { method: 'POST', body: JSON.stringify(payload) });
      const respuesta = await res.json();
      if (!res.ok || !respuesta.ok || respuesta.recibido !== true || respuesta.envioId !== envioId) throw new Error(respuesta.error || 'No pudimos procesar tu envío.');
      status.textContent = '';
      mostrarResultado(datos);
    } catch (error) {
      status.textContent = `${error.message || 'Hubo un problema de conexión.'} Si sigue fallando, escribinos por WhatsApp.`;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Enviar mi CV';
    }
  });
}
