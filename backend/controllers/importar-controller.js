const crypto = require('crypto');
const {
    confirmarImportacionExcel,
    generarPlantillaExcel,
    procesarExcelPreview
} = require('../services/importarExcel-service');
const Animal = require('../models/Animal');
const CatalogoFinanciero = require('../models/CatalogoFinanciero');
const ImportacionExcel = require('../models/ImportacionExcel');
const Lote = require('../models/Lote');
const Potrero = require('../models/Potrero');
const Pesaje = require('../models/Pesaje');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { asegurarPlanVigente, obtenerPlanActual, puedeCrearAnimal, puedeUsarEspecie } = require('../services/plan-service');
const { adquirirBloqueoImportacion, liberarBloqueoImportacion } = require('../services/importacionExcel-lock-service');

const importarCtrl = {};
const MINUTOS_BLOQUEO = Number(process.env.IMPORT_PROCESSING_STALE_MINUTES || 20);

const obtenerCatalogosActivos = async () => {
    const catalogos = await CatalogoFinanciero.find({ activo: true }).select('tipo nombre').sort({ nombre: 1 }).lean();
    return {
        categorias: catalogos.filter((item) => item.tipo === 'categoria').map((item) => item.nombre),
        destinosUso: catalogos.filter((item) => item.tipo === 'destinoUso').map((item) => item.nombre)
    };
};

const crearHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

importarCtrl.descargarPlantilla = async (req, res) => {
    try {
        const catalogos = await obtenerCatalogosActivos();
        const buffer = generarPlantillaExcel(catalogos);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla-importacion-ganaderia.xlsx"');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo generar la plantilla', error: error.message });
    }
};

importarCtrl.previewExcel = async (req, res) => {
    let bloqueo;
    try {
        bloqueo = await adquirirBloqueoImportacion({ organizacionId: req.organizacionId, operacion: 'Vista previa' });
        if (!req.file) return res.status(400).json({ mensaje: 'Debes subir un archivo .xlsx en el campo archivo' });
        asegurarPlanVigente(await obtenerPlanActual(req.organizacionId));

        const hashArchivo = crearHash(req.file.buffer);
        const importacionConfirmada = await ImportacionExcel.exists({
            hashArchivo,
            usuario: req.usuario?.id,
            estado: { $in: ['Aplicada', 'Confirmada', 'Confirmada con errores'] }
        });
        if (importacionConfirmada) {
            return res.status(409).json({
                mensaje: 'Este mismo archivo ya fue confirmado anteriormente. Modifica el archivo o revisa el historial antes de volver a importarlo.'
            });
        }

        const [catalogosFinancieros, animalesExistentes, lotes] = await Promise.all([
            obtenerCatalogosActivos(),
            Animal.find({}).select('diio identificadorFinca nombre especie sexo categoria objetivoProductivo etapaProductiva estado estadoSanitario fechaNacimiento potreroActual madre padre observaciones').lean(),
            Lote.find({}).select('codigo especie proposito estado').lean()
        ]);
        const diios = animalesExistentes.flatMap((item) => [item.diio, item.identificadorFinca]).filter(Boolean);
        const resultado = await procesarExcelPreview(req.file.buffer, {
            catalogosFinancieros,
            diiosExistentes: diios,
            animalesExistentes,
            lotesExistentes: lotes,
            organizacionId: req.organizacionId,
            fincaId: req.fincaId,
            resolverDuplicados: async (registros) => {
                const modelos = { Potrero, Animal, MovimientoFinanciero, Pesaje };
                const pares = await Promise.all(Object.entries(modelos).map(async ([nombre, Modelo]) => {
                    const claves = registros[nombre].map((item) => item.claveImportacion).filter(Boolean);
                    const existentes = claves.length ? await Modelo.distinct('claveImportacion', { claveImportacion: { $in: claves } }) : [];
                    return [nombre, new Set(existentes)];
                }));
                return Object.fromEntries(pares);
            },
            validarCupo: async (animales) => {
                const nuevos = animales.filter((item) => item.operacion === 'crear' && !item.omitirPorDuplicado);
                if (!nuevos.length) return { permitido: true };
                for (const especie of new Set(nuevos.map((item) => item.especie))) {
                    const especiePermitida = await puedeUsarEspecie(especie, req.organizacionId);
                    if (!especiePermitida.permitido) return { ...especiePermitida, cantidadSolicitada: nuevos.length };
                }
                const cuota = await puedeCrearAnimal({ organizacionId: req.organizacionId, especie: nuevos[0].especie, cantidad: nuevos.length });
                return cuota.permitido ? cuota : {
                    ...cuota,
                    cantidadSolicitada: nuevos.length,
                    mensaje: `Su plan permite ${cuota.limite} animales activos; esta importación agregaría ${nuevos.length} y dejaría ${Number(cuota.actual || 0) + nuevos.length}. Elimine filas o mejore su plan.`
                };
            }
        });
        const importacion = await ImportacionExcel.create({
            archivo: req.file.originalname,
            versionPlantilla: resultado.versionPlantilla,
            hashArchivo,
            estado: resultado.valido ? 'Pendiente' : 'Con errores',
            modulosSolicitados: resultado.hojasDetectadas.filter((item) => item.reconocida).map((item) => item.nombre),
            hojasDetectadas: resultado.hojasDetectadas,
            resumenDetectado: resultado.resumen,
            registros: resultado.registros,
            errores: resultado.errores,
            advertencias: resultado.advertencias,
            usuario: req.usuario?.id,
            expiraEn: new Date(Date.now() + Number(process.env.IMPORT_PREVIEW_TTL_HOURS || 24) * 60 * 60 * 1000)
        });
        const { registros, ...respuesta } = resultado;
        res.json({
            ...respuesta,
            importacionId: importacion._id,
            puedeConfirmar: resultado.valido
        });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.status === 409 ? error.message : 'Error al validar el archivo Excel', error: error.message, codigo: error.codigo });
    } finally {
        await liberarBloqueoImportacion(bloqueo).catch(() => {});
    }
};

