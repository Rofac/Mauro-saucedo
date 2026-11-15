/* Inicio: lo que falta cargar, lo de hoy, lo que vence y lo que me deben. */
'use strict';

PANTALLAS.inicio = async (main) => {
  titulo('Inicio');
  const h = hoy(), pend = pendientes(), atr = pend.filter(atrasado);
  const deHoy = DB.todos('pedidos').filter(p => p.recibido.slice(0, 10) === h), cargHoy = DB.todos('pedidos').filter(p => (p.cargado_en || '').slice(0, 10) === h);
  const gHoy = r2(gastosDe(h).reduce((s, g) => s + g.monto, 0)), gMes = r2(DB.todos('gastos').filter(g => g.fecha.slice(0, 7) === h.slice(0, 7)).reduce((s, g) => s + g.monto, 0));
  const ap = aPagar().filter(x => x.vence <= sumarDias(h, 7)), meDeben = r2(deudores().filter(x => x.saldo > 0).reduce((s, x) => s + x.saldo, 0));
  const ev = eventosDe(h), rt = retirosDe(h).filter(p => p.estado !== 'ENTREGADO'), prom = DB.todos('clientes').filter(c => c.promete && c.promete <= h && saldoCliente(c.id) > 0.009);
  const diasCopia = DB.cfg.ultima_copia ? diasEntre(DB.cfg.ultima_copia.slice(0, 10), h) : null;
  const avisarCopia = DB.todos('pedidos').length && (diasCopia === null || diasCopia >= (+DB.cfg.aviso_copia_dias || 7));
  const guia = !DB.cfg.guia_oculta;
  main.innerHTML = `
    ${!DB.cfg.nombre ? `<div class="estado-cuota warn" style="margin-bottom:12px"><div class="tx"><b>Poné el nombre de tu negocio</b><small>En Configuración. La licencia va a ese nombre.</small></div><button class="btn chico" data-ir="config">Ir</button></div>` : ''}
    <div class="kpis">
      <div class="kpi ${pend.length ? 'mal-k' : ''}" data-ir="pedidos" id="kpPend"><small>Falta cargar</small><b>${pend.length}</b><div class="sub">${atr.length ? `${atr.length} hace más de ${DB.cfg.horas_alerta || 3} h` : pend.length ? 'pedidos' : '¡todo cargado!'}</div></div>
      <div class="kpi"><small>Hoy</small><b>${deHoy.length}</b><div class="sub">llegaron · ${cargHoy.length} cargados</div></div>
      <div class="kpi" data-ir="cuentas" id="kpDeben"><small>Me deben</small><b>${money(meDeben)}</b><div class="sub">${prom.length ? `${prom.length} tenían que pagar` : 'ver cuentas ›'}</div></div>
      <div class="kpi" data-ir="gastos"><small>Gastos</small><b>${money(gMes)}</b><div class="sub">hoy ${money(gHoy)}</div></div></div>
    <div class="fila" style="margin-bottom:14px"><button class="btn acento" id="inP">${ico('plus')} Pedido</button><button class="btn" id="inG">${ico('plus')} Gasto</button><button class="btn" id="inC">${ico('check')} Me pagaron</button></div>
    ${avisarCopia ? `<div class="estado-cuota warn" style="margin-bottom:14px"><div class="tx"><b>${diasCopia === null ? 'Todavía no hiciste ninguna copia de seguridad' : `Hace ${diasCopia} días que no hacés copia de seguridad`}</b><small>Si se rompe o se pierde el celular, se pierde todo.</small></div><button class="btn chico" id="inCp">Hacer copia</button></div>` : ''}
    <div class="card"><h2>${ico('pendiente')} Falta cargar en ${esc(PROV())}<span class="sp"></span>${pend.length ? `<span class="pill mal">${pend.length}</span>` : ''}</h2>
      <div class="lista">${pend.slice(0, 8).map(p => filaPedido(p, p.recibido.slice(0, 10) !== h)).join('') || vacio('cargado', '¡Está todo cargado! 🎉')}</div>
      ${pend.length > 8 ? `<button class="btn chico" data-ir="pedidos" style="margin-top:8px">Ver los ${pend.length}</button>` : ''}</div>
    ${ap.length ? `<div class="card"><h2>${ico('plata')} Tengo que pagar (esta semana)</h2><div class="lista">${ap.map(filaPagar).join('')}</div></div>` : ''}
    ${ev.length || rt.length || prom.length ? `<div class="card"><h2>${ico('agenda')} Hoy</h2><div class="lista">
      ${ev.map(e => `<div class="it" data-dia="${h}"><div class="av" style="font-size:12px">${e.hora || '•'}</div><div class="tx"><b class="${e.hecho ? 'tachado' : ''}">${esc(e.titulo)}</b><small>${esc(e.nota || '')}</small></div></div>`).join('')}
      ${rt.map(p => `<div class="it" data-p="${p.id}"><div class="av">${ico('camion')}</div><div class="tx"><b>Retiro: ${esc(p.cliente)}</b><small>${esc(p.texto.split('\n')[0].slice(0, 70))}</small></div><span class="pill ${PILL_P[p.estado]}">${ESTADOS_P[p.estado]}</span></div>`).join('')}
      ${prom.map(c => `<div class="it" data-cc="${c.id}"><div class="av">${ico('plata')}</div><div class="tx"><b>${esc(c.nombre)} ${c.promete < h ? 'tenía que pagar el ' + dm(c.promete) : 'dijo que paga hoy'}</b><small>Debe ${money(saldoCliente(c.id))}</small></div></div>`).join('')}</div></div>` : ''}
    ${guia ? `<div class="card guia"><h2>${ico('wa')} Cómo guardar un pedido de WhatsApp<span class="sp"></span><button class="ib" id="inGuiaX" aria-label="Ocultar">${ico('x')}</button></h2>
      <ol style="margin:0;padding-left:20px;line-height:1.7"><li>En WhatsApp, <b>mantené apretado</b> el mensaje del pedido (o varios).</li><li>Tocá <b>Compartir</b> (o los tres puntitos → Compartir) y elegí <b>${esc(DB.cfg.nombre || 'esta app')}</b>.</li>
      <li>Se abre el pedido ya escrito: poné o confirmá el cliente y tocá <b>Guardar</b>. Queda en "Falta cargar".</li><li>Cuando lo pasás a ${esc(PROV())}, tocá <b>Cargado</b>.</li></ol>
      <p class="muted chico" style="margin-bottom:0">Si no aparece en Compartir: copiá el mensaje y en "+ Pedido" tocá "Pegar lo copiado". Para que aparezca, la app tiene que estar instalada.</p></div>` : ''}`;
  const re = () => PANTALLAS.inicio(main);
  $('#inP').onclick = () => editarPedido({}, re);
  $('#inG').onclick = () => editarGasto({}, re);
  $('#inC').onclick = () => movCliente(null, 'COBRO', re);
  if ($('#inCp')) $('#inCp').onclick = hacerCopia;
  if ($('#inGuiaX')) $('#inGuiaX').onclick = async () => { await DB.setCfg('guia_oculta', true, true); re(); };
  main.onclick = e => {
    const k = e.target.closest('[data-cargar]'); if (k) { e.stopPropagation(); return marcarCargado(DB.get('pedidos', k.dataset.cargar), re); }
    const pg = e.target.closest('[data-pagar]'); if (pg) { e.stopPropagation(); return pagarYa(DB.get('pagar', pg.dataset.pagar), re); }
    const p = e.target.closest('[data-p]'); if (p) return verPedido(DB.get('pedidos', p.dataset.p), re);
    const ap = e.target.closest('[data-ap]'); if (ap) return editarPagar(DB.get('pagar', ap.dataset.ap), re);
    const cc = e.target.closest('[data-cc]'); if (cc) return cuentaCliente(DB.get('clientes', cc.dataset.cc), re);
    const d = e.target.closest('[data-dia]'); if (d) return verDia(d.dataset.dia, re);
  };
};
