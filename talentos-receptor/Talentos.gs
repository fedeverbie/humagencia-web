/**
 * HumagencIA — Receptor de Perfil artístico (talentos). Versión 2026-10-14.
 *
 * Proyecto de Apps Script INDEPENDIENTE del receptor de CV ("HumAgencIA CV").
 * No lee ni escribe el registro laboral, la carpeta Legajos ni sus planillas.
 * Todo se guarda en Drive › 08 — Talentos.
 *
 * Preparación (una sola vez, desde consultorahumania@gmail.com):
 *   1. Ejecutar prepararTalentos(): verifica las carpetas, crea la planilla
 *      "Registro de talentos" y el "Registro técnico — receptor de talentos".
 *   2. Implementar › Aplicación web › Ejecutar como: Yo · Acceso: Cualquier usuario.
 *   3. Copiar la URL /exec en data/site.mjs (talentEndpoint).
 *
 * Protocolo (POST, cuerpo JSON en texto plano para evitar preflight CORS):
 *   1. {accion:'iniciar', envioId, datos, archivos:[{campo,nombre,tipo,bytes}]}
 *      → valida, evita duplicados, crea o reutiliza el legajo y responde un token.
 *   2. {accion:'archivo', envioId, token, indice, base64} — un archivo por pedido.
 *   3. {accion:'finalizar', envioId, token} → legajo Doc, correos y resumen.
 * Cada paso es idempotente: reintentar con el mismo envioId no duplica nada.
 * Nunca se registran datos personales en los logs ni en el registro técnico.
 */
const TAL = Object.freeze({
  VERSION: '2026-10-14',
  CONSENT_VERSION: 'talentos-2026-10-14',
  AGENCY_EMAIL: 'consultorahumania@gmail.com',
  AGENCY_NAME: 'HumagencIA',
  WHATSAPP: '221 606-3997',
  WEB: 'https://humagencia.com.ar',
  MEMBRETE_URL: 'https://humagencia.com.ar/assets/membrete-mail.png',
  TZ: 'America/Argentina/Buenos_Aires',
  CARPETAS: {
    raiz: '1AuktCskmCgDOeVLa78tw45IAZOMdhP5U',      // 08 — Talentos
    registro: '1yr59zkATfkBK7d5ZDmdxlPaM3yV-BDHr',  // Registro de talentos
    legajos: '1XhGeNhAmrS3HZX8otYG39JM5mxmvCIiY',   // Legajos individuales
    fotos: '1v_nbIdPuPE2xer_k-OYYV7-LQdzpg7eb',     // Fotografías originales
    books: '18LrCoTcZ04I7UHpV5nIGC_h4QI4AutWL',     // Books y portfolios
    audiovisual: '1sJpTI0Wa6TPnmnV23LT6W5sWW9dNlVpm', // Material audiovisual
    informes: '186Ghs5qX3k_UyXQmm7df9ATwUweJSKwm',  // Informes internos
    tecnicos: '19aYrE_C-SsvsMEiSc3dreOLy7zW3E3X-',  // Registros técnicos
  },
  LOCALIDADES: ['La Plata', 'Berisso', 'Ensenada', 'Gran La Plata (otra)', 'Otra'],
  DISCIPLINAS: ['Modelo', 'Actuación', 'Promotor/a', 'Danza', 'Música', 'Canto',
    'Conducción / locución', 'Extra / figuración', 'Creación de contenido', 'Otra'],
  // Límites por archivo y por envío (bytes). Deben coincidir con assets/talentos.mjs.
  LIMITES: {
    foto: { max: 8 * 1024 * 1024, min: 1, cantidad: 8, carpeta: 'fotos', tipos: ['image/jpeg', 'image/png', 'image/webp'] },
    book: { max: 15 * 1024 * 1024, min: 0, cantidad: 2, carpeta: 'books', tipos: ['application/pdf'] },
    video: { max: 25 * 1024 * 1024, min: 0, cantidad: 2, carpeta: 'audiovisual', tipos: ['video/mp4', 'video/quicktime', 'video/webm'] },
  },
  TOTAL_MAX: 80 * 1024 * 1024,
  EXT: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' },
  POR_CORREO_HORA: 3,
  GLOBAL_HORA: 60,
});

const TAL_HOJAS = {
  Talentos: ['ID talento', 'Alta', 'Última actualización', 'Nombre', 'Nombre artístico', 'Correo',
    'Teléfono', 'Claves teléfono', 'Localidad', 'Fecha de nacimiento', 'Disciplinas',
    'Carpeta legajo', 'Doc legajo', 'Carpeta fotos', 'Carpeta books', 'Carpeta audiovisual',
    'Autoriza guardar', 'Autoriza presentar a clientes', 'Autoriza uso promocional de imagen',
    'Versión consentimiento', 'Fecha consentimiento', 'Envíos', 'Estado', 'Observación', 'Correos conocidos'],
  'Envíos': ['ID envío', 'Huella', 'Fecha', 'ID talento', 'Token', 'Estado', 'Archivos esperados',
    'Archivos recibidos', 'Datos', 'Coincidencia', 'Correo agencia', 'Correo talento', 'Observación'],
  Archivos: ['ID envío', 'Índice', 'ID talento', 'Tipo', 'Nombre original', 'MIME', 'Bytes',
    'ID archivo', 'URL', 'Fecha'],
};
const TAL_TEC = ['Fecha', 'Acción', 'ID envío', 'ID talento', 'Resultado', 'Detalle técnico'];

