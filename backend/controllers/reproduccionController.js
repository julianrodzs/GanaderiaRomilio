const { RegistroReproductivo, completarFechasYEstado } = require('../models/RegistroReproductivo');
const Animal = require('../models/Animal');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');
const { prepararDatosGenealogia, validarRelacionGenealogica } = require('../services/genealogiaService');

const reproduccionCtrl = {};

const poblarAnimal = (query) => query.populate('animal');

const fechaKey = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toISOString().slice(0, 10);
};

const refrescarRegistro = async (registro) => {
    const original = {
        estado: registro.estado,
        fechaPartoEstimada: fechaKey(registro.fechaPartoEstimada),
        fechaProximoCelo: fechaKey(registro.fechaProximoCelo),
        fechaDestete: fechaKey(registro.fechaDestete)
    };

    completarFechasYEstado(registro);

    const actualizado = {
        estado: registro.estado,
        fechaPartoEstimada: fechaKey(registro.fechaPartoEstimada),
        fechaProximoCelo: fechaKey(registro.fechaProximoCelo),
        fechaDestete: fechaKey(registro.fechaDestete)
    };

    if (JSON.stringify(original) !== JSON.stringify(actualizado)) {
        await registro.save();
    }

    return registro;
};

const validarHembra = async (animalId) => {
    const animal = await Animal.findById(animalId);

    if (!animal) {
        return { valido: false, status: 404, mensaje: 'Animal no encontrado' };
    }

    if (animal.sexo !== 'Hembra') {
        return { valido: false, status: 400, mensaje: 'Solo se pueden registrar ciclos reproductivos para hembras' };
    }

    return { valido: true, animal };
};

const obtenerTipoEventoReproductivo = (registro) => {
    if (registro.fechaPartoReal) return 'Parto';
    if (registro.fechaMonta) return 'Monta';
    if (registro.fechaPartoEstimada) return 'Diagnostico de gestacion';
    if (registro.fechaDestete) return 'Destete';
    return 'Observacion';
};

const obtenerFechaEventoReproductivo = (registro) => {
    return registro.fechaPartoReal
        || registro.fechaMonta
        || registro.fechaPartoEstimada
        || registro.fechaDestete
        || registro.createdAt
        || new Date();
};

const registrarEventoReproduccion = async (registro, usuarioId) => {
    if (!registro?.animal) return;

    completarFechasYEstado(registro);
    const tipoEvento = obtenerTipoEventoReproductivo(registro);
    const animalId = typeof registro.animal === 'object' ? registro.animal._id : registro.animal;

    await upsertEventoAnimal({
        animal: animalId,
        tipoEvento,
        fecha: obtenerFechaEventoReproductivo(registro),
        titulo: `${tipoEvento} registrado`,
        descripcion: registro.observaciones || 'Registro reproductivo del animal.',
        moduloOrigen: 'Reproduccion',
        referenciaId: registro._id,
        creadoPor: usuarioId,
        metadata: {
            fechaMonta: registro.fechaMonta,
            fechaPartoEstimada: registro.fechaPartoEstimada,
            fechaPartoReal: registro.fechaPartoReal,
            fechaProximoCelo: registro.fechaProximoCelo,
            fechaDestete: registro.fechaDestete,
            estado: registro.estado
        }
    });
};

reproduccionCtrl.getRegistros = async (req, res) => {
    try {
        const registrosSinPoblar = await RegistroReproductivo.find().sort({ fechaPartoEstimada: 1, createdAt: -1 });
        await Promise.all(registrosSinPoblar.map(refrescarRegistro));
        const registros = await poblarAnimal(
            RegistroReproductivo.find().sort({ fechaPartoEstimada: 1, createdAt: -1 })
        );

        res.json(registros);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registros reproductivos', error: error.message });
    }
};

reproduccionCtrl.createRegistro = async (req, res) => {
    try {
        const validacion = await validarHembra(req.body.animal);

        if (!validacion.valido) {
            return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        }

        const nuevoRegistro = new RegistroReproductivo(req.body);
        const registroGuardado = await nuevoRegistro.save();
        await registrarEventoReproduccion(registroGuardado, req.usuario?.id);
        const registro = await poblarAnimal(RegistroReproductivo.findById(registroGuardado._id));

        res.status(201).json(registro);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear registro reproductivo', error: error.message });
    }
};

