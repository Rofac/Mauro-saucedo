/* Cuentas: quién me debe (cuenta de cada cliente) y qué tengo que pagar y cuándo (vencimientos). */
'use strict';

/* ---------- me deben ----------
   Debe = pedidos con importe que no se cobraron en el momento + lo que se anotó como fiado − lo que pagó. */
function saldoCliente(id) {
  const ped = DB.todos('pedidos').filter(p => p.cliente_id === id && p.importe && !p.cobrado).reduce((s, p) => s + p.importe, 0);
  const mv = DB.todos('movs').filter(x => x.cliente_id === id).reduce((s, x) => s + (x.tipo === 'COBRO' ? -x.monto : x.monto), 0);
  return r2(ped + mv);
}
function deudores() {
  return DB.todos('clientes').map(c => ({ c, saldo: saldoCliente(c.id) })).filter(x => Math.abs(x.saldo) > 0.009).sort((a, b) => b.saldo - a.saldo);
}
function movimientosCliente(id) {
  const l = DB.todos('pedidos').filter(p => p.cliente_id === id && p.importe).map(p => ({ fecha: p.recibido.slice(0, 10), t: 'Pedido' + (p.cobrado ? ' (pagó en el momento)' : ''), debe: p.cobrado ? 0 : p.importe, pedido: p.id }));
  for (const x of DB.todos('movs').filter(x => x.cliente_id === id)) l.push({ fecha: x.fecha, t: x.tipo === 'COBRO' ? `Pagó${x.medio ? ' (' + x.medio + ')' : ''}` : 'Fiado / anotado', debe: x.tipo === 'COBRO' ? -x.monto : x.monto, nota: x.nota, mov: x.id });
  l.sort((a, b) => a.fecha.localeCompare(b.fecha)); let s = 0; for (const x of l) { s = r2(s + x.debe); x.saldo = s; }
  return l.reverse();
}

/* ---------- tengo que pagar ---------- */
const aPagar = () => DB.todos('pagar').filter(x => !x.pagado).sort((a, b) => a.vence.localeCompare(b.vence));
const vencimientosDe = f => DB.todos('pagar').filter(x => x.vence === f);
const promesasDe = f => DB.todos('clientes').filter(c => c.promete === f && saldoCliente(c.id) > 0.009);

