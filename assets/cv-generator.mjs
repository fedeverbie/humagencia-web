const host = document.getElementById('crear-cv');
const field = (label,name,type='text',extra='') => `<div class="field"><label for="basic-${name}">${label}</label><input id="basic-${name}" name="${name}" type="${type}" ${extra}></div>`;
const textarea = (label,name,help,max=600) => `<div class="field"><label for="basic-${name}">${label}</label><textarea id="basic-${name}" name="${name}" rows="3" maxlength="${max}" aria-describedby="hint-${name}"></textarea><span class="field-hint" id="hint-${name}">${help}</span></div>`;

if(host) {
  host.innerHTML = `
    <div class="cv-builder-heading"><div><p class="eyebrow">No tengo currículum</p><h2 id="cv-builder-title" tabindex="-1">Armá tu primer CV.</h2><p>Completá lo básico. Mirá cómo queda y descargalo en PDF.</p></div><a class="text-link" href="#cv-card">Ya tengo currículum →</a></div>
    <div class="cv-builder-grid">
    <form id="basic-cv-form">
      <fieldset><legend>Datos personales</legend><div class="basic-two">
        ${field('Nombre','nombre','text','autocomplete="given-name" maxlength="40" required')}
        ${field('Apellido','apellido','text','autocomplete="family-name" maxlength="39" required')}
        ${field('Fecha de nacimiento','nacimiento','date')}
        ${field('Localidad','localidad','text','autocomplete="address-level2" maxlength="40"')}
        ${field('Teléfono','telefono','tel','autocomplete="tel" maxlength="25"')}
        ${field('Correo electrónico','email','email','autocomplete="email" maxlength="120"')}
      </div><div class="field"><label for="basic-foto">Foto</label><input id="basic-foto" type="file" accept="image/jpeg,image/png" aria-describedby="basic-photo-hint"><span class="field-hint" id="basic-photo-hint">Opcional. JPG o PNG, hasta 10 MB.</span><span class="field-error" id="basic-photo-error" role="status"></span></div></fieldset>
      <fieldset><legend>Sobre vos</legend>
        ${textarea('¿Cómo te describirías?','perfil','Por ejemplo: responsable, puntual, ordenado/a, con ganas de aprender, buen trato con la gente.')}
        ${textarea('¿De qué te gustaría trabajar?','objetivo','Por ejemplo: atención al público, reposición, depósito o tareas generales.',120)}
        ${textarea('¿Qué sabés hacer?','habilidades','Por ejemplo: manejo de caja, reposición, limpieza, atención al cliente, cocina, herramientas, carga y descarga.')}
      </fieldset>
      <fieldset><legend>Experiencia laboral</legend><div class="field"><label for="basic-experiencia">¿Tenés experiencia laboral?</label><select id="basic-experiencia" name="experiencia"><option value="no">No</option><option value="si">Sí</option></select></div>
      <div id="basic-experience-fields" hidden><div id="basic-experiencias"></div><button class="basic-add" type="button" data-add="experiencias">AGREGAR OTRA EXPERIENCIA</button></div></fieldset>
      <fieldset><legend>Formación</legend><div id="basic-formaciones"></div><button class="basic-add" type="button" data-add="formaciones">AGREGAR OTRA FORMACIÓN</button></fieldset>
      <fieldset><legend>Cursos</legend><p class="field-hint">Si no tenés cursos, dejalo vacío.</p><div id="basic-cursos"></div><button class="basic-add" type="button" data-add="cursos">AGREGAR OTRO CURSO</button></fieldset>
      <button class="button primary full" id="basic-generate" type="submit">GENERAR MI CURRÍCULUM</button>
      <p class="form-note">El PDF se descarga en tu celular. Si querés enviarlo a HumAgencIA, después confirmá el envío en “Subí tu CV”.</p>
      <p id="basic-status" role="status" aria-live="polite"></p>
      <a id="basic-send-link" class="button secondary full" href="#cv-card" hidden>Continuar con el envío a HumAgencIA</a>
    </form>
    <div class="cv-preview-panel"><p class="cv-preview-label">VISTA PREVIA</p><article class="cv-paper" aria-label="Vista previa del currículum"><aside class="cv-paper-left"><div id="basic-photo-preview"></div><h3>DATOS PERSONALES</h3><dl id="basic-personal-preview"></dl><div id="basic-profile-preview"></div><small class="cv-paper-brand">HumAgencIA</small></aside><div class="cv-paper-main" id="basic-main-preview"></div></article></div>
    </div>`;
  const form=host.querySelector('form'), status=host.querySelector('#basic-status'), submit=host.querySelector('#basic-generate');
  const $=id=>document.getElementById(id);
  $('basic-nacimiento').max=new Date().toISOString().slice(0,10);
  let photo=null, photoURL='', photoTask=Promise.resolve(), photoVersion=0, downloadURL='';
  const templates={
    experiencias:[['Lugar o empresa','lugar'],['Puesto o tarea','puesto'],['Desde','desde','month'],['Hasta','hasta','month'],['Qué hacías','tareas','textarea']],
    formaciones:[['Nivel de estudios','nivel'],['Institución','institucion'],['Estado','estado','select']],
    cursos:[['Nombre del curso','nombre'],['Lugar o institución','institucion']]
  };
  const add = (kind) => {
    const list=$('basic-'+kind), block=document.createElement('div');
    block.className='basic-repeat';block.dataset.block=kind;
    const n=list.children.length+1, id=crypto.randomUUID();
    block.innerHTML=`<div class="basic-repeat-heading"><strong>${{experiencias:'Experiencia',formaciones:'Formación',cursos:'Curso'}[kind]} ${n}</strong><button type="button" class="basic-remove">Quitar</button></div>`+templates[kind].map(([label,key,type='text'])=>{
      const attrs=`id="${id}-${key}" data-key="${key}" maxlength="${key==='tareas'?600:120}"`;
      const input=type==='textarea'?`<textarea ${attrs} rows="3"></textarea>`:type==='select'?`<select ${attrs}><option value="">Elegí un estado</option><option>Completo</option><option>Incompleto</option><option>En curso</option></select>`:`<input ${attrs} type="${type}">`;
      return `<div class="field"><label for="${id}-${key}">${label}</label>${input}</div>`;
    }).join('');
    block.querySelector('button').addEventListener('click',()=>{block.remove();update();});
    list.append(block);
    update();
  };
  const read = () => {
    const d=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v).trim()]));
    for(const kind of Object.keys(templates)) d[kind]=[...$('basic-'+kind).children].map(block=>Object.fromEntries([...block.querySelectorAll('[data-key]')].map(el=>[el.dataset.key,el.value.trim()])));
    return d;
  };
  const node = (tag,text,className='') => {const el=document.createElement(tag);el.textContent=text;el.className=className;return el;};
  const update = () => {
    const d=read();
    $('basic-send-link').hidden=true;
    status.textContent='';
    $('basic-personal-preview').replaceChildren(...[['Nacimiento',d.nacimiento?.split('-').reverse().join('/')],['Teléfono',d.telefono],['Correo',d.email],['Localidad',d.localidad]].filter(([,v])=>v).flatMap(([k,v])=>[node('dt',k),node('dd',v)]));
    $('basic-photo-preview').replaceChildren();
    if(photoURL) {const img=document.createElement('img');img.src=photoURL;img.alt='Foto del postulante';$('basic-photo-preview').append(img);}
    const profile=$('basic-profile-preview');profile.replaceChildren();
    if(d.perfil) profile.append(node('h3','SOBRE MÍ'),node('p',d.perfil));
    const main=$('basic-main-preview');main.replaceChildren(node('h3',d.nombre||'Tu nombre','cv-paper-name'),node('p',d.apellido||'Tu apellido','cv-paper-surname'));
    const section = (title) => {const el=document.createElement('section');el.append(node('h4',title));main.append(el);return el;};
    for(const [title,text] of [['OBJETIVO LABORAL',d.objetivo],['QUÉ SÉ HACER',d.habilidades]]) if(text) section(title).append(node('p',text));
    const ex=section('EXPERIENCIA LABORAL'), experiences=d.experiencia==='si'?d.experiencias.filter(e=>Object.values(e).some(Boolean)):[];
    if(!experiences.length) ex.append(node('p',d.experiencia==='no'?'Sin experiencia laboral.':'Completá tu experiencia.'));
    for(const e of experiences) {const el=document.createElement('div');el.className='cv-preview-entry';el.append(node('h5',e.lugar),node('p',e.puesto,'cv-preview-role'),node('p',[e.desde,e.hasta].filter(Boolean).map(v=>v.split('-').reverse().join('/')).join(' — '),'cv-preview-dates'),node('p',e.tareas));ex.append(el);}
    for(const [kind,title] of [['formaciones','FORMACIÓN'],['cursos','CURSOS']]) {
      const items=d[kind].filter(e=>Object.values(e).some(Boolean));if(!items.length)continue;
      const el=section(title);
      for(const e of items) {const entry=document.createElement('div');entry.className='cv-preview-entry';entry.append(node('h5',e.nivel||e.nombre),node('p',[e.institucion,e.estado].filter(Boolean).join(' · ')));el.append(entry);}
    }
  };
  const open = () => {host.hidden=false;$('cv-builder-title').focus();};
  document.querySelectorAll('[data-open-cv]').forEach(el=>el.addEventListener('click',open));
  if(location.hash==='#crear-cv')open();
  window.addEventListener('hashchange',()=>{if(location.hash==='#crear-cv')open();});
  form.addEventListener('input',update);
  $('basic-experiencia').addEventListener('change',()=>{$('basic-experience-fields').hidden=$('basic-experiencia').value!=='si';update();});
  form.querySelectorAll('[data-add]').forEach(el=>el.addEventListener('click',()=>{add(el.dataset.add);$('basic-'+el.dataset.add).lastElementChild.querySelector('input').focus();}));
  for(const kind of Object.keys(templates))add(kind);
  $('basic-foto').addEventListener('change',()=>{
    const version=++photoVersion;photo=null;photoURL='';update();$('basic-photo-error').textContent='';
    const file=$('basic-foto').files[0];if(!file)return;
    photoTask=(async()=>{
      if(!['image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024)throw Error('Elegí una foto JPG o PNG de hasta 10 MB.');
      const image=await createImageBitmap(file);
      const canvas=document.createElement('canvas');canvas.width=500;canvas.height=500;
      const ctx=canvas.getContext('2d');ctx.beginPath();ctx.arc(250,250,250,0,Math.PI*2);ctx.clip();
      const side=Math.min(image.width,image.height);
      ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,500,500);image.close();
      const url=canvas.toDataURL('image/png'), blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('No pudimos leer la foto. Elegí otra.');
      if(version!==photoVersion)return;
      photo=new Uint8Array(await blob.arrayBuffer());photoURL=url;update();
    })().catch(error=>{if(version===photoVersion){$('basic-photo-error').textContent=error.message;$('basic-foto').value='';}});
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;status.textContent='Preparando tu PDF…';
    try {
      await photoTask;
      const d=read();
      const {generatePDF,fileName}=await import('./cv-pdf.mjs');
      const bytes=await generatePDF(d,photo), name=fileName(d);
      const file=new File([bytes],name,{type:'application/pdf'});
      if(file.size>5*1024*1024)throw Error('El PDF supera los 5 MB. Probá con otra foto.');
      if(downloadURL)URL.revokeObjectURL(downloadURL);
      downloadURL=URL.createObjectURL(file);
      const a=document.createElement('a');a.href=downloadURL;a.download=name;a.textContent='Descargar mi PDF';a.className='text-link';
      a.click();
      status.replaceChildren(node('p','Tu CV está listo. Descargalo y, si querés registrarte, confirmá el envío abajo.'),a);
      // Reuse the existing uploader and its consent, identity validation and idempotency.
      // Generating/downloading alone never creates a candidate or grants permission.
      const upload=$('cv-form');
      if(upload && !upload.hidden) {
        for(const [key,value] of [['nombre',d.nombre+' '+d.apellido],['telefono',d.telefono],['email',d.email],['puesto',d.objetivo]]) $('cv-'+key).value=value;
        $('cv-localidad').value=['La Plata','Berisso','Ensenada'].includes(d.localidad)?d.localidad:d.localidad?'Otra':'';
        let attached=false;
        try {const transfer=new DataTransfer();transfer.items.add(file);$('cv-archivo').files=transfer.files;$('cv-archivo').dispatchEvent(new Event('change',{bubbles:true}));attached=true;}catch(_){}
        $('cv-acepta').checked=false;$('cv-compartir').checked=false;
        $('cv-status').textContent=attached?'Tu CV generado está adjunto. Revisá tus datos, autorizá guardarlos y tocá “Enviar mi CV”.':'Revisá tus datos y adjuntá el PDF que descargaste para enviarlo.';
        $('basic-send-link').hidden=false;
      }
    } catch(error) {
      status.textContent=error.message?.includes('WinAnsi')?'Hay un símbolo que no se puede imprimir. Reemplazá los emojis o símbolos especiales por texto y volvé a generar el CV.':'No pudimos generar el PDF. '+(error.message||'Volvé a intentarlo.');
    } finally {submit.disabled=false;}
  });
}
