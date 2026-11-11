const { setTimeout: esperar } = require('node:timers/promises');
const Limite = require('../models/LimiteProveedorCorreo');

const CLAVE = 'resend-equipo';
const INTERVALO_MS = 250;
const EPOCA = new Date(0);

const errorPlazo = () => Object.assign(new Error('Se agoto el tiempo de espera para enviar el correo. Queda pendiente para una proxima ejecucion.'), { code: 'EMAIL_SEND_DEADLINE' });

const crearLimitadorCorreo = ({ modelo = Limite, dormir = esperar, reloj = () => performance.now() } = {}) => ({
    async esperarTurno({ limiteTiempo, comprobarBloqueo = async () => {} }) {
        // El _id nativo evita carreras en la inicializacion, sin indices ni migraciones adicionales.
        try {
            await modelo.updateOne({ _id: CLAVE }, { $setOnInsert: { disponibleDesde: EPOCA } }, { upsert: true });
        } catch (error) { if (error.code !== 11000) throw error; }
        for (;;) {
            await comprobarBloqueo();
            if (reloj() >= limiteTiempo) throw errorPlazo();
            const turno = await modelo.findOneAndUpdate(
                { _id: CLAVE, $expr: { $lte: ['$disponibleDesde', '$$NOW'] } },
                [{ $set: { disponibleDesde: { $add: ['$$NOW', INTERVALO_MS] } } }],
                { new: true }
            ).lean();
            if (turno) return turno.disponibleDesde;
            const [actual] = await modelo.aggregate([
                { $match: { _id: CLAVE } },
                { $project: { esperaMs: { $max: [1, { $subtract: ['$disponibleDesde', '$$NOW'] }] } } }
            ]);
            const demora = Math.max(1, Number(actual?.esperaMs) || INTERVALO_MS);
            // Esperas cortas permiten detectar la perdida del lease del cron mientras espera.
            await dormir(Math.min(demora, 1000, Math.max(1, limiteTiempo - reloj())));
        }
    },
    async pausar(demoraMs) {
        await modelo.updateOne({ _id: CLAVE }, [{ $set: {
            disponibleDesde: { $max: [{ $ifNull: ['$disponibleDesde', EPOCA] }, { $add: ['$$NOW', demoraMs] }] }
        } }], { upsert: true });
    }
});

const limitador = crearLimitadorCorreo();
module.exports = { ...limitador, crearLimitadorCorreo, errorPlazo, INTERVALO_MS };
