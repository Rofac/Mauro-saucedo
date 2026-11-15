/* Configuración, copias de seguridad, licencia y "Más" (en el celular). */
'use strict';

PANTALLAS.mas = async (main) => {
  titulo('Más');
  main.innerHTML = `<div class="card" style="padding:6px 14px"><div class="lista">
    <div class="it" data-ir2="gastos"><div class="av">${ico('caja')}</div><div class="tx"><b>Gastos</b><small>Combustible, mercadería, peajes… por mes y por tipo</small></div>${ico('flecha')}</div>
    <div class="it" data-ir2="clientes"><div class="av">${ico('alumnos')}</div><div class="tx"><b>Clientes</b><small>Teléfono, pedidos y cuenta de cada uno</small></div>${ico('flecha')}</div>
    <div class="it" data-ir2="config"><div class="av">${ico('config')}</div><div class="tx"><b>Configuración</b><small>Datos, tipos de gasto, clave, licencia</small></div>${ico('flecha')}</div>
    <div class="it" id="maCopia"><div class="av">${ico('copia')}</div><div class="tx"><b>Copia de seguridad</b><small>${DB.cfg.ultima_copia ? 'Última: ' + dmy(DB.cfg.ultima_copia) : 'Nunca se hizo'}</small></div>${ico('flecha')}</div></div></div>`;
  main.onclick = e => { const b = e.target.closest('[data-ir2]'); if (b) ir(b.dataset.ir2, null, true); if (e.target.closest('#maCopia')) hacerCopia(); };
};

async function hacerCopia() {
  const antes = DB.cfg.ultima_copia; await DB.setCfg('ultima_copia', ahora(), true);
  const j = DB.exportar(), txt = JSON.stringify(j);
  const nombre = `Copia ${(DB.cfg.nombre || 'Pedidos').replace(/[^\w áéíóúñÁÉÍÓÚÑ-]/g, '')} ${hoy()} ${ahora().slice(11).replace(':', 'h')}.json`;
  const file = new File([txt], nombre, { type: 'application/json' });
  let ok = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia de seguridad', text: `Copia de seguridad de ${DB.cfg.nombre} (${dmy(hoy())})` }); ok = true; }
    catch (e) { if (e.name === 'AbortError') { await DB.setCfg('ultima_copia', antes || '', true); return; } }
  }
  if (!ok) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  toast(ok ? 'Copia enviada' : 'Copia descargada en la carpeta Descargas');
  if (ACTUAL === 'inicio' || ACTUAL === 'config' || ACTUAL === 'mas') recargar();
}
function restaurarCopia(j) {
  return (async () => {
    const n = (j.data && j.data.pedidos || []).length;
    if (!await confirmar(`Se van a REEMPLAZAR todos los datos de este celular por la copia de <b>${esc(j.negocio || '')}</b> del <b>${esc(dmy(j.fecha))} ${esc((j.fecha || '').slice(11))}</b> (${n} pedidos). ¿Seguro?`, 'Sí, restaurar', true)) return;
    try { await DB.copiaDiaria(); await DB.importar(j); toast('Copia restaurada'); setTimeout(() => location.reload(), 900); } catch (e) { fallo(e); }
  })();
}

