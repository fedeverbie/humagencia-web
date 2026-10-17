import {GENERIC,TOKEN_TTL,SESSION_TTL,TOKEN_RE,HAG_RE,randomToken,hash,normalizeEmail,todayArgentina,cookie,setCookie,publicJob,validateBatch,contactUrl,loginMail} from './security.mjs';

const PREFIX='/autopista/api';
const SESSION='__Host-hag_session', INTENT='__Host-hag_intent', REG='__Host-hag_reg';
const json=(data,status=200,cookies=[])=>{
  const h=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
  cookies.forEach(c=>h.append('Set-Cookie',c)); return new Response(JSON.stringify(data),{status,headers:h});
};
class Fault extends Error { constructor(status,code){super(code);this.status=status;} }
const fail=(s,c)=>{throw new Fault(s,c);};
async function body(req,max=16384) {
  if(!(req.headers.get('Content-Type')||'').startsWith('application/json')) fail(415,'FORMATO_INVALIDO');
  const reader=req.body?.getReader(); if(!reader) fail(400,'FALTA_CUERPO');
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,'CUERPO_DEMASIADO_GRANDE');}chunks.push(value);}
  const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(all));}catch{fail(400,'JSON_INVALIDO');}
}
async function callService(service,path,data) {
  if(!service?.fetch) throw new Error('ADAPTADOR_PENDIENTE');
  const res=await service.fetch(new Request('https://adapter.internal/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}));
  if(!res.ok) throw new Error('ADAPTADOR_NO_DISPONIBLE'); return res.json();
}
async function eligible(env,email) {
  const r=await callService(env.REGISTRY,'eligible',{email});
  return r.eligible===true && typeof r.subject==='string' && r.subject.length>0 && r.subject.length<=160;
}
async function limit(db,key,now,max,window=TOKEN_TTL) {
  const bucket=Math.floor(now/window), k=`${key}:${bucket}`;
  const r=await db.prepare('INSERT INTO cabina_limites(clave,cantidad,vence) VALUES(?,1,?) ON CONFLICT(clave) DO UPDATE SET cantidad=cantidad+1 WHERE cantidad<? RETURNING cantidad').bind(k,now+window,max).first();
  return !!r;
}
async function createSession(db,email,now) {
  const id=crypto.randomUUID(), token=randomToken();
  await db.prepare('INSERT INTO cabina_usuarios(id,email,verificado_at,ultimo_ingreso) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET ultimo_ingreso=excluded.ultimo_ingreso,verificado_at=excluded.verificado_at').bind(id,email,now,now).run();
  const u=await db.prepare('SELECT id FROM cabina_usuarios WHERE email=?').bind(email).first();
  await db.prepare('INSERT INTO cabina_sesiones(hash,usuario_id,creado_at,vence) VALUES(?,?,?,?)').bind(await hash(token),u.id,now,now+SESSION_TTL).run();
  return setCookie(SESSION,token,SESSION_TTL/1000);
}
async function session(req,db,now) {
  const token=cookie(req,SESSION); if(!TOKEN_RE.test(token)) fail(401,'INGRESO_REQUERIDO');
  const r=await db.prepare('SELECT s.usuario_id,u.email FROM cabina_sesiones s JOIN cabina_usuarios u ON u.id=s.usuario_id WHERE s.hash=? AND s.vence>?').bind(await hash(token),now).first();
  if(!r)fail(401,'INGRESO_REQUERIDO');return r;
}
async function sendLink(db,env,email,intent,hag,now,ip) {
  if(!await limit(db,'email:'+await hash(email),now,3))return;
  if(!await limit(db,'ip:'+await hash(ip),now,20))return;
  if(!await eligible(env,email))return;
  // Presupuesto técnico de mails, no límite de consultas de avisos.
  if(!await limit(db,'mail-total',now,Number(env.MAIL_DAILY_BUDGET||50),86400000))return;
  const token=randomToken(), tokenHash=await hash(token);
  await db.prepare('INSERT INTO cabina_enlaces(hash,email,intent_hash,hag_id,vence,habilitado) VALUES(?,?,?,?,?,1)').bind(tokenHash,email,await hash(intent),hag,now+TOKEN_TTL).run();
  const link=`${env.APP_ORIGIN}/autopista/#ingreso=${token}`;
  try{
    const result=await callService(env.MAILER,'send-login',{idempotencyKey:tokenHash,to:email,...loginMail(link)});
    if(result.sent!==true)throw new Error('MAIL_NO_CONFIRMADO');
  }catch(err){await db.prepare('UPDATE cabina_enlaces SET habilitado=0 WHERE hash=?').bind(tokenHash).run();throw err;}
}
async function ingest(req,db,env,now) {
  if(env.INGEST_ENABLED!=='true'||!env.INGEST_SECRET||env.INGEST_SECRET.length<32)fail(503,'INGESTION_DESACTIVADA');
  const auth=req.headers.get('Authorization')||'';
  if(await hash(auth)!==await hash('Bearer '+env.INGEST_SECRET))fail(401,'NO_AUTORIZADO');
  let data;try{data=validateBatch(await body(req,512000),now);}catch(e){if(e instanceof Fault)throw e;fail(400,e.message);}
  const existing=await db.prepare('SELECT id FROM hag_lotes WHERE id=?').bind(data.batchId).first();
  if(existing)return json({ok:true,repeated:true});
  // La condición sobre el lote evita carreras: todas las escrituras y el cierre
  // se incluyen en UNA transacción D1. Un lote antiguo nunca revive avisos.
  const statements=[];
  const fresh='NOT EXISTS (SELECT 1 FROM hag_lotes WHERE generado_at>=?)';
  statements.push(db.prepare(`INSERT INTO hag_contactos(id,title,city,category,source_label,apply_mode,apply_target,apply_instructions,first_seen_at,checked_at,review_after,actualizado,status)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.city'),json_extract(value,'$.category'),json_extract(value,'$.sourceLabel'),json_extract(value,'$.applyMode'),json_extract(value,'$.applyTarget'),json_extract(value,'$.applyInstructions'),json_extract(value,'$.firstSeenAt'),json_extract(value,'$.checkedAt'),json_extract(value,'$.reviewAfter'),?,json_extract(value,'$.status')
    FROM json_each(?) WHERE ${fresh}
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,city=excluded.city,category=excluded.category,source_label=excluded.source_label,apply_mode=excluded.apply_mode,apply_target=excluded.apply_target,apply_instructions=excluded.apply_instructions,checked_at=excluded.checked_at,review_after=excluded.review_after,actualizado=excluded.actualizado,status=excluded.status`).bind(data.generatedAt,JSON.stringify(data.jobs),data.generatedAt));
  statements.push(db.prepare(`UPDATE hag_contactos SET status='closed' WHERE actualizado<>? AND ${fresh}`).bind(data.generatedAt,data.generatedAt));
  statements.push(db.prepare(`INSERT INTO hag_lotes(id,generado_at,importado_at) SELECT ?,?,? WHERE ${fresh}`).bind(data.batchId,data.generatedAt,now,data.generatedAt));
  await db.batch(statements);
  const applied=await db.prepare('SELECT id FROM hag_lotes WHERE id=?').bind(data.batchId).first();
  return json({ok:!!applied,stale:!applied,count:applied?data.jobs.length:0});
}
export async function handle(req,env,ctx={waitUntil:p=>p.catch(()=>{})}) {
  const url=new URL(req.url), now=Date.now();
  try {
    if(!url.pathname.startsWith(PREFIX+'/'))fail(404,'NO_ENCONTRADO');
    if(!env.AUTOPISTA_DB)fail(503,'REVISION_SIN_CONEXION');
    const db=env.AUTOPISTA_DB.withSession?env.AUTOPISTA_DB.withSession('first-primary'):env.AUTOPISTA_DB;
    const path=url.pathname.slice(PREFIX.length);
    if(path==='/admin/lote'&&req.method==='POST')return await ingest(req,db,env,now);
    if(req.method==='POST'&&req.headers.get('Origin')!==env.APP_ORIGIN)fail(403,'ORIGEN_INVALIDO');
    if(path==='/jobs'&&req.method==='GET'){
      const rows=await db.prepare("SELECT id,title,city,category,source_label,checked_at,review_after,status FROM hag_contactos WHERE status='published' AND review_after>? ORDER BY checked_at DESC,id").bind(todayArgentina(now)).all();
      return json({schema:'hag-v1',jobs:rows.results.map(publicJob)});
    }
    if(path==='/acceso'&&req.method==='POST'){
      const b=await body(req), email=normalizeEmail(b.email), hag=HAG_RE.test(b.hagId||'')?b.hagId:'';
      const prior=cookie(req,INTENT), intent=TOKEN_RE.test(prior)?prior:randomToken();
      if(email&&env.ACCESS_ENABLED==='true'&&env.MAIL_ENABLED==='true'){
        // Respuesta independiente de existencia, elegibilidad y cuota. No enumera base.
        ctx.waitUntil(sendLink(db,env,email,intent,hag,now,req.headers.get('CF-Connecting-IP')||'unknown').catch(()=>console.warn('AUTOPISTA_ACCESO_NO_COMPLETADO')));
      }
      return json({ok:true,message:GENERIC},202,[setCookie(INTENT,intent,TOKEN_TTL/1000)]);
    }
    if(path==='/canjear'&&req.method==='POST'){
      if(env.ACCESS_ENABLED!=='true')fail(503,'ACCESO_DESACTIVADO');
      const b=await body(req), intent=cookie(req,INTENT);
      if(!TOKEN_RE.test(b.token||'')||!TOKEN_RE.test(intent))fail(400,'ENLACE_INVALIDO_O_VENCIDO');
      const r=await db.prepare('UPDATE cabina_enlaces SET usado_at=? WHERE hash=? AND intent_hash=? AND usado_at IS NULL AND vence>? AND habilitado=1 RETURNING email,hag_id').bind(now,await hash(b.token),await hash(intent),now).first();
      if(!r)fail(400,'ENLACE_INVALIDO_O_VENCIDO');
      return json({ok:true,hagId:r.hag_id},200,[await createSession(db,r.email,now),setCookie(INTENT,'',0)]);
    }
    if(path==='/registro/iniciar'&&req.method==='POST'){
      if(env.ACCESS_ENABLED!=='true'||!env.REGISTRY)fail(503,'INTEGRACION_REGISTRO_PENDIENTE');
      const challenge=randomToken();
      return json({challenge:await hash(challenge)},200,[setCookie(REG,challenge,TOKEN_TTL/1000)]);
    }
    if(path==='/registro/canjear'&&req.method==='POST'){
      if(env.ACCESS_ENABLED!=='true'||!env.REGISTRY)fail(503,'INTEGRACION_REGISTRO_PENDIENTE');
      const b=await body(req), challenge=cookie(req,REG);
      if(!TOKEN_RE.test(challenge)||typeof b.receipt!=='string'||b.receipt.length<32||b.receipt.length>4096)fail(400,'RECIBO_INVALIDO');
      const r=await callService(env.REGISTRY,'receipt',{receipt:b.receipt,challenge:await hash(challenge)});
      const email=normalizeEmail(r.email);
      if(r.eligible!==true||r.registrationVerified!==true||!email||r.challenge!==await hash(challenge)||!Number.isFinite(r.expiresAt)||r.expiresAt<=now||r.expiresAt>now+TOKEN_TTL)fail(400,'RECIBO_INVALIDO');
      const claimed=await db.prepare('INSERT INTO cabina_recibos(hash,consumido_at) VALUES(?,?) ON CONFLICT(hash) DO NOTHING RETURNING hash').bind(await hash(b.receipt),now).first();
      if(!claimed)fail(400,'RECIBO_YA_UTILIZADO');
      return json({ok:true},200,[await createSession(db,email,now),setCookie(REG,'',0)]);
    }
    if(env.ACCESS_ENABLED!=='true')fail(503,'ACCESO_DESACTIVADO');
    const user=await session(req,db,now);
    if(path==='/sesion'&&req.method==='GET')return json({authenticated:true});
    if(path==='/salir'&&req.method==='POST'){
      await db.prepare('DELETE FROM cabina_sesiones WHERE hash=?').bind(await hash(cookie(req,SESSION))).run();
      return json({ok:true},200,[setCookie(SESSION,'',0)]);
    }
    const contact=path.match(/^\/contacto\/(HAG-\d{3,8})$/);
    if(contact&&req.method==='POST'){
      const id=contact[1];
      const job=await db.prepare("SELECT * FROM hag_contactos WHERE id=? AND status='published' AND review_after>?").bind(id,todayArgentina(now)).first();
      if(!job)fail(404,'AVISO_NO_VIGENTE');
      if(job.apply_mode==='consultar')return json({id,mode:'consultar',instructions:job.apply_instructions,url:null});
      const link=contactUrl(job.apply_mode,job.apply_target,id);
      await db.prepare('INSERT INTO cabina_postulaciones(usuario_id,hag_id,abierto_at,ultima_apertura) VALUES(?,?,?,?) ON CONFLICT(usuario_id,hag_id) DO UPDATE SET ultima_apertura=excluded.ultima_apertura').bind(user.usuario_id,id,now,now).run();
      return json({id,mode:job.apply_mode,instructions:job.apply_instructions,url:link});
    }
    const post=path.match(/^\/postule\/(HAG-\d{3,8})$/);
    if(post&&req.method==='POST'){
      const r=await db.prepare('UPDATE cabina_postulaciones SET postulado_at=COALESCE(postulado_at,?) WHERE usuario_id=? AND hag_id=? RETURNING hag_id').bind(now,user.usuario_id,post[1]).first();
      if(!r)fail(409,'ABRI_EL_CONTACTO_PRIMERO');
      return json({ok:true,message:'Marcaste que te postulaste. Es una declaración tuya, no una confirmación de envío.'});
    }
    if(path==='/historial'&&req.method==='GET'){
      const before=Number(url.searchParams.get('before')||now+1), afterId=url.searchParams.get('id')||'';
      if(!Number.isSafeInteger(before)||before<0||(afterId&&!HAG_RE.test(afterId)))fail(400,'CURSOR_INVALIDO');
      const rows=await db.prepare('SELECT p.hag_id,p.abierto_at,p.ultima_apertura,p.postulado_at,j.title,j.city FROM cabina_postulaciones p JOIN hag_contactos j ON j.id=p.hag_id WHERE p.usuario_id=? AND (p.ultima_apertura<? OR (p.ultima_apertura=? AND p.hag_id>?)) ORDER BY p.ultima_apertura DESC,p.hag_id LIMIT 101').bind(user.usuario_id,before,before,afterId).all();
      const items=rows.results.slice(0,100),last=items.at(-1);
      return json({items,next:rows.results.length>100?{before:last.ultima_apertura,id:last.hag_id}:null});
    }
    fail(404,'NO_ENCONTRADO');
  }catch(e){
    if(!(e instanceof Fault))console.warn('AUTOPISTA_ERROR_INTERNO');
    return json({ok:false,error:e instanceof Fault?e.message:'SERVICIO_NO_DISPONIBLE'},e instanceof Fault?e.status:503);
  }
}
export default {fetch:handle};