/* ───────────────────────── Entrada web ───────────────────────── */

function doGet() {
  return talJson_({ ok: true, servicio: 'HumagencIA Talentos', version: TAL.VERSION, estado: 'activo' });
}

function doPost(e) {
  let accion = '', envioId = '';
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw) talFallo_('Envío vacío.');
    if (raw.length > Math.ceil(TAL.LIMITES.video.max / 3) * 4 + 20000) talFallo_('El archivo supera el tamaño permitido.');
    let x;
    try { x = JSON.parse(raw); } catch (_) { talFallo_('El envío no tiene un formato válido.'); }
    if (!x || typeof x !== 'object' || Array.isArray(x)) talFallo_('Envío inválido.');
    accion = String(x.accion || '');
    envioId = talTexto_(x.envioId, 64);
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(envioId)) talFallo_('Falta el identificador del envío. Recargá la página.');
    if (accion === 'iniciar') return talJson_(talIniciar_(x, envioId));
    if (accion === 'archivo') return talJson_(talArchivo_(x, envioId));
    if (accion === 'finalizar') return talJson_(talFinalizar_(x, envioId));
    talFallo_('Acción desconocida.');
  } catch (err) {
    const publico = err && err.publico;
    talTecnico_(accion || '?', envioId, '', 'ERROR', publico ? err.message : String(err && err.message || err).slice(0, 300));
    return talJson_({ ok: false, error: publico ? err.message :
      'No pudimos completar el paso. Reintentá en unos segundos; no se va a duplicar tu envío.' });
  }
}

/* ───────────────────────── Paso 1: iniciar ───────────────────────── */

function talIniciar_(x, envioId) {
  if (x.website) talFallo_('No pudimos validar el envío.');
  const d = talValidarDatos_(x.datos || {});
  const plan = talValidarPlan_(x.archivos);
  const huella = talHuella_(JSON.stringify([d, plan]));
  return talLock_(() => {
    const libro = talLibro_();
    const envios = talHoja_(libro, 'Envíos');
    const filas = talFilas_(envios);
    const previo = filas.findIndex(r => r[0] === envioId);
    if (previo >= 0) {
      const r = filas[previo];
      if (r[1] !== huella) talFallo_('Este envío ya fue usado con otros datos. Recargá la página.');
      return { ok: true, envioId, talentoId: r[3], token: r[4], estado: r[5], recibidos: talRecibidos_(libro, envioId) };
    }
    const hora = Date.now() - 3600000;
    const recientes = filas.filter(r => new Date(r[2]).getTime() > hora);
    if (recientes.length >= TAL.GLOBAL_HORA) talFallo_('Estamos recibiendo muchos perfiles. Probá de nuevo en un rato.');
    if (recientes.filter(r => talDato_(r[8]).email === d.email).length >= TAL.POR_CORREO_HORA)
      talFallo_('Recibimos varios envíos con este correo. Probá en una hora o escribinos por WhatsApp.');

    const talentos = talHoja_(libro, 'Talentos');
    const match = talBuscarTalento_(talentos, d);
    const ahora = new Date().toISOString();
    let talentoId, coincidencia;
    if (match.fila) {
      talentoId = match.valores[0];
      coincidencia = match.motivo;
      const v = match.valores.slice();
      v[2] = ahora; v[4] = talCelda_(d.artistico || talTextoCelda_(v[4])); v[5] = talCelda_(d.email);
      v[6] = talCelda_(d.telefono); v[7] = talSumar_(v[7], d.claveTel); v[24] = talSumar_(v[24], d.email); v[8] = d.localidad; v[10] = d.disciplinas.join(', ');
      v[16] = 'SÍ'; v[17] = d.clientes ? 'SÍ' : 'NO'; v[18] = d.promocion ? 'SÍ' : 'NO';
      v[19] = TAL.CONSENT_VERSION; v[20] = ahora; v[21] = Number(v[21] || 0) + 1;
      if (match.conflicto) v[23] = talCelda_('Revisar: el correo y el teléfono coinciden con legajos distintos (' + match.conflicto + ').');
      talentos.getRange(match.fila, 1, 1, v.length).setValues([v]);
    } else {
      talentoId = talNuevoId_(talentos);
      coincidencia = 'NUEVO';
      const carpetas = talCrearCarpetas_(talentos, d.nombre);
      talentos.appendRow([talentoId, ahora, ahora, talCelda_(d.nombre), talCelda_(d.artistico), talCelda_(d.email),
        talCelda_(d.telefono), d.claveTel, d.localidad, d.nacimiento, d.disciplinas.join(', '),
        carpetas.legajo, '', carpetas.fotos, carpetas.books, carpetas.audiovisual,
        'SÍ', d.clientes ? 'SÍ' : 'NO', d.promocion ? 'SÍ' : 'NO', TAL.CONSENT_VERSION, ahora, 1, 'NUEVO', '', d.email]);
    }
    const token = Utilities.getUuid().replace(/-/g, '');
    envios.appendRow([envioId, huella, ahora, talentoId, token, plan.length ? 'RECIBIENDO' : 'DATOS COMPLETOS',
      JSON.stringify(plan), 0, JSON.stringify(d), coincidencia, 'PENDIENTE', 'PENDIENTE', '']);
    SpreadsheetApp.flush();
    talTecnico_('iniciar', envioId, talentoId, 'OK', coincidencia + ' · archivos=' + plan.length);
    return { ok: true, envioId, talentoId, token, estado: 'RECIBIENDO', recibidos: [] };
  });
}

