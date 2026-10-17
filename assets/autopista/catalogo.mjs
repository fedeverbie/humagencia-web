// Solo proyección de datos ya públicos. Nunca copiar summary, sourceUrl ni contactos.
export function argentinaDay(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
const publicText=value=>typeof value==='string'&&!/[<>@]|https?:|www\.|(?:\+?\d[\s().-]*){7}/i.test(value)?value.trim().slice(0,200):'';
export function proyectarAviso(j){
  if(!j||!/^HAG-\d{3,8}$/.test(j.id))return null;
  const out={id:j.id,title:publicText(j.title),company:publicText(j.company),city:publicText(j.city),category:publicText(j.category),schedule:publicText(j.schedule),sourceLabel:publicText(j.sourceLabel),checkedAt:j.checkedAt,reviewAfter:j.reviewAfter,status:j.status};
  return out.title&&out.city?out:null;
}
export function catalogoPublico(jobs,today=argentinaDay()){
  if(!Array.isArray(jobs))return [];
  return jobs.filter(j=>j&&j.status==='published'&&/^\d{4}-\d{2}-\d{2}$/.test(j.checkedAt||'')&&/^\d{4}-\d{2}-\d{2}$/.test(j.reviewAfter||'')&&j.checkedAt<=today&&today<j.reviewAfter).map(proyectarAviso).filter(Boolean);
}