let TAB_CU = 'deben';
PANTALLAS.cuentas = async (main) => {
  titulo('Cuentas');
  const dd = deudores(), total = r2(dd.filter(x => x.saldo > 0).reduce((s, x) => s + x.saldo, 0));
  const ap = aPagar(), totalAp = r2(ap.reduce((s, x) => s + x.monto, 0)), venc = ap.filter(x => x.vence < hoy()), semana = ap.filter(x => x.vence <= sumarDias(hoy(), 7));
  let cuerpo;
  if (TAB_CU === 'deben') {
    cuerpo = `<div class="kpis"><div class="kpi oscuro"><small>Me deben</small><b>${money(total)}</b><div class="sub">${dd.filter(x => x.saldo > 0).length} cliente${dd.filter(x => x.saldo > 0).length === 1 ? '' : 's'}</div></div>
      <div class="kpi"><small>Dijeron que pagan esta semana</small><b>${dd.filter(x => x.saldo > 0 && x.c.promete && x.c.promete <= sumarDias(hoy(), 7)).length}</b><div class="sub">&nbsp;</div></div></div>
      <div class="fila" style="margin-bottom:14px"><button class="btn acento" id="cuCob">${ico('check')} Registrar un pago</button><button class="btn" id="cuFia">${ico('plus')} Anotar fiado</button></div>
      <div class="card" style="padding:4px 14px"><div class="lista">${dd.map(({ c, saldo }) => `<div class="it" data-cc="${c.id}">${avatar(c)}<div class="tx"><b>${esc(c.nombre)}</b>
        <small>${saldo < 0 ? 'Tiene a favor' : c.promete ? `Dijo que paga el <b class="${c.promete < hoy() ? 'mal' : ''}">${dm(c.promete)}</b>` : 'Sin fecha de pago'}</small></div><b class="num ${saldo > 0 ? 'mal' : 'ok'}">${money(Math.abs(saldo))}</b></div>`).join('') || vacio('check', 'Nadie te debe nada 🎉')}</div></div>
      <p class="muted chico">Lo que debe cada cliente sale de los pedidos con importe que no pagó en el momento, más lo que anotes como fiado, menos lo que te pagó.</p>`;
  } else {
    const pagados = DB.todos('pagar').filter(x => x.pagado).sort((a, b) => b.pagado.localeCompare(a.pagado)).slice(0, 15);
    cuerpo = `<div class="kpis"><div class="kpi oscuro"><small>Tengo que pagar</small><b>${money(totalAp)}</b><div class="sub">${ap.length} pendiente${ap.length === 1 ? '' : 's'}</div></div>
      <div class="kpi ${venc.length ? 'mal-k' : ''}"><small>Vencidos</small><b>${venc.length}</b><div class="sub">${semana.length - venc.length} vencen esta semana</div></div></div>
      <div class="fila" style="margin-bottom:14px"><button class="btn acento ancho" id="cuApN">${ico('plus')} Anotar algo para pagar</button></div>
      <div class="card" style="padding:4px 14px"><div class="lista">${ap.map(filaPagar).join('') || vacio('check', 'No tenés nada pendiente de pagar')}</div></div>
      ${pagados.length ? `<div class="card" style="padding:4px 14px"><h2 style="padding-top:10px;font-size:15px">Pagados</h2><div class="lista">${pagados.map(filaPagar).join('')}</div></div>` : ''}`;
  }
  main.innerHTML = `<div class="tabsf" id="cuT">${[['deben', `Me deben <span class="pill ${total > 0 ? 'mal' : ''}">${money(total)}</span>`], ['pagar', `Tengo que pagar <span class="pill ${venc.length ? 'mal' : semana.length ? 'warn' : ''}">${ap.length}</span>`]].map(([k, t]) => `<button data-t="${k}" class="${TAB_CU === k ? 'act' : ''}">${t}</button>`).join('')}</div>${cuerpo}`;
  const re = () => PANTALLAS.cuentas(main);
  $('#cuT').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { TAB_CU = b.dataset.t; re(); } };
  if ($('#cuCob')) $('#cuCob').onclick = () => movCliente(null, 'COBRO', re);
  if ($('#cuFia')) $('#cuFia').onclick = () => movCliente(null, 'CARGO', re);
  if ($('#cuApN')) $('#cuApN').onclick = () => editarPagar({}, re);
  main.onclick = e => {
    const c = e.target.closest('[data-cc]'); if (c) return cuentaCliente(DB.get('clientes', c.dataset.cc), re);
    const pg = e.target.closest('[data-pagar]'); if (pg) { e.stopPropagation(); return pagarYa(DB.get('pagar', pg.dataset.pagar), re); }
    const a = e.target.closest('[data-ap]'); if (a) return editarPagar(DB.get('pagar', a.dataset.ap), re);
  };
};
function filaPagar(x) {
  const d = diasEntre(hoy(), x.vence), cuando = x.pagado ? `Pagado el ${dm(x.pagado)}` : d < 0 ? `Venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'Vence HOY' : d === 1 ? 'Vence mañana' : `Vence el ${DIAS_C[diaSemana(x.vence)]} ${dm(x.vence)}`;
  return `<div class="it" data-ap="${x.id}" style="${x.pagado ? 'opacity:.6' : ''}"><div class="av" style="font-size:12px;line-height:1.1;text-align:center">${dm(x.vence)}</div>
    <div class="tx"><b>${esc(x.a)}</b><small>${esc(x.concepto || '')}${x.concepto ? ' · ' : ''}<span class="${!x.pagado && d < 0 ? 'mal' : !x.pagado && d <= 2 ? 'warn-t' : ''}">${cuando}</span></small></div>
    <b class="num">${money(x.monto)}</b>${x.pagado ? '' : `<button class="btn chico acento" data-pagar="${x.id}">Pagué</button>`}</div>`;
}

/* ---------- cuenta de un cliente ---------- */
function cuentaCliente(c, luego) {
  const s = saldoCliente(c.id), l = movimientosCliente(c.id);
  const m = modal(`${esc(c.nombre)}`, `<div class="estado-cuota ${s > 0 ? 'mal' : 'ok'}"><div class="tx"><b>${s > 0 ? 'Te debe ' + money(s) : s < 0 ? 'Tiene a favor ' + money(-s) : 'No debe nada'}</b>
      ${s > 0 ? `<small>${c.promete ? `Dijo que paga el ${fechaLarga(c.promete)}` : 'Sin fecha de pago'}</small>` : ''}</div></div>
    ${s > 0 ? `<div class="fila" style="margin:10px 0"><label class="sp">Dijo que paga el<input type="date" id="ccPr" value="${esc(c.promete || '')}"></label><button class="btn chico" id="ccPrOk" style="align-self:flex-end">Guardar fecha</button></div>` : ''}
    <table class="t" style="margin-top:8px"><tr><th>Fecha</th><th>Qué</th><th class="r">Importe</th><th class="r">Saldo</th></tr>
      ${l.map(x => `<tr ${x.mov ? `data-mv="${x.mov}" style="cursor:pointer"` : x.pedido ? `data-vp="${x.pedido}" style="cursor:pointer"` : ''}><td class="chico">${dm(x.fecha)}</td><td>${esc(x.t)}${x.nota ? `<div class="chico muted">${esc(x.nota)}</div>` : ''}</td>
        <td class="r ${x.debe < 0 ? 'ok' : ''}">${x.debe ? (x.debe < 0 ? '−' : '') + money(Math.abs(x.debe)) : '—'}</td><td class="r"><b>${money(x.saldo)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin movimientos</td></tr>'}</table>
    <p class="muted chico">Tocá un pago o un fiado para modificarlo o borrarlo.</p>`,
    `${c.tel && s > 0 ? `<button class="btn" id="ccWa">${ico('wa')} Recordarle</button>` : ''}<button class="btn" id="ccF">${ico('plus')} Fiado</button><button class="btn acento" id="ccC">${ico('check')} Pagó</button>`, 'ancho');
  const otra = () => { m.cerrar(); luego && luego(); cuentaCliente(DB.get('clientes', c.id), luego); };
  $('#ccC', m).onclick = () => { m.cerrar(); movCliente(c, 'COBRO', otra); };
  $('#ccF', m).onclick = () => { m.cerrar(); movCliente(c, 'CARGO', otra); };
  if ($('#ccWa', m)) $('#ccWa', m).onclick = () => abrirWa(c.tel, `Hola ${c.nombre.split(' ')[0]}! Te paso el saldo de tu cuenta: ${money(s)}. Gracias!`);
  if ($('#ccPrOk', m)) $('#ccPrOk', m).onclick = async () => { try { c.promete = val('ccPr', m); await DB.guardar('clientes', c); toast('Fecha guardada: aparece en el calendario'); otra(); } catch (e) { fallo(e); } };
  m.onclick = e => {
    const mv = e.target.closest('[data-mv]'); if (mv) { m.cerrar(); return movCliente(c, null, otra, DB.get('movs', mv.dataset.mv)); }
    const vp = e.target.closest('[data-vp]'); if (vp) { m.cerrar(); return verPedido(DB.get('pedidos', vp.dataset.vp), otra); }
  };
}
/* pago de un cliente (COBRO) o algo que se le fió aparte de los pedidos (CARGO) */
function movCliente(c, tipo, luego, x) {
  x = x || { tipo, fecha: hoy() }; tipo = x.tipo;
  const clientes = DB.todos('clientes').slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const m = modal(x.id ? (tipo === 'COBRO' ? 'Modificar pago' : 'Modificar fiado') : tipo === 'COBRO' ? `${ico('check')} Registrar un pago` : `${ico('plus')} Anotar fiado`, `<div class="form">
    <div class="campo full"><label>Cliente</label><input id="mv_c" list="mvCl" value="${esc(c ? c.nombre : '')}" autocomplete="off"><datalist id="mvCl">${clientes.map(k => `<option value="${esc(k.nombre)}">`).join('')}</datalist></div>
    <div class="campo"><label>${tipo === 'COBRO' ? 'Cuánto pagó' : 'Importe'}</label>${campoMonto('id="mv_m"', x.monto ?? '')}</div>
    <div class="campo"><label>Día</label><input type="date" id="mv_f" value="${esc(x.fecha)}"></div>
    ${tipo === 'COBRO' ? `<div class="campo"><label>Cómo pagó</label><select id="mv_p">${opciones(DB.cfg.medios || ['Efectivo'], x.medio)}</select></div>` : ''}
    <div class="campo ${tipo === 'COBRO' ? '' : 'full'}"><label>Nota</label><input id="mv_n" value="${esc(x.nota || '')}"></div></div><p class="chico" id="mvSal" style="font-weight:800"></p>`,
    `${x.id ? `<button class="btn rojo" id="mvB">${ico('trash')}</button>` : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="mvOk">${ico('check')} Guardar</button>`);
  const sal = () => { const k = clientePorNombre(val('mv_c', m)); $('#mvSal', m).textContent = k ? `${k.nombre} debe ${money(saldoCliente(k.id))}${x.id ? ' (contando esto)' : ''}` : ''; };
  $('#mv_c', m).oninput = sal; sal(); setTimeout(() => (c ? $('#mv_m', m) : $('#mv_c', m)).focus(), 80);
  $('#mvOk', m).onclick = async () => { try {
    const k = clientePorNombre(val('mv_c', m)), v = aNum($('#mv_m', m).value);
    if (!k) throw new Error(val('mv_c', m) ? 'No existe ese cliente: elegilo de la lista' : 'Elegí el cliente');
    if (isNaN(v) || v <= 0) throw new Error('Poné el importe'); if (!val('mv_f', m)) throw new Error('Poné el día');
    const nuevo = !x.id;
    await DB.guardar('movs', Object.assign(x, { cliente_id: k.id, monto: r2(v), fecha: val('mv_f', m), medio: tipo === 'COBRO' ? val('mv_p', m) : '', nota: val('mv_n', m) }));
    if (tipo === 'COBRO' && saldoCliente(k.id) <= 0.009 && k.promete) { k.promete = ''; await DB.guardar('clientes', k); }
    await DB.anotar(tipo === 'COBRO' ? (nuevo ? 'Pago de cliente' : 'Pago modificado') : (nuevo ? 'Fiado anotado' : 'Fiado modificado'), `${k.nombre} ${money(v)}`);
    m.cerrar(); toast(tipo === 'COBRO' ? `Pago guardado. ${k.nombre} ${saldoCliente(k.id) > 0.009 ? 'debe ' + money(saldoCliente(k.id)) : 'no debe nada'}` : 'Fiado anotado'); luego && luego(); } catch (e) { fallo(e); } };
  if ($('#mvB', m)) $('#mvB', m).onclick = async () => {
    if (!await confirmar(`¿Borrar este ${tipo === 'COBRO' ? 'pago' : 'fiado'} de ${money(x.monto)}?`, 'Borrar', true)) return;
    try { const copia = Object.assign({}, x); await DB.borrar('movs', x.id); await DB.anotar(tipo === 'COBRO' ? 'Pago borrado' : 'Fiado borrado', money(x.monto)); m.cerrar(); luego && luego();
      toastDeshacer('Borrado', async () => { await DB.guardar('movs', copia); }); } catch (e) { fallo(e); }
  };
}

/* ---------- lo que tengo que pagar ---------- */
function editarPagar(x, luego) {
  const quienes = [...new Set([PROV(), ...DB.todos('pagar').map(p => p.a)])];
  const m = modal(x.id ? 'Para pagar' : `${ico('plus')} Anotar algo para pagar`, `<div class="form">
    <div class="campo full"><label>A quién</label><input id="pa_a" list="paA" value="${esc(x.a || '')}" placeholder="Ej.: ${esc(PROV())}, luz, cuota del camión"><datalist id="paA">${quienes.map(q => `<option value="${esc(q)}">`).join('')}</datalist></div>
    <div class="campo"><label>Importe</label>${campoMonto('id="pa_m"', x.monto ?? '')}</div>
    <div class="campo"><label>Vence el</label><input type="date" id="pa_v" value="${esc(x.vence || hoy())}"></div>
    <div class="campo full"><label>Qué es (opcional)</label><input id="pa_c" value="${esc(x.concepto || '')}" placeholder="Ej.: pedido del martes, cuota 3 de 12"></div>
    ${x.id ? '' : `<div class="campo full"><label>Repetir</label><select id="pa_r">${opciones([{ v: 0, t: 'No, una sola vez' }, { v: 3, t: 'Todos los meses, 3 meses' }, { v: 6, t: 'Todos los meses, 6 meses' }, { v: 12, t: 'Todos los meses, 12 meses' }], 0)}</select></div>`}
    ${x.pagado ? `<div class="campo full"><div class="estado-cuota ok"><div class="tx"><b>Pagado el ${dmy(x.pagado)}${x.medio ? ' · ' + esc(x.medio) : ''}</b></div></div></div>` : ''}</div>`,
    `${x.id ? `<button class="btn rojo" id="paB">${ico('trash')}</button>` : ''}${x.pagado ? '<button class="btn" id="paNo">No lo pagué</button>' : x.id ? '<button class="btn acento" id="paYa">Pagué</button>' : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="paOk">${ico('check')} Guardar</button>`);
  $('#paOk', m).onclick = async () => { try {
    const a = val('pa_a', m), v = aNum($('#pa_m', m).value), ve = val('pa_v', m);
    if (!a) throw new Error('Poné a quién le tenés que pagar'); if (isNaN(v) || v <= 0) throw new Error('Poné el importe'); if (!ve) throw new Error('Poné cuándo vence');
    const veces = x.id ? 0 : +val('pa_r', m) || 0;
    await DB.guardar('pagar', Object.assign(x, { a, monto: r2(v), vence: ve, concepto: val('pa_c', m), pagado: x.pagado || '' }));
    for (let k = 1; k < veces; k++) await DB.guardar('pagar', { a, monto: r2(v), vence: sumarMeses(ve, k), concepto: val('pa_c', m) || '', pagado: '' });
    await DB.anotar('Para pagar', `${a} ${money(v)} vence ${dmy(ve)}${veces > 1 ? ` (${veces} meses)` : ''}`);
    m.cerrar(); toast(veces > 1 ? `Anotado: ${veces} vencimientos` : 'Anotado: aparece en el calendario'); luego && luego(); } catch (e) { fallo(e); } };
  if ($('#paYa', m)) $('#paYa', m).onclick = () => { m.cerrar(); pagarYa(x, luego); };
  if ($('#paNo', m)) $('#paNo', m).onclick = async () => { try {
    if (x.gasto_id && DB.get('gastos', x.gasto_id)) await DB.borrar('gastos', x.gasto_id);
    Object.assign(x, { pagado: '', medio: '', gasto_id: 0 }); await DB.guardar('pagar', x); m.cerrar(); toast('Volvió a pendiente'); luego && luego(); } catch (e) { fallo(e); } };
  if ($('#paB', m)) $('#paB', m).onclick = async () => {
    if (!await confirmar(`¿Borrar "${esc(x.a)}" de ${money(x.monto)}?`, 'Borrar', true)) return;
    try { const copia = Object.assign({}, x); await DB.borrar('pagar', x.id); m.cerrar(); luego && luego(); toastDeshacer('Borrado', async () => { await DB.guardar('pagar', copia); }); } catch (e) { fallo(e); }
  };
}
function pagarYa(x, luego) {
  const cats = DB.cfg.categorias_gasto || ['Otros'];
  const m = modal(`Pagué: ${esc(x.a)}`, `<div class="form"><div class="campo"><label>Importe pagado</label>${campoMonto('id="py_m"', x.monto)}</div>
    <div class="campo"><label>Día</label><input type="date" id="py_f" value="${hoy()}"></div>
    <div class="campo"><label>Pagado con</label><select id="py_p">${opciones(DB.cfg.medios || ['Efectivo'])}</select></div>
    <div class="campo full"><label class="chk"><input type="checkbox" id="py_g" checked> Anotarlo también en Gastos, como</label><select id="py_c">${opciones(cats, normal(x.a) === normal(PROV()) ? (cats.find(c => /mercader/i.test(c)) || cats[0]) : cats[cats.length - 1])}</select></div></div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="pyOk">${ico('check')} Listo, pagado</button>`);
  $('#pyOk', m).onclick = async () => { try {
    const v = aNum($('#py_m', m).value), f = val('py_f', m); if (isNaN(v) || v <= 0) throw new Error('Poné el importe'); if (!f) throw new Error('Poné el día');
    let gid = 0;
    if ($('#py_g', m).checked) gid = (await DB.guardar('gastos', { monto: r2(v), fecha: f, categoria: val('py_c', m), medio: val('py_p', m), nota: `${x.a}${x.concepto ? ' · ' + x.concepto : ''}` })).id;
    Object.assign(x, { pagado: f, medio: val('py_p', m), monto: r2(v), gasto_id: gid }); await DB.guardar('pagar', x);
    await DB.anotar('Pagado', `${x.a} ${money(v)}`); m.cerrar(); toast('Pagado' + (gid ? ' y anotado en Gastos' : '')); luego && luego(); } catch (e) { fallo(e); } };
}
