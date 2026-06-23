const { Tarea } = require('../models/Tarea');

const tareaCtrl = {};
const POPULATE_TAREA = [
    { path: 'asignadoA', select: 'nombre apellido correo rol estado' },
    { path: 'creadoPor', select: 'nombre apellido correo rol' },
    { path: 'potrero', select: 'codigo nombre area estado' },
    { path: 'animal', select: 'diio nombre sexo estado' },
    { path: 'comentarios.usuario', select: 'nombre apellido correo rol' }
];

const esAdministrador = (req) => req.usuario?.rol === 'Administrador';
const esAsignado = (req, tarea) => String(tarea.asignadoA?._id || tarea.asignadoA) === String(req.usuario?.id);

const construirFiltros = (query = {}) => {
    const filtros = {};
    const { estado, prioridad, tipo, asignadoA, potrero, fechaInicio, fechaFin } = query;

    if (estado) filtros.estado = estado;
    if (prioridad) filtros.prioridad = prioridad;
    if (tipo) filtros.tipo = tipo;
    if (asignadoA) filtros.asignadoA = asignadoA;
    if (potrero) filtros.potrero = potrero;

    if (fechaInicio || fechaFin) {
        filtros.fechaProgramada = {};
        if (fechaInicio) filtros.fechaProgramada.$gte = new Date(fechaInicio);
        if (fechaFin) {
            const fin = new Date(fechaFin);
            fin.setUTCHours(23, 59, 59, 999);
            filtros.fechaProgramada.$lte = fin;
        }
    }

    return filtros;
};

const obtenerTareaPoblada = (id) => Tarea.findById(id).populate(POPULATE_TAREA);

const limpiarDatosTarea = (datos) => {
    const datosLimpios = { ...datos };

    ['potrero', 'animal', 'fechaLimite'].forEach((campo) => {
        if (datosLimpios[campo] === '' || datosLimpios[campo] === 'null') {
            datosLimpios[campo] = null;
        }
    });

    return datosLimpios;
};

const aplicarFechaCompletadaPorEstado = (datos) => {
    const datosConEstado = { ...datos };

    if (datosConEstado.estado === 'Completada' && !datosConEstado.fechaCompletada) {
        datosConEstado.fechaCompletada = new Date();
    }

    if (datosConEstado.estado && datosConEstado.estado !== 'Completada') {
        datosConEstado.fechaCompletada = null;
    }

    return datosConEstado;
};

tareaCtrl.getTareas = async (req, res) => {
    try {
        if (!esAdministrador(req)) {
            return res.status(403).json({ mensaje: 'Solo el Administrador puede ver todas las tareas' });
        }

        const tareas = await Tarea.find(construirFiltros(req.query))
            .populate(POPULATE_TAREA)
            .sort({ fechaProgramada: 1, prioridad: 1 });

        res.json(tareas);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener tareas', error: error.message });
    }
};

tareaCtrl.getMisTareas = async (req, res) => {
    try {
        const filtros = {
            ...construirFiltros(req.query),
            asignadoA: req.usuario.id
        };

        const tareas = await Tarea.find(filtros)
            .populate(POPULATE_TAREA)
            .sort({ fechaProgramada: 1, prioridad: 1 });

        res.json(tareas);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener mis tareas', error: error.message });
    }
};

tareaCtrl.getTareaById = async (req, res) => {
    try {
        const tarea = await obtenerTareaPoblada(req.params.id);

        if (!tarea) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        if (!esAdministrador(req) && !esAsignado(req, tarea)) {
            return res.status(403).json({ mensaje: 'No tienes permisos para ver esta tarea' });
        }

        res.json(tarea);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener tarea', error: error.message });
    }
};

tareaCtrl.crearTarea = async (req, res) => {
    try {
        if (!esAdministrador(req)) {
            return res.status(403).json({ mensaje: 'Solo el Administrador puede crear tareas' });
        }

        const nuevaTarea = new Tarea({
            ...aplicarFechaCompletadaPorEstado(limpiarDatosTarea(req.body)),
            creadoPor: req.usuario.id
        });
        const tareaGuardada = await nuevaTarea.save();
        const tarea = await obtenerTareaPoblada(tareaGuardada._id);

        res.status(201).json(tarea);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear tarea', error: error.message });
    }
};

tareaCtrl.actualizarTarea = async (req, res) => {
    try {
        if (!esAdministrador(req)) {
            return res.status(403).json({ mensaje: 'Solo el Administrador puede editar tareas' });
        }

        const tarea = await Tarea.findByIdAndUpdate(
            req.params.id,
            aplicarFechaCompletadaPorEstado(limpiarDatosTarea(req.body)),
            { new: true, runValidators: true }
        ).populate(POPULATE_TAREA);

        if (!tarea) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        res.json(tarea);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar tarea', error: error.message });
    }
};

tareaCtrl.cambiarEstadoTarea = async (req, res) => {
    try {
        const { estado } = req.body;
        const tarea = await Tarea.findById(req.params.id);

        if (!tarea) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        if (!esAdministrador(req)) {
            if (!esAsignado(req, tarea)) {
                return res.status(403).json({ mensaje: 'No puedes modificar tareas de otros usuarios' });
            }

            if (!['En proceso', 'Completada'].includes(estado)) {
                return res.status(403).json({ mensaje: 'Solo puedes cambiar a En proceso o Completada' });
            }
        }

        tarea.estado = estado;
        tarea.fechaCompletada = estado === 'Completada' ? new Date() : null;
        const tareaActualizada = await tarea.save();
        res.json(await obtenerTareaPoblada(tareaActualizada._id));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al cambiar estado de tarea', error: error.message });
    }
};

tareaCtrl.completarTarea = async (req, res) => {
    try {
        const tarea = await Tarea.findById(req.params.id);

        if (!tarea) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        if (!esAdministrador(req) && !esAsignado(req, tarea)) {
            return res.status(403).json({ mensaje: 'No puedes completar esta tarea' });
        }

        tarea.estado = 'Completada';
        tarea.fechaCompletada = new Date();

        if (req.file) {
            tarea.evidenciaUrl = `/uploads/tareas/${req.file.filename}`;
        }

        if (req.body.observaciones) {
            tarea.observaciones = req.body.observaciones;
        }

        const tareaActualizada = await tarea.save();
        res.json(await obtenerTareaPoblada(tareaActualizada._id));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al completar tarea', error: error.message });
    }
};

tareaCtrl.eliminarTarea = async (req, res) => {
    try {
        if (!esAdministrador(req)) {
            return res.status(403).json({ mensaje: 'Solo el Administrador puede eliminar tareas' });
        }

        const tarea = await Tarea.findByIdAndDelete(req.params.id);

        if (!tarea) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        res.json({ mensaje: 'Tarea eliminada' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar tarea', error: error.message });
    }
};

tareaCtrl.agregarComentario = async (req, res) => {
    try {
        const { texto } = req.body;

        if (!texto) {
            return res.status(400).json({ mensaje: 'El comentario es requerido' });
        }

        const tarea = await Tarea.findById(req.params.id);

        if (!tarea) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        if (!esAdministrador(req) && !esAsignado(req, tarea)) {
            return res.status(403).json({ mensaje: 'No puedes comentar esta tarea' });
        }

        tarea.comentarios.push({
            usuario: req.usuario.id,
            texto
        });

        const tareaActualizada = await tarea.save();
        res.status(201).json(await obtenerTareaPoblada(tareaActualizada._id));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al agregar comentario', error: error.message });
    }
};

module.exports = tareaCtrl;
