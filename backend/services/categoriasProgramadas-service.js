const Organizacion = require('../models/Organizacion');
const Finca = require('../models/Finca');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { sincronizarCategoriasAnimales } = require('./categoriaAnimal-service');

const procesarCategoriasTodasOrganizaciones = async ({ comprobarBloqueo = async () => {}, alProgreso = () => {}, fechaReferencia = new Date() } = {}) => {
    const organizaciones = await Organizacion.find({ estado: 'Activa', 'plan.estado': { $in: ['Activo', 'Prueba'] } }).select('_id nombre').lean();
    const resultados = [];
    for (const organizacion of organizaciones) {
        await comprobarBloqueo();
        const resultado = { organizacionId: organizacion._id, organizacion: organizacion.nombre, escaneados: 0, revisados: 0, actualizados: 0, sellados: 0, errores: [], fincas: [] };
        try {
            await ejecutarConOrganizacion(organizacion._id, async () => {
                const fincas = Finca.find({ estado: 'Activa' }).select('_id').lean().cursor({ batchSize: 250 });
                try {
                    for await (const finca of fincas) {
                        await comprobarBloqueo();
                        try {
                            const conteos = await ejecutarConOrganizacion(organizacion._id,
                                () => sincronizarCategoriasAnimales(fechaReferencia, { comprobarBloqueo, alProgreso }), finca._id);
                            for (const campo of ['escaneados', 'revisados', 'actualizados', 'sellados']) resultado[campo] += conteos[campo];
                            resultado.fincas.push({ fincaId: finca._id, ...conteos });
                        } catch (error) {
                            if (error.code === 'JOB_LOCK_LOST') throw error;
                            const parcial = error.resultadoCategorias || {};
                            for (const campo of ['escaneados', 'revisados', 'actualizados', 'sellados']) resultado[campo] += parcial[campo] || 0;
                            resultado.errores.push({ fincaId: finca._id, mensaje: error.message });
                        }
                        alProgreso();
                    }
                } finally { await fincas.close(); }
            });
        } catch (error) {
            if (error.code === 'JOB_LOCK_LOST') throw error;
            resultado.errores.push({ mensaje: error.message });
        }
        resultados.push(resultado);
    }
    return resultados;
};
module.exports = { procesarCategoriasTodasOrganizaciones };
