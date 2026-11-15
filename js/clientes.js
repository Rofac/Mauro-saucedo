/* Clientes: se crean solos con el primer pedido. Ficha con teléfono, dirección e historial. */
'use strict';

let Q_CLI = '';
PANTALLAS.clientes = async (main) => {
  titulo('Clientes');
  const ped = DB.todos('pedidos'), info = {};
  for (const p of ped) { const i = info[p.cliente_id] = info[p.cliente_id] || { n: 0, pend: 0, ult: '' }; i.n++; if (p.estado === 'PENDIENTE') i.pend++; if (p.recibido > i.ult) i.ult = p.recibido; }
  let l = DB.todos('clientes').slice(); if (Q_CLI) l = l.filter(c => coincide(c.nombre + ' ' + (c.tel || '') + ' ' + (c.direccion || ''), Q_CLI));
  l.sort((a, b) => ((info[b.id] || {}).ult || '').localeCompare((info[a.id] || {}).ult || '') || a.nombre.localeCompare(b.nombre, 'es'));
  main.innerHTML = `<div class="fila" style="margin-bottom:12px"><div class="buscar">${ico('buscar')}<input id="clQ" type="search" placeholder="Buscar cliente…" value="${esc(Q_CLI)}"></div><button class="btn acento" id="clN">${ico('plus')} Cliente</button></div>
    <div class="card" style="padding:4px 14px"><div class="lista">${l.map(c => { const i = info[c.id] || { n: 0, pend: 0, ult: '' };
      return `<div class="it" data-c="${c.id}">${avatar(c)}<div class="tx"><b>${esc(c.nombre)}</b><small>${i.n} pedido${i.n === 1 ? '' : 's'}${i.ult ? ' · último ' + dm(i.ult) : ''}${c.tel ? ' · ' + esc(c.tel) : ''}</small></div>${i.pend ? `<span class="pill mal">${i.pend} sin cargar</span>` : ''}${saldoCliente(c.id) > 0.009 ? `<span class="pill warn">debe ${money(saldoCliente(c.id))}</span>` : ''}</div>`; }).join('') || vacio('alumnos', 'Los clientes se agregan solos al guardar el primer pedido')}</div></div>`;
  $('#clQ').oninput = debounce(e => { Q_CLI = e.target.value; PANTALLAS.clientes(main).then(() => { const i = $('#clQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300);
  $('#clN').onclick = () => editarCliente({}, () => PANTALLAS.clientes(main));
  main.onclick = e => { const c = e.target.closest('[data-c]'); if (c) ir('ficha', +c.dataset.c, true); };
};

PANTALLAS.ficha = async (main, id) => {
  const c = DB.get('clientes', id); if (!c) return ir('clientes');
  titulo(c.nombre);
  const ps = DB.todos('pedidos').filter(p => p.cliente_id === c.id).sort((a, b) => b.recibido.localeCompare(a.recibido));
  const imp = r2(ps.filter(p => p.recibido.slice(0, 7) === hoy().slice(0, 7)).reduce((s, p) => s + (p.importe || 0), 0));
  main.innerHTML = `<div class="card"><div class="ficha-cab">${avatar(c, true)}<div class="tx"><h2>${esc(c.nombre)}</h2><div class="muted">${c.tel ? esc(c.tel) : 'Sin teléfono'}${c.direccion ? ' · ' + esc(c.direccion) : ''}</div>${c.notas ? `<div class="chico" style="margin-top:4px">${esc(c.notas)}</div>` : ''}</div></div>
      <div class="fila" style="margin-top:12px">${c.tel ? `<button class="btn" id="fiWa">${ico('wa')} WhatsApp</button>` : ''}<button class="btn" id="fiEd">${ico('lapiz')} Modificar</button><button class="btn acento" id="fiP">${ico('plus')} Pedido</button></div></div>
    <div class="kpis"><div class="kpi"><small>Pedidos</small><b>${ps.length}</b><div class="sub">${ps.filter(p => p.estado === 'PENDIENTE').length} sin cargar</div></div>
      <div class="kpi" id="fiCta" style="cursor:pointer"><small>Me debe</small><b class="${saldoCliente(c.id) > 0.009 ? 'mal' : ''}">${money(Math.max(0, saldoCliente(c.id)))}</b><div class="sub">${c.promete && saldoCliente(c.id) > 0.009 ? 'paga el ' + dm(c.promete) : 'ver cuenta ›'}</div></div>
      <div class="kpi"><small>Este mes</small><b>${ps.filter(p => p.recibido.slice(0, 7) === hoy().slice(0, 7)).length}</b><div class="sub">${imp ? money(imp) : '&nbsp;'}</div></div></div>
    <div class="card" style="padding:4px 14px"><h2 style="padding-top:10px">${ico('pedido')} Pedidos</h2><div class="lista">${ps.map(p => filaPedido(p, true)).join('') || '<p class="muted">Todavía no hay pedidos</p>'}</div></div>`;
  const re = () => PANTALLAS.ficha(main, id);
  if ($('#fiWa')) $('#fiWa').onclick = () => abrirWa(c.tel, `Hola ${c.nombre.split(' ')[0]}!`);
  $('#fiEd').onclick = () => editarCliente(c, re);
  $('#fiCta').onclick = () => cuentaCliente(c, re);
  $('#fiP').onclick = () => editarPedido({ cliente: c.nombre, cliente_id: c.id }, re);
  main.onclick = e => {
    const k = e.target.closest('[data-cargar]'); if (k) { e.stopPropagation(); return marcarCargado(DB.get('pedidos', k.dataset.cargar), re); }
    const p = e.target.closest('[data-p]'); if (p) verPedido(DB.get('pedidos', p.dataset.p), re);
  };
};

function editarCliente(c, luego) {
  const m = modal(c.id ? 'Modificar cliente' : 'Cliente nuevo', `<div class="form">
    <div class="campo full"><label>Nombre</label><input id="cl_n" value="${esc(c.nombre || '')}" autofocus></div>
    <div class="campo"><label>Teléfono</label><input id="cl_t" inputmode="tel" value="${esc(c.tel || '')}"></div>
    <div class="campo"><label>Dirección</label><input id="cl_d" value="${esc(c.direccion || '')}"></div>
    <div class="campo full"><label>Notas</label><textarea id="cl_o">${esc(c.notas || '')}</textarea></div></div>`,
    `${c.id ? `<button class="btn rojo" id="clB">${ico('trash')}</button>` : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="clOk">${ico('check')} Guardar</button>`);
  $('#clOk', m).onclick = async () => { try {
    const n = val('cl_n', m).replace(/\s+/g, ' '); if (!n) throw new Error('Poné el nombre');
    if (DB.todos('clientes').some(k => k.id !== c.id && normal(k.nombre) === normal(n))) throw new Error('Ya hay un cliente con ese nombre');
    const viejo = c.nombre; Object.assign(c, { nombre: n, tel: val('cl_t', m), direccion: val('cl_d', m), notas: $('#cl_o', m).value.trim() });
    await DB.guardar('clientes', c);
    if (viejo && viejo !== n) for (const p of DB.todos('pedidos').filter(p => p.cliente_id === c.id)) { p.cliente = n; await DB.guardar('pedidos', p); }
    m.cerrar(); toast('Guardado'); luego && luego(); } catch (e) { fallo(e); } };
  if ($('#clB', m)) $('#clB', m).onclick = async () => {
    const n = DB.todos('pedidos').filter(p => p.cliente_id === c.id).length + DB.todos('movs').filter(x => x.cliente_id === c.id).length;
    if (n) return toast(`No se puede borrar: tiene ${n} pedido${n === 1 ? '' : 's'} o pagos. Borrá primero sus pedidos y pagos.`, true);
    if (!await confirmar(`¿Borrar a <b>${esc(c.nombre)}</b>?`, 'Borrar', true)) return;
    try { await DB.borrar('clientes', c.id); await DB.anotar('Cliente borrado', c.nombre); m.cerrar(); toast('Cliente borrado'); ir('clientes'); } catch (e) { fallo(e); }
  };
}