let LIC_ESTADO = null;
PANTALLAS.config = async (main) => {
  titulo('Configuración');
  const c = DB.cfg, lic = LIC_ESTADO = await LIC.estado(), copias = await DB.copiasInternas();
  
  main.innerHTML = `
    <div class="card"><h2>${ico('inicio')} Datos del negocio</h2><div class="form">
      <div class="campo full"><label>Nombre (aparece en comprobantes y mensajes; la licencia va a este nombre)</label><input id="cf_n" value="${esc(c.nombre)}"></div>
      <div class="campo"><label>Teléfono</label><input id="cf_t" value="${esc(c.telefono || '')}"></div>
      <div class="campo"><label>Nombre del proveedor (su app donde cargás los pedidos)</label><input id="cf_pv" value="${esc(c.proveedor || 'Jaguar')}"></div>
      <div class="campo"><label>Marcar en rojo los pedidos sin cargar después de … horas</label><input id="cf_ha" inputmode="numeric" value="${esc(c.horas_alerta ?? 3)}"></div></div>
      <div class="fila" style="margin-bottom:12px"><img src="${c.logo || 'img/logo.png'}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:contain;background:#fff;border:1px solid var(--borde)">
        <label class="btn chico" style="margin:0">${ico('foto')} Cambiar logo<input type="file" accept="image/*" id="cfLogo" hidden></label>${c.logo ? '<button class="btn chico" id="cfLogoQ">Volver al de fábrica</button>' : ''}</div>
      <button class="btn pri" id="cfG1">${ico('check')} Guardar</button></div>

    <div class="card"><h2>${ico('rutina')} Listas</h2><div class="form">
      <div class="campo"><label>Medios de pago (uno por renglón)</label><textarea id="cf_me">${esc(c.medios.join('\n'))}</textarea></div>
      <div class="campo"><label>Tipos de gasto (uno por renglón)</label><textarea id="cf_ga">${esc(c.categorias_gasto.join('\n'))}</textarea></div>
</div>
      <button class="btn pri" id="cfG3">${ico('check')} Guardar</button></div>

    <div class="card"><h2>${ico('copia')} Copia de seguridad</h2>
      <p style="margin-top:0">Todo está guardado <b>en este celular</b>. Si se rompe, se pierde o la resetean, sólo se recupera con una copia.
        Tocá "Hacer copia" y mandala a <b>Google Drive</b> o a tu <b>WhatsApp</b> (por ejemplo a vos mismo). Conviene una vez por semana.</p>
      <p class="${!c.ultima_copia ? 'mal' : ''}"><b>Última copia:</b> ${c.ultima_copia ? dmy(c.ultima_copia) + ' ' + c.ultima_copia.slice(11) : 'nunca'}</p>
      <div class="fila"><button class="btn acento" id="cfCp">${ico('copia')} Hacer copia</button><label class="btn" style="margin:0">${ico('subir')} Restaurar una copia<input type="file" accept=".json,application/json" id="cfRs" hidden></label>
        <label class="chk" style="margin-left:6px">Avisar cada <input id="cf_ac" inputmode="numeric" value="${esc(c.aviso_copia_dias)}" style="width:64px;min-height:38px;padding:6px"> días</label></div>
      ${copias.length ? `<p class="muted chico" style="margin-bottom:6px">Además la app guarda sola una copia por día adentro del celular (las últimas 5), por si se borra algo sin querer:</p>
        <div class="fila">${copias.map(x => `<button class="btn chico" data-ci="${x.k}">${dmy(x.fecha)}</button>`).join('')}</div>` : ''}</div>

    <div class="card"><h2>${ico('foto')} Fotos y audios de los pedidos</h2>
      <p style="margin-top:0" class="muted">No van en la copia de seguridad (pesarían mucho): quedan sólo en este celular. El texto de los pedidos sí va.</p>
      <p id="cfEsp" class="muted">Calculando…</p><div class="fila" id="cfEspB"></div></div>

    <div class="card"><h2>${ico('candado')} Clave del dueño</h2>
      <p style="margin-top:0" class="muted">Si la ponés, la pide para entrar a Gastos y a la Configuración. Sirve si otra persona usa el celular para anotar pedidos.</p>
      <div class="fila"><input id="cf_pin" type="password" inputmode="numeric" placeholder="${c.pin ? 'Nueva clave (4 a 8 números)' : '4 a 8 números'}" style="max-width:240px" autocomplete="new-password">
        <button class="btn pri" id="cfPin">${c.pin ? 'Cambiar clave' : 'Poner clave'}</button>${c.pin ? `<button class="btn rojo" id="cfPinQ">Quitar clave</button>` : ''}</div></div>

    <div class="card"><h2>${ico('check')} Licencia</h2>
      <div class="estado-cuota ${lic.activa ? (lic.por_vencer ? 'warn' : 'ok') : lic.bloqueado ? 'mal' : 'warn'}" style="margin-bottom:12px"><div class="tx"><b>${esc(lic.mensaje)}</b></div></div>
      <label>Código de este celular (mandáselo a quien te vendió la app para pedir la licencia)</label>
      <div class="fila" style="margin-bottom:12px"><b style="font-size:22px;letter-spacing:2px;user-select:all" id="cfEq">${esc(lic.equipo)}</b><button class="btn chico" id="cfEqC">Copiar</button>
        <button class="btn chico" id="cfEqW">${ico('wa')} Mandar</button></div>
      <label>Clave de licencia</label><textarea id="cf_lic" style="font-family:monospace;min-height:70px">${esc(c.licencia || '')}</textarea>
      <button class="btn pri" id="cfLic" style="margin-top:10px">Activar</button></div>

    <div class="card"><h2>${ico('config')} Apariencia y ayuda</h2><div class="fila">
      <div><label>Colores</label><div class="seg" id="cfTema">${[['light', 'Claro'], ['dark', 'Oscuro'], ['auto', 'Como el celular']].map(([k, t]) => `<button data-tm="${k}" class="${(c.tema || 'light') === k ? 'act' : ''}">${t}</button>`).join('')}</div></div>
      <div><label>Tamaño de letra</label><div class="seg" id="cfLetra">${[['chica', 'Chica'], ['normal', 'Normal']].map(([k, t]) => `<button data-lt="${k}" class="${(c.letra || 'normal') === k ? 'act' : ''}">${t}</button>`).join('')}</div></div>
      <button class="btn" id="cfAct">${ico('reloj')} Registro de actividad</button><button class="btn" id="cfInst">Cómo instalar la app</button></div></div>
    <div class="card"><h2>Acerca de</h2><div class="fila"><div class="sp"><b style="font-size:18px">RoFac</b><div class="muted chico">Versión 1.0</div></div>
      <button class="btn" id="cfLegal">Términos y privacidad</button></div></div>`;
  const re = () => PANTALLAS.config(main);
  const lineas = id => $('#' + id).value.split('\n').map(x => x.trim()).filter(Boolean);
  $('#cfG1').onclick = async () => { try { const n = val('cf_n'); if (!n) throw new Error('Poné el nombre'); await DB.setCfg('nombre', n); await DB.setCfg('telefono', val('cf_t')); await DB.setCfg('proveedor', val('cf_pv') || 'Jaguar');
    const ha = parseInt(val('cf_ha')); if (!(ha >= 1 && ha <= 72)) throw new Error('Las horas para marcar en rojo van de 1 a 72'); await DB.setCfg('horas_alerta', ha); pintarMenu(); toast('Guardado'); arrancarLicencia(); re(); } catch (e) { fallo(e); } };
  $('#cfLogo').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await DB.setCfg('logo', await leerFoto(f, 360)); pintarMenu(); toast('Logo cambiado'); re(); } catch (x) { fallo(x); } };
  if ($('#cfLogoQ')) $('#cfLogoQ').onclick = async () => { try { await DB.setCfg('logo', ''); pintarMenu(); re(); } catch (x) { fallo(x); } };
  $('#cfG3').onclick = async () => { try { const me = lineas('cf_me'), ga = lineas('cf_ga'); if (!me.length) throw new Error('Tiene que haber al menos un medio de pago');
    await DB.setCfg('medios', me); await DB.setCfg('categorias_gasto', ga.length ? ga : ['Otros']); toast('Guardado'); } catch (e) { fallo(e); } };
  main.onclick = async e => {
    const ci = e.target.closest('[data-ci]'); if (ci) { const j = await DB.copiaInterna(ci.dataset.ci); if (j) restaurarCopia(j); }
  };
  $('#cfCp').onclick = () => hacerCopia();
  $('#cf_ac').onchange = e => DB.setCfg('aviso_copia_dias', Math.max(1, parseInt(e.target.value) || 7), true);
  $('#cfRs').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { restaurarCopia(JSON.parse(await f.text())); } catch (x) { fallo(new Error('No se pudo leer el archivo de copia')); } };
  $('#cfPin').onclick = async () => { const p = val('cf_pin'); if (!/^\d{4,8}$/.test(p)) return toast('La clave tiene que ser de 4 a 8 números', true); await DB.setCfg('pin', await sha256(p), true); DESBLOQUEADO = true; await DB.anotar('Clave del dueño cambiada'); toast('Clave guardada'); re(); };
  if ($('#cfPinQ')) $('#cfPinQ').onclick = async () => { if (!await confirmar('¿Quitar la clave del dueño?', 'Quitar', true)) return; await DB.setCfg('pin', '', true); toast('Clave quitada'); re(); };
  espacioAdjuntos().then(e => { const el = $('#cfEsp'); if (!el) return;
    el.innerHTML = e.n ? `Hay <b>${e.n}</b> foto${e.n === 1 ? '' : 's'} o audio${e.n === 1 ? '' : 's'} guardados (${String(e.mb).replace('.', ',')} MB).` : 'Todavía no hay fotos ni audios guardados.';
    if (e.entregados) { $('#cfEspB').innerHTML = `<button class="btn" id="cfEspX">${ico('trash')} Borrar los de pedidos entregados (${e.entregados})</button>`;
      $('#cfEspX').onclick = async () => { if (!await confirmar(`¿Borrar las fotos y audios de los pedidos <b>ya entregados</b>? El texto de los pedidos queda.`, 'Borrar', true)) return;
        try { const n = await borrarAdjuntosEntregados(); toast(`Listo: se borraron los de ${n} pedido${n === 1 ? '' : 's'}`); PANTALLAS.config($('#main')); } catch (x) { fallo(x); } }; } });
  $('#cfEqC').onclick = async () => { try { await navigator.clipboard.writeText(lic.equipo); toast('Código copiado'); } catch (e) { toast('Mantené apretado el código para copiarlo'); } };
  $('#cfEqW').onclick = () => abrirWa('', `Hola! Te paso el código del celular para la licencia de ${DB.cfg.nombre}: ${lic.equipo}`);
  $('#cfLic').onclick = async () => { const k = $('#cf_lic').value.replace(/\s/g, ''); const r = await LIC.verificar(k, DB.cfg.nombre, lic.equipo);
    if (k && !r.activa) return toast(r.mensaje, true); await DB.setCfg('licencia', k, true); await DB.anotar('Licencia cargada'); toast(r.activa ? '¡Licencia activada!' : 'Licencia borrada'); await arrancarLicencia(); re(); };
  $('#cfLetra').onclick = async e => { const b = e.target.closest('[data-lt]'); if (!b) return; await DB.setCfg('letra', b.dataset.lt, true); aplicarTema(); re(); };
  $('#cfTema').onclick = async e => { const b = e.target.closest('[data-tm]'); if (!b) return; await DB.setCfg('tema', b.dataset.tm, true); aplicarTema(); re(); };
  $('#cfAct').onclick = () => modal('Registro de actividad', `<table class="t">${DB.todos('actividad').slice(-300).reverse().map(a => `<tr><td class="chico muted" style="white-space:nowrap">${dmy(a.fecha)} ${a.fecha.slice(11)}</td><td><b>${esc(a.accion)}</b><div class="chico muted">${esc(a.detalle)}</div></td></tr>`).join('') || '<tr><td class="muted">Sin actividad</td></tr>'}</table>`, '', 'ancho');
  $('#cfInst').onclick = ayudaInstalar;
  $('#cfLegal').onclick = verLegal;
};

function ayudaInstalar() {
  modal('Cómo instalar la app', `<ol style="padding-left:20px;line-height:1.7;margin-top:0">
    <li>En el celular, abrí <b>Chrome</b> y entrá a la dirección de la app.</li>
    <li>Tocá el menú <b>⋮</b> (arriba a la derecha) y elegí <b>"Instalar aplicación"</b> o <b>"Agregar a la pantalla principal"</b>.</li>
    <li>Queda el ícono de ${esc(DB.cfg.nombre)} en la pantalla. De ahí en más se abre como cualquier app, <b>sin internet</b>.</li></ol>
    <p><b>En iPhone:</b> abrí la dirección en <b>Safari</b>, tocá <b>Compartir</b> (el cuadrado con la flecha) y elegí <b>"Agregar a pantalla de inicio"</b>.</p>
    <p><b>Importante:</b> los datos quedan en el celular. No borres los datos de Chrome ni "desinstales" la app sin antes hacer una copia de seguridad.</p>`, '<button class="btn pri" data-cerrar>Entendido</button>');
}