reproduccionCtrl.registrarTerneroDesdeParto = async (req, res) => {
    try {
        const registro = await RegistroReproductivo.findById(req.params.id).populate('animal');

        if (!registro) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        if (!registro.fechaPartoReal) {
            return res.status(400).json({ mensaje: 'El registro debe tener parto real para crear el ternero' });
        }

        const madre = registro.animal;

        if (!madre) {
            return res.status(404).json({ mensaje: 'Madre no encontrada' });
        }

        const identificador = req.body.identificadorFinca || req.body.diio;

        if (!identificador) {
            return res.status(400).json({ mensaje: 'El DIIO o identificador de finca del ternero es requerido' });
        }

        const padreRegistrado = req.body.padre
            ? await Animal.findById(req.body.padre)
            : req.body.padreDiio
                ? await Animal.findOne({
                    $or: [
                        { diio: req.body.padreDiio },
                        { identificadorFinca: req.body.padreDiio }
                    ]
                })
                : null;

        const datosTernero = prepararDatosGenealogia({
            identificadorFinca: identificador,
            diio: req.body.diio || undefined,
            nombre: req.body.nombre,
            sexo: req.body.sexo,
            raza: req.body.raza || madre.raza,
            madre: madre._id,
            madreDiio: madre.diio || madre.identificadorFinca,
            padre: padreRegistrado?._id,
            padreDiio: req.body.padreDiio,
            padreExternoNombre: padreRegistrado ? undefined : req.body.padreExternoNombre || req.body.padreDiio,
            fechaNacimiento: registro.fechaPartoReal,
            pesoNacimiento: req.body.pesoNacimiento,
            estado: 'Activo',
            observaciones: req.body.observaciones
        });

        await validarRelacionGenealogica(null, datosTernero.padre, datosTernero.madre);
        const nuevoTernero = new Animal(datosTernero);
        const terneroGuardado = await nuevoTernero.save();

        await upsertEventoAnimal({
            animal: terneroGuardado._id,
            tipoEvento: 'Nacimiento',
            fecha: terneroGuardado.fechaNacimiento,
            titulo: 'Nacimiento registrado desde parto',
            descripcion: `Ternero registrado desde parto de ${madre.diio || madre.identificadorFinca}.`,
            moduloOrigen: 'Reproduccion',
            referenciaId: registro._id,
            creadoPor: req.usuario?.id,
            metadata: {
                madreDiio: terneroGuardado.madreDiio,
                padreDiio: terneroGuardado.padreDiio,
                pesoNacimiento: terneroGuardado.pesoNacimiento,
                registroReproductivo: registro._id
            }
        });

        await upsertEventoAnimal({
            animal: madre._id,
            tipoEvento: 'Parto',
            fecha: registro.fechaPartoReal,
            titulo: 'Parto con ternero registrado',
            descripcion: `Se registró el ternero ${terneroGuardado.diio || terneroGuardado.identificadorFinca}.`,
            moduloOrigen: 'Reproduccion',
            referenciaId: registro._id,
            creadoPor: req.usuario?.id,
            metadata: {
                ternero: terneroGuardado._id,
                terneroDiio: terneroGuardado.diio || terneroGuardado.identificadorFinca,
                fechaPartoReal: registro.fechaPartoReal
            }
        });

        res.status(201).json(terneroGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al registrar ternero desde parto', error: error.message });
    }
};

reproduccionCtrl.getRegistro = async (req, res) => {
    try {
        const registroSinPoblar = await RegistroReproductivo.findById(req.params.id);

        if (!registroSinPoblar) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        await refrescarRegistro(registroSinPoblar);
        const registro = await poblarAnimal(RegistroReproductivo.findById(req.params.id));

        res.json(registro);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registro reproductivo', error: error.message });
    }
};

reproduccionCtrl.getRegistrosPorAnimal = async (req, res) => {
    try {
        const registrosSinPoblar = await RegistroReproductivo.find({ animal: req.params.animalId }).sort({ fechaMonta: -1, createdAt: -1 });
        await Promise.all(registrosSinPoblar.map(refrescarRegistro));
        const registros = await poblarAnimal(
            RegistroReproductivo.find({ animal: req.params.animalId }).sort({ fechaMonta: -1, createdAt: -1 })
        );

        res.json(registros);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registros reproductivos del animal', error: error.message });
    }
};

reproduccionCtrl.updateRegistro = async (req, res) => {
    try {
        if (req.body.animal) {
            const validacion = await validarHembra(req.body.animal);

            if (!validacion.valido) {
                return res.status(validacion.status).json({ mensaje: validacion.mensaje });
            }
        }

        const registroActualizado = await RegistroReproductivo.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!registroActualizado) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        await registrarEventoReproduccion(registroActualizado, req.usuario?.id);
        const registro = await poblarAnimal(RegistroReproductivo.findById(registroActualizado._id));

        res.json(registro);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar registro reproductivo', error: error.message });
    }
};

reproduccionCtrl.deleteRegistro = async (req, res) => {
    try {
        const registro = await RegistroReproductivo.findByIdAndDelete(req.params.id);

        if (!registro) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        await eliminarEventosPorReferencia({ moduloOrigen: 'Reproduccion', referenciaId: registro._id });

        res.json({ mensaje: 'Registro reproductivo eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar registro reproductivo', error: error.message });
    }
};

module.exports = reproduccionCtrl;
