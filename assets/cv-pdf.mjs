import { PDFDocument, rgb } from './vendor/pdf-lib-1.17.1.mjs';
import fontkit from './vendor/fontkit-1.1.1.mjs';

export const fileName = (d) => 'CV_' + [d.nombre, d.apellido].map(v => v.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')).join('_') + '.pdf';
export const birthDate = (value) => value ? value.split('-').reverse().join('/') : '';
export const period = (e) => [e.desde, e.hasta].filter(Boolean).map(v => v.split('-').reverse().join('/')).join(' — ');

// Vector text stays selectable. Both columns paginate independently, without clipping.
export async function generatePDF(d, photo, fontBytes) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = fontBytes || await Promise.all(['DejaVuSans','DejaVuSans-Bold'].map(async name => {
    const response = await fetch(new URL('./vendor/'+name+'.ttf',import.meta.url));
    if(!response.ok) throw Error('No se pudo cargar la tipografía. Volvé a intentarlo.');
    return new Uint8Array(await response.arrayBuffer());
  }));
  const regular = await pdf.embedFont(fonts[0],{subset:true});
  const bold = await pdf.embedFont(fonts[1],{subset:true});
  const supported=new Set(regular.getCharacterSet());
  const verifyText=value=>{
    if(typeof value==='string') for(const ch of value) {
      if(ch!=='\n' && ch!=='\r' && !supported.has(ch.codePointAt(0))) throw Error('Hay un símbolo que no se puede imprimir: '+ch+'. Reemplazalo por texto.');
    }
    else if(value && typeof value==='object') Object.values(value).forEach(verifyText);
  };
  verifyText(d);
  const navy = rgb(.075,.14,.27), violet = rgb(.36,.29,.56), ink = rgb(.18,.22,.28), muted = rgb(.40,.45,.52);
  const width = 595.28, height = 841.89, sidebar = 183, bottom = 52;
  const pages = [];
  const pageAt = (i) => {
    while (pages.length <= i) {
      const p = pdf.addPage([width,height]);
      p.drawRectangle({x:0,y:0,width:sidebar,height,color:rgb(.945,.95,.97)});
      p.drawRectangle({x:0,y:0,width:5,height,color:violet});
      p.drawText('HumAgencIA', {x:25,y:25,size:8,font:bold,color:violet});
      p.drawText(String(pages.length+1), {x:width-35,y:25,size:8,font:regular,color:muted});
      pages.push(p);
    }
    return pages[i];
  };
  const wrap = (text, font, size, max) => {
    const lines = [];
    for (const para of String(text).replace(/[\u0000-\u0008\u000b-\u001f]/g,'').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const candidate = line ? line+' '+word : word;
        if (font.widthOfTextAtSize(candidate,size) <= max) { line=candidate; continue; }
        if (line) { lines.push(line); line=''; }
        let part='';
        for (const char of word) {
          if (part && font.widthOfTextAtSize(part+char,size)>max) { lines.push(part); part=''; }
          part+=char;
        }
        line=part;
      }
      lines.push(line);
    }
    return lines;
  };
  const column = (x,max,y) => {
    let i=0;
    return {
      space(n=10) { y-=n; },
      text(value, {size=10.5,font=regular,color=ink,gap=5}={}) {
        if (!value) return;
        for (const line of wrap(value,font,size,max)) {
          if (y < bottom+size) { i++; y=height-45; }
          pageAt(i).drawText(line,{x,y,size,font,color});
          y-=size*1.4;
        }
        y-=gap;
      },
      heading(value) {
        if (y<bottom+55) { i++; y=height-45; }
        pageAt(i).drawLine({start:{x,y:y+5},end:{x:x+max,y:y+5},thickness:.6,color:rgb(.78,.80,.85)});
        this.text(value,{size:9,font:bold,color:violet,gap:9});
      }
    };
  };
  pageAt(0);
  let leftY=height-48;
  if (photo) {
    const img=await pdf.embedPng(photo);
    pages[0].drawImage(img,{x:43,y:height-163,width:98,height:98});
    leftY=height-192;
  }
  const left=column(25,sidebar-50,leftY), right=column(sidebar+30,width-sidebar-60,height-58);
  left.heading('DATOS PERSONALES');
  for (const [label,value] of [['Nacimiento',birthDate(d.nacimiento)],['Teléfono',d.telefono],['Correo',d.email],['Localidad',d.localidad]]) {
    if(value) { left.text(label,{size:8,font:bold,color:muted,gap:0});left.text(value,{size:10,gap:11}); }
  }
  if(d.perfil) { left.space(12);left.heading('SOBRE MÍ');left.text(d.perfil); }
  right.text(d.nombre+'\n'+d.apellido,{size:28,font:bold,color:navy,gap:17});
  for(const [title,text] of [['OBJETIVO LABORAL',d.objetivo],['QUÉ SÉ HACER',d.habilidades]]) {
    if(text) { right.heading(title);right.text(text);right.space(14); }
  }
  const experiences=d.experiencia==='si' ? d.experiencias.filter(e=>Object.values(e).some(Boolean)) : [];
  right.heading('EXPERIENCIA LABORAL');
  if(!experiences.length) right.text(d.experiencia==='no' ? 'Sin experiencia laboral.' : 'No informada.');
  for(const e of experiences) {
    right.text(e.lugar,{font:bold,size:12,gap:2});
    right.text(e.puesto,{size:11,gap:2});
    right.text(period(e),{size:9,color:muted,gap:6});
    right.text(e.tareas);right.space(10);
  }
  const studies=d.formaciones.filter(e=>Object.values(e).some(Boolean));
  if(studies.length) {right.space(10);right.heading('FORMACIÓN');}
  for(const e of studies) {
    right.text(e.nivel,{font:bold,size:12,gap:2});
    right.text([e.institucion,e.estado].filter(Boolean).join(' · '));right.space(7);
  }
  const courses=d.cursos.filter(e=>Object.values(e).some(Boolean));
  if(courses.length) {right.space(10);right.heading('CURSOS');}
  for(const e of courses) {right.text(e.nombre,{font:bold,gap:2});right.text(e.institucion);right.space(7);}
  pdf.setTitle('CV - '+d.nombre+' '+d.apellido);
  pdf.setAuthor(d.nombre+' '+d.apellido);
  pdf.setCreator('HumAgencIA');
  return pdf.save();
}
