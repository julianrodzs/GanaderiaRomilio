const mongoose = require('mongoose');

const MS_HORA = 60 * 60 * 1000;

const idTexto = (valor) => String(valor?._id || valor || '');
const sumarHoras = (fecha, horas = 0) => new Date(new Date(fecha).getTime() + Number(horas) * MS_HORA);

const normalizarPasos = (pasos = []) => {
    const mapa = new Map();
    const normalizados = pasos.map((paso, indice) => {
        const clave = idTexto(paso._id || paso.claveTemporal || `paso-${indice}`);
        const _id = mongoose.isValidObjectId(paso._id) ? paso._id : new mongoose.Types.ObjectId();
        mapa.set(clave, _id);
        return { ...paso, _id, orden: Number(paso.orden ?? indice + 1) };
    });
    return normalizados.map((paso) => ({
        ...paso,
        pasoReferenciaId: paso.referenciaTemporal === 'DESDE_PASO'
            ? (mapa.get(idTexto(paso.pasoReferenciaId || paso.pasoReferenciaClave)) || paso.pasoReferenciaId)
            : undefined
    }));
};

const validarPasos = (pasos = [], accionesPermitidas = []) => {
    if (!pasos.length) throw Object.assign(new Error('El protocolo requiere al menos un paso.'), { status: 400 });
    const ids = new Set(pasos.map((paso) => idTexto(paso._id)));
    pasos.forEach((paso, indice) => {
        if (!String(paso.nombre || '').trim()) throw Object.assign(new Error(`El paso ${indice + 1} requiere nombre.`), { status: 400 });
        if (!accionesPermitidas.includes(paso.tipoAccion)) throw Object.assign(new Error(`La acción ${paso.tipoAccion || 'vacía'} no es válida.`), { status: 400 });
        if (!Number.isFinite(Number(paso.offsetHoras || 0))) throw Object.assign(new Error(`El paso ${paso.nombre} tiene un desplazamiento inválido.`), { status: 400 });
        if (paso.referenciaTemporal === 'DESDE_PASO' && !ids.has(idTexto(paso.pasoReferenciaId))) {
            throw Object.assign(new Error(`El paso ${paso.nombre} referencia otro paso inexistente.`), { status: 400 });
        }
    });
};

const calcularCronograma = ({ pasos = [], fechaInicio, ejecuciones = [], eventos = {} }) => {
    const porPaso = new Map(ejecuciones.map((item) => [idTexto(item.pasoId), item]));
    const fechas = new Map();
    return [...pasos].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0)).map((paso) => {
        let base = new Date(fechaInicio);
        if (paso.referenciaTemporal === 'DESDE_PASO') {
            const ejecucionReferencia = porPaso.get(idTexto(paso.pasoReferenciaId));
            base = ejecucionReferencia?.fechaReal || fechas.get(idTexto(paso.pasoReferenciaId)) || base;
        }
        if (paso.referenciaTemporal === 'DESDE_EVENTO_REAL') base = eventos[paso.eventoReferencia] || null;
        const fechaProgramada = base ? sumarHoras(base, paso.offsetHoras || 0) : null;
        if (fechaProgramada) fechas.set(idTexto(paso._id), fechaProgramada);
        return {
            pasoId: paso._id,
            nombre: paso.nombre,
            tipoAccion: paso.tipoAccion,
            fechaProgramada,
            ventanaInicio: fechaProgramada && Number.isFinite(Number(paso.ventanaInicioHoras)) ? sumarHoras(fechaProgramada, paso.ventanaInicioHoras) : undefined,
            ventanaFin: fechaProgramada && Number.isFinite(Number(paso.ventanaFinHoras)) ? sumarHoras(fechaProgramada, paso.ventanaFinHoras) : undefined,
            estado: porPaso.get(idTexto(paso._id))?.estado || 'PENDIENTE'
        };
    });
};

const calcularCumplimiento = (ejecuciones = []) => {
    const obligatorias = ejecuciones.filter((item) => item.obligatorio !== false);
    const realizadas = obligatorias.filter((item) => ['REALIZADO', 'PARCIAL'].includes(item.estado));
    const aTiempo = realizadas.filter((item) => {
        if (!item.fechaReal) return false;
        if (!item.fechaProgramada) return false;
        const inicio = item.ventanaInicio || new Date(new Date(item.fechaProgramada).setHours(0, 0, 0, 0));
        const fin = item.ventanaFin || new Date(new Date(item.fechaProgramada).setHours(23, 59, 59, 999));
        return new Date(item.fechaReal) >= new Date(inicio) && new Date(item.fechaReal) <= new Date(fin);
    });
    return {
        totalObligatorias: obligatorias.length,
        realizadas: realizadas.length,
        aTiempo: aTiempo.length,
        porcentaje: obligatorias.length ? Number(((realizadas.length / obligatorias.length) * 100).toFixed(1)) : 0,
        porcentajeATiempo: realizadas.length ? Number(((aTiempo.length / realizadas.length) * 100).toFixed(1)) : 0
    };
};

module.exports = { calcularCronograma, calcularCumplimiento, idTexto, normalizarPasos, sumarHoras, validarPasos };
