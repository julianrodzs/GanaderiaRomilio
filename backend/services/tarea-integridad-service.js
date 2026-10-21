const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const Lote = require('../models/Lote');
const { ESTADOS_TAREA } = require('../models/Tarea');
const { normalizarId } = require('./identificador-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { claveDiaEnZona } = require('./fechaZonaHoraria-service');

const errorTarea = (mensaje, status = 400, codigo = 'TAREA_INVALIDA') => Object.assign(new Error(mensaje), { status, codigo });
const CAMPOS = ['titulo', 'descripcion', 'tipo', 'estado', 'prioridad', 'fechaProgramada', 'fechaLimite', 'asignadoA', 'animal', 'potrero', 'lote', 'observaciones'];
const rechazarOperadores = (valor) => {
    if (!valor || typeof valor !== 'object') return;
    for (const [clave, dato] of Object.entries(valor)) {
        if (clave.startsWith('$') || clave.includes('.') || ['__proto__', 'constructor', 'prototype'].includes(clave)) {
            throw errorTarea('No se permiten operadores ni rutas de campos en tareas.');
        }
        rechazarOperadores(dato);
    }
};
const limpiarDatosTarea = (datos, campos = CAMPOS) => {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw errorTarea('Datos de tarea inválidos.');
    rechazarOperadores(datos);
    const salida = {};
    for (const [campo, valor] of Object.entries(datos)) {
        if (!campos.includes(campo)) throw errorTarea(`Campo no editable: ${campo}.`);
        if (valor != null && typeof valor === 'object') throw errorTarea(`Valor inválido para ${campo}.`);
        if (campo === 'reapertura' && typeof valor !== 'boolean') throw errorTarea('La reapertura debe ser explícita.');
        if (campo !== 'reapertura' && valor != null && typeof valor !== 'string') throw errorTarea(`El campo ${campo} debe ser texto.`);
        salida[campo] = ['animal', 'potrero', 'lote', 'fechaLimite'].includes(campo) && (valor === '' || valor === 'null') ? null : valor;
        if (['animal', 'potrero', 'lote', 'asignadoA'].includes(campo)) salida[campo] = normalizarId(salida[campo]);
        if (typeof salida[campo] === 'string' && salida[campo].length > (campo === 'titulo' ? 200 : 5000)) throw errorTarea(`El campo ${campo} es demasiado largo.`);
        if (['fechaProgramada', 'fechaLimite'].includes(campo) && salida[campo] != null) {
            const fecha = new Date(salida[campo]);
            if (!salida[campo] || Number.isNaN(fecha.getTime()) || (/^\d{4}-\d{2}-\d{2}$/.test(salida[campo]) && fecha.toISOString().slice(0, 10) !== salida[campo])) throw errorTarea('Fecha de tarea inválida.');
            salida[campo] = fecha;
        }
    }
    return salida;
};
const validarRelacionesTarea = async (datos, session) => {
    if (Object.hasOwn(datos, 'asignadoA')) await validarUsuarioAsignable(datos.asignadoA, 'Tareas', { session });
    for (const [campo, Modelo] of [['animal', Animal], ['potrero', Potrero], ['lote', Lote]]) {
        if (datos[campo] && !await Modelo.exists({ _id: datos[campo] }).session(session || null)) throw errorTarea(`${campo} no existe en la finca activa.`);
    }
};
const esTareaEspecializada = (tarea) => ['Sanidad', 'IATF', 'BandaPorcina', 'BandaReproductivaPorcina', 'ProtocoloEngorde'].includes(tarea.moduloOrigen)
    || ['IATF', 'BANDA_PORCINA', 'PROTOCOLO_ENGORDE'].includes(tarea.categoriaAutomatica);
const esTareaVinculada = (tarea) => Boolean(tarea.creadoAutomaticamente || tarea.referenciaId || esTareaEspecializada(tarea));
const validarTransicionTarea = (tarea, destino, gestor, reapertura = false) => {
    if (!ESTADOS_TAREA.includes(destino)) throw errorTarea('Estado de tarea inválido.');
    if (destino === tarea.estado) return;
    if (destino === 'Completada' && esTareaEspecializada(tarea)) throw errorTarea('Registra la ejecución desde el módulo de origen.', 409, 'PROTOCOLO_REQUIERE_EJECUCION');
    if (['Completada', 'Cancelada'].includes(tarea.estado)) {
        if (!gestor || !reapertura || destino !== 'Pendiente' || esTareaVinculada(tarea)) throw errorTarea('Esta tarea requiere una reapertura autorizada desde su origen.', 409, 'TAREA_REAPERTURA_REQUERIDA');
    }
    if (destino === 'Cancelada' && !gestor) throw errorTarea('No tienes permiso para cancelar tareas.', 403);
};
const fechaEjecucionTarea = (valor, ahora = new Date()) => {
    if (valor == null || valor === '') return ahora;
    if (typeof valor !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(valor)) throw errorTarea('La fecha de ejecución debe incluir hora y zona horaria.');
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime()) || fecha > ahora) throw errorTarea('Fecha de ejecución inválida o futura.');
    return fecha;
};
// Las fechas civiles históricas se almacenan a medianoche UTC; los protocolos conservan sus instantes.
const claveFechaTarea = (fecha, zona = 'America/Costa_Rica') => {
    const d = new Date(fecha);
    return d.toISOString().endsWith('T00:00:00.000Z') ? d.toISOString().slice(0, 10) : claveDiaEnZona(d, zona);
};
const diasHastaTarea = (fecha, zona = 'America/Costa_Rica', ahora = new Date()) => (
    (Date.parse(claveFechaTarea(fecha, zona)) - Date.parse(claveDiaEnZona(ahora, zona))) / 86400000
);

module.exports = { CAMPOS, limpiarDatosTarea, validarRelacionesTarea, esTareaEspecializada, esTareaVinculada, validarTransicionTarea, fechaEjecucionTarea, claveFechaTarea, diasHastaTarea, errorTarea };
