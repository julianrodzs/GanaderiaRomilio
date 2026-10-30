const { InsumoReproductivo } = require('../models/InsumoReproductivo');
const mongoose = require('mongoose');
const { BancoSemen } = require('../models/BancoSemen');
const { consumirDelBanco } = require('./bancoSemen-service');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');

const errorSemen = (mensaje, status = 422, code = 'SEMEN_INVALID') => Object.assign(
    new Error(mensaje),
    { status, code }
);

const validarCantidadPajuelas = (cantidad) => {
    const valor = Number(cantidad ?? 1);
    if (!Number.isInteger(valor) || valor <= 0) {
        throw errorSemen('La cantidad de pajuelas debe ser un numero entero mayor que cero.', 422, 'SEMEN_QUANTITY_INVALID');
    }
    return valor;
};

const inicioDiaUtc = (fecha) => {
    const valor = new Date(fecha || Date.now());
    if (Number.isNaN(valor.getTime())) throw errorSemen('La fecha de inseminacion no es valida.');
    return new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
};

const consumirSemen = async ({ semenId, cantidad = 1, fechaInseminacion, session = null, campanaId, moneda, especie, usuarioId, eventoId }) => {
    if (!semenId) throw errorSemen('Selecciona el lote de semen utilizado.', 422, 'SEMEN_REQUIRED');
    const pajuelas = validarCantidadPajuelas(cantidad);
    const fechaUso = inicioDiaUtc(fechaInseminacion);
    if (mongoose.isObjectIdOrHexString(semenId)) {
        const ficha = await BancoSemen.findById(semenId).session(session);
        if (ficha) {
            const { asegurarPlanVigente, obtenerPlanActual } = require('./plan-service');
            const plan = asegurarPlanVigente(await obtenerPlanActual());
            if (!plan.configuracion.funcionalidades.iatfReproductivo) throw errorSemen('El banco de semen requiere Pro o Premium.', 403, 'PLAN_FEATURE_NOT_AVAILABLE');
            const ejecutar = (sesion) => consumirDelBanco({ semenId, cantidad: pajuelas, campanaId, moneda, especie, usuarioId, eventoId, session: sesion });
            return session ? ejecutar(session) : ejecutarEnTransaccion(ejecutar);
        }
        const legado = await InsumoReproductivo.findById(semenId).session(session);
        if (legado?.bancoSemenId) {
            return consumirSemen({ semenId: legado.bancoSemenId, cantidad, fechaInseminacion, session, campanaId, moneda, especie, usuarioId, eventoId });
        }
        if (campanaId) throw errorSemen('Asigna primero semen del banco a la campana.', 400, 'SEMEN_ASSIGNMENT_REQUIRED');
    }
    const semen = await InsumoReproductivo.findOneAndUpdate(
        {
            _id: semenId,
            categoria: 'SEMEN',
            activo: true,
            cantidadDisponible: { $gte: pajuelas },
            $or: [
                { fechaVencimiento: { $exists: false } },
                { fechaVencimiento: null },
                { fechaVencimiento: { $gte: fechaUso } }
            ]
        },
        { $inc: { cantidadDisponible: -pajuelas } },
        { new: true, runValidators: true, session }
    );
    if (!semen) {
        const existente = await InsumoReproductivo.findById(semenId).session(session);
        if (existente?.fechaVencimiento && inicioDiaUtc(existente.fechaVencimiento) < fechaUso) {
            throw errorSemen('El lote de semen esta vencido para la fecha de inseminacion.', 422, 'SEMEN_EXPIRED');
        }
        throw errorSemen('No hay suficientes pajuelas disponibles en el lote seleccionado.', 422, 'SEMEN_STOCK_INSUFFICIENT');
    }
    return {
        insumo: semen,
        cantidad: pajuelas,
        snapshot: {
            nombre: semen.nombre,
            toro: semen.toro,
            codigoToro: semen.codigoToro,
            raza: semen.razaToro,
            lote: semen.lote,
            tipoSemen: semen.tipoSemen,
            fechaVencimiento: semen.fechaVencimiento,
            cantidad: pajuelas,
            costoUnitario: semen.costoUnitario,
            moneda: semen.moneda
        }
    };
};

const devolverSemen = async ({ semenId, cantidad, session = null }) => {
    if (!semenId) return null;
    const pajuelas = validarCantidadPajuelas(cantidad);
    return InsumoReproductivo.findOneAndUpdate(
        { _id: semenId, categoria: 'SEMEN' },
        { $inc: { cantidadDisponible: pajuelas } },
        { new: true, runValidators: true, session }
    );
};

module.exports = {
    consumirSemen,
    devolverSemen,
    inicioDiaUtc,
    validarCantidadPajuelas
};
