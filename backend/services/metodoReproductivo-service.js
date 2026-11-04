const catalogo = require('../config/metodos-reproductivos.json');
const DIA = 86400000;
const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const id = (v) => v?._id?.toString() || v?.toString();
const fecha = (v) => v ? new Date(v) : null;
const sumarDias = (v, n) => new Date(new Date(v).getTime() + n * DIA);

const metodoLegado = (r = {}) => {
    if (r.metodo) return r.metodo;
    if (r.campanaIATF || r.tipoInseminacion === 'IATF' || r.origenGestacion === 'IATF') return 'IATF';
    if (r.tipoRegistro === 'Monta' || r.origenGestacion === 'MONTA_NATURAL') return 'MONTA_NATURAL';
    if (r.tipoRegistro === 'Inseminación' || r.tipoInseminacion === 'IA_CONVENCIONAL' || r.origenGestacion === 'IA_CONVENCIONAL') return 'IA_CONVENCIONAL';
    return 'DESCONOCIDO';
};
const validarMetodo = (metodo, especie = 'Bovino') => {
    if (!catalogo[metodo]?.especies.includes(especie)) throw error('Metodo reproductivo no permitido para esta especie.');
    return metodo;
};

// Las fechas compatibles son evidencia temporal, no una prueba de paternidad.
const calcularAtribucion = (r, { diasGestacion = r.especie === 'Porcino' ? 114 : 283, toleranciaDias = 21 } = {}) => {
    const servicios = (r.servicios || []).filter((s) => !s.anulado);
    const diagnostico = [...(r.historialDiagnosticos || [])].reverse().find((d) => d.resultado === 'PREÑADA' || d.resultado === 'PRENADA');
    const base = r.fechaPartoReal || r.fechaPartoEstimada || diagnostico?.fechaProbableParto;
    const concepcion = diagnostico?.diasGestacionEstimados != null
        ? sumarDias(diagnostico.fecha, -diagnostico.diasGestacionEstimados)
        : base ? sumarDias(base, -diasGestacion) : null;
    const compatibles = servicios.filter((s) => {
        const inicio = fecha(s.fechaServicio || s.fechaServicioDesde);
        const fin = fecha(s.fechaServicio || s.fechaServicioHasta || s.fechaServicioDesde);
        if (!inicio || !concepcion) return true;
        const edadEmbrion = s.metodo === 'TRANSFERENCIA_EMBRIONES' ? Number(s.embrion?.edadDias ?? 7) : 0;
        const esperado = sumarDias(concepcion, edadEmbrion);
        return inicio <= sumarDias(esperado, toleranciaDias) && fin >= sumarDias(esperado, -toleranciaDias);
    });
    const candidatos = compatibles.map((s) => s._id);
    const confirmado = r.atribucionConfirmadaPorUsuario && compatibles.find((s) => id(s._id) === id(r.servicioAtribuidoId));
    if (confirmado) return { estadoAtribucion: 'CONFIRMADA', servicioAtribuidoId: confirmado._id, serviciosCandidatos: candidatos, metodo: confirmado.metodo };
    if (!compatibles.length) return { estadoAtribucion: 'SIN_SERVICIO', servicioAtribuidoId: null, serviciosCandidatos: [], metodo: 'DESCONOCIDO' };
    if (compatibles.length === 1) return { estadoAtribucion: 'CONFIRMADA', servicioAtribuidoId: compatibles[0]._id, serviciosCandidatos: candidatos, metodo: compatibles[0].metodo };
    // Un rango libre o sin fecha nunca permite elegir silenciosamente una IATF.
    return { estadoAtribucion: 'INCIERTA', servicioAtribuidoId: null, serviciosCandidatos: candidatos, metodo: 'DESCONOCIDO' };
};

const prepararMetodoCiclo = (r) => {
    const metodo = validarMetodo(metodoLegado(r), r.especie || 'Bovino');
    if (!(r.servicios || []).length && metodo !== 'DESCONOCIDO' && !r.inseminacionAnulada) {
        r.servicios = [{
            metodo, fechaServicio: r.fechaInseminacion || r.fechaMonta || null,
            submodalidad: metodo === 'MONTA_NATURAL' ? 'CONTROLADA' : undefined,
            campanaId: r.campanaIATF, fichaSemenId: r.bancoSemenId,
            toroId: r.semenSnapshot?.toroId, sementalExternoNombre: r.semenSnapshot?.esExterno ? r.semenSnapshot?.toro : undefined,
            diioSemental: r.semenSnapshot?.codigoToro, responsable: r.asignadoA
        }];
    }
    for (const s of r.servicios || []) validarMetodo(s.metodo, r.especie || 'Bovino');
    r.metodo = metodo;
    if ((r.servicios || []).length || r.fechaPartoReal || r.gestacionConfirmada) Object.assign(r, calcularAtribucion(r, {
        diasGestacion: r.diasGestacionReferencia || (r.especie === 'Porcino' ? 114 : 283), toleranciaDias: r.toleranciaAtribucionDias ?? 21
    }));
    if (r.fechaPartoReal && !r.resultado?.tipo) r.resultado = { tipo: 'PARTO', fecha: r.fechaPartoReal };
    r.origenGestacion = r.metodo === 'DESCONOCIDO' ? 'INDETERMINADO' : r.metodo;
};

module.exports = { catalogo, metodoLegado, validarMetodo, calcularAtribucion, prepararMetodoCiclo, sumarDias, error };
