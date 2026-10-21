const { RegistroReproductivo, completarFechasYEstado } = require('../models/RegistroReproductivo');
const Animal = require('../models/Animal');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');
const { prepararDatosGenealogia, validarRelacionGenealogica } = require('../services/genealogiaService');
const { sincronizarTareasPorcinas } = require('../services/reproduccionPorcina-service');
const {
    esSeguimientoBovinoVigente,
    sincronizarTareasBovinas
} = require('../services/reproduccionBovina-service');
const {
    crearNuevoCicloReproductivo,
    cerrarCicloReproductivo,
    cancelarCicloReproductivo,
    marcarCicloNoPrenada,
    reabrirCicloReproductivo,
    obtenerCicloActivoPorAnimal,
    cancelarTareasAutomaticasDelCiclo
} = require('../services/reproduccion-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');
const { asegurarPuedeCrearAnimal, ejecutarConReservaCuota } = require('../services/plan-service');
const { validarObjetivoProductivoFinca } = require('../services/finca-service');
const { prepararDatosRaciales } = require('../services/raza-service');
const { calcularEdadMeses, validarYPrepararCategoriaAnimal } = require('../services/categoriaAnimal-service');
const { prepararObjetivoProductivo } = require('../config/objetivosProductivos');
const {
    limpiarActualizarRegistroReproductivo,
    limpiarCrearRegistroReproductivo
} = require('../services/reproduccion-dto-service');
const { respuestaErrorPlan } = require('../middleware/plan');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { consumirSemen } = require('../services/semen-reproductivo-service');
const { InsumoReproductivo } = require('../models/InsumoReproductivo');

const reproduccionCtrl = {};

const notificarRegistroReproductivo = (req, registro, animal, tipo, titulo, accion) => notificarAccionSegura({
    actor: req.usuario,
    naturaleza: 'Informativa',
    tipo,
    titulo,
    mensaje: `${nombreUsuario(req.usuario)} ${accion} el ciclo reproductivo de ${animal?.diio || animal?.identificadorFinca || animal?.nombre || 'un animal'}.`,
    moduloOrigen: 'Reproduccion',
    entidadTipo: 'RegistroReproductivo',
    entidadId: registro._id,
    url: `/reproduccion/${registro._id}`,
    metadata: { animalId: animal?._id || registro.animal, especie: registro.especie || animal?.especie }
});

const poblarAnimal = (query) => query
    .populate('animal')
    .populate('semenUtilizado', 'nombre toro codigoToro razaToro lote tipoSemen fechaVencimiento cantidadDisponible')
    .populate('asignadoA', 'nombre apellido correo rol estado');

const esInseminacionConvencional = (datos = {}) => datos.tipoRegistro === 'Inseminación'
    && Boolean(datos.fechaInseminacion || datos.fechaMonta);

const prepararInseminacionConvencional = async ({ datos, session }) => {
    const fechaInseminacion = datos.fechaInseminacion || datos.fechaMonta;
    const consumo = await consumirSemen({
        semenId: datos.semenUtilizado || datos.semen,
        cantidad: datos.cantidadPajuelas ?? 1,
        fechaInseminacion,
        session
    });
    return {
        ...datos,
        fechaInseminacion,
        fechaMonta: fechaInseminacion,
        tipoInseminacion: 'IA_CONVENCIONAL',
        origenGestacion: 'IA_CONVENCIONAL',
        semenUtilizado: consumo.insumo._id,
        semenSnapshot: consumo.snapshot,
        cantidadPajuelas: consumo.cantidad
    };
};

