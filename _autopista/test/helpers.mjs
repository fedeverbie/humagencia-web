import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle} from '../src/worker.mjs';
export class LocalD1 {
  constructor(){this.sql=new DatabaseSync(':memory:');this.sql.exec(readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8'));this.sql.exec(readFileSync(new URL('../migrations/0002_public_fields.sql',import.meta.url),'utf8'));for(const m of ['0003_elegibles.sql','0004_config.sql'])this.sql.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));}
  withSession(){return this;}
  prepare(query){const db=this;let values=[];return {bind(...v){values=v;return this;},async first(){return db.sql.prepare(query).get(...values)||null;},async all(){return {results:db.sql.prepare(query).all(...values)};},async run(){return db.sql.prepare(query).run(...values);},_sql:query,_values:()=>values};}
  async batch(statements){this.sql.exec('BEGIN');try{const out=statements.map(s=>this.sql.prepare(s._sql).run(...s._values()));this.sql.exec('COMMIT');return out;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
export function system(){
  const db=new LocalD1(), mails=[], pending=[], eligibleEmails=new Set(['registrado@example.test']), receipts=new Map();
  const env={AUTOPISTA_DB:db,APP_ORIGIN:'https://humagencia.test',ACCESS_ENABLED:'true',MAIL_ENABLED:'true',INGEST_ENABLED:'true',INGEST_SECRET:'x'.repeat(48),REGISTRY:{async fetch(req){const b=await req.json();if(new URL(req.url).pathname==='/receipt')return Response.json(receipts.get(b.receipt)||{eligible:false});return Response.json({eligible:eligibleEmails.has(b.email),subject:'candidato-opaco'});}},MAILER:{async fetch(req){mails.push(await req.json());return Response.json({sent:true});}}};
  const jar=new Map();
  async function request(path,body,opts={}){
    const headers=new Headers(opts.headers||{});
    if(body!==undefined){headers.set('Content-Type','application/json');if(!headers.has('Origin'))headers.set('Origin',env.APP_ORIGIN);}
    if(!opts.noCookie)headers.set('Cookie',[...jar].map(([k,v])=>k+'='+v).join('; '));
    const req=new Request(env.APP_ORIGIN+'/autopista/api'+path,{method:opts.method||(body===undefined?'GET':'POST'),headers,body:body===undefined?undefined:JSON.stringify(body)});
    const res=await handle(req,env,{waitUntil:p=>pending.push(p)});
    if(!opts.noCookie)for(const c of res.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');if(v)jar.set(k,v);else jar.delete(k);}
    return {status:res.status,headers:res.headers,data:await res.json()};
  }
  async function drain(){await Promise.all(pending.splice(0));}
  async function login(email='registrado@example.test',hagId='HAG-001'){
    await request('/acceso',{email,hagId});await drain();
    const token=mails.at(-1)?.text.match(/#ingreso=([A-Za-z0-9_-]{43})/)?.[1];
    return request('/canjear',{token});
  }
  return {db,env,mails,jar,pending,eligibleEmails,receipts,request,drain,login};
}
export function batch(jobs=[job()],date=new Date().toISOString()) {return {schema:'hag-private-v1',batchId:crypto.randomUUID(),generatedAt:date,jobs};}
export function job(overrides={}){return {id:'HAG-001',title:'Atención al público',city:'La Plata',category:'Comercio',sourceLabel:'Fuente de prueba',checkedAt:'2026-10-16',reviewAfter:'2099-10-20',firstSeenAt:'2026-10-15',status:'published',applyMode:'email',applyTarget:'empresa@example.test',applyInstructions:'Enviar CV en PDF.',...overrides};}
export async function seed(s,jobs=[job()],date){return s.request('/admin/lote',batch(jobs,date),{headers:{Authorization:'Bearer '+s.env.INGEST_SECRET}});}