importarCtrl.confirmarExcel = async (req, res) => {
    let bloqueo;
    try {
        bloqueo = await adquirirBloqueoImportacion({ organizacionId: req.organizacionId, operacion: 'Confirmacion' });
        const { importacionId, modo = 'crear_actualizar', duplicadosConfirmados = [] } = req.body || {};
        if (!importacionId) return res.status(400).json({ mensaje: 'La vista previa es obligatoria antes de confirmar.' });
        if (!['crear_actualizar', 'solo_crear'].includes(modo)) return res.status(400).json({ mensaje: 'Modo de importación no permitido.' });

        asegurarPlanVigente(await obtenerPlanActual(req.organizacionId));
        const vencidoAntesDe = new Date(Date.now() - MINUTOS_BLOQUEO * 60 * 1000);
        await ImportacionExcel.updateMany(
            { estado: 'Procesando', iniciadoEn: { $lte: vencidoAntesDe } },
            { $set: { estado: 'Fallida', finalizadoEn: new Date(), errorFinal: { mensaje: 'La importación excedió el tiempo máximo de procesamiento.' } } }
        );
        await ImportacionExcel.updateMany(
            { estado: 'Pendiente', expiraEn: { $lte: new Date() } },
            { $set: { estado: 'Expirada', finalizadoEn: new Date() } }
        );
        const importacion = await ImportacionExcel.findOneAndUpdate(
            { _id: importacionId, usuario: req.usuario?.id, estado: 'Pendiente', expiraEn: { $gt: new Date() } },
            { $set: { estado: 'Procesando', iniciadoEn: new Date(), modo } },
            { new: true }
        );
        if (!importacion) {
            const existente = await ImportacionExcel.findOne({ _id: importacionId, usuario: req.usuario?.id }).select('estado');
            if (existente) return res.status(409).json({ mensaje: 'Esta importación ya se está procesando, fue aplicada, falló o expiró.', estado: existente.estado });
            return res.status(404).json({ mensaje: 'Vista previa no encontrada.' });
        }

        let respuesta;
        try {
            respuesta = await confirmarImportacionExcel(
                { registros: importacion.registros },
                {
                    modo,
                    usuarioId: req.usuario?.id,
                    importacionId: importacion._id,
                    organizacionId: req.organizacionId,
                    fincaId: req.fincaId,
                    duplicadosConfirmados
                }
            );
            await ImportacionExcel.updateOne({ _id: importacion._id, estado: 'Procesando' }, {
                $set: { estado: 'Aplicada', resultado: respuesta.resultado, confirmadaAt: new Date(), finalizadoEn: new Date() }
            });
        } catch (error) {
            await ImportacionExcel.updateOne({ _id: importacion._id, estado: 'Procesando' }, {
                $set: { estado: 'Fallida', finalizadoEn: new Date(), errorFinal: { mensaje: error.message, codigo: error.codigo, hoja: error.hoja, fila: error.fila } }
            });
            throw error;
        }

        res.status(201).json({
            ...respuesta,
            importacionId: importacion._id,
            estado: 'Aplicada',
            hojasDetectadas: importacion.hojasDetectadas,
            resumenDetectado: importacion.resumenDetectado,
            advertencias: importacion.advertencias
        });
    } catch (error) {
        const status = error.status || (error.codigo === 'IMPORTACION_EN_PROCESO' ? 409 : 422);
        res.status(status).json({ mensaje: 'Error al confirmar la importación', error: error.message, codigo: error.codigo, hoja: error.hoja, fila: error.fila });
    } finally {
        await liberarBloqueoImportacion(bloqueo).catch(() => {});
    }
};

module.exports = importarCtrl;
