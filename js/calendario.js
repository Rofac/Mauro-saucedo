/* Calendario: pedidos que llegaron, retiros, gastos y recordatorios de cada día. */
'use strict';

const REPETIR = { no: 'No se repite', semana: 'Todas las semanas', mes: 'Todos los meses' };
function eventoOcurre(ev, f) {
  if (f < ev.fecha) return false; if (f === ev.fecha) return true;
  if (ev.repetir === 'semana') return diasEntre(ev.fecha, f) % 7 === 0;
  if (ev.repetir === 'mes') { const a = aFecha(ev.fecha), b = aFecha(f), ult = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate(); return b.getDate() === Math.min(a.getDate(), ult); }
  return false;
}
const eventosDe = f => DB.todos('eventos').filter(ev => eventoOcurre(ev, f)).map(ev => Object.assign({}, ev, { dia: f, hecho: (ev.hechos || []).includes(f) }))
  .sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
const retirosDe = f => DB.todos('pedidos').filter(p => p.retiro === f).sort((a, b) => a.cliente.localeCompare(b.cliente, 'es'));
const pedidosDe = f => DB.todos('pedidos').filter(p => p.recibido.slice(0, 10) === f).sort((a, b) => a.recibido.localeCompare(b.recibido));
const gastosDe = f => DB.todos('gastos').filter(g => g.fecha === f);

