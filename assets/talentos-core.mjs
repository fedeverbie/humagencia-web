// Perfil artístico: reglas compartidas (sin DOM) para poder probarlas en Node.
// Los límites deben coincidir con talentos-receptor/Talentos.gs (TAL.LIMITES).

export const MB = 1024 * 1024;
export const LIMITES = Object.freeze({
  foto: { max: 8 * MB, min: 1, cantidad: 8, tipos: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } },
  book: { max: 15 * MB, min: 0, cantidad: 2, tipos: { pdf: 'application/pdf' } },
  video: { max: 25 * MB, min: 0, cantidad: 2, tipos: { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' } },
});
export const TOTAL_MAX = 80 * MB;
export const LADO_MINIMO = 500; // px del lado menor de cada foto
export const LOCALIDADES = ['La Plata', 'Berisso', 'Ensenada', 'Gran La Plata (otra)', 'Otra'];
export const DISCIPLINAS = ['Modelo', 'Actuación', 'Promotor/a', 'Danza', 'Música', 'Canto',
  'Conducción / locución', 'Extra / figuración', 'Creación de contenido', 'Otra'];

export const NOMBRE_CAMPO = { foto: 'foto', book: 'book o portfolio', video: 'video' };

export function mb(bytes) {
  return (bytes / MB).toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: bytes < MB ? 1 : 0 }) + ' MB';
}

export function tipoDe(campo, file) {
  const ext = (String(file.name).split('.').pop() || '').toLowerCase();
  const tipos = LIMITES[campo].tipos;
  if (tipos[ext]) return tipos[ext];
  return Object.values(tipos).includes(file.type) ? file.type : '';
}

/** Valida un archivo nuevo contra su campo. Devuelve '' si está bien o el mensaje de error. */
export function errorArchivo(campo, file, yaElegidos = []) {
  const lim = LIMITES[campo];
  if (!tipoDe(campo, file)) {
    return `"${file.name}" no es un formato válido. ${campo === 'foto' ? 'Usá JPG, PNG o WebP.' : campo === 'book' ? 'El book tiene que ser PDF.' : 'Usá MP4, MOV o WebM.'}`;
  }
  if (!file.size) return `"${file.name}" está vacío.`;
  if (file.size > lim.max) return `"${file.name}" pesa ${mb(file.size)}. El máximo por ${NOMBRE_CAMPO[campo]} es ${mb(lim.max)}.`;
  if (yaElegidos.length >= lim.cantidad) return `Podés subir hasta ${lim.cantidad} ${campo === 'foto' ? 'fotos' : campo === 'book' ? 'books' : 'videos'}.`;
  if (yaElegidos.some((f) => f.name === file.name && f.size === file.size)) return `"${file.name}" ya está agregado.`;
  return '';
}

export function totalBytes(archivos) {
  return Object.values(archivos).flat().reduce((s, f) => s + f.size, 0);
}

export function edadEn(fechaIso, hoyIso) {
  const [y, m, d] = fechaIso.split('-').map(Number);
  const [hy, hm, hd] = hoyIso.split('-').map(Number);
  let edad = hy - y;
  if (hm < m || (hm === m && hd < d)) edad--;
  return edad;
}

export function hoyAR() {
  return new Date().toLocaleDateString('sv', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/** Valida los datos del formulario. Devuelve {campo: mensaje} con los errores (vacío si está todo bien). */
export function validarDatos(d, archivos, hoy = hoyAR()) {
  const e = {};
  if (d.nombre.length < 3 || !/\s/.test(d.nombre)) e.nombre = 'Escribí tu nombre y apellido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = 'Revisá tu correo electrónico.';
  if (d.telefono.replace(/\D/g, '').length < 8) e.telefono = 'Revisá tu teléfono: incluí la característica.';
  if (!LOCALIDADES.includes(d.localidad)) e.localidad = 'Elegí una localidad.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.nacimiento)) e.nacimiento = 'Indicá tu fecha de nacimiento.';
  else {
    const edad = edadEn(d.nacimiento, hoy);
    if (edad < 18) e.nacimiento = 'Este formulario es para mayores de 18 años. Para menores, escribinos por WhatsApp con un adulto responsable.';
    else if (edad > 100) e.nacimiento = 'Revisá tu fecha de nacimiento.';
  }
  if (!d.disciplinas.length) e.disciplinas = 'Elegí al menos una disciplina.';
  else if (d.disciplinas.length > 6) e.disciplinas = 'Elegí hasta seis disciplinas.';
  if (d.disciplinas.includes('Otra') && d.otraDisciplina.length < 2) e.otraDisciplina = 'Contanos cuál es tu otra disciplina.';
  if (d.experiencia.length < 20) e.experiencia = 'Contanos tu experiencia en al menos un par de líneas. Si recién empezás, contalo también.';
  if (d.altura && !(/^\d{2,3}$/.test(d.altura) && +d.altura >= 100 && +d.altura <= 230)) e.altura = 'Indicá la altura en centímetros, por ejemplo 172.';
  if (d.calzado && !/^\d{2}(\.5)?$/.test(d.calzado)) e.calzado = 'Revisá el número de calzado.';
  if (d.instagram && !/^@?[A-Za-z0-9._]{1,30}$/.test(d.instagram)) e.instagram = 'Escribí solo tu usuario, por ejemplo @tu.usuario.';
  if (d.links.length > 3) e.links = 'Podés indicar hasta 3 enlaces.';
  else if (d.links.some((l) => !/^https:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(l))) e.links = 'Cada enlace tiene que empezar con https:// (uno por línea).';
  if (archivos.foto.length < LIMITES.foto.min) e.fotos = 'Subí al menos una foto tuya.';
  if (totalBytes(archivos) > TOTAL_MAX) e.fotos = `Entre todos los archivos superás los ${mb(TOTAL_MAX)}. Quitá alguno o compartí los videos por enlace.`;
  if (!d.mayor) e.mayor = 'Necesitamos que confirmes que sos mayor de 18 años.';
  if (!d.derechos) e.derechos = 'Necesitamos que confirmes que podés compartir este material.';
  if (!d.guardar) e.guardar = 'Necesitamos tu autorización para guardar tus datos e imágenes.';
  return e;
}

/** Lista ordenada de archivos que se envían, en el formato que espera el receptor. */
export function armarPlan(archivos) {
  return ['foto', 'book', 'video'].flatMap((campo) => archivos[campo].map((file) => ({
    campo, nombre: file.name.slice(0, 120), tipo: tipoDe(campo, file), bytes: file.size, file,
  })));
}

export function nuevoId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('');
}

/** POST con reintentos para cortes de red. Los pasos del receptor son idempotentes. */
export async function enviar(url, cuerpo, { intentos = 3, espera = 1500, fetchImpl = fetch } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetchImpl(url, { method: 'POST', body: JSON.stringify(cuerpo) });
      const json = await res.json();
      if (json && json.ok) return json;
      ultimo = new Error((json && json.error) || 'No pudimos completar el envío.');
      ultimo.definitivo = true; // error del receptor: no tiene sentido reintentar igual
      throw ultimo;
    } catch (err) {
      ultimo = err.definitivo ? err : new Error('Se cortó la conexión.');
      if (err.definitivo && !/otros envíos en curso|unos segundos/.test(err.message)) throw err;
      if (i < intentos - 1) await new Promise((r) => setTimeout(r, espera * (i + 1)));
    }
  }
  throw ultimo;
}
