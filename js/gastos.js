/* Gastos del día a día: combustible, mercadería, peajes… por mes y por tipo. */
'use strict';

let MES_GA = hoy().slice(0, 7);
PANTALLAS.gastos = async (main) => {
  titulo('Gastos');
  const [a, mm] = MES_GA.split('-').map(Number);
  const l = DB.todos('gastos').filter(g => g.fecha.slice(0, 7) === MES_GA).sort((x, y) => y.fecha.localeCompare(x.fecha) || y.id - x.id);
  const total = r2(l.reduce((s, g) => s + g.monto, 0)), ant = r2(DB.todos('gastos').filter(g => g.fecha.slice(0, 7) === sumarMeses(MES_GA + '-01', -1).slice(0, 7)).reduce((s, g) => s + g.monto, 0));
  const porCat = {}; l.forEach(g => porCat[g.categoria] = r2((porCat[g.categoria] || 0) + g.monto));
  const cats = Object.entries(porCat).sort((x, y) => y[1] - x[1]), max = Math.max(1, ...cats.map(c => c[1]));
  const deHoy = r2(DB.todos('gastos').filter(g => g.fecha === hoy()).reduce((s, g) => s + g.monto, 0));
  const porDia = []; for (const g of l) { if (!porDia.length || porDia[porDia.length - 1].f !== g.fecha) porDia.push({ f: g.fecha, l: [] }); porDia[porDia.length - 1].l.push(g); }
  main.innerHTML = `<div class="card"><div class="fila"><button class="btn" id="gaAnt" aria-label="Mes anterior">‹</button><h2 class="sp" style="text-align:center;text-transform:capitalize">${MESES[mm - 1]} ${a}</h2><button class="btn" id="gaSig" aria-label="Mes siguiente">›</button></div></div>
    <div class="kpis"><div class="kpi oscuro"><small>Gastos del mes</small><b>${money(total)}</b><div class="sub">${ant ? `mes anterior ${money(ant)}` : '&nbsp;'}</div></div>
      <div class="kpi"><small>Hoy</small><b>${money(deHoy)}</b><div class="sub">${l.length} gasto${l.length === 1 ? '' : 's'} en el mes</div></div></div>
    <div class="fila" style="margin-bottom:14px"><button class="btn acento ancho" id="gaN">${ico('plus')} Cargar gasto</button></div>
    ${cats.length ? `<div class="card"><h2>${ico('progreso')} Por tipo</h2>${cats.map(([c, v]) => `<div class="ga-cat"><div class="fila"><b class="sp">${esc(c)}</b><b class="num">${money(v)}</b><span class="muted chico" style="width:42px;text-align:right">${Math.round(v / total * 100)}%</span></div><div class="barra"><i style="width:${v / max * 100}%"></i></div></div>`).join('')}</div>` : ''}
    ${porDia.map(g => `<div class="card" style="padding:4px 14px"><h2 style="font-size:14px;padding:10px 0 4px;color:var(--txt2)">${g.f === hoy() ? 'Hoy' : fechaLarga(g.f)} <span class="sp"></span><span class="num">${money(r2(g.l.reduce((s, x) => s + x.monto, 0)))}</span></h2>
      <div class="lista">${g.l.map(x => `<div class="it" data-g="${x.id}"><div class="tx"><b>${esc(x.categoria)}</b><small>${esc(x.medio || '')}${x.nota ? ' · ' + esc(x.nota) : ''}</small></div><b class="num">${money(x.monto)}</b></div>`).join('')}</div></div>`).join('') || `<div class="card">${vacio('caja', 'No hay gastos cargados en este mes')}</div>`}`;
  const re = () => PANTALLAS.gastos(main);
  $('#gaAnt').onclick = () => { MES_GA = sumarMeses(MES_GA + '-01', -1).slice(0, 7); re(); };
  $('#gaSig').onclick = () => { MES_GA = sumarMeses(MES_GA + '-01', 1).slice(0, 7); re(); };
  $('#gaN').onclick = () => editarGasto({ fecha: MES_GA === hoy().slice(0, 7) ? hoy() : MES_GA + '-01' }, re);
  main.onclick = e => { const g = e.target.closest('[data-g]'); if (g) editarGasto(DB.get('gastos', g.dataset.g), re); };
};

function editarGasto(x, luego) {
  const cats = DB.cfg.categorias_gasto || ['Otros'], medios = DB.cfg.medios || ['Efectivo'];
  const m = modal(x.id ? 'Modificar gasto' : `${ico('caja')} Gasto nuevo`, `<div class="form">
    <div class="campo"><label>Importe</label>${campoMonto('id="ga_m" autofocus', x.monto ?? '')}</div>
    <div class="campo"><label>Día</label><input type="date" id="ga_f" value="${esc(x.fecha || hoy())}"></div>
    <div class="campo full"><label>Tipo de gasto</label><div class="chips" id="gaC">${[...new Set([...cats, ...(x.categoria && !cats.includes(x.categoria) ? [x.categoria] : [])])].map(c => `<button type="button" data-c="${esc(c)}" class="${(x.categoria || '') === c ? 'act' : ''}">${esc(c)}</button>`).join('')}</div></div>
    <div class="campo"><label>Pagado con</label><select id="ga_p">${opciones(medios, x.medio || medios[0])}</select></div>
    <div class="campo"><label>Nota (opcional)</label><input id="ga_n" value="${esc(x.nota || '')}" placeholder="Ej.: YPF, 40 litros"></div></div>`,
    `${x.id ? `<button class="btn rojo" id="gaB">${ico('trash')}</button>` : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="gaOk">${ico('check')} Guardar</button>`);
  let cat = x.categoria || '';
  $('#gaC', m).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; $$('#gaC button', m).forEach(z => z.classList.toggle('act', z === b)); };
  $('#gaOk', m).onclick = async () => { try {
    const v = aNum($('#ga_m', m).value), f = val('ga_f', m);
    if (isNaN(v) || v <= 0) throw new Error('Poné el importe del gasto'); if (!f) throw new Error('Elegí el día'); if (!cat) throw new Error('Elegí el tipo de gasto');
    if (f > sumarDias(hoy(), 31)) throw new Error('Revisá el día: es muy adelante');
    const nuevo = !x.id;
    await DB.guardar('gastos', Object.assign(x, { monto: r2(v), fecha: f, categoria: cat, medio: val('ga_p', m), nota: val('ga_n', m) }));
    await DB.anotar(nuevo ? 'Gasto cargado' : 'Gasto modificado', `${cat} ${money(v)} ${dmy(f)}`);
    m.cerrar(); toast('Gasto guardado'); luego && luego(); } catch (e) { fallo(e); } };
  if ($('#gaB', m)) $('#gaB', m).onclick = async () => {
    if (!await confirmar(`¿Borrar el gasto de ${money(x.monto)} (${esc(x.categoria)})?`, 'Borrar', true)) return;
    try { const copia = Object.assign({}, x); await DB.borrar('gastos', x.id); await DB.anotar('Gasto borrado', `${x.categoria} ${money(x.monto)}`); m.cerrar(); luego && luego();
      toastDeshacer('Gasto borrado', async () => { await DB.guardar('gastos', copia); }); } catch (e) { fallo(e); }
  };
}
