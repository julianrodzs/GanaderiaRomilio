const { escaparHtml: h } = require('./htmlSeguro-service');

const numero = (n) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(Number(n || 0)).replace(/\u00a0|\u202f/g, ' ');
const dinero = (n, moneda = 'CRC') => moneda === 'USD'
    ? `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))}`
    : `₡${numero(n)}`;
const signo = (n) => `${n > 0 ? '+' : ''}${numero(n)}`;
const especieVisible = (resumen, especie, datos) => datos.total > 0 || datos.partos > 0
    || resumen.inventario?.some((r) => r.especie === especie && r.activos > 0);
const etiquetaEspecie = (especie) => especie === 'Porcino' ? 'Porcinos' : 'Bovinos';
const enlacePanel = (valor = process.env.FRONTEND_URL) => {
    let url;
    try { url = new URL(valor); } catch { throw new Error('FRONTEND_URL debe ser una URL válida para el resumen.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production')) || url.username || url.password) {
        throw new Error('FRONTEND_URL requiere HTTPS y no debe contener credenciales.');
    }
    url.search = ''; url.hash = '';
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return url.toString();
};
const celda = 'padding:12px 10px;border-bottom:1px solid #e2e8e3;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;';
const tabla = (cabeceras, filas, { destacarUltima = false, negativo = false } = {}) => {
    const cuerpo = filas.map((fila, i) => `<tr>${fila.map((c, j) => {
        const contenido = destacarUltima && i === filas.length - 1 && j === fila.length - 1
            ? `<strong style="display:inline-block;padding:5px 8px;border-radius:4px;background:${negativo ? '#fde8e6;color:#9b2424' : '#edf4ee;color:#0F2E1E'};">${h(c)}</strong>` : h(c);
        return `<td style="${celda}">${contenido}</td>`;
    }).join('')}</tr>`).join('');
    return `<table role="table" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;"><thead><tr>${cabeceras.map((c) => `<th scope="col" style="${celda}background:#edf4ee;color:#0F2E1E;">${h(c)}</th>`).join('')}</tr></thead><tbody>${cuerpo}</tbody></table>`;
};

