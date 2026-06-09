const animalCtrl = {};

const Animal = require('../models/Animal');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');
const {
    prepararDatosGenealogia,
    validarRelacionGenealogica
} = require('../services/genealogiaService');

const limpiarDiio = (diio) => {
    if (diio === undefined) return undefined;
    const valor = String(diio || '').trim();
    return valor || undefined;
};

const validarDiioDisponible = async (diio, animalId = null) => {
    const diioLimpio = limpiarDiio(diio);
    if (!diioLimpio) return;

    const filtro = { diio: diioLimpio };
    if (animalId) {
        filtro._id = { $ne: animalId };
    }

    const existente = await Animal.findOne(filtro).select('_id identificadorFinca diio');
    if (existente) {
        const error = new Error(`El DIIO ${diioLimpio} ya está registrado en otro animal.`);
        error.status = 400;
        throw error;
    }
};

const crearEventosInventario = async ({ animal, animalAnterior = null, usuarioId }) => {
    const referenciaId = animal._id;
    const creadoPor = usuarioId;

    const diioAnterior = limpiarDiio(animalAnterior?.diio);
    const diioActual = limpiarDiio(animal.diio);

    if (animalAnterior && diioAnterior !== diioActual) {
        await upsertEventoAnimal({
            animal: animal._id,
            tipoEvento: 'Observacion',
            fecha: new Date(),
            titulo: 'DIIO actualizado',
            descripcion: `DIIO actualizado de ${diioAnterior || 'sin DIIO'} a ${diioActual || 'sin DIIO'}.`,
            moduloOrigen: 'Inventario',
            creadoPor,
            metadata: {
                diioAnterior,
                diioActual,
                identificadorFinca: animal.identificadorFinca
            }
        });
    }

    if (animal.fechaNacimiento) {
        await upsertEventoAnimal({
            animal: animal._id,
            tipoEvento: 'Nacimiento',
            fecha: animal.fechaNacimiento,
            titulo: 'Nacimiento registrado',
            descripcion: `Nacimiento de ${animal.diio || animal.identificadorFinca || 'animal'}.`,
            moduloOrigen: 'Inventario',
            referenciaId,
            creadoPor,
            metadata: {
                diio: animal.diio,
                identificadorFinca: animal.identificadorFinca,
                pesoNacimiento: animal.pesoNacimiento,
                madreDiio: animal.madreDiio,
                padreDiio: animal.padreDiio
            }
        });
    }

    if (animal.fechaCompra || animal.montoCompra) {
        await upsertEventoAnimal({
            animal: animal._id,
            tipoEvento: 'Compra',
            fecha: animal.fechaCompra || animal.createdAt || new Date(),
            titulo: 'Compra registrada',
            descripcion: `Compra de ${animal.diio || animal.identificadorFinca || 'animal'}.`,
            moduloOrigen: 'Inventario',
            referenciaId,
            creadoPor,
            metadata: {
                montoCompra: animal.montoCompra,
                fechaCompra: animal.fechaCompra
            }
        });
    }

    const datosVentaCambiaron = animalAnterior
        && (
            String(animalAnterior.fechaVenta || '') !== String(animal.fechaVenta || '')
            || Number(animalAnterior.montoVenta || 0) !== Number(animal.montoVenta || 0)
        );

    if (animal.estado === 'Vendido' && (animalAnterior?.estado !== 'Vendido' || datosVentaCambiaron)) {
        await upsertEventoAnimal({
            animal: animal._id,
            tipoEvento: 'Venta',
            fecha: animal.fechaVenta || new Date(),
            titulo: 'Venta registrada',
            descripcion: `Venta de ${animal.diio || animal.identificadorFinca || 'animal'}.`,
            moduloOrigen: 'Inventario',
            referenciaId,
            creadoPor,
            metadata: {
                estadoAnterior: animalAnterior?.estado,
                montoVenta: animal.montoVenta,
                fechaVenta: animal.fechaVenta
            }
        });
    }

    const datosMuerteCambiaron = animalAnterior
        && String(animalAnterior.fechaMuerte || '') !== String(animal.fechaMuerte || '');

    if (animal.estado === 'Muerto' && (animalAnterior?.estado !== 'Muerto' || datosMuerteCambiaron)) {
        await upsertEventoAnimal({
            animal: animal._id,
            tipoEvento: 'Muerte',
            fecha: animal.fechaMuerte || new Date(),
            titulo: 'Muerte registrada',
            descripcion: `Se marcó como muerto el animal ${animal.diio || animal.identificadorFinca || ''}.`,
            moduloOrigen: 'Inventario',
            referenciaId,
            creadoPor,
            metadata: {
                estadoAnterior: animalAnterior?.estado,
                fechaMuerte: animal.fechaMuerte,
                observaciones: animal.observaciones
            }
        });
    }
};

animalCtrl.getAnimales = async (req, res) => {
    try {
        const animales = await Animal.find()
            .populate('potreroActual')
            .populate('padre', 'diio identificadorFinca nombre sexo')
            .populate('madre', 'diio identificadorFinca nombre sexo')
            .sort({ createdAt: -1 });
        res.json(animales);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener animales', error: error.message });
    }
};

animalCtrl.createAnimal = async (req, res) => {
    try {
        const datos = prepararDatosGenealogia({
            ...req.body,
            diio: limpiarDiio(req.body.diio)
        });
        await validarDiioDisponible(datos.diio);
        await validarRelacionGenealogica(null, datos.padre, datos.madre);

        const nuevoAnimal = new Animal(datos);
        const animalGuardado = await nuevoAnimal.save();
        await crearEventosInventario({ animal: animalGuardado, usuarioId: req.usuario?.id });
        res.status(201).json(animalGuardado);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear animal', error: error.message });
    }
};

animalCtrl.getAnimal = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id)
            .populate('potreroActual')
            .populate('padre', 'diio identificadorFinca nombre sexo')
            .populate('madre', 'diio identificadorFinca nombre sexo');

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        res.json(animal);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener animal', error: error.message });
    }
};

animalCtrl.updateAnimal = async (req, res) => {
    try {
        const datos = prepararDatosGenealogia({
            ...req.body,
            diio: req.body.diio !== undefined ? limpiarDiio(req.body.diio) : req.body.diio
        });
        const animalAnterior = await Animal.findById(req.params.id).lean();

        if (!animalAnterior) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        if (datos.diio !== undefined && limpiarDiio(animalAnterior.diio) !== datos.diio) {
            await validarDiioDisponible(datos.diio, req.params.id);
        }
        await validarRelacionGenealogica(req.params.id, datos.padre, datos.madre);

        const animal = await Animal.findByIdAndUpdate(req.params.id, datos, {
            new: true,
            runValidators: true
        })
            .populate('potreroActual')
            .populate('padre', 'diio identificadorFinca nombre sexo')
            .populate('madre', 'diio identificadorFinca nombre sexo');

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        await crearEventosInventario({ animal, animalAnterior, usuarioId: req.usuario?.id });

        res.json(animal);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar animal', error: error.message });
    }
};

animalCtrl.deleteAnimal = async (req, res) => {
    try {
        const animal = await Animal.findByIdAndDelete(req.params.id);

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        await eliminarEventosPorReferencia({ moduloOrigen: 'Inventario', referenciaId: animal._id });

        res.json({ mensaje: 'Animal eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar animal', error: error.message });
    }
};

module.exports = animalCtrl;
