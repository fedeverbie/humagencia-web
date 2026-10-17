// Adaptador opt-in: no se carga en el formulario actual ni intercepta su envío.
// Solo conectar después de que el receptor real emita recibos verificables.
const base='/autopista/api';
async function post(path,data){
  const r=await fetch(base+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const b=await r.json();if(!r.ok)throw new Error(b.error||'INTEGRACION_REGISTRO_PENDIENTE');return b;
}
export async function prepararIngresoTrasRegistro(){return (await post('/registro/iniciar',{})).challenge;}
export async function ingresarTrasRegistro(receipt){
  // Nunca acepta email, envioId, ok/recibido o una URL elegida por el cliente como prueba.
  await post('/registro/canjear',{receipt});
  location.assign('/autopista/');
}
