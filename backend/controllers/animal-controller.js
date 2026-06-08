const animalCtrl = {};

const Animal = require('../models/Animal');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');

const crearEventosInventario = async ({ animal, animalAnterior = null, usuarioId }) => {
    const referenciaId = animal._id;
    const creadoPor = usuarioId;

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
        const animales = await Animal.find().populate('potreroActual').sort({ createdAt: -1 });
        res.json(animales);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener animales', error: error.message });
    }
};

animalCtrl.createAnimal = async (req, res) => {
    try {
        const nuevoAnimal = new Animal(req.body);
        const animalGuardado = await nuevoAnimal.save();
        await crearEventosInventario({ animal: animalGuardado, usuarioId: req.usuario?.id });
        res.status(201).json(animalGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear animal', error: error.message });
    }
};

animalCtrl.getAnimal = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id).populate('potreroActual');

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
        const animalAnterior = await Animal.findById(req.params.id).lean();
        const animal = await Animal.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        await crearEventosInventario({ animal, animalAnterior, usuarioId: req.usuario?.id });

        res.json(animal);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar animal', error: error.message });
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
