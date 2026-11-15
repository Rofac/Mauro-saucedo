/* Pedidos que llegan por WhatsApp: pendientes de cargar en la app del proveedor, cargados y entregados. */
'use strict';

const PROV = () => DB.cfg.proveedor || 'el proveedor';
const ESTADOS_P = { PENDIENTE: 'Falta cargar', CARGADO: 'Cargado', ENTREGADO: 'Entregado' };
const PILL_P = { PENDIENTE: 'mal', CARGADO: 'ok', ENTREGADO: 'info' };

/* ---------- datos ---------- */
const pedidosTodos = () => DB.todos('pedidos');
const pendientes = () => pedidosTodos().filter(p => p.estado === 'PENDIENTE').sort((a, b) => a.recibido.localeCompare(b.recibido));
const minutosDesde = s => Math.round((new Date() - new Date(s.replace(' ', 'T') + ':00')) / 60000);
function haceCuanto(s) {
  const m = minutosDesde(s); if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`; const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24); return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}
const atrasado = p => p.estado === 'PENDIENTE' && minutosDesde(p.recibido) >= (+DB.cfg.horas_alerta || 3) * 60;
function clientePorNombre(nombre) { const n = normal(nombre); return n ? DB.todos('clientes').find(c => normal(c.nombre) === n) || null : null; }
async function asegurarCliente(nombre, tel) {
  nombre = String(nombre || '').replace(/\s+/g, ' ').trim(); if (!nombre) throw new Error('Poné el nombre del cliente');
  let c = clientePorNombre(nombre);
  if (!c) { c = await DB.guardar('clientes', { nombre, tel: tel || '', direccion: '', notas: '' }); await DB.anotar('Cliente nuevo', nombre); }
  else if (tel && !c.tel) { c.tel = tel; await DB.guardar('clientes', c); }
  return c;
}
/* el mismo cliente con un texto igual (o casi) en los últimos 3 días */
function posiblesRepetidos(p) {
  const t = normal(p.texto).replace(/\s+/g, ' ').slice(0, 80); if (t.length < 4) return [];
  return pedidosTodos().filter(o => o.id !== p.id && o.cliente_id === p.cliente_id && Math.abs(diasEntre(o.recibido.slice(0, 10), p.recibido.slice(0, 10))) <= 3
    && normal(o.texto).replace(/\s+/g, ' ').slice(0, 80) === t);
}

/* Lo que llega al compartir desde WhatsApp. Un solo mensaje viene sólo con el texto.
   Varios mensajes vienen así: "[11:20, 15/11/2026] Juan Pérez: quiero 2 cajas…" (o "15/11/26 11:20 - Juan: …" en los chats exportados). */
function leerWhatsApp(txt) {
  txt = String(txt || '').replace(/\r/g, '').trim();
  const re = /^\[?(?:(\d{1,2}:\d{2})(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})|(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s*(\d{1,2}:\d{2})(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?)\]?\s*(?:-\s*)?([^:\n]{1,60}):\s?(.*)$/i;
  const lineas = txt.split('\n'), msgs = [];
  for (const l of lineas) {
    const m = l.match(re);
    if (m) {
      let hora = m[1] || m[8]; const pre = l.slice(0, l.indexOf(m[9])), hh = +hora.split(':')[0];
      if (/\d\s*p\.?\s?m/i.test(pre) && hh < 12) hora = (hh + 12) + hora.slice(hora.indexOf(':')); else if (/\d\s*a\.?\s?m/i.test(pre) && hh === 12) hora = '00' + hora.slice(2);
      const d = m[2] || m[5], mes = m[3] || m[6]; let a = m[4] || m[7]; if (a.length === 2) a = '20' + a;
      msgs.push({ fecha: `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`, hora: hora.padStart(5, '0'), quien: m[9].trim(), texto: m[10] });
    } else if (msgs.length) msgs[msgs.length - 1].texto += '\n' + l;
    else msgs.push({ texto: l });
  }
  if (!msgs.length || !msgs[0].quien) return { texto: txt };
  const quienes = [...new Set(msgs.map(x => x.quien))];
  return { cliente: quienes.length === 1 ? quienes[0] : '', fecha: msgs[0].fecha, hora: msgs[0].hora,
    texto: quienes.length === 1 ? msgs.map(x => x.texto.trim()).filter(Boolean).join('\n') : txt };
}

async function cambiarEstado(p, estado, extra = {}) {
  const antes = { estado: p.estado, cargado_en: p.cargado_en, entregado_en: p.entregado_en, nro: p.nro };
  Object.assign(p, extra, { estado });
  if (estado === 'PENDIENTE') { p.cargado_en = ''; p.entregado_en = ''; }
  if (estado === 'CARGADO') { p.cargado_en = p.cargado_en || ahora(); p.entregado_en = ''; }
  if (estado === 'ENTREGADO') { p.cargado_en = p.cargado_en || ahora(); p.entregado_en = ahora(); }
  await DB.guardar('pedidos', p);
  await DB.anotar('Pedido: ' + ESTADOS_P[estado], `${p.cliente} · recibido ${dmy(p.recibido)} ${p.recibido.slice(11)}`);
  return async () => { Object.assign(p, antes); await DB.guardar('pedidos', p); };
}
async function marcarCargado(p, luego) {
  try { const des = await cambiarEstado(p, 'CARGADO'); luego && luego(); toastDeshacer(`Pedido de ${p.cliente.split(' ')[0]} cargado en ${PROV()}`, des); } catch (e) { fallo(e); }
}

/* ---------- pantalla PEDIDOS ---------- */
let FP = { estado: 'PENDIENTE', periodo: 'todo', dia: hoy(), q: '' };
function rangoPeriodo(f) {
  const h = hoy();
  if (f.periodo === 'hoy') return [h, h]; if (f.periodo === 'ayer') return [sumarDias(h, -1), sumarDias(h, -1)];
  if (f.periodo === 'semana') return [sumarDias(h, -6), h]; if (f.periodo === 'mes') return [h.slice(0, 8) + '01', h];
  if (f.periodo === 'dia') return [f.dia, f.dia]; return ['0000', '9999'];
}
function filaPedido(p, conFecha) {
  const ls = p.texto.split('\n').filter(Boolean), q = typeof FP !== 'undefined' && ACTUAL === 'pedidos' ? FP.q : '';
  const conQ = q ? ls.filter(l => normal(q).split(/\s+/).some(w => w && normal(l).includes(w))) : [];      // al buscar, se ven los renglones que coinciden
  const atr = atrasado(p), primeras = (conQ.length ? conQ : ls).slice(0, 2).join(' · ');
  return `<div class="it ped ${atr ? 'atr' : ''}" data-p="${p.id}"><div class="av" style="font-size:12.5px;line-height:1.1;text-align:center">${conFecha ? `${dm(p.recibido)}<br>` : ''}${p.recibido.slice(11, 16)}</div>
    <div class="tx"><b>${esc(p.cliente)}${iconosAdj(p)}</b><small>${esc(primeras.slice(0, 110))}${primeras.length > 110 ? '…' : ''}</small>
      <small>${p.estado === 'PENDIENTE' ? `<span class="pill ${atr ? 'mal' : 'warn'}">${ico('pendiente')} Falta cargar · ${haceCuanto(p.recibido)}</span>` : `<span class="pill ${PILL_P[p.estado]}">${ico(p.estado === 'ENTREGADO' ? 'entregado' : 'cargado')} ${ESTADOS_P[p.estado]}${p.nro ? ' · N° ' + esc(p.nro) : ''}</span>`}
      ${p.importe ? ` <span class="pill">${money(p.importe)}</span>` : ''}${p.retiro ? ` <span class="pill info">${ico('camion')} ${p.retiro === hoy() ? 'hoy' : dm(p.retiro)}</span>` : ''}</small></div>
    ${p.estado === 'PENDIENTE' ? `<button class="btn chico acento" data-cargar="${p.id}" title="Ya lo cargué">${ico('check')} Cargado</button>` : ''}</div>`;
}
PANTALLAS.pedidos = async (main) => {
  titulo('Pedidos');
  const [d, h] = rangoPeriodo(FP), todos = pedidosTodos();
  const cuenta = e => todos.filter(p => (e === 'TODOS' || p.estado === e) && p.recibido.slice(0, 10) >= d && p.recibido.slice(0, 10) <= h && (!FP.q || coincide(p.cliente + ' ' + p.texto + ' ' + (p.nro || '') + ' ' + (p.nota || ''), FP.q))).length;
  let l = todos.filter(p => (FP.estado === 'TODOS' || p.estado === FP.estado) && p.recibido.slice(0, 10) >= d && p.recibido.slice(0, 10) <= h);
  if (FP.q) l = l.filter(p => coincide(p.cliente + ' ' + p.texto + ' ' + (p.nro || '') + ' ' + (p.nota || ''), FP.q));
  l.sort((a, b) => FP.estado === 'PENDIENTE' ? a.recibido.localeCompare(b.recibido) : b.recibido.localeCompare(a.recibido));
  const porDia = []; for (const p of l) { const f = p.recibido.slice(0, 10); if (!porDia.length || porDia[porDia.length - 1].f !== f) porDia.push({ f, l: [] }); porDia[porDia.length - 1].l.push(p); }
  main.innerHTML = `<div class="fila" style="margin-bottom:10px"><div class="buscar">${ico('buscar')}<input id="pqQ" type="search" placeholder="Buscar cliente, producto, N° de pedido…" value="${esc(FP.q)}"></div><button class="btn acento" id="pqPeg">${ico('copiar')} Pegar</button></div>
    <div class="tabsf" id="pqE">${[['PENDIENTE', 'Falta cargar'], ['CARGADO', 'Cargados'], ['ENTREGADO', 'Entregados'], ['TODOS', 'Todos']].map(([k, t]) => `<button data-e="${k}" class="${FP.estado === k ? 'act' : ''}">${t} <span class="pill ${k === 'PENDIENTE' && cuenta(k) ? 'mal' : ''}">${cuenta(k)}</span></button>`).join('')}</div>
    <div class="chips" id="pqPer" style="margin-bottom:12px">${[['todo', 'Todos los días'], ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', '7 días'], ['mes', 'Este mes']].map(([k, t]) => `<button data-per="${k}" class="${FP.periodo === k ? 'act' : ''}">${t}</button>`).join('')}
      <label class="btn chico ${FP.periodo === 'dia' ? 'pri' : ''}" style="margin:0;position:relative">${ico('agenda')} ${FP.periodo === 'dia' ? dmy(FP.dia) : 'Elegir día'}<input type="date" id="pqDia" value="${FP.dia}" style="position:absolute;inset:0;opacity:0"></label></div>
    ${porDia.map(g => `<div class="card" style="padding:4px 14px"><h2 style="font-size:14px;padding:10px 0 4px;color:var(--txt2)">${g.f === hoy() ? 'Hoy' : g.f === sumarDias(hoy(), -1) ? 'Ayer' : fechaLarga(g.f)} <span class="muted" style="font-weight:600">· ${g.l.length} pedido${g.l.length === 1 ? '' : 's'}</span></h2>
      <div class="lista">${g.l.map(p => filaPedido(p)).join('')}</div></div>`).join('') || `<div class="card">${vacio('pedido', FP.estado === 'PENDIENTE' && !FP.q ? `¡No hay nada pendiente de cargar! 🎉` : 'No hay pedidos con ese filtro')}</div>`}
    <p class="muted chico" style="text-align:center">Para guardar un pedido de WhatsApp: mantené apretado el mensaje → tocá <b>copiar</b> (los dos cuadraditos de arriba) → acá tocá <b>Pegar pedido</b>.</p>`;
  const re = () => PANTALLAS.pedidos(main);
  $('#pqPeg').onclick = () => pegarPedido(re);
  $('#pqQ').oninput = debounce(e => { FP.q = e.target.value; re().then(() => { const i = $('#pqQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300);
  $('#pqE').onclick = e => { const b = e.target.closest('[data-e]'); if (b) { FP.estado = b.dataset.e; re(); } };
  $('#pqPer').onclick = e => { const b = e.target.closest('[data-per]'); if (b) { FP.periodo = b.dataset.per; re(); } };
  $('#pqDia').onchange = e => { if (e.target.value) { FP.dia = e.target.value; FP.periodo = 'dia'; re(); } };
  main.onclick = e => {
    const c = e.target.closest('[data-cargar]'); if (c) { e.stopPropagation(); return marcarCargado(DB.get('pedidos', c.dataset.cargar), re); }
    const p = e.target.closest('[data-p]'); if (p) verPedido(DB.get('pedidos', p.dataset.p), re);
  };
};

/* ---------- ver un pedido ---------- */
function verPedido(p, luego) {
  if (!p) return;
  const c = DB.get('clientes', p.cliente_id), rep = posiblesRepetidos(p);
  const pasos = [['Recibido', p.recibido], [`Cargado en ${PROV()}`, p.cargado_en], ['Entregado', p.entregado_en]];
  const m = modal(`${ico('pedido')} Pedido de ${esc(p.cliente)}`, `
    <div class="ped-pasos">${pasos.map(([t, f]) => `<div class="${f ? 'si' : ''}"><i>${f ? ico('check') : ''}</i><b>${t}</b><small>${f ? `${f.slice(0, 10) === hoy() ? 'hoy' : dm(f)} ${f.slice(11, 16)}` : '—'}</small></div>`).join('')}</div>
    ${rep.length ? `<div class="estado-cuota warn" style="margin:10px 0"><div class="tx"><b>¿Repetido?</b> ${esc(p.cliente)} mandó un pedido igual el ${rep.map(o => dm(o.recibido) + ' ' + o.recibido.slice(11, 16) + ' (' + ESTADOS_P[o.estado].toLowerCase() + ')').join(', ')}.</div></div>` : ''}
    <div class="ped-texto">${esc(p.texto)}</div>${(p.adj || []).length ? '<div class="adj" id="vpAdj"></div>' : ''}
    <table class="t" style="margin-top:10px">${p.nro ? `<tr><td class="muted">N° de pedido en ${esc(PROV())}</td><td class="r"><b>${esc(p.nro)}</b></td></tr>` : ''}
      ${p.importe ? `<tr><td class="muted">Importe</td><td class="r"><b>${money(p.importe)}</b> <span class="pill ${p.cobrado ? 'ok' : 'warn'}">${p.cobrado ? 'pagó en el momento' : 'a cuenta'}</span></td></tr>` : ''}
      ${p.importe && !p.cobrado && saldoCliente(p.cliente_id) > 0.009 ? `<tr><td class="muted">${esc(p.cliente)} debe en total</td><td class="r"><b class="mal">${money(saldoCliente(p.cliente_id))}</b></td></tr>` : ''}${p.retiro ? `<tr><td class="muted">Retiro / entrega</td><td class="r"><b>${fechaLarga(p.retiro)}</b></td></tr>` : ''}
      ${c && c.tel ? `<tr><td class="muted">Teléfono</td><td class="r">${esc(c.tel)}</td></tr>` : ''}${p.nota ? `<tr><td class="muted">Nota</td><td class="r">${esc(p.nota)}</td></tr>` : ''}</table>
    <div class="fila" style="margin-top:12px"><button class="btn chico" id="vpCop">${ico('copiar')} Copiar el pedido</button>
      ${c && c.tel ? `<button class="btn chico" id="vpWa">${ico('wa')} WhatsApp</button>` : ''}<button class="btn chico" id="vpEd">${ico('lapiz')} Modificar</button><button class="btn chico rojo" id="vpBo">${ico('trash')} Borrar</button></div>`,
    `${p.estado !== 'PENDIENTE' ? `<button class="btn" id="vpPen">Volver a "falta cargar"</button>` : ''}
     ${p.estado === 'PENDIENTE' ? `<button class="btn acento" id="vpCar">${ico('check')} Ya lo cargué en ${esc(PROV())}</button>` : ''}
     ${p.estado === 'CARGADO' ? `<button class="btn pri" id="vpEnt">${ico('entregado')} Entregado</button>` : ''}`, 'ancho');
  if ((p.adj || []).length) pintarAdjuntos($('#vpAdj', m), p.adj);
  const fin = async (estado, msg, extra) => { try { const des = await cambiarEstado(p, estado, extra); m.cerrar(); luego && luego(); toastDeshacer(msg, des); } catch (e) { fallo(e); } };
  if ($('#vpCar', m)) $('#vpCar', m).onclick = async () => {
    const nro = await pedirTexto(`Cargado en ${PROV()}`, `N° de pedido en ${PROV()} (opcional, podés dejarlo vacío)`, p.nro || '');
    if (nro === null) return; fin('CARGADO', 'Pedido marcado como cargado', { nro: nro.trim() });
  };
  if ($('#vpEnt', m)) $('#vpEnt', m).onclick = () => fin('ENTREGADO', 'Pedido entregado');
  if ($('#vpPen', m)) $('#vpPen', m).onclick = () => fin('PENDIENTE', 'Volvió a "falta cargar"');
  $('#vpCop', m).onclick = async () => { try { await navigator.clipboard.writeText(p.texto); toast(`Copiado: pegalo en la app de ${PROV()}`); } catch (e) { toast('Mantené apretado el texto para copiarlo', true); } };
  if ($('#vpWa', m)) $('#vpWa', m).onclick = () => abrirWa(c.tel, `Hola ${p.cliente.split(' ')[0]}! ${p.estado === 'PENDIENTE' ? 'Recibí tu pedido 👍' : p.estado === 'CARGADO' ? 'Tu pedido ya está cargado 👍' : 'Tu pedido ya fue entregado. ¡Gracias!'}`);
  $('#vpEd', m).onclick = () => { m.cerrar(); editarPedido(p, luego); };
  $('#vpBo', m).onclick = async () => {
    if (!await confirmar(`¿Borrar el pedido de <b>${esc(p.cliente)}</b> del ${dmy(p.recibido)} ${p.recibido.slice(11, 16)}?`, 'Borrar', true)) return;
    try { const copia = Object.assign({}, p); await DB.borrar('pedidos', p.id); await DB.anotar('Pedido borrado', `${p.cliente} ${dmy(p.recibido)}`); m.cerrar(); luego && luego();
      toastDeshacer('Pedido borrado', async () => { await DB.guardar('pedidos', copia); }); } catch (e) { fallo(e); }
  };
}

/* ---------- pegar lo copiado en WhatsApp: abre el pedido nuevo ya escrito ---------- */
async function pegarPedido(luego) {
  if (DB.soloLectura) return toast(DB.mensajeBloqueo, true);
  let t = '';
  try { t = (await navigator.clipboard.readText()) || ''; } catch (e) { t = null; }
  if (t === null) { editarPedido({}, luego); return toast('Mantené apretado el cuadro "Pedido" y tocá Pegar', true); }
  if (!t.trim()) { editarPedido({}, luego); return toast('No hay nada copiado. En WhatsApp mantené apretado el mensaje y tocá el ícono de copiar', true); }
  const w = leerWhatsApp(t), rec = w.fecha && `${w.fecha} ${w.hora}` <= ahora() ? `${w.fecha} ${w.hora}` : ahora();
  editarPedido({ cliente: w.cliente || '', texto: w.texto, recibido: rec }, luego);
}

/* ---------- cargar o modificar un pedido ---------- */
function editarPedido(x, luego) {
  x = x || {};
  const nuevo = !x.id, rec = x.recibido || ahora(), c = x.cliente_id ? DB.get('clientes', x.cliente_id) : clientePorNombre(x.cliente);
  const clientes = DB.todos('clientes').slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const m = modal(nuevo ? `${ico('pedido')} Pedido nuevo` : 'Modificar pedido', `<div class="form">
    <div class="campo full"><label class="fila" style="justify-content:space-between">Cliente ${hayContactos() ? `<button type="button" class="btn chico" id="epCon">${ico('contactos')} De mis contactos</button>` : ''}</label><input id="ep_c" value="${esc(x.cliente || '')}" placeholder="Escribí o tocá un cliente de abajo" autocomplete="off" autocorrect="off" spellcheck="false">
      <div class="sug" id="epSug"></div></div>
    <div class="campo full"><label class="fila" style="justify-content:space-between">Pedido <button type="button" class="btn chico" id="epPeg">${ico('copiar')} Pegar lo copiado</button></label>
      <textarea id="ep_t" style="min-height:150px" placeholder="Lo que pidió: productos, cantidades…">${esc(x.texto || '')}</textarea></div>
    <div class="campo full"><label class="fila" style="justify-content:space-between">Fotos y audios <label class="btn chico" style="margin:0">${ico('clip')} Agregar<input type="file" id="epArch" accept="image/*,audio/*" multiple hidden></label></label>
      <div class="adj" id="epAdj"></div><small class="muted" id="epAdjV">${(x.adj || []).length || (x._nuevos || []).length ? '' : 'Si el pedido vino en una foto o un audio, compartilo desde WhatsApp a esta app, o agregalo acá.'}</small></div>
    <div class="campo"><label>Llegó el día</label><input type="date" id="ep_f" value="${rec.slice(0, 10)}"></div>
    <div class="campo"><label>A la hora</label><input type="time" id="ep_h" value="${rec.slice(11, 16)}"></div>
    <div class="campo"><label>Importe (opcional)</label>${campoMonto('id="ep_i"', x.importe || '')}</div>
    <div class="campo full" id="epCobBox"><label class="chk"><input type="checkbox" id="ep_cob" ${x.cobrado ? 'checked' : ''}> Me lo pagó en el momento (si no, queda en lo que me debe)</label></div>
    <div class="campo"><label>Retiro / entrega (opcional)</label><input type="date" id="ep_r" value="${esc(x.retiro || '')}"></div>
    <div class="campo full"><label>Teléfono del cliente (opcional)</label><input id="ep_tel" inputmode="tel" value="${esc(c ? c.tel : '')}"></div>
    <div class="campo full"><label>Nota</label><input id="ep_n" value="${esc(x.nota || '')}"></div>
    ${nuevo ? `<div class="campo full"><label class="chk"><input type="checkbox" id="ep_ya"> Ya lo cargué en ${esc(PROV())}</label></div>` : ''}</div>
    <div id="epRep"></div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="epOk">${ico('check')} Guardar</button>`, 'ancho');
  /* fotos y audios: los que ya tenía (quedan), los que se agregan (nuevos) y los que se quitan */
  const quedan = (x.adj || []).slice(), nuevos = (x._nuevos || []).slice(), quitados = []; delete x._nuevos;
  const pintarA = () => { pintarAdjuntos($('#epAdj', m), [...quedan, ...nuevos], true); $('#epAdjV', m).hidden = !!(quedan.length + nuevos.length); };
  pintarA();
  $('#epAdj', m).onclick = e => { const b = e.target.closest('[data-quitar]'); if (!b) return; const i = +b.dataset.quitar; if (i < quedan.length) quitados.push(...quedan.splice(i, 1)); else nuevos.splice(i - quedan.length, 1); pintarA(); };
  $('#epArch', m).onchange = e => { for (const f of e.target.files) { const tipo = tipoArchivo(f.type, f.name); if (tipo) nuevos.push({ blob: f, tipo, mime: f.type, nombre: f.name }); else toast('Sólo fotos o audios', true); } e.target.value = ''; pintarA(); };
  if ($('#epCon', m)) $('#epCon', m).onclick = async () => {
    const [k] = await elegirContactos(false); if (!k) return;
    const ya = clientePorTel(k.tel) || clientePorNombre(k.nombre);
    $('#ep_c', m).value = ya ? ya.nombre : k.nombre; $('#ep_tel', m).value = k.tel || (ya && ya.tel) || ''; pintarSug();
  };
  $('#ep_c', m).onchange = () => { const k = clientePorNombre(val('ep_c', m)); if (k && k.tel && !val('ep_tel', m)) $('#ep_tel', m).value = k.tel; };
  /* sugerencias de clientes debajo del nombre: los últimos que pidieron, o los que coinciden con lo que va escribiendo (en cualquier parte del nombre o el teléfono) */
  const ultimo = {}; for (const o of pedidosTodos()) if ((ultimo[o.cliente_id] || '') < o.recibido) ultimo[o.cliente_id] = o.recibido;
  const pintarSug = () => {
    const q = val('ep_c', m), exacto = clientePorNombre(q);
    let l = q ? clientes.filter(k => coincide(k.nombre + ' ' + (k.tel || ''), q)) : clientes.slice().sort((a, b) => (ultimo[b.id] || '').localeCompare(ultimo[a.id] || '') || a.nombre.localeCompare(b.nombre, 'es'));
    if (exacto) l = l.filter(k => k.id !== exacto.id);
    $('#epSug', m).innerHTML = l.slice(0, 8).map(k => `<button type="button" class="chip-cli" data-cli="${k.id}">${esc(k.nombre)}</button>`).join('')
      + (q && !exacto && !l.length ? `<span class="muted chico">Cliente nuevo: se crea al guardar</span>` : '');
  };
  pintarSug();
  $('#ep_c', m).addEventListener('input', pintarSug);
  $('#epSug', m).onclick = e => { const b = e.target.closest('[data-cli]'); if (!b) return; const k = DB.get('clientes', b.dataset.cli);
    $('#ep_c', m).value = k.nombre; if (k.tel) $('#ep_tel', m).value = k.tel; pintarSug(); if (!$('#ep_t', m).value.trim()) $('#ep_t', m).focus(); };
  $('#epPeg', m).onclick = async () => {
    try { const t = await navigator.clipboard.readText(); if (!t.trim()) return toast('No hay nada copiado', true); const w = leerWhatsApp(t);
      $('#ep_t', m).value = w.texto; if (w.cliente && !val('ep_c', m)) $('#ep_c', m).value = w.cliente; if (w.fecha) { $('#ep_f', m).value = w.fecha; $('#ep_h', m).value = w.hora; } }
    catch (e) { toast('No pude leer lo copiado: mantené apretado el cuadro y tocá "Pegar"', true); }
  };
  if (!nuevo || x.texto) setTimeout(() => (val('ep_c', m) ? $('#ep_t', m) : $('#ep_c', m)).focus(), 80); else setTimeout(() => $('#ep_c', m).focus(), 80);
  $('#epOk', m).onclick = async () => {
    const bt = $('#epOk', m); if (bt.disabled) return; bt.disabled = true;      // que no se guarde dos veces si toca rápido (achicar la foto tarda un poquito)
    try {
      const nombre = val('ep_c', m), escrito = $('#ep_t', m).value.trim().replace(/^Pedido por (foto y audio|foto|audio)$/, ''), hayAdj = quedan.length + nuevos.length > 0, f = val('ep_f', m), hh = val('ep_h', m) || '00:00', imp = $('#ep_i', m).value.trim();
      if (!nombre) throw new Error('Poné el nombre del cliente'); if (!escrito && !hayAdj) throw new Error('Escribí o pegá el pedido (o agregá la foto o el audio)');
      const texto = escrito || textoPorAdjuntos([...quedan, ...nuevos]); if (!f) throw new Error('Poné el día en que llegó');
      if (imp && (isNaN(aNum(imp)) || aNum(imp) < 0)) throw new Error('Revisá el importe');
      const recibido = `${f} ${hh}`;
      if (recibido > ahora()) throw new Error('La fecha y hora no pueden ser después de ahora');
      const cli = await asegurarCliente(nombre, val('ep_tel', m));
      if (val('ep_tel', m) && cli.tel !== val('ep_tel', m)) { cli.tel = val('ep_tel', m); await DB.guardar('clientes', cli); }
      const prueba = Object.assign({}, x, { cliente_id: cli.id, texto, recibido });
      const rep = escrito ? posiblesRepetidos(prueba) : [];
      if (rep.length && nuevo && !await confirmar(`<b>${esc(cli.nombre)}</b> ya mandó un pedido igual el ${rep.map(o => dm(o.recibido) + ' ' + o.recibido.slice(11, 16) + ' (' + ESTADOS_P[o.estado].toLowerCase() + ')').join(', ')}.<br><br>¿Lo guardo igual?`, 'Sí, guardar')) return;
      const ya = nuevo && $('#ep_ya', m).checked;
      Object.assign(x, { cliente_id: cli.id, cliente: cli.nombre, texto, recibido, importe: imp ? r2(aNum(imp)) : 0, cobrado: !!imp && $('#ep_cob', m).checked, retiro: val('ep_r', m), nota: val('ep_n', m) });
      if (nuevo) Object.assign(x, { estado: ya ? 'CARGADO' : 'PENDIENTE', cargado_en: ya ? ahora() : '', entregado_en: '', nro: '' });
      await DB.guardar('pedidos', x);
      if (nuevos.length || quitados.length) {
        const adj = quedan.slice();
        for (const a of nuevos) { const blob = a.tipo === 'foto' ? await achicarFoto(a.blob) : a.blob;
          adj.push({ id: await ADJ.guardar({ pedido_id: x.id, tipo: a.tipo, mime: blob.type || a.mime || '', nombre: a.nombre || '', blob, creado_iso: new Date().toISOString() }), tipo: a.tipo }); }
        x.adj = adj; await DB.guardar('pedidos', x);
        for (const a of quitados) await ADJ.borrar(a.id).catch(() => {});
      }
      await DB.anotar(nuevo ? 'Pedido nuevo' : 'Pedido modificado', `${cli.nombre} · ${dmy(recibido)} ${hh}`);
      m.cerrar(); toast(nuevo ? (ya ? 'Pedido guardado como cargado' : 'Pedido guardado: falta cargarlo') : 'Pedido modificado'); luego && luego();
    } catch (e) { fallo(e); } finally { bt.disabled = false; }
  };
  return m;
}
