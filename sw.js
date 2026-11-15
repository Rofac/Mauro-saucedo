/* Guarda la app en el celular para que abra sin internet. Al cambiar VERSION se actualiza. */
const VERSION = 'ped-1.1.1';
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/db.js', 'js/lic.js', 'js/ui.js', 'js/adjuntos.js', 'js/pedidos.js', 'js/cuentas.js', 'js/calendario.js', 'js/gastos.js', 'js/clientes.js', 'js/inicio.js', 'js/config.js', 'js/legal.js', 'js/main.js',
  'img/logo.png', 'img/favicon.png', 'img/icono-192.png', 'img/icono-512.png', 'img/icono-maskable.png', 'img/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
/* sólo se borran las versiones viejas DE ESTA APP (las otras apps de rofac.github.io comparten el mismo lugar) */
const PREFIJO = VERSION.split('-')[0] + '-';
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIJO) && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* si no está guardado y la señal es mala, no se queda colgada esperando: a los 8 segundos usa lo que haya */
const conTiempo = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(() => ok(null), ms))]);
/* primero lo guardado (abre al instante y sin internet); si hay internet, se actualiza de fondo para la próxima vez */
/* "Compartir" desde WhatsApp con fotos o audios: se guardan un momento y se abre la app con el pedido nuevo */
async function recibirCompartido(req) {
  const dest = new URL('./?compartido=1', self.registration.scope);
  try {
    const f = await req.formData(), c = await caches.open('pedcompartido');
    for (const k of await c.keys()) await c.delete(k);
    let i = 0;
    for (const a of f.getAll('archivos')) {
      if (!a || typeof a === 'string') continue;
      await c.put(new Request(new URL('./compartido/' + (i++), self.registration.scope).href), new Response(a, { headers: { 'Content-Type': a.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(a.name || '') } }));
    }
    for (const k of ['title', 'text', 'url']) if (f.get(k)) dest.searchParams.set(k, f.get(k));
    if (i) dest.searchParams.set('archivos', i);
  } catch (e) { /* si falla, igual abre la app */ }
  return Response.redirect(dest.href, 303);
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.origin === location.origin && u.pathname.endsWith('/compartir')) { e.respondWith(recibirCompartido(e.request)); return; }
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const g = await c.match(e.request, { ignoreSearch: true });
    const red = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (g) return g;
    const r = await conTiempo(red, 8000);
    return r || (await c.match('index.html')) || (await red) || Response.error();
  }));
});
