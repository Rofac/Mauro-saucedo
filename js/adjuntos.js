/* Fotos y audios de los pedidos (llegan con "Compartir" desde WhatsApp o se agregan a mano) y contactos del celular.
   Los archivos se guardan aparte (tabla "archivos") y NO van en la copia de seguridad, para que la copia no pese mucho. */
'use strict';

const ADJ = {
  _st(modo) { return DB.db.transaction('archivos', modo || 'readonly').objectStore('archivos'); },
  _q(fn) { return new Promise((ok, mal) => { const q = fn(); q.onsuccess = () => ok(q.result); q.onerror = () => mal(q.error); }); },
  guardar(a) { DB.verificarEscritura(); return this._q(() => this._st('readwrite').add(a)); },
  leer(id) { return this._q(() => this._st().get(+id)); },
  borrar(id) { return this._q(() => this._st('readwrite').delete(+id)); },
  /* recorre todos sin cargarlos en memoria */
  recorrer(fn) {
    return new Promise((ok, mal) => {
      const q = this._st('readwrite').openCursor();
      q.onsuccess = () => { const c = q.result; if (!c) return ok(); fn(c.value, c); c.continue(); };
      q.onerror = () => mal(q.error);
    });
  },
};

function tipoArchivo(mime, nombre) {
  mime = mime || ''; nombre = nombre || '';
  if (/^image\//.test(mime) || /\.(jpe?g|png|webp|heic|gif)$/i.test(nombre)) return 'foto';
  if (/^audio\//.test(mime) || /\.(opus|ogg|m4a|mp3|aac|amr|wav)$/i.test(nombre)) return 'audio';
  return '';
}

/* las fotos del celular pesan 3-5 MB: se achican a 1600 px (se siguen leyendo perfecto) */
async function achicarFoto(blob) {
  try {
    const img = await createImageBitmap(blob), max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const b = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.82));
    return b && b.size < blob.size ? b : blob;
  } catch (e) { return blob; }
}

const textoPorAdjuntos = l => { const f = l.some(a => a.tipo === 'foto'), a = l.some(a => a.tipo === 'audio'); return f && a ? 'Pedido por foto y audio' : f ? 'Pedido por foto' : 'Pedido por audio'; };
const iconosAdj = p => (p.adj || []).length ? ` ${(p.adj || []).some(a => a.tipo === 'foto') ? '📷' : ''}${(p.adj || []).some(a => a.tipo === 'audio') ? '🎤' : ''}` : '';

/* dibuja fotos y audios dentro de un elemento. l = [{id, tipo}] guardados o [{blob, tipo}] nuevos */
const URLS_ADJ = [];
async function pintarAdjuntos(el, l, conBorrar) {
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < l.length; i++) {
    const a = l[i]; let blob = a.blob;
    if (!blob && a.id) { try { blob = (await ADJ.leer(a.id) || {}).blob; } catch (e) { blob = null; } }
    const d = document.createElement('div'); d.className = 'adj-it ' + a.tipo;
    if (!blob) d.innerHTML = `<span class="muted chico">${a.tipo === 'foto' ? '📷' : '🎤'} No está en este celular</span>`;
    else {
      const u = URL.createObjectURL(blob); URLS_ADJ.push(u);
      d.innerHTML = a.tipo === 'foto' ? `<img src="${u}" alt="Foto del pedido" data-ver="${u}">` : `<audio controls preload="metadata" src="${u}"></audio>`;
    }
    if (conBorrar) d.insertAdjacentHTML('beforeend', `<button type="button" class="ib adj-x" data-quitar="${i}" aria-label="Quitar">${ico('x')}</button>`);
    el.appendChild(d);
  }
  while (URLS_ADJ.length > 60) URL.revokeObjectURL(URLS_ADJ.shift());
}
document.addEventListener('click', e => {
  const v = e.target.closest('[data-ver]'); if (!v) return;
  modal('Foto del pedido', `<img src="${v.dataset.ver}" style="width:100%;border-radius:10px" alt="">`, '', 'ancho');
});

/* lo que dejó el service worker al compartir fotos o audios desde WhatsApp */
async function leerCompartidos() {
  try {
    const c = await caches.open('pedcompartido'), ks = (await c.keys()).sort((a, b) => +a.url.split('/').pop() - +b.url.split('/').pop()), out = [];
    for (const k of ks) {
      const r = await c.match(k), b = await r.blob(), nombre = decodeURIComponent(r.headers.get('X-Nombre') || ''), mime = b.type || r.headers.get('Content-Type') || '';
      const tipo = tipoArchivo(mime, nombre); if (tipo) out.push({ blob: b, tipo, mime, nombre });
    }
    await caches.delete('pedcompartido');
    return out;
  } catch (e) { return []; }
}

/* borra fotos/audios que ya no son de ningún pedido (pedido borrado). Espera 1 hora por si se tocó "Deshacer" */
async function limpiarAdjuntos() {
  try {
    const usados = new Set(); for (const p of DB.todos('pedidos')) for (const a of p.adj || []) usados.add(a.id);
    const limite = new Date(Date.now() - 3600e3).toISOString();
    await ADJ.recorrer((v, c) => { if (!usados.has(v.id) && (v.creado_iso || '') < limite) c.delete(); });
  } catch (e) { console.warn('limpiar adjuntos', e); }
}
async function espacioAdjuntos() {
  let n = 0, b = 0, ent = 0; const entregados = new Set(DB.todos('pedidos').filter(p => p.estado === 'ENTREGADO').map(p => p.id));
  try { await ADJ.recorrer(v => { n++; b += (v.blob && v.blob.size) || 0; if (entregados.has(v.pedido_id)) ent++; }); } catch (e) { /* */ }
  return { n, mb: Math.round(b / 1048576 * 10) / 10, entregados: ent };
}
async function borrarAdjuntosEntregados() {
  const ped = DB.todos('pedidos').filter(p => p.estado === 'ENTREGADO' && (p.adj || []).length);
  for (const p of ped) { for (const a of p.adj) await ADJ.borrar(a.id).catch(() => {}); p.adj = []; await DB.guardar('pedidos', p); }
  return ped.length;
}

/* ---------- contactos del celular (Chrome en Android) ---------- */
const hayContactos = () => !!(navigator.contacts && navigator.contacts.select);
async function elegirContactos(varios) {
  try {
    const l = await navigator.contacts.select(['name', 'tel'], { multiple: !!varios });
    return (l || []).map(c => ({ nombre: String((c.name || [])[0] || '').replace(/\s+/g, ' ').trim(), tel: String((c.tel || [])[0] || '').trim() })).filter(c => c.nombre || c.tel);
  } catch (e) { toast('No se pudo abrir la agenda del celular', true); return []; }
}
const digitosTel = t => String(t || '').replace(/\D/g, '').slice(-8);
function clientePorTel(tel) { const d = digitosTel(tel); return d.length >= 6 ? DB.todos('clientes').find(c => digitosTel(c.tel) === d) || null : null; }