let MES_CAL = hoy().slice(0, 7);
PANTALLAS.calendario = async (main) => {
  titulo('Calendario');
  const ini = MES_CAL + '-01', d0 = lunesDe(ini), ultimo = sumarDias(sumarMeses(ini, 1), -1), dias = [];
  for (let d = d0; d <= ultimo || diaSemana(d) !== 1; d = sumarDias(d, 1)) dias.push(d);
  const [a, mm] = MES_CAL.split('-').map(Number);
  const delMes = DB.todos('pedidos').filter(p => p.recibido.slice(0, 7) === MES_CAL);
  const gMes = r2(DB.todos('gastos').filter(g => g.fecha.slice(0, 7) === MES_CAL).reduce((s, g) => s + g.monto, 0));
  main.innerHTML = `<div class="card"><div class="fila" style="margin-bottom:10px"><button class="btn" id="caAnt" aria-label="Mes anterior">‹</button>
      <h2 class="sp" style="text-align:center;text-transform:capitalize">${MESES[mm - 1]} ${a}</h2><button class="btn" id="caSig" aria-label="Mes siguiente">›</button></div>
    <div class="fila chico muted" style="justify-content:center;margin-bottom:8px;gap:14px"><span>📦 ${delMes.length} pedidos</span><span class="mal">${delMes.filter(p => p.estado === 'PENDIENTE').length} sin cargar</span><span>Gastos ${money(gMes)}</span></div>
    <div class="mes">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<div class="mes-cab">${x}</div>`).join('')}
      ${dias.map(d => { const ps = pedidosDe(d), pend = ps.filter(p => p.estado === 'PENDIENTE').length, rt = retirosDe(d), ev = eventosDe(d), g = r2(gastosDe(d).reduce((s, x) => s + x.monto, 0));
        return `<div class="mes-dia ${d.slice(0, 7) !== MES_CAL ? 'fuera' : ''} ${d === hoy() ? 'hoy' : ''}" data-dia="${d}"><div class="n">${+d.slice(8)}</div>
          ${ps.length ? `<div class="mes-t ${pend ? 'pend' : 'ok'}" title="${ps.length} pedidos, ${pend} sin cargar">📦${ps.length}</div>` : ''}
          ${rt.length ? `<div class="mes-t ret">🚚 ${rt.length}</div>` : ''}
          ${ev.slice(0, 2).map(e => `<div class="mes-t ev ${e.hecho ? 'hecho' : ''}">${e.hora ? e.hora + ' ' : ''}${esc(e.titulo)}</div>`).join('')}${ev.length > 2 ? `<div class="mes-mas">+${ev.length - 2}</div>` : ''}
          ${vencimientosDe(d).filter(x => !x.pagado).length ? `<div class="mes-t vto">💳 ${vencimientosDe(d).filter(x => !x.pagado).length}</div>` : ''}
          ${promesasDe(d).length ? `<div class="mes-t cob">💰 ${promesasDe(d).length}</div>` : ''}
          ${g ? `<div class="mes-t gas">$${g >= 1000 ? num(Math.round(g / 1000)) + 'k' : num(Math.round(g))}</div>` : ''}</div>`; }).join('')}</div>
    <div class="fila chico muted" style="margin-top:10px;gap:12px"><span>📦 pedidos (rojo = hay sin cargar)</span><span>🚚 retiros</span><span>💳 tengo que pagar</span><span>💰 dijo que me paga</span><span>$ gastos</span></div>
    <div class="fila" style="margin-top:10px"><button class="btn" id="caHoy">Hoy</button><span class="sp"></span><button class="btn acento" id="caEv">${ico('plus')} Recordatorio</button></div></div>`;
  const re = () => PANTALLAS.calendario(main);
  $('#caAnt').onclick = () => { MES_CAL = sumarMeses(MES_CAL + '-01', -1).slice(0, 7); re(); };
  $('#caSig').onclick = () => { MES_CAL = sumarMeses(MES_CAL + '-01', 1).slice(0, 7); re(); };
  $('#caHoy').onclick = () => { MES_CAL = hoy().slice(0, 7); re(); };
  $('#caEv').onclick = () => editarEvento({ fecha: MES_CAL === hoy().slice(0, 7) ? hoy() : MES_CAL + '-01' }, re);
  main.onclick = e => { const d = e.target.closest('[data-dia]'); if (d) verDia(d.dataset.dia, re); };
};

function verDia(f, luego) {
  const vt = vencimientosDe(f), pr = promesasDe(f);
  const ps = pedidosDe(f), rt = retirosDe(f), ev = eventosDe(f), gs = gastosDe(f), tg = r2(gs.reduce((s, x) => s + x.monto, 0));
  const m = modal(esc(fechaLarga(f)), `
    <h3 class="sub-t">${ico('agenda')} Recordatorios</h3><div class="lista">${ev.map(e => `<div class="it ${e.hecho ? 'hecho' : ''}"><button class="tg ${e.hecho ? 'si' : ''}" data-hev="${e.id}" aria-label="Hecho">${e.hecho ? ico('check') : ''}</button>
      <div class="tx" data-eev="${e.id}" style="cursor:pointer"><b>${e.hora ? e.hora + ' · ' : ''}${esc(e.titulo)}</b><small>${e.repetir && e.repetir !== 'no' ? REPETIR[e.repetir] : ''}${e.nota ? ' · ' + esc(e.nota) : ''}</small></div></div>`).join('') || '<p class="muted chico" style="margin:4px 0">Ninguno</p>'}</div>
    ${vt.length ? `<h3 class="sub-t">${ico('plata')} Tengo que pagar</h3><div class="lista">${vt.map(filaPagar).join('')}</div>` : ''}
    ${pr.length ? `<h3 class="sub-t">${ico('plata')} Dijeron que me pagan</h3><div class="lista">${pr.map(c => `<div class="it" data-cc="${c.id}"><div class="tx"><b>${esc(c.nombre)}</b><small>Debe en total</small></div><b class="num mal">${money(saldoCliente(c.id))}</b></div>`).join('')}</div>` : ''}
    ${rt.length ? `<h3 class="sub-t">${ico('camion')} Retiros / entregas</h3><div class="lista">${rt.map(p => `<div class="it" data-vp="${p.id}"><div class="tx"><b>${esc(p.cliente)}</b><small>${esc(p.texto.split('\n')[0].slice(0, 80))}</small></div><span class="pill ${PILL_P[p.estado]}">${ESTADOS_P[p.estado]}</span></div>`).join('')}</div>` : ''}
    <h3 class="sub-t">${ico('pedido')} Pedidos que llegaron (${ps.length})</h3><div class="lista">${ps.map(p => `<div class="it" data-vp="${p.id}"><div class="av" style="font-size:12.5px">${p.recibido.slice(11, 16)}</div><div class="tx"><b>${esc(p.cliente)}</b><small>${esc(p.texto.split('\n')[0].slice(0, 80))}</small></div><span class="pill ${PILL_P[p.estado]}">${ESTADOS_P[p.estado]}</span></div>`).join('') || '<p class="muted chico" style="margin:4px 0">Ninguno</p>'}</div>
    <h3 class="sub-t">${ico('caja')} Gastos ${tg ? '· ' + money(tg) : ''}</h3><div class="lista">${gs.map(g => `<div class="it" data-vg="${g.id}"><div class="tx"><b>${esc(g.categoria)}</b><small>${esc(g.medio || '')}${g.nota ? ' · ' + esc(g.nota) : ''}</small></div><b class="num">${money(g.monto)}</b></div>`).join('') || '<p class="muted chico" style="margin:4px 0">Ninguno</p>'}</div>`,
    `<button class="btn" id="vdV">${ico('plus')} Para pagar</button><button class="btn" id="vdG">${ico('plus')} Gasto</button><button class="btn" id="vdP">${ico('plus')} Pedido</button><button class="btn pri" id="vdE">${ico('plus')} Recordatorio</button>`, 'ancho');
  const otra = () => { m.cerrar(); luego && luego(); verDia(f, luego); };
  $('#vdE', m).onclick = () => { m.cerrar(); editarEvento({ fecha: f }, otra); };
  $('#vdG', m).onclick = () => { m.cerrar(); editarGasto({ fecha: f }, otra); };
  $('#vdV', m).onclick = () => { m.cerrar(); editarPagar({ vence: f }, otra); };
  $('#vdP', m).onclick = () => { m.cerrar(); editarPedido({ recibido: f === hoy() ? ahora() : f + ' 12:00' }, otra); };
  m.onclick = async e => {
    const h = e.target.closest('[data-hev]'); if (h) { const ev = DB.get('eventos', h.dataset.hev); const l = (ev.hechos || []).filter(x => x !== f); if (!(ev.hechos || []).includes(f)) l.push(f); ev.hechos = l; try { await DB.guardar('eventos', ev); otra(); } catch (er) { fallo(er); } return; }
    const ee = e.target.closest('[data-eev]'); if (ee) { m.cerrar(); return editarEvento(DB.get('eventos', ee.dataset.eev), otra); }
    const vp = e.target.closest('[data-vp]'); if (vp) { m.cerrar(); return verPedido(DB.get('pedidos', vp.dataset.vp), otra); }
    const vg = e.target.closest('[data-vg]'); if (vg) { m.cerrar(); return editarGasto(DB.get('gastos', vg.dataset.vg), otra); }
    const pg = e.target.closest('[data-pagar]'); if (pg) { e.stopPropagation(); m.cerrar(); return pagarYa(DB.get('pagar', pg.dataset.pagar), otra); }
    const ap = e.target.closest('[data-ap]'); if (ap) { m.cerrar(); return editarPagar(DB.get('pagar', ap.dataset.ap), otra); }
    const cc = e.target.closest('[data-cc]'); if (cc) { m.cerrar(); return cuentaCliente(DB.get('clientes', cc.dataset.cc), otra); }
  };
}

function editarEvento(x, luego) {
  const m = modal(x.id ? 'Recordatorio' : 'Recordatorio nuevo', `<div class="form">
    <div class="campo full"><label>Qué</label><input id="ev_t" value="${esc(x.titulo || '')}" placeholder="Ej.: Retirar en ${esc(PROV())}, pagar la cuenta, cobrarle a…" autofocus></div>
    <div class="campo"><label>Día</label><input type="date" id="ev_f" value="${esc(x.fecha || hoy())}"></div><div class="campo"><label>Hora (opcional)</label><input type="time" id="ev_h" value="${esc(x.hora || '')}"></div>
    <div class="campo full"><label>Repetir</label><select id="ev_r">${opciones(Object.entries(REPETIR).map(([v, t]) => ({ v, t })), x.repetir || 'no')}</select></div>
    <div class="campo full"><label>Nota</label><input id="ev_n" value="${esc(x.nota || '')}"></div></div>`,
    `${x.id ? `<button class="btn rojo" id="evB">${ico('trash')}</button>` : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="evOk">${ico('check')} Guardar</button>`);
  $('#evOk', m).onclick = async () => { try {
    const t = val('ev_t', m), f = val('ev_f', m); if (!t) throw new Error('Escribí qué hay que recordar'); if (!f) throw new Error('Elegí el día');
    await DB.guardar('eventos', Object.assign(x, { titulo: t, fecha: f, hora: val('ev_h', m), repetir: val('ev_r', m), nota: val('ev_n', m), hechos: x.hechos || [] }));
    m.cerrar(); toast('Recordatorio guardado'); luego && luego(); } catch (e) { fallo(e); } };
  if ($('#evB', m)) $('#evB', m).onclick = async () => {
    try { const copia = Object.assign({}, x); await DB.borrar('eventos', x.id); m.cerrar(); luego && luego(); toastDeshacer('Recordatorio borrado', async () => { await DB.guardar('eventos', copia); }); } catch (e) { fallo(e); }
  };
}
