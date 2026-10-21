const Animal = require('../models/Animal');

const MS_DIA = 24 * 60 * 60 * 1000;
const conSession = (query, session) => session ? query.session(session) : query;

const normalizarDiasRetiro = (valor) => {
    const dias = Number(valor || 0);
    if (!Number.isFinite(dias) || dias < 0 || !Number.isInteger(dias)) {
        const error = new Error('Los días de retiro de carne deben ser un entero mayor o igual a cero');
        error.status = 400;
        throw error;
    }
    return dias;
};

const calcularFechaFinRetiroCarne = (fechaAplicacion, diasRetiroCarne) => {
    const dias = normalizarDiasRetiro(diasRetiroCarne);
    if (!dias) return null;
    const inicio = new Date(fechaAplicacion);
    if (Number.isNaN(inicio.getTime())) {
        const error = new Error('La fecha de aplicación no es válida');
        error.status = 400;
        throw error;
    }
    return new Date(inicio.getTime() + (dias * MS_DIA));
};

const aplicarRetiroCarneAnimales = async ({
    animales,
    producto,
    fechaAplicacion,
    diasRetiroCarne,
    session
}) => {
    const fechaFinRetiroCarne = calcularFechaFinRetiroCarne(fechaAplicacion, diasRetiroCarne);
    if (!fechaFinRetiroCarne) return null;

    const ids = [...new Set((animales || []).map((animal) => String(animal?._id || animal)).filter(Boolean))];
    const registros = await conSession(
        Animal.find({ _id: { $in: ids } }).select('_id fechaFinRetiroCarne'),
        session
    );

    await Promise.all(registros.map((animal) => {
        const retiroActual = animal.fechaFinRetiroCarne ? new Date(animal.fechaFinRetiroCarne) : null;
        if (retiroActual && retiroActual >= fechaFinRetiroCarne) return null;
        return Animal.updateOne(
            { _id: animal._id },
            { $set: { fechaFinRetiroCarne, medicamentoEnRetiro: producto } },
            session ? { session } : {}
        );
    }));

    return fechaFinRetiroCarne;
};

const obtenerAlertasRetiroVenta = async ({ animales, fechaVenta, session }) => {
    const ids = [...new Set((animales || []).map((animal) => String(animal?._id || animal)).filter(Boolean))];
    if (!ids.length) return [];
    const fecha = new Date(fechaVenta || new Date());
    if (Number.isNaN(fecha.getTime())) return [];

    const registros = await conSession(
        Animal.find({
            _id: { $in: ids },
            fechaFinRetiroCarne: { $gt: fecha }
        }).select('_id diio identificadorFinca nombre medicamentoEnRetiro fechaFinRetiroCarne'),
        session
    ).lean();

    return registros.map((animal) => ({
        animalId: animal._id,
        animal: animal.diio || animal.identificadorFinca || animal.nombre || String(animal._id),
        medicamento: animal.medicamentoEnRetiro || 'Medicamento no especificado',
        fechaFinRetiroCarne: animal.fechaFinRetiroCarne,
        diasFaltantes: Math.max(Math.ceil((new Date(animal.fechaFinRetiroCarne) - fecha) / MS_DIA), 1)
    }));
};

module.exports = {
    aplicarRetiroCarneAnimales,
    calcularFechaFinRetiroCarne,
    normalizarDiasRetiro,
    obtenerAlertasRetiroVenta
};
