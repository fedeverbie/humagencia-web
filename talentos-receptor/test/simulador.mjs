// Simulador mínimo de Apps Script para ejecutar Talentos.gs en Node.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const SRC = fs.readFileSync(new URL('../Talentos.gs', import.meta.url), 'utf8');

export function entorno() {
  let seq = 0;
  const nid = (p) => `${p}${++seq}`;
  const items = new Map(); // id -> {tipo:'folder'|'file', nombre, padre, ...}
  const sheets = new Map();
  const mails = [];
  const carpeta = (id, nombre, padre) => { items.set(id, { tipo: 'folder', id, nombre, padre, trashed: false }); return id; };
  ['1AuktCskmCgDOeVLa78tw45IAZOMdhP5U', '1yr59zkATfkBK7d5ZDmdxlPaM3yV-BDHr', '1XhGeNhAmrS3HZX8otYG39JM5mxmvCIiY',
    '1v_nbIdPuPE2xer_k-OYYV7-LQdzpg7eb', '18LrCoTcZ04I7UHpV5nIGC_h4QI4AutWL', '1sJpTI0Wa6TPnmnV23LT6W5sWW9dNlVpm',
    '186Ghs5qX3k_UyXQmm7df9ATwUweJSKwm', '19aYrE_C-SsvsMEiSc3dreOLy7zW3E3X-'].forEach((id, i) => carpeta(id, 'raiz' + i, 'root'));
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const hijos = (padre, tipo, nombre) => [...items.values()].filter(x => x.padre === padre && x.tipo === tipo && !x.trashed && (nombre === undefined || x.nombre === nombre));
  const archivoObj = (x) => ({
    getId: () => x.id, getName: () => x.nombre, getUrl: () => 'https://drive/' + x.id, isTrashed: () => x.trashed,
    setDescription: (d) => { x.desc = d; }, moveTo: (f) => { x.padre = f.getId(); }, setName: (n) => { x.nombre = n; return archivoObj(x); },
    getBlob: () => ({}), getMimeType: () => x.mime,
  });
  const carpetaObj = (x) => ({
    getId: () => x.id, getName: () => x.nombre, isTrashed: () => x.trashed,
    createFolder: (n) => carpetaObj(items.get(carpeta(nid('F'), n, x.id))),
    getFoldersByName: (n) => iter(hijos(x.id, 'folder', n).map(carpetaObj)),
    getFilesByName: (n) => iter(hijos(x.id, 'file', n).map(archivoObj)),
    createFile: (blob) => { const id = nid('A'); items.set(id, { tipo: 'file', id, nombre: blob.name, padre: x.id, mime: blob.mime, bytes: blob.bytes.length }); return archivoObj(items.get(id)); },
    createShortcut: (target) => { const id = nid('S'); items.set(id, { tipo: 'file', id, nombre: 'atajo', padre: x.id, target }); return archivoObj(items.get(id)); },
  });
  const hoja = (nombre) => {
    const rows = [];
    const s = {
      nombre, rows,
      getName: () => s.nombre, setName: (n) => { s.nombre = n; return s; },
      getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
      appendRow: (r) => rows.push(r.slice()),
      setFrozenRows: () => s,
      getRange: (fila, col, nf = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[fila - 1 + i] || [])[col - 1 + j] ?? '')),
        getValue: () => (rows[fila - 1] || [])[col - 1] ?? '',
        setValues: (vals) => { vals.forEach((v, i) => { rows[fila - 1 + i] = rows[fila - 1 + i] || []; v.forEach((c, j) => { rows[fila - 1 + i][col - 1 + j] = c; }); }); return { setFontWeight: () => {} }; },
        setValue: (v) => { rows[fila - 1] = rows[fila - 1] || []; rows[fila - 1][col - 1] = v; },
      }),
    };
    return s;
  };
  const libroObj = (id) => {
    const l = sheets.get(id);
    return {
      getId: () => id, getSheets: () => l.hojas,
      getSheetByName: (n) => l.hojas.find(h => h.getName() === n) || null,
      insertSheet: (n) => { const h = hoja(n); l.hojas.push(h); return h; },
    };
  };
  const props = new Map();
  const docs = new Map();
  const ctx = {
    console: { log() {}, warn() {} },
    JSON, Date, Math, Number, String, Array, Object, Set, Error, RegExp,
    DriveApp: {
      getFolderById: (id) => { const x = items.get(id); if (!x || x.tipo !== 'folder') throw new Error('no folder ' + id); return carpetaObj(x); },
      getFileById: (id) => { const x = items.get(id); if (!x) throw new Error('no file ' + id); return archivoObj(x); },
    },
    SpreadsheetApp: {
      create: (n) => { const id = nid('L'); sheets.set(id, { hojas: [hoja('Hoja 1')] }); items.set(id, { tipo: 'file', id, nombre: n, padre: 'root' }); return libroObj(id); },
      openById: (id) => libroObj(id), flush: () => {},
    },
    DocumentApp: {
      ParagraphHeading: { TITLE: 1, SUBTITLE: 2, HEADING1: 3, HEADING2: 4, HEADING3: 5 },
      create: (n) => { const id = nid('D'); const texto = []; docs.set(id, texto); items.set(id, { tipo: 'file', id, nombre: n, padre: 'root', mime: 'doc' }); return ctx.DocumentApp.openById(id); },
      openById: (id) => {
        const texto = docs.get(id);
        const par = (t) => { texto.push(t); const p = { setHeading: () => p, setItalic: () => p, setLinkUrl: () => p }; return p; };
        const body = { clear: () => { texto.length = 0; }, appendParagraph: par, appendListItem: par, appendTable: (f) => { f.forEach(r => texto.push(r.join(': '))); } };
        return { getId: () => id, getBody: () => body, saveAndClose: () => {} };
      },
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map(n => (n > 127 ? n - 256 : n)),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (d, tz, f) => { const x = new Date(d.getTime() - 3 * 3600000).toISOString(); return f === 'yyyyMMdd' ? x.slice(0, 10).replace(/-/g, '') : f === 'yyyy-MM-dd' ? x.slice(0, 10) : x.slice(0, 16); },
      computeDigest: (_a, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map(n => (n > 127 ? n - 256 : n)),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (m) => mails.push(m) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 404, getBlob: () => ({ getContentType: () => 'text/html' }) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  ctx.prepararTalentos();
  const post = (o) => ctx.doPost({ postData: { contents: JSON.stringify(o) } });
  return { ctx, post, items, sheets, mails, props, docs, libro: () => libroObj(props.get('TAL_LIBRO')) };
}

