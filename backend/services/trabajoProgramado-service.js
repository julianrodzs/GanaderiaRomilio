const { adquirirBloqueo, iniciarRenovacion, finalizarTrabajo } = require('./bloqueoCron-service');
const { medirCron } = require('./metricasCron-service');
const { procesarCategoriasTodasOrganizaciones } = require('./categoriasProgramadas-service');
const { procesarAlertasTodasOrganizaciones } = require('./alertasCorreo-service');
const { procesarResumenesTodasOrganizaciones } = require('./resumenEmail-service');

const CLAVE_ALERTAS = 'alertas-operativas';
const CLAVE_RESUMENES = 'resumenes-email-premium';
let intervaloInterno = null;
let intervaloResumenes = null;

const erroresResultado = (resultado) => [
    ...(resultado.error ? [{ mensaje: resultado.error }] : []),
    ...(resultado.errores || []), ...(resultado.correos?.errores || [])
];

const ejecutarFase = async (procesar, opciones, resumir) => {
    const medicion = medirCron();
    let resultados = [], errorGlobal;
    try {
        await opciones.comprobarBloqueo();
        const respuesta = await procesar({ ...opciones, alProgreso: medicion.muestrear });
        if (respuesta?.omitido) return { status: 'Omitido', ...resumir([]), errores: [], resultados: [], motivo: respuesta.motivo, ...medicion.terminar() };
        resultados = respuesta;
    } catch (error) {
        resultados = error.resultado?.resultados || [];
        errorGlobal = { mensaje: error.message, codigo: error.code };
    }
    const errores = resultados.flatMap((r) => erroresResultado(r).map((error) => ({ organizacionId: r.organizacionId, ...error })));
    if (errorGlobal) errores.push(errorGlobal);
    return { status: errores.length ? 'Error' : 'Completado', ...resumir(resultados), errores, resultados, ...medicion.terminar() };
};

const total = (filas, campo) => filas.reduce((n, r) => n + Number(r[campo] || 0), 0);
const resumenAlertas = (filas) => ({ organizacionesProcesadas: filas.length,
    notificacionesCreadas: total(filas, 'notificacionesCreadas'), enviadas: filas.reduce((n, r) => n + Number(r.correos?.enviadas || 0), 0) });
const resumenCategorias = (filas) => ({ organizacionesProcesadas: filas.length,
    escaneados: total(filas, 'escaneados'), actualizados: total(filas, 'actualizados'), sellados: total(filas, 'sellados') });
const resumenEmails = (filas) => ({ organizacionesProcesadas: filas.length,
    enviadas: filas.reduce((n, r) => n + (r.envios || []).filter((envio) => envio.enviado).length, 0) });

const ejecutarConBloqueo = async (clave, origen, ejecutar) => {
    const bloqueo = await adquirirBloqueo(clave, origen);
    if (!bloqueo) return { ejecutado: false, omitido: true, motivo: 'Ya existe una ejecucion de este trabajo en curso.' };
    const lease = iniciarRenovacion(bloqueo), medicion = medirCron();
    let resultado = null, fallo = null;
    try {
        resultado = await ejecutar({ comprobarBloqueo: () => lease.comprobar() });
        await lease.comprobar();
        if (resultado.status === 'Error') {
            fallo = Object.assign(new Error('El trabajo fallo en una o mas fases u organizaciones. Revisar resultados.'), { code: 'JOB_PARTIAL_FAILURE' });
        }
    } catch (error) { fallo = error; }
    finally {
        await lease.detener();
        try { await lease.comprobar(); } catch (error) { fallo = fallo || error; }
        if (resultado) {
            resultado.metricas = medicion.terminar();
            for (const fase of [resultado.categorias, resultado.alertas, resultado.resumenes]) {
                for (const campo of ['rss', 'heapUsed', 'heapTotal']) resultado.metricas.memoriaMb.pico[campo] = Math.max(resultado.metricas.memoriaMb.pico[campo], fase?.memoriaMb?.pico[campo] || 0);
            }
            if (fallo) resultado.status = 'Error';
        }
        try { await finalizarTrabajo(bloqueo, { estado: fallo ? 'Error' : 'Completado', ultimoError: fallo?.message || '', ultimoResultado: resultado }); }
        catch (error) { fallo = fallo || error; if (resultado) resultado.status = 'Error'; }
    }
    if (fallo) { if (resultado) fallo.resultado = resultado; throw fallo; }
    return resultado;
};

