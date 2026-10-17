import {proyectarAviso} from '../../assets/autopista/catalogo.mjs';
export const IG = 'https://instagram.com/humagencia.lp';
export const GENERIC = 'Si tu email está registrado, te llegará el enlace; si no, registrate y subí tu CV.';
export const CV_NOTICE = 'Adjuntá tu CV. Mandalo por WhatsApp o por email al anunciante; sin CV tu postulación no cuenta.';
export const TOKEN_TTL = 15 * 60 * 1000;
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const HAG_RE = /^HAG-\d{3,8}$/;
export function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function normalizeEmail(value) {
  if(typeof value!=='string') return null;
  const email=value.trim().toLowerCase();
  return email.length<=254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)?email:null;
}
export function todayArgentina(now=Date.now()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const get=t=>parts.find(x=>x.type===t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function cookie(req,name) {
  return (req.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
}
export function setCookie(name,value,maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function contactUrl(mode,target,id,title='') {
  // El mensaje va al anunciante: habla de SU aviso (el puesto), nunca de nuestro código HAG.
  const puesto=String(title||'').trim()||'el puesto publicado';
  if(mode==='email' && normalizeEmail(target)===target) return `mailto:${encodeURIComponent(target).replace(/%40/g,"@")}?subject=${encodeURIComponent(`Postulación: ${puesto}`)}&body=${encodeURIComponent(`Hola, ¿cómo están? Me postulo para su aviso de ${puesto}. Adjunto mi CV.\n\nQuedo a disposición. Saludos.`)}`;
  if(mode==='whatsapp' && /^\d{10,15}$/.test(target)) return `https://wa.me/${target}?text=${encodeURIComponent(`Hola, ¿cómo están? Me postulo para su aviso de ${puesto}. Les envío mi CV.`)}`;
  if(mode==='web') {
    const u=new URL(target);
    if(u.protocol==='https:' && !u.username && !u.password) return u.href;
  }
  if(mode==='presencial'||mode==='consultar') return null;
  throw new Error('CONTACTO_INVALIDO');
}
export function publicJob(r) {
  const raw={id:r.id,title:r.title,company:r.company||'',city:r.city,category:r.category,schedule:r.schedule||'',sourceLabel:r.source_label,checkedAt:r.checked_at,reviewAfter:r.review_after,status:r.status};
  return proyectarAviso(raw);
}
export function validateBatch(input,now=Date.now()) {
  if(input?.schema!=='hag-private-v1' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.batchId||'') || !Array.isArray(input.jobs) || input.jobs.length>500) throw new Error('LOTE_INVALIDO');
  const time=Date.parse(input.generatedAt);
  if(!Number.isFinite(time)||time>now+60000 || time<now-86400000) throw new Error('FECHA_LOTE_INVALIDA');
  if(input.jobs.length===0 && input.confirmEmpty!==true) throw new Error('LOTE_VACIO_REQUIERE_CONFIRMACION');
  const ids=new Set();
  const day=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
  const jobs=input.jobs.map(j=>{
    if(!HAG_RE.test(j.id)||ids.has(j.id)) throw new Error('ID_INVALIDO_O_REPETIDO'); ids.add(j.id);
    for(const key of ['title','city','category','sourceLabel']) {
      if(typeof j[key]!=='string' || !j[key].trim() || j[key].length>200 || /[\r\n<>@]|https?:|www\.|(?:\+?\d[\s().-]*){7}/i.test(j[key])) throw new Error('TEXTO_PUBLICO_INVALIDO');
    }
    for(const key of ['company','schedule']){
      if(j[key]!==undefined&&(typeof j[key]!=='string'||j[key].length>200||/[\r\n<>@]|https?:|www\.|(?:\+?\d[\s().-]*){7}/i.test(j[key])))throw new Error('TEXTO_PUBLICO_INVALIDO');
    }
    if(!['published','closed'].includes(j.status)||!day(j.checkedAt)||!day(j.reviewAfter)||!day(j.firstSeenAt)||j.checkedAt>=j.reviewAfter||j.firstSeenAt>j.checkedAt) throw new Error('VIGENCIA_INVALIDA');
    if(j.checkedAt>todayArgentina(now)) throw new Error('VERIFICACION_FUTURA');
    if(typeof j.applyTarget!=='string'||j.applyTarget.length>2000||typeof j.applyInstructions!=='string'||j.applyInstructions.length>4000) throw new Error('CONTACTO_INVALIDO');
    contactUrl(j.applyMode,j.applyTarget,j.id);
    if(['presencial','consultar'].includes(j.applyMode)&&j.applyTarget) throw new Error('DESTINO_INESPERADO');
    if(j.applyMode==='presencial'&&!j.applyInstructions.trim()) throw new Error('FALTAN_INSTRUCCIONES');
    return {...publicJob({id:j.id,title:j.title,company:j.company,schedule:j.schedule,city:j.city,category:j.category,source_label:j.sourceLabel,checked_at:j.checkedAt,review_after:j.reviewAfter,status:j.status}),firstSeenAt:j.firstSeenAt,applyMode:j.applyMode,applyTarget:j.applyTarget,applyInstructions:j.applyInstructions};
  });
  return {batchId:input.batchId,generatedAt:new Date(time).toISOString(),jobs};
}
export function loginMail(url) {
  return {subject:'Tu enlace de ingreso — HumagencIA',text:`Ingresá a la Autopista de Avisos de HumagencIA:\n${url}\n\nEste enlace es de un solo uso y vence en 15 minutos. Abrilo en el navegador donde lo pediste. Confirmá el ingreso en la página. Si no lo solicitaste, ignorá este correo. No lo reenvíes.\n\nSeguinos en Instagram: @humagencia.lp\n${IG}`};
}