function talValidarDatos_(x) {
  const t = (v, max) => talTexto_(v, max);
  const d = {
    nombre: t(x.nombre, 80), artistico: t(x.artistico, 80),
    email: t(x.email, 120).toLowerCase(), telefono: t(x.telefono, 25).replace(/[^\d+ ()-]/g, ''),
    localidad: t(x.localidad, 40), nacimiento: t(x.nacimiento, 10),
    disciplinas: Array.isArray(x.disciplinas) ? x.disciplinas.map(v => t(v, 40)).filter(Boolean) : [],
    otraDisciplina: t(x.otraDisciplina, 60),
    experiencia: t(x.experiencia, 1500), formacion: t(x.formacion, 800), habilidades: t(x.habilidades, 400),
    altura: t(x.altura, 4), talle: t(x.talle, 10), calzado: t(x.calzado, 5),
    instagram: t(x.instagram, 60), links: Array.isArray(x.links) ? x.links.map(v => t(v, 300)).filter(Boolean) : [],
    mayor: x.mayor === true, derechos: x.derechos === true, guardar: x.guardar === true,
    clientes: x.clientes === true, promocion: x.promocion === true,
  };
  if (d.nombre.length < 3 || !/\s/.test(d.nombre)) talFallo_('Escribí tu nombre y apellido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) talFallo_('Revisá tu correo electrónico.');
  d.claveTel = talClaveTel_(d.telefono);
  if (d.claveTel.length < 8) talFallo_('Revisá tu teléfono: incluí la característica.');
  if (TAL.LOCALIDADES.indexOf(d.localidad) === -1) talFallo_('Elegí una localidad.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.nacimiento)) talFallo_('Indicá tu fecha de nacimiento.');
  const edad = talEdad_(d.nacimiento);
  if (!(edad >= 18 && edad <= 100)) talFallo_('Este formulario es para mayores de 18 años. Para menores, escribinos por WhatsApp con un adulto responsable.');
  if (!d.disciplinas.length || d.disciplinas.length > 6 || d.disciplinas.some(v => TAL.DISCIPLINAS.indexOf(v) === -1))
    talFallo_('Elegí entre una y seis disciplinas de la lista.');
  if (d.disciplinas.indexOf('Otra') >= 0 && d.otraDisciplina.length < 2) talFallo_('Contanos cuál es tu otra disciplina.');
  if (d.experiencia.length < 20) talFallo_('Contanos tu experiencia en al menos un par de líneas.');
  if (d.altura && !(/^\d{2,3}$/.test(d.altura) && +d.altura >= 100 && +d.altura <= 230)) talFallo_('La altura va en centímetros (por ejemplo, 172).');
  if (d.calzado && !/^\d{2}(\.5)?$/.test(d.calzado)) talFallo_('Revisá el número de calzado.');
  if (d.instagram && !/^@?[A-Za-z0-9._]{1,30}$/.test(d.instagram)) talFallo_('Revisá tu usuario de Instagram.');
  d.instagram = d.instagram.replace(/^@/, '');
  if (d.links.length > 3) talFallo_('Podés indicar hasta 3 enlaces.');
  d.links.forEach(l => { if (!/^https:\/\/[^\s<>"']+$/i.test(l)) talFallo_('Los enlaces tienen que empezar con https://'); });
  if (!d.mayor) talFallo_('Necesitamos que confirmes que sos mayor de 18 años.');
  if (!d.derechos) talFallo_('Necesitamos que confirmes que podés compartir este material.');
  if (!d.guardar) talFallo_('Necesitamos tu autorización para guardar tus datos e imágenes.');
  return d;
}

function talValidarPlan_(lista) {
  if (!Array.isArray(lista)) talFallo_('Falta la lista de archivos.');
  const cuenta = { foto: 0, book: 0, video: 0 };
  let total = 0;
  const plan = lista.map((a, i) => {
    const campo = String(a && a.campo || '');
    const lim = TAL.LIMITES[campo];
    if (!lim) talFallo_('Tipo de archivo desconocido.');
    const tipo = String(a.tipo || '');
    const bytes = Number(a.bytes);
    if (lim.tipos.indexOf(tipo) === -1) talFallo_('Hay un archivo con un formato no permitido.');
    if (!(bytes > 0 && bytes <= lim.max)) talFallo_('Hay un archivo vacío o que supera el tamaño permitido.');
    cuenta[campo]++; total += bytes;
    const nombre = talTexto_(a.nombre, 120).replace(/[\\/:*?"<>|]/g, '_') || ('archivo-' + (i + 1));
    return { indice: i, campo, tipo, bytes, nombre };
  });
  Object.keys(TAL.LIMITES).forEach(c => {
    const lim = TAL.LIMITES[c];
    if (cuenta[c] < lim.min) talFallo_('Subí al menos ' + lim.min + ' foto.');
    if (cuenta[c] > lim.cantidad) talFallo_('Superaste la cantidad de archivos permitida.');
  });
  if (total > TAL.TOTAL_MAX) talFallo_('El total de archivos supera los 80 MB.');
  return plan;
}

/* ───────────────────────── Paso 2: un archivo ───────────────────────── */

function talArchivo_(x, envioId) {
  const libro = talLibro_();
  const env = talEnvio_(libro, envioId, x.token);
  if (env.valores[5] === 'COMPLETO') return { ok: true, envioId, indice: Number(x.indice), guardado: true };
  const plan = JSON.parse(env.valores[6]);
  const item = plan[Number(x.indice)];
  if (!item || item.indice !== Number(x.indice)) talFallo_('Archivo no previsto en este envío.');
  if (talRecibidos_(libro, envioId).indexOf(item.indice) >= 0) return { ok: true, envioId, indice: item.indice, guardado: true };

  const b64 = x.base64;
  if (typeof b64 !== 'string' || !b64.length || b64.length % 4 ||
      b64.length > Math.ceil(TAL.LIMITES[item.campo].max / 3) * 4)
    talFallo_('El archivo no llegó completo. Reintentá.');
  let bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (_) { talFallo_('No pudimos leer el archivo.'); }
  if (bytes.length !== item.bytes) talFallo_('El archivo no llegó completo. Reintentá.');
  if (!talFirmaOk_(bytes, item.tipo)) talFallo_('"' + item.nombre + '" no coincide con su formato. Exportalo de nuevo y volvé a intentar.');

  const talentoId = env.valores[3];
  const tal = talTalento_(libro, talentoId);
  const carpetaId = tal.valores[{ fotos: 13, books: 14, audiovisual: 15 }[TAL.LIMITES[item.campo].carpeta]];
  const carpeta = DriveApp.getFolderById(carpetaId);
  // Nombre determinista: si un pedido se cortó tras crear el archivo, se recupera en vez de duplicarlo.
  const etiqueta = { foto: 'Foto', book: 'Book', video: 'Video' }[item.campo];
  const fecha = Utilities.formatDate(new Date(env.valores[2]), TAL.TZ, 'yyyy-MM-dd');
  const nombre = etiqueta + ' ' + (item.indice + 1) + ' · ' + fecha + ' · ' + envioId.slice(0, 8) + '.' + TAL.EXT[item.tipo];
  const existe = carpeta.getFilesByName(nombre);
  const file = existe.hasNext() ? existe.next() : carpeta.createFile(Utilities.newBlob(bytes, item.tipo, nombre));
  file.setDescription('Original: ' + item.nombre + ' · ' + talentoId + ' · envío ' + envioId);

  return talLock_(() => {
    if (talRecibidos_(libro, envioId).indexOf(item.indice) >= 0) return { ok: true, envioId, indice: item.indice, guardado: true };
    talHoja_(libro, 'Archivos').appendRow([envioId, item.indice, talentoId, item.campo, talCelda_(item.nombre), item.tipo,
      item.bytes, file.getId(), file.getUrl(), new Date().toISOString()]);
    const envios = talHoja_(libro, 'Envíos');
    envios.getRange(env.fila, 8).setValue(talRecibidos_(libro, envioId).length);
    SpreadsheetApp.flush();
    talTecnico_('archivo', envioId, talentoId, 'OK', item.campo + ' #' + (item.indice + 1) + ' · ' + item.bytes + ' bytes');
    return { ok: true, envioId, indice: item.indice, guardado: true };
  });
}

function talFirmaOk_(bytes, tipo) {
  const b = bytes.slice(0, 16).map(n => (n + 256) % 256);
  const en = (arr, desde) => arr.every((n, i) => b[(desde || 0) + i] === n);
  const ascii = (s, desde) => en(s.split('').map(c => c.charCodeAt(0)), desde);
  switch (tipo) {
    case 'image/jpeg': return en([255, 216, 255]);
    case 'image/png': return en([137, 80, 78, 71, 13, 10, 26, 10]);
    case 'image/webp': return ascii('RIFF') && ascii('WEBP', 8);
    case 'application/pdf': return ascii('%PDF-');
    case 'video/mp4': case 'video/quicktime': return ascii('ftyp', 4);
    case 'video/webm': return en([26, 69, 223, 163]);
  }
  return false;
}

/* ───────────────────────── Paso 3: finalizar ───────────────────────── */

function talFinalizar_(x, envioId) {
  const libro = talLibro_();
  const res = talLock_(() => {
    const env = talEnvio_(libro, envioId, x.token);
    const plan = JSON.parse(env.valores[6]);
    const recibidos = talRecibidos_(libro, envioId);
    const faltan = plan.filter(p => recibidos.indexOf(p.indice) === -1);
    if (faltan.length) talFallo_('Faltan ' + faltan.length + ' archivo(s) por subir. Reintentá el envío.');
    const talentoId = env.valores[3];
    const tal = talTalento_(libro, talentoId);
    const d = talDato_(env.valores[8]);
    if (env.valores[5] !== 'COMPLETO') {
      const archivos = talArchivosEnvio_(libro, envioId);
      const docId = talLegajoDoc_(tal, d, env, archivos);
      const talentos = talHoja_(libro, 'Talentos');
      talentos.getRange(tal.fila, 13).setValue(docId);
      if (tal.valores[22] === 'NUEVO' || !tal.valores[22]) talentos.getRange(tal.fila, 23).setValue('SIN EVALUAR');
      const envios = talHoja_(libro, 'Envíos');
      envios.getRange(env.fila, 6).setValue('COMPLETO');
      SpreadsheetApp.flush();
      talTecnico_('finalizar', envioId, talentoId, 'OK', 'archivos=' + archivos.length + ' · ' + env.valores[9]);
    }
    return { talentoId, d, coincidencia: env.valores[9], docId: talTalento_(libro, talentoId).valores[12], fila: env.fila };
  });
  // Los correos no cambian el resultado de recepción.
  try { talCorreos_(libro, envioId); } catch (e) { talTecnico_('correos', envioId, res.talentoId, 'REVISAR', String(e.message).slice(0, 200)); }
  const archivos = talArchivosEnvio_(libro, envioId);
  return {
    ok: true, envioId, completo: true, talentoId: res.talentoId,
    actualizado: res.coincidencia !== 'NUEVO',
    resumen: {
      nombre: res.d.nombre, email: res.d.email, disciplinas: res.d.disciplinas,
      fotos: archivos.filter(a => a.tipo === 'foto').length,
      books: archivos.filter(a => a.tipo === 'book').length,
      videos: archivos.filter(a => a.tipo === 'video').length,
      enlaces: res.d.links.length,
      clientes: res.d.clientes, promocion: res.d.promocion,
    },
  };
}

function talLegajoDoc_(tal, d, env, archivos) {
  const v = tal.valores;
  const legajo = DriveApp.getFolderById(v[11]);
  let doc;
  if (v[12]) doc = DocumentApp.openById(v[12]);
  else {
    const titulo = 'Legajo artístico — ' + talTextoCelda_(v[3]);
    const previo = legajo.getFilesByName(titulo);
    if (previo.hasNext()) doc = DocumentApp.openById(previo.next().getId());
    else {
      doc = DocumentApp.create(titulo);
      DriveApp.getFileById(doc.getId()).moveTo(legajo);
      const body = doc.getBody();
      body.clear();
      body.appendParagraph('Legajo artístico').setHeading(DocumentApp.ParagraphHeading.TITLE);
      body.appendParagraph(talTextoCelda_(v[3])).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
      body.appendParagraph('ID interno: ' + v[0] + ' · Alta: ' + talFecha_(v[1]));
      body.appendParagraph('Carpetas: fotos ' + talUrlCarpeta_(v[13]) + ' · books ' + talUrlCarpeta_(v[14]) + ' · audiovisual ' + talUrlCarpeta_(v[15]));
      body.appendParagraph('Evaluación interna').setHeading(DocumentApp.ParagraphHeading.HEADING1);
      body.appendParagraph('Estado: SIN EVALUAR. Completar después de revisar el material o hacer la entrevista. No evaluar edad, origen, religión ni otros datos sensibles; las medidas solo se usan si un cliente las pide para un casting.');
      [['Perfil y fortalezas', ''], ['Para qué tipo de propuestas se presentaría', ''], ['Observaciones', '']].forEach(([h]) => {
        body.appendParagraph(h).setHeading(DocumentApp.ParagraphHeading.HEADING3);
        body.appendParagraph('—');
      });
    }
  }
  const body = doc.getBody();
  const fecha = talFecha_(env.valores[2]);
  body.appendParagraph((env.valores[9] === 'NUEVO' ? 'Alta del perfil' : 'Actualización del perfil') + ' · ' + fecha)
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const disciplinas = d.disciplinas.map(x => x === 'Otra' ? 'Otra: ' + d.otraDisciplina : x).join(', ');
  const filas = [
    ['Nombre', d.nombre], ['Nombre artístico', d.artistico || '—'], ['Correo', d.email], ['Teléfono', d.telefono],
    ['Localidad', d.localidad], ['Fecha de nacimiento', d.nacimiento], ['Disciplinas', disciplinas],
    ['Experiencia', d.experiencia], ['Formación', d.formacion || '—'], ['Habilidades e idiomas', d.habilidades || '—'],
    ['Altura / talle / calzado', [d.altura ? d.altura + ' cm' : '', d.talle, d.calzado].filter(Boolean).join(' · ') || '—'],
    ['Instagram', d.instagram ? '@' + d.instagram : '—'], ['Enlaces', d.links.join('\n') || '—'],
  ];
  body.appendTable(filas);
  body.appendParagraph('Consentimiento').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Versión ' + TAL.CONSENT_VERSION + ' · otorgado el ' + fecha + ' desde ' + TAL.WEB + '/perfil-artistico/');
  body.appendListItem('Declara ser mayor de 18 años: SÍ');
  body.appendListItem('Declara tener derecho a compartir las fotos, books y videos enviados: SÍ');
  body.appendListItem('Autoriza a guardar sus datos e imágenes para gestionar su perfil artístico: SÍ');
  body.appendListItem('Autoriza a presentar su perfil, fotos y material a clientes, productoras y organizadores: ' + (d.clientes ? 'SÍ (con aviso previo)' : 'NO'));
  body.appendListItem('Autoriza el uso de sus imágenes en la difusión de HumagencIA (web y redes): ' + (d.promocion ? 'SÍ' : 'NO'));
  body.appendParagraph('Archivos recibidos en este envío').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (!archivos.length) body.appendParagraph('Sin archivos nuevos.');
  archivos.forEach(a => {
    const p = body.appendListItem(({ foto: 'Foto', book: 'Book/portfolio', video: 'Video' }[a.tipo]) + ': ' + a.nombre + ' (' + talMb_(a.bytes) + ')');
    p.setLinkUrl(a.url);
  });
  body.appendParagraph('Envío ' + env.valores[0]).setItalic(true);
  doc.saveAndClose();
  return doc.getId();
}

/* ───────────────────────── Correos ───────────────────────── */

function talCorreos_(libro, envioId) {
  talLock_(() => {
    const envios = talHoja_(libro, 'Envíos');
    const filas = talFilas_(envios);
    const i = filas.findIndex(r => r[0] === envioId);
    if (i < 0) return;
    const r = filas[i], fila = i + 2;
    if (r[5] !== 'COMPLETO') return;
    const d = talDato_(r[8]);
    const tal = talTalento_(libro, r[3]);
    const archivos = talArchivosEnvio_(libro, envioId);
    [[11, () => talCorreoAgencia_(d, tal, r, archivos)], [12, () => talCorreoTalento_(d, r, archivos)]].forEach(([col, enviar]) => {
      const estado = envios.getRange(fila, col).getValue();
      if (estado !== 'PENDIENTE' || MailApp.getRemainingDailyQuota() < 1) return;
      envios.getRange(fila, col).setValue('ENVIANDO'); SpreadsheetApp.flush();
      try { enviar(); envios.getRange(fila, col).setValue('ENVIADO'); }
      catch (e) { envios.getRange(fila, col).setValue('REVISAR'); envios.getRange(fila, 13).setValue('Correo incierto: revisar manualmente.'); }
      SpreadsheetApp.flush();
    });
  });
}

function talCorreoAgencia_(d, tal, r, archivos) {
  const cuenta = t => archivos.filter(a => a.tipo === t).length;
  const cuerpo = [
    (r[9] === 'NUEVO' ? 'Nuevo perfil artístico' : 'Perfil artístico actualizado (' + r[9] + ')') + ' desde la web',
    '', 'ID: ' + r[3], 'Nombre: ' + d.nombre + (d.artistico ? ' (' + d.artistico + ')' : ''),
    'Correo: ' + d.email, 'Teléfono: ' + d.telefono, 'Localidad: ' + d.localidad,
    'Disciplinas: ' + d.disciplinas.join(', '),
    'Material: ' + cuenta('foto') + ' foto(s), ' + cuenta('book') + ' book(s), ' + cuenta('video') + ' video(s), ' + d.links.length + ' enlace(s)',
    'Presentar a clientes: ' + (d.clientes ? 'SÍ' : 'NO') + ' · Uso promocional de imagen: ' + (d.promocion ? 'SÍ' : 'NO'),
    '', 'Legajo: https://docs.google.com/document/d/' + tal.valores[12] + '/edit',
    'Carpeta: ' + talUrlCarpeta_(tal.valores[11]),
  ].join('\n');
  MailApp.sendEmail({ to: TAL.AGENCY_EMAIL, subject: 'Perfil artístico web: ' + d.nombre + ' (' + d.disciplinas[0] + ')',
    body: cuerpo, replyTo: d.email, name: TAL.AGENCY_NAME + ' web' });
}

function talCorreoTalento_(d, r, archivos) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = {};
  let membrete = '';
  try {
    const resp = UrlFetchApp.fetch(TAL.MEMBRETE_URL, { muteHttpExceptions: true });
    const img = resp.getBlob();
    if (resp.getResponseCode() === 200 && /^image\//.test(img.getContentType())) {
      inline.membrete = img;
      membrete = '<img src="cid:membrete" alt="HumagencIA" width="560" style="width:100%;max-width:560px;display:block;margin-bottom:24px">';
    }
  } catch (_) { /* sin membrete */ }
  const cuenta = t => archivos.filter(a => a.tipo === t).length;
  const fila = (k, v) => '<tr><td style="padding:8px 12px;color:#53647b;width:38%">' + k + '</td><td style="padding:8px 12px"><strong>' + v + '</strong></td></tr>';
  const nuevo = r[9] === 'NUEVO';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#12263e;max-width:560px;margin:auto;line-height:1.6">' + membrete +
    '<h2 style="color:#08234f;margin:0 0 12px">' + (nuevo ? '¡Recibimos tu perfil artístico, ' : '¡Actualizamos tu perfil artístico, ') + esc(d.nombre.split(' ')[0]) + '!</h2>' +
    '<p>' + (nuevo ? 'Ya formás parte del registro de talentos de HumagencIA.' : 'Sumamos este material a tu legajo existente; no se creó un perfil duplicado.') + ' Este es el resumen:</p>' +
    '<table style="width:100%;border-collapse:collapse;background:#f2f6fc;font-size:14px">' +
    fila('Nombre', esc(d.nombre + (d.artistico ? ' (' + d.artistico + ')' : ''))) + fila('Disciplinas', esc(d.disciplinas.join(', '))) +
    fila('Fotos', cuenta('foto')) + fila('Books / portfolios', cuenta('book')) + fila('Videos', cuenta('video') + (d.links.length ? ' + ' + d.links.length + ' enlace(s)' : '')) +
    fila('Presentarte a clientes', d.clientes ? 'Sí, con aviso previo' : 'No por ahora') + fila('Uso de tus fotos en nuestra difusión', d.promocion ? 'Sí' : 'No') +
    '</table>' +
    '<p style="margin-top:18px"><strong>¿Qué sigue?</strong> Revisamos tu material y te escribimos cuando haya una propuesta compatible (castings, eventos, campañas o producciones).</p>' +
    '<p>Podés cambiar tus autorizaciones, corregir datos o pedir que borremos tu perfil y tus imágenes respondiendo este correo.</p>' +
    '<p style="margin-top:24px">Federico, Uma y Botito · HumagencIA<br>WhatsApp: ' + TAL.WHATSAPP + '<br>' + TAL.AGENCY_EMAIL + '<br>humagencia.com.ar</p></div>';
  MailApp.sendEmail({ to: d.email, subject: nuevo ? 'Recibimos tu perfil artístico · HumagencIA' : 'Actualizamos tu perfil artístico · HumagencIA',
    htmlBody: html, body: 'Recibimos tu perfil artístico en HumagencIA. Para cambiar autorizaciones o borrar tus datos, respondé este correo.',
    replyTo: TAL.AGENCY_EMAIL, name: TAL.AGENCY_NAME, inlineImages: inline });
}

function reintentarCorreosTalentos() {
  const libro = talLibro_();
  talFilas_(talHoja_(libro, 'Envíos')).filter(r => r[5] === 'COMPLETO' && (r[10] === 'PENDIENTE' || r[11] === 'PENDIENTE'))
    .slice(0, 5).forEach(r => talCorreos_(libro, r[0]));
}

/* ───────────────────────── Duplicados y carpetas ───────────────────────── */

function talBuscarTalento_(hoja, d) {
  const filas = talFilas_(hoja);
  const tiene = (lista, v) => String(lista || '').split(',').indexOf(v) >= 0;
  const porMail = filas.findIndex(r => talTextoCelda_(r[5]).toLowerCase() === d.email || tiene(r[24], d.email));
  const porTel = filas.findIndex(r => tiene(r[7], d.claveTel));
  if (porMail < 0 && porTel < 0) return {};
  const i = porMail >= 0 ? porMail : porTel;
  const motivo = porMail >= 0 && porTel === porMail ? 'MISMO CORREO Y TELÉFONO' : porMail >= 0 ? 'MISMO CORREO' : 'MISMO TELÉFONO';
  const conflicto = porMail >= 0 && porTel >= 0 && porMail !== porTel ? filas[porTel][0] : '';
  return { fila: i + 2, valores: filas[i], motivo: conflicto ? motivo + ' (REVISAR)' : motivo, conflicto };
}

function talCrearCarpetas_(hoja, nombre) {
  // Regla de la agencia: carpeta con nombre y apellido; si el nombre ya existe, se agrega un número.
  const base = nombre.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const usados = new Set(talFilas_(hoja).map(r => {
    try { return DriveApp.getFolderById(r[11]).getName(); } catch (_) { return ''; }
  }));
  const legajos = DriveApp.getFolderById(TAL.CARPETAS.legajos);
  const ocupado = n => usados.has(n) || legajos.getFoldersByName(n).hasNext();
  let n = base, k = 2;
  while (ocupado(n)) n = base + ' ' + (k++);
  const crear = id => DriveApp.getFolderById(id).createFolder(n);
  const legajo = legajos.createFolder(n);
  const fotos = crear(TAL.CARPETAS.fotos), books = crear(TAL.CARPETAS.books), audio = crear(TAL.CARPETAS.audiovisual);
  // Accesos directos para tener todo el material del talento desde su legajo.
  [[fotos, 'Fotografías originales'], [books, 'Books y portfolios'], [audio, 'Material audiovisual']].forEach(([f, t]) => {
    try { legajo.createShortcut(f.getId()).setName(t); } catch (_) { /* opcional */ }
  });
  return { legajo: legajo.getId(), fotos: fotos.getId(), books: books.getId(), audiovisual: audio.getId() };
}

function talNuevoId_(hoja) {
  const usados = new Set(talFilas_(hoja).map(r => r[0]));
  const dia = Utilities.formatDate(new Date(), TAL.TZ, 'yyyyMMdd');
  let id;
  do { id = 'TAL-' + dia + '-' + Utilities.getUuid().slice(0, 4).toUpperCase(); } while (usados.has(id));
  return id;
}

/* ───────────────────────── Planillas ───────────────────────── */

function talLibro_() {
  const id = PropertiesService.getScriptProperties().getProperty('TAL_LIBRO');
  if (!id) throw new Error('Falta ejecutar prepararTalentos');
  return SpreadsheetApp.openById(id);
}
function talHoja_(libro, nombre) {
  const s = libro.getSheetByName(nombre);
  if (!s) throw new Error('Falta la pestaña ' + nombre);
  const h = s.getRange(1, 1, 1, TAL_HOJAS[nombre].length).getValues()[0];
  if (TAL_HOJAS[nombre].some((x, i) => x !== h[i])) throw new Error('Encabezados alterados en ' + nombre);
  return s;
}
function talFilas_(s) {
  const n = s.getLastRow() - 1;
  return n > 0 ? s.getRange(2, 1, n, s.getLastColumn()).getValues() : [];
}
function talEnvio_(libro, envioId, token) {
  const filas = talFilas_(talHoja_(libro, 'Envíos'));
  const i = filas.findIndex(r => r[0] === envioId);
  if (i < 0 || typeof token !== 'string' || filas[i][4] !== token) talFallo_('El envío venció o no es válido. Recargá la página.');
  return { fila: i + 2, valores: filas[i] };
}
function talTalento_(libro, id) {
  const filas = talFilas_(talHoja_(libro, 'Talentos'));
  const i = filas.findIndex(r => r[0] === id);
  if (i < 0) throw new Error('Talento inexistente');
  return { fila: i + 2, valores: filas[i] };
}
function talRecibidos_(libro, envioId) {
  return talFilas_(talHoja_(libro, 'Archivos')).filter(r => r[0] === envioId).map(r => Number(r[1]));
}
function talArchivosEnvio_(libro, envioId) {
  return talFilas_(talHoja_(libro, 'Archivos')).filter(r => r[0] === envioId)
    .map(r => ({ indice: Number(r[1]), tipo: r[3], nombre: talTextoCelda_(r[4]), bytes: Number(r[6]), id: r[7], url: r[8] }))
    .sort((a, b) => a.indice - b.indice);
}

/* ───────────────────────── Preparación y diagnóstico ───────────────────────── */

function prepararTalentos() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(TAL.CARPETAS).forEach(k => {
    const f = DriveApp.getFolderById(TAL.CARPETAS[k]);
    if (f.isTrashed()) throw new Error('Carpeta en papelera: ' + k);
  });
  talLock_(() => {
    if (!props.getProperty('TAL_LIBRO')) {
      const registro = DriveApp.getFolderById(TAL.CARPETAS.registro);
      const previo = registro.getFilesByName('Registro de talentos');
      const libro = previo.hasNext() ? SpreadsheetApp.openById(previo.next().getId()) : SpreadsheetApp.create('Registro de talentos');
      if (!previo.hasNext()) DriveApp.getFileById(libro.getId()).moveTo(registro);
      Object.keys(TAL_HOJAS).forEach((n, i) => {
        const sola = libro.getSheets().length === 1 && libro.getSheets()[0].getLastRow() === 0 && !TAL_HOJAS[libro.getSheets()[0].getName()];
        const s = libro.getSheetByName(n) || (i === 0 && sola ? libro.getSheets()[0].setName(n) : libro.insertSheet(n));
        if (s.getLastRow() === 0) { s.getRange(1, 1, 1, TAL_HOJAS[n].length).setValues([TAL_HOJAS[n]]).setFontWeight('bold'); s.setFrozenRows(1); }
      });
      props.setProperty('TAL_LIBRO', libro.getId());
    }
    if (!props.getProperty('TAL_TECNICO')) {
      const tec = DriveApp.getFolderById(TAL.CARPETAS.tecnicos);
      const previo = tec.getFilesByName('Registro técnico — receptor de talentos');
      const libro = previo.hasNext() ? SpreadsheetApp.openById(previo.next().getId()) : SpreadsheetApp.create('Registro técnico — receptor de talentos');
      if (!previo.hasNext()) DriveApp.getFileById(libro.getId()).moveTo(tec);
      const s = libro.getSheets()[0];
      if (s.getLastRow() === 0) { s.getRange(1, 1, 1, TAL_TEC.length).setValues([TAL_TEC]).setFontWeight('bold'); s.setFrozenRows(1); }
      props.setProperty('TAL_TECNICO', libro.getId());
    }
  });
  Object.keys(TAL_HOJAS).forEach(n => talHoja_(talLibro_(), n));
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'reintentarCorreosTalentos'))
    ScriptApp.newTrigger('reintentarCorreosTalentos').timeBased().everyMinutes(15).create();
  try { UrlFetchApp.fetch(TAL.MEMBRETE_URL, { muteHttpExceptions: true }); } catch (_) {}
  console.log('Talentos listo · registro ' + props.getProperty('TAL_LIBRO') + ' · técnico ' + props.getProperty('TAL_TECNICO') + ' · cuota correo ' + MailApp.getRemainingDailyQuota());
}

function talTecnico_(accion, envioId, talentoId, resultado, detalle) {
  try {
    const id = PropertiesService.getScriptProperties().getProperty('TAL_TECNICO');
    if (!id) return;
    SpreadsheetApp.openById(id).getSheets()[0].appendRow([new Date().toISOString(), accion, envioId, talentoId, resultado, talCelda_(String(detalle || ''))]);
  } catch (_) { console.warn('Registro técnico no disponible'); }
}

/* ───────────────────────── Utilidades ───────────────────────── */

function talLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) talFallo_('Hay otros envíos en curso. Reintentá en unos segundos.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function talTexto_(v, max) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim();
  if (t.length > max) talFallo_('Uno de los campos es demasiado largo.');
  return t;
}
function talClaveTel_(t) {
  let n = String(t).replace(/\D/g, '');
  n = n.replace(/^54/, '').replace(/^9(?=\d{10}$)/, '').replace(/^0/, '');
  n = n.replace(/^(\d{2,4})15(\d{6,8})$/, (m, a, b) => (a + b).length === 10 ? a + b : m);
  return n.slice(-10);
}
function talEdad_(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const hoy = new Date(Utilities.formatDate(new Date(), TAL.TZ, 'yyyy-MM-dd') + 'T12:00:00Z');
  let edad = hoy.getUTCFullYear() - y;
  if (hoy.getUTCMonth() + 1 < m || (hoy.getUTCMonth() + 1 === m && hoy.getUTCDate() < d)) edad--;
  return edad;
}
function talSumar_(lista, v) { const a = String(lista || '').split(',').filter(Boolean); if (a.indexOf(v) === -1) a.push(v); return a.join(','); }
function talDato_(s) { try { return JSON.parse(s || '{}'); } catch (_) { return {}; } }
function talCelda_(s) { s = String(s || ''); return /^[=+@\-']/.test(s) ? "'" + s : s; }
function talTextoCelda_(s) { return String(s || '').replace(/^'(?=[=+@\-'])/, ''); }
function talHuella_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(n => ('0' + ((n + 256) % 256).toString(16)).slice(-2)).join('');
}
function talFecha_(iso) { return Utilities.formatDate(new Date(iso), TAL.TZ, 'dd/MM/yyyy HH:mm'); }
function talMb_(n) { return (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
function talUrlCarpeta_(id) { return 'https://drive.google.com/drive/folders/' + id; }
function talFallo_(s) { const e = new Error(s); e.publico = true; throw e; }
function talJson_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
