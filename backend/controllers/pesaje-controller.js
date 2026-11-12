const pesajeCtrl = {};

const Pesaje = require('../models/Pesaje');
const Animal = require('../models/Animal');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { Membresia } = require('../models/Membresia');
const { listarFincasAccesibles } = require('../services/accesoFinca-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { filtroTipoPesaje, origenPesaje } = require('../config/tiposPesaje');
const {
    actualizarPesoActualAnimal,
    crearErrorPesaje,
    limpiarEventosPesaje,
    registrarEventoPesaje,
    sanitizarPesaje,
    validarDatosPesaje
} = require('../services/pesaje-integridad-service');

const poblarPesaje = (query) => query
    .populate('animal')
    .populate('lote', 'codigo nombre')
    .populate('fincaId', 'nombre codigo')
    .populate('registradoPor', 'nombre apellido correo rol')
    .populate('editadoPor', 'nombre apellido correo rol');

const prepararDatosPersistencia = (datos, validacion) => ({
    ...datos,
    fecha: validacion.fecha,
    peso: validacion.peso,
    etapaProductiva: validacion.animal.especie === 'Porcino'
        ? datos.etapaProductiva || validacion.animal.etapaProductiva || undefined
        : undefined
});

const obtenerFiltroPesajes = async (especie, filtros = {}) => {
    const filtroPesajes = filtroTipoPesaje(filtros.tipoPesaje);
    if (filtros.animal) filtroPesajes.animal = filtros.animal;
    if (filtros.fechaInicio || filtros.fechaFin) {
        const { parsearFechaCivil } = require('../services/fechaZonaHoraria-service');
        filtroPesajes.fecha = {};
        if (filtros.fechaInicio) filtroPesajes.fecha.$gte = parsearFechaCivil(filtros.fechaInicio);
        if (filtros.fechaFin) { const fin = parsearFechaCivil(filtros.fechaFin); fin.setUTCHours(23, 59, 59, 999); filtroPesajes.fecha.$lte = fin; }
    }
    if (!['Bovino', 'Porcino'].includes(especie)) return filtroPesajes;
    const filtro = especie === 'Bovino'
        ? { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] }
        : { especie };
    const animales = await Animal.find(filtro).select('_id');
    return { ...filtroPesajes, animal: { $in: animales.filter((animal) => !filtros.animal || String(animal._id) === filtros.animal).map((animal) => animal._id) } };
};

pesajeCtrl.getPesajes = async (req, res) => {
    try {
        const filtro = await obtenerFiltroPesajes(req.query.especie, req.query);
        const pesajes = await poblarPesaje(Pesaje.find(filtro).sort({ fecha: -1, createdAt: -1, _id: -1 }));
        res.json(pesajes);
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message });
    }
};

pesajeCtrl.createPesaje = async (req, res) => {
    try {
        const datos = sanitizarPesaje(req.body);
        let pesajeId;
        await ejecutarEnTransaccion(async (session) => {
            const validacion = await validarDatosPesaje(datos, { session });
            const [pesaje] = await Pesaje.create([{
                ...prepararDatosPersistencia(datos, validacion),
                lote: validacion.animal.loteActual || null,
                tipoPesaje: datos.tipoPesaje || 'REGULAR',
                origenPesaje: 'Individual',
                registradoPor: req.usuario?.id
            }], { session, ordered: true });
            await actualizarPesoActualAnimal(pesaje.animal, {
                session,
                organizacionId: req.organizacionId
            });
            await registrarEventoPesaje(pesaje, req.usuario?.id, { session });
            pesajeId = pesaje._id;
        });

        const pesaje = await poblarPesaje(Pesaje.findById(pesajeId));
        await notificarAccionSegura({
            actor: req.usuario,
            naturaleza: 'Informativa',
            tipo: 'PESAJE_REGISTRADO',
            titulo: 'Pesaje registrado',
            mensaje: `${nombreUsuario(req.usuario)} registró un pesaje de ${pesaje.peso} kg para ${pesaje.animal?.diio || pesaje.animal?.identificadorFinca || pesaje.animal?.nombre || 'un animal'}.`,
            moduloOrigen: 'Pesajes',
            entidadTipo: 'Animal',
            entidadId: pesaje.animal?._id || pesaje.animal,
            url: `/inventario/animal/${pesaje.animal?._id || pesaje.animal}`,
            metadata: { pesajeId: pesaje._id, peso: pesaje.peso }
        });
        res.status(201).json(pesaje);
    } catch (error) {
        res.status(error.status || (error.code === 11000 ? 409 : 400)).json({ mensaje: error.code === 11000 ? 'El animal ya tiene un pesaje de ese hito; edite el registro existente.' : error.message, codigo: error.codigo });
    }
};