const ejecutarResumenesEmailProgramados = ({ origen = 'manual', modoEjecucion = 'continuo', comprobarBloqueoExterno = async () => {} } = {}) => ejecutarConBloqueo(CLAVE_RESUMENES, origen, async (opciones) => {
    const comprobarBloqueo = async () => { await opciones.comprobarBloqueo(); await comprobarBloqueoExterno(); };
    const resumenes = await ejecutarFase((opts) => procesarResumenesTodasOrganizaciones(new Date(), opts), { comprobarBloqueo, modoEjecucion }, resumenEmails);
    return { ejecutado: true, status: resumenes.status, organizacionesProcesadas: resumenes.organizacionesProcesadas,
        correosEnviados: resumenes.enviadas, organizacionesConError: resumenes.resultados.filter((r) => erroresResultado(r).length).length,
        resultados: resumenes.resultados, resumenes };
});

const ejecutarAlertasProgramadas = ({ origen = 'manual', modoEjecucion = 'cron_diario', incluirResumenes = process.env.CRON_INCLUDE_SUMMARIES !== 'false' } = {}) => ejecutarConBloqueo(CLAVE_ALERTAS, origen, async (opciones) => {
    // Cada fase termina antes de comenzar la siguiente; sus errores no abortan las restantes.
    const categorias = await ejecutarFase(procesarCategoriasTodasOrganizaciones, opciones, resumenCategorias);
    const alertas = await ejecutarFase(procesarAlertasTodasOrganizaciones, opciones, resumenAlertas);
    const resumenes = incluirResumenes ? await ejecutarFase(async () => {
        const r = await ejecutarResumenesEmailProgramados({ origen: `${origen}:resumenes`, modoEjecucion, comprobarBloqueoExterno: opciones.comprobarBloqueo });
        return r.omitido ? r : r.resultados || [];
    }, opciones, resumenEmails) : { status: 'Desactivado' };
    const porOrganizacion = new Map(alertas.resultados.map((r) => [String(r.organizacionId), { ...r }]));
    for (const r of categorias.resultados) {
        const clave = String(r.organizacionId);
        porOrganizacion.set(clave, { ...(porOrganizacion.get(clave) || { organizacionId: r.organizacionId, organizacion: r.organizacion }), categoriasAnimales: r });
    }
    for (const r of resumenes.resultados || []) {
        const clave = String(r.organizacionId);
        porOrganizacion.set(clave, { ...(porOrganizacion.get(clave) || { organizacionId: r.organizacionId }), resumenesEmail: r });
    }
    const resultados = [...porOrganizacion.values()];
    const fases = [categorias, alertas, resumenes];
    return { ejecutado: true, status: fases.some((f) => f.status === 'Error') ? 'Error' : 'Completado', categorias, alertas, resumenes,
        organizacionesProcesadas: resultados.length,
        organizacionesConError: resultados.filter((r) => erroresResultado(r).length || r.categoriasAnimales?.errores?.length || erroresResultado(r.resumenesEmail || {}).length).length,
        notificacionesCreadas: alertas.notificacionesCreadas, correosEnviados: alertas.enviadas + Number(resumenes.enviadas || 0),
        categoriasAnimalesActualizadas: categorias.actualizados, resultados };
});

const iniciarProgramadorAlertas = () => {
    const modo = (process.env.CRON_MODE || 'internal').toLowerCase();
    if (modo !== 'internal') { console.log(`Programador interno de alertas desactivado. CRON_MODE=${modo}`); return; }
    const ejecutar = () => ejecutarAlertasProgramadas({ origen: 'programador-interno', incluirResumenes: false })
        .then((r) => console.log('Revision central de tareas completada:', r))
        .catch((e) => console.error('Error revisando tareas y notificaciones:', e.message));
    ejecutar();
    intervaloInterno = setInterval(ejecutar, Number(process.env.EMAIL_ALERTS_INTERVAL_MS) || 24 * 60 * 60 * 1000);
    const ejecutarResumenes = () => ejecutarResumenesEmailProgramados({ origen: 'programador-interno' })
        .then((r) => console.log('Revision de resumenes Premium completada:', r))
        .catch((e) => console.error('Error enviando resumenes Premium:', e.message));
    ejecutarResumenes();
    intervaloResumenes = setInterval(ejecutarResumenes, Number(process.env.EMAIL_DIGEST_INTERVAL_MS) || 60 * 60 * 1000);
};

module.exports = { ejecutarAlertasProgramadas, ejecutarResumenesEmailProgramados, iniciarProgramadorAlertas };
