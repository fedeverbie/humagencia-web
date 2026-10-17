import {catalogoPublico} from './catalogo.mjs';
const $=id=>document.getElementById(id), base='/autopista/api';
let authenticated=false, selected='', allJobs=[], token='', nextHistory=null;
const message=text=>{$('status').textContent=text;};
async function api(path,data){
  const opts={credentials:'same-origin',cache:'no-store'};
  if(data!==undefined)Object.assign(opts,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const res=await fetch(base+path,opts);
  let b;try{b=await res.json();}catch{throw new Error('La Autopista está en revisión. El acceso todavía no está conectado.');}
  if(!res.ok){const e=new Error(b.error==='INGRESO_REQUERIDO'?'Pedí un enlace para ingresar.':b.error==='ENLACE_INVALIDO_O_VENCIDO'?'El enlace venció, ya fue usado o se abrió en otro navegador. Pedí uno nuevo.':'No pudimos completar la operación. Intentá nuevamente más tarde.');e.status=res.status;throw e;}
  return b;
}
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
function login(id=''){
  selected=id; $('login').hidden=false;$('login').scrollIntoView({block:'center'});$('email').focus();
}
async function showContact(id){
  selected=id;
  if(!authenticated){login(id);return;}
  try{
    const c=await api('/contacto/'+encodeURIComponent(id),{});
    $('contact-title').textContent='Contacto del aviso '+id;
    $('instructions').textContent=c.instructions||'';
    $('contact-status').textContent=c.mode==='consultar'?'Este aviso todavía no tiene contacto disponible. No se registró una apertura.':'Consultaste el contacto. Todavía no confirmaste una postulación.';
    const a=$('open-contact');a.removeAttribute('href');a.hidden=true;
    // Defensa adicional ante un adaptador mal configurado; no aceptar javascript:, data:, http:.
    if(c.url){const u=new URL(c.url,location.origin);if(['mailto:','https:'].includes(u.protocol)){a.href=c.url;a.hidden=false;a.textContent=c.mode==='email'?'Abrir mi correo':c.mode==='whatsapp'?'Abrir WhatsApp del anunciante':'Abrir sitio del anunciante';}}
    $('declare').hidden=c.mode==='consultar';$('declare').disabled=false;
    $('contact').hidden=false;$('contact').scrollIntoView({block:'start'});$('contact').focus();
  }catch(e){if(e.status===401){authenticated=false;login(id);}message(e.message);}
}
function renderJobs(){
  const q=$('search').value.trim().toLocaleLowerCase('es');
  const jobs=allJobs.filter(j=>[j.title,j.city,j.category,j.id].join(' ').toLocaleLowerCase('es').includes(q));
  $('jobs').replaceChildren(...jobs.map(j=>{
    const card=text('article','', 'job');card.append(text('span',j.id,'eyebrow'),text('h3',j.title),text('p',j.city+' · '+j.category));
    if(j.company)card.append(text('p',j.company));if(j.schedule)card.append(text('p','Horario: '+j.schedule));
    card.append(text('p','Fuente: '+j.sourceLabel+' · Revisado: '+j.checkedAt,'muted'));
    const b=text('button','Ver contacto');b.type='button';b.addEventListener('click',()=>showContact(j.id));card.append(b);return card;
  }));
  $('jobs-status').textContent=jobs.length?`${jobs.length} avisos · Consultas sin límite`:'No hay avisos vigentes para esta búsqueda.';
}
async function history(more=false){
  if(!authenticated){login();return;}
  try{
    const suffix=more&&nextHistory?'?before='+nextHistory.before+'&id='+encodeURIComponent(nextHistory.id):'';
    const b=await api('/historial'+suffix);if(!more)$('history-list').replaceChildren();
    for(const r of b.items){
      const fmt=n=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(n));
      const row=text('article','', 'history-row');row.append(text('h3',r.hag_id+' · '+r.title),text('p','Abriste el contacto el '+fmt(r.abierto_at)));
      if(r.postulado_at)row.append(text('p','Marcaste que te postulaste el '+fmt(r.postulado_at)));
      else{const btn=text('button','Ya me postulé');btn.type='button';btn.addEventListener('click',async()=>{try{await api('/postule/'+r.hag_id,{});await history();}catch(e){message(e.message);}});row.append(btn);}
      $('history-list').append(row);
    }
    if(!more&&!b.items.length)$('history-list').append(text('p','Todavía no abriste contactos.'));
    nextHistory=b.next;$('history-more').hidden=!nextHistory;$('history').hidden=false;
    if(!more)$('history').scrollIntoView({block:'start'});
  }catch(e){message(e.message);}
}
$('search').addEventListener('input',renderJobs);
$('history-button').addEventListener('click',()=>history());
$('history-more').addEventListener('click',()=>history(true));
$('close-contact').addEventListener('click',()=>{$('contact').hidden=true;});
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{const b=await api('/acceso',{email:$('email').value,hagId:selected});$('login-status').textContent=b.message;}
  catch(e){$('login-status').textContent=e.message;}finally{btn.disabled=false;}
});
$('consume').addEventListener('click',async()=>{
  $('consume').disabled=true;
  try{const b=await api('/canjear',{token});token='';authenticated=true;$('confirm-login').hidden=true;$('login').hidden=true;$('logout').hidden=false;message('Ingresaste a la Autopista.');if(b.hagId)await showContact(b.hagId);}
  catch(e){message(e.message);$('confirm-login').hidden=true;login();}finally{$('consume').disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  try{await api('/salir',{});authenticated=false;$('logout').hidden=true;$('history').hidden=true;$('history-list').replaceChildren();$('contact').hidden=true;$('instructions').textContent='';$('open-contact').removeAttribute('href');message('Cerraste tu sesión en este dispositivo.');}catch(e){message(e.message);}
});
$('declare').addEventListener('click',async()=>{
  $('declare').disabled=true;
  try{const b=await api('/postule/'+selected,{});$('contact-status').textContent=b.message;}catch(e){$('contact-status').textContent=e.message;$('declare').disabled=false;}
});
// El fragmento no viaja al servidor/referrer. GET no consume el enlace: evita escáneres de correo.
const match=location.hash.match(/^#ingreso=([A-Za-z0-9_-]{43})$/);
if(location.hash.startsWith('#ingreso=')){
  token=match?.[1]||'';historyReplace();
  if(token)$('confirm-login').hidden=false;else message('El enlace de ingreso no es válido.');
}
function historyReplace(){window.history.replaceState(null,'',location.pathname+location.search);}
async function init(){
  try{const b=await api('/jobs');allJobs=catalogoPublico(b.jobs);if(!allJobs.length)throw new Error('CATALOGO_PENDIENTE');renderJobs();}
  catch{
    try{
      // Lee la fuente actual de Claude sin modificarla. Solo permite ver el adelanto.
      // Ningún contacto se obtiene desde site.mjs ni se concede acceso a partir de él.
      const {jobs}=await import('../../data/site.mjs');allJobs=catalogoPublico(jobs);renderJobs();
      message('Vista de prueba con los avisos públicos actuales. El acceso a contactos todavía está en preparación.');
    }catch{$('jobs-status').textContent='No pudimos cargar los avisos. Intentá nuevamente más tarde.';}
  }
  try{await api('/sesion');authenticated=true;$('logout').hidden=false;}catch{authenticated=false;}
}
init();
