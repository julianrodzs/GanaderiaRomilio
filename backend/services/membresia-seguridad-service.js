const crypto = require('crypto');
const BloqueoSeguridad = require('../models/BloqueoSeguridad');
const { Membresia } = require('../models/Membresia');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const adquirirBloqueo = async (organizacionId) => {
    const clave = `administradores:${organizacionId}`;
    const token = crypto.randomUUID();
    for (let intento = 0; intento < 50; intento += 1) {
        const ahora = new Date();
        const expiraEn = new Date(ahora.getTime() + 15000);
        try {
            const bloqueo = await BloqueoSeguridad.findOneAndUpdate(
                { clave, $or: [{ expiraEn: { $lte: ahora } }, { token }] },
                { $set: { clave, token, expiraEn } },
                { upsert: true, new: true }
            );
            if (bloqueo?.token === token) return { clave, token };
        } catch (error) {
            if (error?.code !== 11000) throw error;
        }
        await esperar(30);
    }
    const error = new Error('La membresía está siendo actualizada. Intenta nuevamente.');
    error.status = 409;
    throw error;
};

const liberarBloqueo = ({ clave, token }) => BloqueoSeguridad.deleteOne({ clave, token });

const ejecutarProtegiendoAdministradores = async ({ organizacionId, membresia, siguienteRol, siguienteEstado, operacion }) => {
    const dejaDeSerAdministrador = membresia.rol === 'Administrador'
        && membresia.estado === 'Activo'
        && (siguienteRol !== undefined && siguienteRol !== 'Administrador'
            || siguienteEstado !== undefined && siguienteEstado !== 'Activo');
    if (!dejaDeSerAdministrador) return operacion();

    const bloqueo = await adquirirBloqueo(organizacionId);
    try {
        const otros = await Membresia.countDocuments({
            organizacionId,
            _id: { $ne: membresia._id },
            rol: 'Administrador',
            estado: 'Activo'
        });
        if (otros < 1) {
            const error = new Error('La organización debe conservar al menos un administrador activo.');
            error.status = 409;
            throw error;
        }
        return await operacion();
    } finally {
        await liberarBloqueo(bloqueo).catch(() => null);
    }
};

module.exports = { ejecutarProtegiendoAdministradores };
