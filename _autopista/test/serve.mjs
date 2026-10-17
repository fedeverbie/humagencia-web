// SOLO localhost + datos ficticios. Nunca desplegar este archivo.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {system,seed,job} from './helpers.mjs';
import {handle} from '../src/worker.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const s=system(),origin='http://localhost:8788';s.env.APP_ORIGIN=origin;
await seed(s,[job({title:'Aviso ficticio: atención al público'}),job({id:'HAG-002',title:'Aviso ficticio: tareas de depósito',applyMode:'whatsapp',applyTarget:'5492210000000',applyInstructions:'PRUEBA. No enviar a este número.'})]);
const old=s.env.MAILER.fetch;
s.env.MAILER.fetch=async req=>{const copy=req.clone();const result=await old(req);console.log('ENLACE FICTICIO LOCAL (no email real):\n'+(await copy.json()).text.match(/http:\/\/localhost:8788\/autopista\/#ingreso=\S+/)[0]);return result;};
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.headers.host!=='localhost:8788'){res.writeHead(403);res.end();return;}
    const u=new URL(req.url,origin);
    if(u.pathname.startsWith('/autopista/api/')){
      const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>512000)throw new Error('size');chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      const r=await handle(new Request(u,{method:req.method,headers:req.headers,...(body.length?{body}: {})}),s.env,{waitUntil:p=>p.catch(()=>{})});
      const headers=Object.fromEntries(r.headers);delete headers['set-cookie'];
      // Excepción SOLO del servidor local de prueba; no cambia el Worker.
      const cookies=r.headers.getSetCookie().map(c=>c.replace('__Host-','test-').replace('; Secure',''));
      // El navegador devuelve test-*; remapeo se hace abajo antes de handle.
      if(cookies.length)headers['Set-Cookie']=cookies;
      res.writeHead(r.status,headers);res.end(Buffer.from(await r.arrayBuffer()));return;
    }
    let path=decodeURIComponent(u.pathname);if(path.endsWith('/'))path+='index.html';
    const file=resolve(root,'.'+path);if(!file.startsWith(root))throw new Error('path');
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('No disponible en la prueba local.');}
});
// Reescribir cookies exclusivamente en el transporte local.
server.prependListener('request',req=>{if(req.headers.cookie)req.headers.cookie=req.headers.cookie.replaceAll('test-hag_','__Host-hag_');});
server.listen(8788,'127.0.0.1',()=>console.log('SOLO PRUEBA FICTICIA: '+origin+'/autopista/ · email registrado@example.test'));
