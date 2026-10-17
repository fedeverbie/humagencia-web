// Ingreso a la Autopista tras registrar el CV. Lo usa assets/cv-upload.mjs:
// solo canjea un recibo firmado que emite el receptor real de CV.
const base='/autopista/api';
async function post(path,data){
  const r=await fetch(base+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const b=await r.json();if(!r.ok)throw new Error(b.error||'INTEGRACION_REGISTRO_PENDIENTE');return b;
}
export async function prepararIngresoTrasRegistro(){return (await post('/registro/iniciar',{})).challenge;}
// Deja la sesión abierta sin redirigir: la persona entra cuando toca "Ver avisos y postulación".
// Nunca acepta email, envioId, ok/recibido o una URL elegida por el cliente como prueba.
export async function ingresarTrasRegistro(receipt){
  await post('/registro/canjear',{receipt});
}
