const EventoAnimal = require('../models/EventoAnimal');
const Animal = require('../models/Animal');
const { serializarEventoParaRol } = require('../services/eventoAnimal-privacidad-service');

const eventoAnimalCtrl = {};
const LIMITE_EVENTOS_DEFAULT = 20;
const LIMITE_EVENTOS_MAXIMO = 100;

const numeroEnteroPositivo = (valor, predeterminado, maximo = Number.MAX_SAFE_INTEGER) => {
    const numero = Number.parseInt(valor, 10);
    if (!Number.isInteger(numero) || numero < 1) return predeterminado;
    return Math.min(numero, maximo);
};

const poblarEvento = (consulta) => consulta
    .populate('creadoPor', 'nombre apellido correo rol')
    .populate('fincaId', 'nombre codigo estado');

const respuestaEvento = (evento, rol) => serializarEventoParaRol(evento, rol);

eventoAnimalCtrl.getEventosPorAnimal = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.animalId).select('_id').lean();
        if (!animal) return res.status(404).json({ mensaje: 'Animal no encontrado en la finca activa' });
        // El acceso se autoriza con el animal en la finca actual. Luego se omite solo
        // el aislamiento por finca para conservar su historia dentro de la organización.
        const filtro = { animal: req.params.animalId };
        const solicitaPaginacion = req.query.pagina !== undefined || req.query.limite !== undefined;
        const pagina = numeroEnteroPositivo(req.query.pagina, 1);
        const limite = numeroEnteroPositivo(req.query.limite, LIMITE_EVENTOS_DEFAULT, LIMITE_EVENTOS_MAXIMO);
        const consultaEventos = poblarEvento(
            EventoAnimal.find(filtro)
                .setOptions({ omitirAislamientoFinca: true })
                .sort({ fecha: -1, createdAt: -1 })
        );

        if (solicitaPaginacion) consultaEventos.skip((pagina - 1) * limite).limit(limite);

        const [eventos, total] = await Promise.all([
            consultaEventos.lean(),
            solicitaPaginacion
                ? EventoAnimal.countDocuments(filtro).setOptions({ omitirAislamientoFinca: true })
                : Promise.resolve(null)
        ]);
        const eventosSerializados = eventos.map((evento) => respuestaEvento(evento, req.usuario.rol));

        if (!solicitaPaginacion) return res.json(eventosSerializados);

        return res.json({
            eventos: eventosSerializados,
            paginacion: {
                pagina,
                limite,
                total,
                totalPaginas: Math.ceil(total / limite),
                hayMas: pagina * limite < total
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener bitacora del animal', error: error.message });
    }
};

eventoAnimalCtrl.createEvento = async (req, res) => {
    try {
        const claveIdempotencia = String(req.get('Idempotency-Key') || '').trim();
        const animalId = req.body?.animal;
        const descripcion = String(req.body?.descripcion || '').trim();
        if (claveIdempotencia.length > 160) {
            return res.status(400).json({ mensaje: 'La clave de idempotencia no es valida' });
        }
        if (!animalId || !descripcion) {
            return res.status(400).json({ mensaje: 'El animal y la descripcion son obligatorios' });
        }

        if (claveIdempotencia) {
            const existente = await poblarEvento(EventoAnimal.findOne({ claveIdempotencia, animal: animalId }));
            if (existente) {
                res.set('X-Idempotent-Replay', 'true');
                return res.json(respuestaEvento(existente, req.usuario.rol));
            }
        }

        const animal = await Animal.findById(animalId);

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        const nuevoEvento = new EventoAnimal({
            animal: animal._id,
            tipoEvento: 'Observacion',
            fecha: req.body.fecha || new Date(),
            titulo: 'Observacion manual',
            descripcion,
            creadoPor: req.usuario?.id,
            moduloOrigen: 'Manual',
            claveIdempotencia: claveIdempotencia || undefined
        });
        const eventoGuardado = await nuevoEvento.save();
        const evento = await poblarEvento(EventoAnimal.findById(eventoGuardado._id));

        res.status(201).json(respuestaEvento(evento, req.usuario.rol));
    } catch (error) {
        if (error?.code === 11000) {
            const claveIdempotencia = String(req.get('Idempotency-Key') || '').trim();
            const existente = claveIdempotencia
                ? await poblarEvento(EventoAnimal.findOne({ claveIdempotencia, animal: req.body?.animal }))
                : null;
            if (existente) {
                res.set('X-Idempotent-Replay', 'true');
                return res.json(respuestaEvento(existente, req.usuario.rol));
            }
        }
        res.status(400).json({ mensaje: 'Error al crear evento de animal', error: error.message });
    }
};

eventoAnimalCtrl.updateEvento = async (req, res) => {
    try {
        const evento = await EventoAnimal.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('creadoPor', 'nombre apellido correo rol');

        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento no encontrado' });
        }

        res.json(evento);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar evento de animal', error: error.message });
    }
};

eventoAnimalCtrl.deleteEvento = async (req, res) => {
    try {
        const evento = await EventoAnimal.findByIdAndDelete(req.params.id);

        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento no encontrado' });
        }

        res.json({ mensaje: 'Evento eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar evento de animal', error: error.message });
    }
};

module.exports = eventoAnimalCtrl;