const crearContenido = ({ usuario, organizacion, resumen, frecuencia }) => {
    const url = enlacePanel();
    const zona = resumen.periodo.zonaHoraria;
    const fecha = (valor) => new Intl.DateTimeFormat('es-CR', { timeZone: zona, dateStyle: 'long', timeStyle: 'short' }).format(new Date(valor));
    const corte = `Corte ${frecuencia.toLowerCase()}: ${fecha(resumen.periodo.desde)} al ${fecha(resumen.periodo.hasta)} (${zona}; ${frecuencia === 'Semanal' ? 'últimos 7 días' : 'últimas 24 h'}).`;
    const bloques = [], lineas = [`CIR Ganadero | ${organizacion.nombre}`, `Hola ${usuario.nombre || ''},`, corte];
    const agregar = (titulo, html, texto) => {
        bloques.push(`<tr><td style="padding:22px 24px;border-bottom:1px solid #d6e1d8;"><h2 style="margin:0 0 14px;font-size:19px;color:#0F2E1E;">${h(titulo)}</h2>${html}</td></tr>`);
        lineas.push('', titulo, ...texto);
    };

    if (resumen.tareas) {
        const t = resumen.tareas;
        const total = `${numero(t.pendientes)} pendientes en total, incluyendo ${numero(t.vencidas)} vencidas. Completadas en el período: ${numero(t.completadas)}.`;
        const personal = `Mis tareas: ${numero(t.personales.pendientes)} pendientes, incluyendo ${numero(t.personales.vencidas)} vencidas; ${numero(t.personales.completadas)} completadas en el período.`;
        const urgentes = t.urgentes.map((u) => `${u.estado} | ${u.titulo} | ${u.finca}${u.referencia ? ` | ${u.referencia}` : ''} | Fecha límite: ${u.fechaLimite} | Responsable: ${u.responsable}`);
        agregar(t.supervision ? 'Supervisión de tareas' : 'Mis tareas', `<p style="margin:0 0 10px;">${h(total)}</p>${t.supervision ? `<p>${h(personal)}</p>` : ''}${t.urgentes.map((u) => `<div style="padding:12px 0;border-top:1px solid #e2e8e3;"><span style="display:inline-block;padding:4px 8px;background:${u.estado === 'Vencida' ? '#fde8e6;color:#9b2424' : '#fff1c9;color:#6b4b00'};border-radius:4px;font-weight:bold;">${h(u.estado)}</span><p style="margin:8px 0 4px;font-weight:bold;">${h(u.titulo)}</p><p style="margin:0;">${h([u.finca, u.referencia].filter(Boolean).join(' | '))}<br>Fecha límite: ${h(u.fechaLimite)}<br>Responsable: ${h(u.responsable)}</p></div>`).join('') || '<p>Sin tareas pendientes.</p>'}`,
        [total, ...(t.supervision ? [personal] : []), ...urgentes.map((u) => `- ${u}`)]);
    }
    if (resumen.radar) {
        const r = resumen.radar, texto = [];
        if (r.partos !== undefined) {
            texto.push(`Partos estimados próximos 7 días: ${numero(r.partos)}.`);
            for (const [especie, d] of Object.entries(r.partosPorEspecie || {})) {
                if (especieVisible(resumen, especie, d)) texto.push(`${etiquetaEspecie(especie)}: ${numero(d.partos)} ${d.partos === 1 ? 'parto estimado' : 'partos estimados'}; ${numero(d.partosConfirmados)} con gestación confirmada y ${numero(d.partos - d.partosConfirmados)} pendientes de confirmación.`);
            }
            texto.push(...(r.hembras || []).map((a) => `- ${a.especie ? `${a.especie} | ` : ''}${[a.diio, a.nombre].filter(Boolean).join(' ') || 'Animal registrado'}: ${a.dia}${a.confirmada !== undefined ? ` | ${a.confirmada ? 'Gestación confirmada' : 'Pendiente de confirmar gestación'}` : ''}`));
            if (Object.values(r.partosPorEspecie || {}).some((d) => d.partos > d.partosConfirmados)) texto.push('La fecha de parto estimada no equivale a un diagnóstico positivo de gestación.');
        }
        if (r.retiroCarne !== undefined) texto.push(`Animales con retiro de carne vigente al corte: ${numero(r.retiroCarne)}.`);
        if (r.campanas !== undefined) texto.push(`Tareas programadas de campañas IATF / TE próximas 7 días: ${numero(r.campanas)}.`);
        agregar('Radar operativo', texto.map((s) => `<p style="margin:8px 0;">${h(s)}</p>`).join(''), texto);
    }
    if (resumen.inventario) {
        const texto = resumen.inventario.map((d) => `${d.especie}: ${numero(d.activos)} activos al corte; variación ${signo(d.variacion)}. Altas: ${numero(d.nacimientos)} nacimientos, ${numero(d.compras)} compras, ${numero(d.recibidos)} traslados recibidos. Bajas: ${numero(d.ventas)} ventas, ${numero(d.muertes)} muertes, ${numero(d.enviados)} traslados enviados.`);
        if (!texto.length) texto.push('Sin animales activos registrados.');
        if (resumen.productivo?.gestacionesPorEspecie) {
            texto.push(`Hembras en seguimiento de gestación: ${numero(resumen.productivo.gestacionesSeguimiento)}.`);
            for (const [especie, d] of Object.entries(resumen.productivo.gestacionesPorEspecie)) {
                if (especieVisible(resumen, especie, d)) texto.push(`${etiquetaEspecie(especie)}: ${numero(d.confirmadas)} ${d.confirmadas === 1 ? 'gestación confirmada' : 'gestaciones confirmadas'} y ${numero(d.sinConfirmar)} en seguimiento sin confirmación.`);
            }
        } else if (resumen.productivo?.gestaciones !== undefined) texto.push(`Hembras con gestación confirmada activa: ${numero(resumen.productivo.gestaciones)}.`);
        if (resumen.productivo) texto.push(`Animales en lotes de engorde activos: ${numero(resumen.productivo.engorde)}.`);
        texto.push('Foto actual al corte y movimientos del período. Los traslados entre fincas incluidas se compensan en la variación consolidada.');
        agregar('Inventario y movimiento del período', texto.map((s) => `<p style="margin:8px 0;">${h(s)}</p>`).join(''), texto);
    }
    if (resumen.finanzas) {
        const texto = [], html = [];
        for (const [moneda, d] of Object.entries(resumen.finanzas)) {
            const totales = [['Ingresos del período', dinero(d.ingresos, moneda)], ['Egresos del período', dinero(d.egresos, moneda)], ['Flujo Neto de Caja del Período', dinero(d.balance, moneda)]];
            html.push(`<h3 style="color:#0F2E1E;">${moneda}</h3>${tabla(['Concepto', 'Monto'], totales, { destacarUltima: true, negativo: d.balance < 0 })}`);
            texto.push(moneda, ...totales.map(([c, v]) => `${c}: ${v}`));
            for (const [titulo, top] of [['Top 3 categorías de Ingresos', d.topIngresos], ['Top 3 categorías de Egresos', d.topEgresos]]) {
                html.push(`<h3 style="font-size:15px;">${h(titulo)}</h3>${top.length ? tabla(['Categoría', 'Monto', '% del total'], top.map((r) => [r.categoria, dinero(r.monto, moneda), `${numero(r.porcentaje)}%`])) : '<p>Sin movimientos.</p>'}`);
                texto.push(titulo, ...(top.length ? top.map((r) => `- ${r.categoria}: ${dinero(r.monto, moneda)} (${numero(r.porcentaje)}%)`) : ['Sin movimientos.']));
            }
        }
        const nota = 'Flujo de caja operativo del período; no equivale a utilidad contable. CRC y USD se presentan por separado, sin conversión.';
        agregar('Finanzas del período', `${html.join('')}<p style="font-size:12px;color:#47584c;">${h(nota)}</p>`, [...texto, nota]);
    }
    if (resumen.fincas) {
        const columnas = ['Finca'];
        if (resumen.inventario) columnas.push('Animales activos (Δ período)');
        if (resumen.finanzas) columnas.push('Flujo Neto CRC');
        if (resumen.tareas) columnas.push('Tareas vencidas');
        if (resumen.radar?.partos !== undefined) columnas.push('Partos próx. 7d');
        const filas = resumen.fincas.map((f) => [f.nombre,
            ...(resumen.inventario ? [`${numero(f.inventario.activos)} (${signo(f.inventario.variacion)})`] : []),
            ...(resumen.finanzas ? [dinero(f.caja.balance)] : []), ...(resumen.tareas ? [numero(f.vencidas)] : []),
            ...(resumen.radar?.partos !== undefined ? [numero(f.partos)] : [])]);
        agregar('Comparativo por finca', tabla(columnas, filas), [columnas.join(' | '), ...filas.map((f) => f.join(' | '))]);
    }
    lineas.push('', `Ir al Panel de CIR Ganadero → ${url}`, 'Contenido según tus preferencias, rol vigente y fincas autorizadas.');
    return {
        subject: `Resumen ejecutivo ${frecuencia.toLowerCase()} - ${organizacion.nombre}`,
        text: lineas.join('\n'),
        html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:16px 0;background:#FAF9F5;color:#24392c;font-family:Arial,Helvetica,sans-serif;line-height:1.5;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #d6e1d8;"><tr><td style="padding:24px;background:#0F2E1E;color:white;"><p style="margin:0;font-size:23px;font-weight:bold;">CIR Ganadero</p><p style="margin:6px 0 0;">${h(organizacion.nombre)}</p></td></tr><tr><td style="padding:24px;"><p>Hola ${h(usuario.nombre || '')},</p><p style="margin:0;color:#47584c;">${h(corte)}</p></td></tr>${bloques.join('')}<tr><td style="padding:28px 24px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#348655" style="padding:14px 20px;border-radius:6px;"><a href="${h(url)}" style="color:#ffffff;font-weight:bold;text-decoration:none;">Ir al Panel de CIR Ganadero →</a></td></tr></table><p style="font-size:12px;color:#47584c;">Contenido según tus preferencias, rol vigente y fincas autorizadas.</p></td></tr></table></td></tr></table></body></html>`
    };
};

module.exports = { crearContenido, enlacePanel, dinero };