const crearFiltroEspecie = (especie) => {
    if (especie === 'Bovino') return { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    if (especie === 'Porcino') return { especie };
    return {};
};

const obtenerFiltroRegistros = async (especie) => {
    const filtro = crearFiltroEspecie(especie);
    if (!Object.keys(filtro).length) return {};
    const animales = await Animal.find(filtro).select('_id');
    return { animal: { $in: animales.map((animal) => animal._id) } };
};

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

const EDAD_REPRODUCTIVA_MINIMA_MESES = Object.freeze({ Bovino: 24, Porcino: 7 });

const validarHembra = async (animalId, especieEsperada, { exigirElegibilidad = true } = {}) => {
    const animal = await Animal.findById(animalId);

    if (!animal) {
        return { valido: false, status: 404, mensaje: 'Animal no encontrado' };
    }

    if (animal.sexo !== 'Hembra') {
        return { valido: false, status: 400, mensaje: 'Solo se pueden registrar ciclos reproductivos para hembras' };
    }

    if (exigirElegibilidad && animal.estado !== 'Activo') {
        return { valido: false, status: 409, mensaje: 'Solo se pueden registrar ciclos reproductivos para animales activos en inventario' };
    }

    if (especieEsperada && animal.especie !== especieEsperada) {
        return { valido: false, status: 422, mensaje: 'La especie indicada no coincide con la especie del animal' };
    }

    const especie = animal.especie || 'Bovino';
    const edadMinima = EDAD_REPRODUCTIVA_MINIMA_MESES[especie];
    const edadMeses = calcularEdadMeses(animal.fechaNacimiento);
    if (exigirElegibilidad && edadMinima != null && edadMeses == null) {
        return { valido: false, status: 422, mensaje: 'La fecha de nacimiento es requerida para validar la edad reproductiva' };
    }
    if (exigirElegibilidad && edadMinima != null && edadMeses < edadMinima) {
        return {
            valido: false,
            status: 422,
            mensaje: `La hembra no alcanza la edad reproductiva mínima de ${edadMinima} meses para ${especie.toLowerCase()}`
        };
    }

    return { valido: true, animal };
};

const validarTipoInseminacionConvencional = (datos) => {
    if (datos.tipoInseminacion && datos.tipoInseminacion !== 'IA_CONVENCIONAL') {
        const error = new Error('Los vínculos IATF solo pueden modificarse desde el flujo de campañas IATF.');
        error.status = 422;
        error.code = 'REPRODUCCION_VINCULO_INTERNO_PROTEGIDO';
        throw error;
    }
};

const resolverPadreNacimiento = async ({ registro, datos, madre }) => {
    const especie = madre.especie || 'Bovino';
    let padreRegistrado = datos.padre
        ? await Animal.findOne({ _id: datos.padre, sexo: 'Macho', especie })
        : datos.padreDiio
            ? await Animal.findOne({
                sexo: 'Macho',
                especie,
                $or: [
                    { diio: datos.padreDiio },
                    { identificadorFinca: datos.padreDiio }
                ]
            })
            : null;
    if (datos.padre && !padreRegistrado) {
        const error = new Error('El padre seleccionado debe existir, ser macho y pertenecer a la misma especie de la cría.');
        error.status = 422;
        throw error;
    }
    let padreDiio = datos.padreDiio || padreRegistrado?.diio || padreRegistrado?.identificadorFinca;
    let padreExternoNombre = padreRegistrado
        ? undefined
        : datos.padreExternoNombre || datos.padreDiio;

    const origenConSemen = ['IATF', 'IA_CONVENCIONAL'].includes(registro.tipoInseminacion)
        || ['IATF', 'IA_CONVENCIONAL'].includes(registro.origenGestacion);
    const semen = registro.semenSnapshot || {};
    if (!padreRegistrado && !padreDiio && !padreExternoNombre && origenConSemen) {
        const codigoToro = semen.codigoToro || null;
        if (codigoToro) {
            padreRegistrado = await Animal.findOne({
                sexo: 'Macho',
                especie,
                $or: [{ diio: codigoToro }, { identificadorFinca: codigoToro }]
            });
        }
        padreDiio = padreRegistrado
            ? (padreRegistrado.diio || padreRegistrado.identificadorFinca)
            : codigoToro || undefined;
        padreExternoNombre = padreRegistrado
            ? undefined
            : semen.toro || semen.nombre || codigoToro || undefined;
    }

    return { padreRegistrado, padreDiio, padreExternoNombre };
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

const sincronizarAutomatizacionReproductiva = async ({ registro, animal, usuarioId }) => {
    const cicloActivo = (registro.estadoCiclo || 'Activo') === 'Activo' && registro.activoParaAlertas !== false;
    const especie = registro.especie || animal?.especie || 'Bovino';

    if (especie === 'Porcino' && cicloActivo) {
        await sincronizarTareasPorcinas({ registro, animal, usuarioId });
    } else if (especie === 'Bovino' && esSeguimientoBovinoVigente(registro)) {
        await sincronizarTareasBovinas({ registro, animal, usuarioId });
    } else {
        await cancelarTareasAutomaticasDelCiclo(registro._id);
    }
};

reproduccionCtrl.getRegistros = async (req, res) => {
    try {
        const filtro = await obtenerFiltroRegistros(req.query.especie);
        const registrosSinPoblar = await RegistroReproductivo.find(filtro).sort({ fechaPartoEstimada: 1, createdAt: -1 });
        await Promise.all(registrosSinPoblar.map(async (registro) => {
            await refrescarRegistro(registro);
            if ((registro.especie || 'Bovino') === 'Bovino' && registro.fechaPartoReal) {
                await sincronizarAutomatizacionReproductiva({
                    registro,
                    animal: await Animal.findById(registro.animal),
                    usuarioId: req.usuario?.id
                });
            }
        }));
        const registros = await poblarAnimal(
            RegistroReproductivo.find(filtro).sort({ fechaPartoEstimada: 1, createdAt: -1 })
        );

        res.json(registros);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registros reproductivos', error: error.message });
    }
};

reproduccionCtrl.createRegistro = async (req, res) => {
    try {
        const datos = limpiarCrearRegistroReproductivo(req.body);
        validarTipoInseminacionConvencional(datos);
        await validarUsuarioAsignable(datos.asignadoA, 'Reproduccion');
        const validacion = await validarHembra(datos.animal, datos.especie);

        if (!validacion.valido) {
            return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        }

        const crearRegistro = async (session = null) => {
            const data = esInseminacionConvencional(datos)
                ? await prepararInseminacionConvencional({ datos, session })
                : datos;
            return crearNuevoCicloReproductivo({
                data,
                animal: validacion.animal,
                usuarioId: req.usuario?.id,
                cerrarCicloAnterior: datos.cerrarCicloAnterior === true,
                session
            });
        };
        const registroGuardado = esInseminacionConvencional(datos)
            ? await ejecutarEnTransaccion(crearRegistro)
            : await crearRegistro();
        await registrarEventoReproduccion(registroGuardado, req.usuario?.id);
        await sincronizarAutomatizacionReproductiva({
            registro: registroGuardado,
            animal: validacion.animal,
            usuarioId: req.usuario?.id
        });
        const registro = await poblarAnimal(RegistroReproductivo.findById(registroGuardado._id));

        await notificarRegistroReproductivo(
            req,
            registroGuardado,
            validacion.animal,
            'CICLO_REPRODUCTIVO_CREADO',
            'Ciclo reproductivo registrado',
            'registró'
        );

        res.status(201).json(registro);
    } catch (error) {
        if (error.status === 409) {
            return res.status(409).json({
                mensaje: error.message,
                cicloActivo: error.cicloActivo
            });
        }

        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear registro reproductivo', error: error.message, code: error.code });
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

        const { padreRegistrado, padreDiio, padreExternoNombre } = await resolverPadreNacimiento({
            registro,
            datos: req.body,
            madre
        });

        let datosTernero = prepararDatosRaciales(prepararDatosGenealogia({
            identificadorFinca: identificador,
            diio: req.body.diio || undefined,
            nombre: req.body.nombre,
            sexo: req.body.sexo,
            raza: req.body.raza || madre.descripcionRacial || madre.raza,
            razaPrincipal: req.body.razaPrincipal,
            razaSecundaria: req.body.razaSecundaria,
            gradoRacial: req.body.gradoRacial,
            descripcionRacial: req.body.descripcionRacial || req.body.raza,
            fraccionRazaPrincipal: req.body.fraccionRazaPrincipal,
            fraccionRazaSecundaria: req.body.fraccionRazaSecundaria,
            especie: madre.especie || 'Bovino',
            madre: madre._id,
            madreDiio: madre.diio || madre.identificadorFinca,
            madreExternaNombre: null,
            padre: padreRegistrado?._id,
            padreDiio,
            padreExternoNombre,
            origenGenealogico: 'Interno',
            objetivoProductivo: prepararObjetivoProductivo(req.body.objetivoProductivo || 'SIN_DEFINIR'),
            fechaNacimiento: registro.fechaPartoReal,
            fechaDesteteEstimada: registro.fechaDestete,
            pesoNacimiento: req.body.pesoNacimiento,
            estado: 'Activo',
            observaciones: req.body.observaciones
        }));
        datosTernero = validarYPrepararCategoriaAnimal(datosTernero);

        await validarRelacionGenealogica(null, datosTernero.padre, datosTernero.madre, datosTernero.especie);
        const permisoCreacion = await asegurarPuedeCrearAnimal({
            organizacionId: req.organizacionId,
            especie: datosTernero.especie
        });
        await validarObjetivoProductivoFinca({
            fincaId: req.fincaId,
            especie: datosTernero.especie,
            objetivoProductivo: datosTernero.objetivoProductivo
        });
        const terneroGuardado = await ejecutarConReservaCuota({
            permiso: permisoCreacion,
            recurso: 'animales',
            organizacionId: req.organizacionId,
            operacion: () => new Animal(datosTernero).save()
        });
        if (!terneroGuardado.madre) {
            throw new Error('No se pudo asociar la madre registrada al ternero.');
        }

        await sincronizarTareasBovinas({
            registro,
            animal: madre,
            usuarioId: req.usuario?.id
        });

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

        await terneroGuardado.populate('madre', 'diio identificadorFinca nombre sexo especie');
        res.status(201).json(terneroGuardado);
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
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

reproduccionCtrl.getSemenDisponible = async (req, res) => {
    try {
        const fecha = req.query.fecha ? new Date(req.query.fecha) : new Date();
        if (Number.isNaN(fecha.getTime())) return res.status(422).json({ mensaje: 'La fecha indicada no es valida.' });
        const inicioDia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
        const semen = await InsumoReproductivo.find({
            categoria: 'SEMEN',
            activo: true,
            cantidadDisponible: { $gte: 1 },
            $or: [
                { fechaVencimiento: { $exists: false } },
                { fechaVencimiento: null },
                { fechaVencimiento: { $gte: inicioDia } }
            ]
        }).sort({ fechaVencimiento: 1, nombre: 1 });
        return res.json(semen);
    } catch (error) {
        return res.status(400).json({ mensaje: 'No se pudo consultar el semen disponible', error: error.message });
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
        const datosActualizacion = limpiarActualizarRegistroReproductivo(req.body);
        validarTipoInseminacionConvencional(datosActualizacion);
        const registroAnterior = await RegistroReproductivo.findById(req.params.id).lean();
        if (!registroAnterior) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }
        let animalValidado = null;
        if (Object.prototype.hasOwnProperty.call(datosActualizacion, 'asignadoA')) {
            await validarUsuarioAsignable(datosActualizacion.asignadoA, 'Reproduccion');
        }
        if (datosActualizacion.animal) {
            const cambiaAnimal = String(datosActualizacion.animal) !== String(registroAnterior.animal);
            const validacion = await validarHembra(
                datosActualizacion.animal,
                datosActualizacion.especie,
                { exigirElegibilidad: cambiaAnimal }
            );

            if (!validacion.valido) {
                return res.status(validacion.status).json({ mensaje: validacion.mensaje });
            }
            animalValidado = validacion.animal;
        }

        if (animalValidado) {
            const cicloActivo = await obtenerCicloActivoPorAnimal(animalValidado._id, req.params.id);
            if (cicloActivo) {
                return res.status(409).json({
                    mensaje: 'El animal ya tiene otro ciclo reproductivo activo',
                    cicloActivo
                });
            }
            datosActualizacion.especie = animalValidado.especie || 'Bovino';
        }

        if (registroAnterior.semenUtilizado
            && datosActualizacion.semenUtilizado
            && String(registroAnterior.semenUtilizado) !== String(datosActualizacion.semenUtilizado)) {
            return res.status(409).json({ mensaje: 'El lote de semen consumido no puede sustituirse; registre una correccion trazable.' });
        }
        const requiereConsumoSemen = esInseminacionConvencional(datosActualizacion) && !registroAnterior.semenUtilizado;
        const actualizar = async (session = null) => {
            const datos = requiereConsumoSemen
                ? await prepararInseminacionConvencional({ datos: datosActualizacion, session })
                : datosActualizacion;
            return RegistroReproductivo.findByIdAndUpdate(req.params.id, datos, {
                new: true,
                runValidators: true,
                session
            });
        };
        const registroActualizado = requiereConsumoSemen
            ? await ejecutarEnTransaccion(actualizar)
            : await actualizar();

        if (!registroActualizado) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        await registrarEventoReproduccion(registroActualizado, req.usuario?.id);
        await sincronizarAutomatizacionReproductiva({
            registro: registroActualizado,
            animal: animalValidado || await Animal.findById(registroActualizado.animal),
            usuarioId: req.usuario?.id
        });
        const registro = await poblarAnimal(RegistroReproductivo.findById(registroActualizado._id));

        const partoNuevo = Boolean(registroActualizado.fechaPartoReal)
            && fechaKey(registroActualizado.fechaPartoReal) !== fechaKey(registroAnterior.fechaPartoReal);
        const desteteNuevo = Boolean(datosActualizacion.fechaDestete)
            && fechaKey(registroActualizado.fechaDestete) !== fechaKey(registroAnterior.fechaDestete);
        const tipoNotificacion = partoNuevo
            ? 'PARTO_REGISTRADO'
            : desteteNuevo
                ? 'DESTETE_REGISTRADO'
                : 'CICLO_REPRODUCTIVO_MODIFICADO';
        const tituloNotificacion = partoNuevo
            ? 'Parto registrado'
            : desteteNuevo
                ? 'Destete registrado'
                : 'Ciclo reproductivo actualizado';
        const accionNotificacion = partoNuevo
            ? 'registró un parto en'
            : desteteNuevo
                ? 'registró un destete en'
                : 'actualizó';

        await notificarRegistroReproductivo(
            req,
            registroActualizado,
            animalValidado || registro.animal,
            tipoNotificacion,
            tituloNotificacion,
            accionNotificacion
        );

        res.json(registro);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar registro reproductivo', error: error.message, code: error.code });
    }
};

reproduccionCtrl.deleteRegistro = async (req, res) => {
    try {
        const registro = await RegistroReproductivo.findByIdAndDelete(req.params.id);

        if (!registro) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        await eliminarEventosPorReferencia({ moduloOrigen: 'Reproduccion', referenciaId: registro._id });
        await cancelarTareasAutomaticasDelCiclo(registro._id, 'Cancelada por eliminación del registro reproductivo');

        res.json({ mensaje: 'Registro reproductivo eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar registro reproductivo', error: error.message });
    }
};

const ejecutarCierreCiclo = async ({ req, res, accion, tipo, titulo, verbo }) => {
    try {
        const motivo = req.body?.motivo || req.body?.motivoCierre;
        const registroActualizado = await accion(req.params.id, motivo, req.usuario?.id);
        const registro = await poblarAnimal(RegistroReproductivo.findById(registroActualizado._id));

        await notificarRegistroReproductivo(req, registroActualizado, registro.animal, tipo, titulo, verbo);

        res.json(registro);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar ciclo reproductivo' });
    }
};

reproduccionCtrl.cerrarCiclo = (req, res) => ejecutarCierreCiclo({
    req,
    res,
    accion: cerrarCicloReproductivo,
    tipo: 'CICLO_REPRODUCTIVO_CERRADO',
    titulo: 'Ciclo reproductivo cerrado',
    verbo: 'cerró'
});

reproduccionCtrl.reabrirCiclo = async (req, res) => {
    try {
        const registroActualizado = await reabrirCicloReproductivo({
            cicloId: req.params.id,
            motivo: req.body?.motivo,
            usuarioId: req.usuario?.id
        });
        const registro = await poblarAnimal(RegistroReproductivo.findById(registroActualizado._id));
        await notificarRegistroReproductivo(
            req,
            registroActualizado,
            registro.animal,
            'CICLO_REPRODUCTIVO_REABIERTO',
            'Ciclo reproductivo reabierto',
            'reabrió'
        );
        res.json(registro);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al reabrir el ciclo reproductivo' });
    }
};

reproduccionCtrl.cancelarCiclo = (req, res) => ejecutarCierreCiclo({
    req,
    res,
    accion: cancelarCicloReproductivo,
    tipo: 'CICLO_REPRODUCTIVO_CANCELADO',
    titulo: 'Ciclo reproductivo cancelado',
    verbo: 'canceló'
});

reproduccionCtrl.marcarNoPrenada = (req, res) => ejecutarCierreCiclo({
    req,
    res,
    accion: marcarCicloNoPrenada,
    tipo: 'CICLO_NO_PRENADA',
    titulo: 'Animal marcado como no preñado',
    verbo: 'marcó como no preñado'
});

module.exports = reproduccionCtrl;