pesajeCtrl.getPesaje = async (req, res) => {
    try {
        const pesaje = await poblarPesaje(Pesaje.findById(req.params.id));
        if (!pesaje) return res.status(404).json({ mensaje: 'Pesaje no encontrado' });
        res.json(pesaje);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pesaje', error: error.message });
    }
};

pesajeCtrl.exportarPesajes = async (req, res) => {
    try {
        const formato = req.query.formato || 'xlsx';
        if (!['xlsx', 'pdf'].includes(formato)) throw crearErrorPesaje('Formato no permitido.', 422);
        const filtro = await obtenerFiltroPesajes(req.query.especie, req.query);
        if (req.query.soloActivos === 'true') {
            const activos = await Animal.find({ estado: { $nin: ['Muerto', 'Vendido'] } }).select('_id');
            const ids = activos.map((a) => a._id).filter((id) => !filtro.animal || (filtro.animal.$in ? filtro.animal.$in.some((v) => String(v) === String(id)) : String(filtro.animal) === String(id)));
            filtro.animal = { $in: ids };
        }
        const datos = await Pesaje.find(filtro).populate('animal', 'diio identificadorFinca nombre especie').sort({ fecha: -1 }).limit(10001).lean();
        if (datos.length > 10000) throw crearErrorPesaje('La exportacion supera 10000 filas. Reduce el periodo para descargarla.', 422);
        const { exportarPesajesExcel, exportarPesajesPdf } = require('../services/pesajes-export-service');
        const archivo = formato === 'pdf' ? await exportarPesajesPdf(datos) : exportarPesajesExcel(datos);
        res.setHeader('Content-Type', formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="pesajes.${formato}"`);
        res.send(archivo);
    } catch (error) { res.status(error.status || 500).json({ mensaje: error.message }); }
};

pesajeCtrl.getPesajesPorAnimal = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.animalId).select('_id organizacionId');
        if (!animal) return res.status(404).json({ mensaje: 'Animal no encontrado' });
        const membresia = await Membresia.findById(req.usuario?.membresiaId);
        if (!membresia || String(membresia.organizacionId) !== String(animal.organizacionId)) {
            return res.status(403).json({ mensaje: 'No tienes acceso al historial de este animal' });
        }
        const fincas = await listarFincasAccesibles(membresia, { incluirInactivas: true });
        const fincaIds = fincas.map((finca) => finca._id);
        const pesajes = await poblarPesaje(
            Pesaje.find({
                animal: req.params.animalId,
                $or: [
                    { fincaId: { $in: fincaIds } },
                    { fincaId: { $exists: false } },
                    { fincaId: null }
                ]
            })
                .setOptions({ omitirAislamientoFinca: true })
                .sort({ fecha: -1, createdAt: -1, _id: -1 })
        );
        res.json(pesajes);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pesajes del animal', error: error.message });
    }
};

pesajeCtrl.updatePesaje = async (req, res) => {
    try {
        const cambios = sanitizarPesaje(req.body, { parcial: true });
        let pesajeId;
        await ejecutarEnTransaccion(async (session) => {
            const pesaje = await Pesaje.findById(req.params.id).session(session);
            if (!pesaje) throw crearErrorPesaje('Pesaje no encontrado.', 404, 'PESAJE_NO_ENCONTRADO');

            const animalAnterior = pesaje.animal;
            const animalFinal = cambios.animal || pesaje.animal;
            if (origenPesaje(pesaje) === 'Lote' && String(animalFinal) !== String(animalAnterior)) {
                throw crearErrorPesaje('Un pesaje grupal no puede reasignarse a otro animal.', 409, 'PESAJE_LOTE_NO_REASIGNABLE');
            }
            const datosFinales = {
                tipoPesaje: cambios.tipoPesaje ?? pesaje.tipoPesaje,
                animal: animalFinal,
                fecha: cambios.fecha ?? pesaje.fecha,
                peso: cambios.peso ?? pesaje.peso,
                etapaProductiva: cambios.etapaProductiva ?? pesaje.etapaProductiva,
                observaciones: cambios.observaciones ?? pesaje.observaciones
            };
            const validacion = await validarDatosPesaje(datosFinales, { session, pesajeId: pesaje._id });
            const cambioAnimal = String(animalAnterior) !== String(animalFinal);
            if (cambioAnimal || datosFinales.tipoPesaje !== pesaje.tipoPesaje) await limpiarEventosPesaje(pesaje._id, { session, soloAnimal: !cambioAnimal });

            pesaje.set({
                ...prepararDatosPersistencia(datosFinales, validacion),
                editadoPor: req.usuario?.id,
                fechaEdicion: new Date()
            });
            if (cambioAnimal) pesaje.lote = validacion.animal.loteActual || null;
            await pesaje.save({ session });

            if (cambioAnimal) {
                await actualizarPesoActualAnimal(animalAnterior, {
                    session,
                    organizacionId: req.organizacionId,
                    forzar: true
                });
            }
            await actualizarPesoActualAnimal(pesaje.animal, {
                session,
                organizacionId: req.organizacionId,
                forzar: true
            });
            await registrarEventoPesaje(pesaje, req.usuario?.id, {
                session,
                crearEventoLote: origenPesaje(pesaje) !== 'Lote',
                titulo: 'Pesaje corregido'
            });
            pesajeId = pesaje._id;
        });

        const pesaje = await poblarPesaje(Pesaje.findById(pesajeId));
        await notificarAccionSegura({
            actor: req.usuario,
            naturaleza: 'Informativa',
            tipo: 'PESAJE_MODIFICADO',
            titulo: 'Pesaje actualizado',
            mensaje: `${nombreUsuario(req.usuario)} actualizó a ${pesaje.peso} kg el pesaje de ${pesaje.animal?.diio || pesaje.animal?.identificadorFinca || pesaje.animal?.nombre || 'un animal'}.`,
            moduloOrigen: 'Pesajes',
            entidadTipo: 'Animal',
            entidadId: pesaje.animal?._id || pesaje.animal,
            url: `/inventario/animal/${pesaje.animal?._id || pesaje.animal}`,
            metadata: { pesajeId: pesaje._id, peso: pesaje.peso }
        });
        res.json(pesaje);
    } catch (error) {
        res.status(error.status || (error.code === 11000 ? 409 : 400)).json({ mensaje: error.code === 11000 ? 'El animal ya tiene un pesaje de ese hito; edite el registro existente.' : error.message, codigo: error.codigo });
    }
};

pesajeCtrl.deletePesaje = async (req, res) => {
    try {
        await ejecutarEnTransaccion(async (session) => {
            const pesaje = await Pesaje.findById(req.params.id).session(session);
            if (!pesaje) throw crearErrorPesaje('Pesaje no encontrado.', 404, 'PESAJE_NO_ENCONTRADO');
            const animalId = pesaje.animal;
            await Pesaje.deleteOne({ _id: pesaje._id }, { session });
            await limpiarEventosPesaje(pesaje._id, { session });
            await actualizarPesoActualAnimal(animalId, {
                session,
                organizacionId: req.organizacionId,
                forzar: true
            });
        });
        res.json({ mensaje: 'Pesaje eliminado' });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message, codigo: error.codigo });
    }
};

module.exports = pesajeCtrl;
module.exports.obtenerFiltroPesajes = obtenerFiltroPesajes;
