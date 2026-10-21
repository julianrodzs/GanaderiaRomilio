const Pesaje = require('../models/Pesaje');
const Animal = require('../models/Animal');
const EventoLote = require('../models/EventoLote');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('./eventoAnimal-service');
const { obtenerOrganizacionActual } = require('../context/organizacion-context');

const CAMPOS_PESAJE = new Set(['animal', 'fecha', 'peso', 'etapaProductiva', 'observaciones']);
const CAMPOS_PESAJE_MASIVO = new Set(['fecha', 'observaciones', 'pesajes']);
const CAMPOS_PROTEGIDOS = new Set([
    '_id', '__v', 'organizacionId', 'fincaId', 'registradoPor', 'editadoPor',
    'fechaEdicion', 'aumentoKg', 'diasDesdeUltimoPesaje', 'tipoPesaje', 'lote',
    'createdAt', 'updatedAt'
]);
const MS_DIA = 24 * 60 * 60 * 1000;

const crearErrorPesaje = (mensaje, status = 400, codigo = 'PESAJE_INVALIDO') => (
    Object.assign(new Error(mensaje), { status, statusCode: status, codigo })
);

const validarClavesSeguras = (valor, ruta = '') => {
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
        valor.forEach((item, indice) => validarClavesSeguras(item, `${ruta}[${indice}]`));
        return;
    }
    Object.entries(valor).forEach(([clave, contenido]) => {
        if (clave.startsWith('$') || clave.includes('.')) {
            throw crearErrorPesaje(`El campo ${ruta ? `${ruta}.` : ''}${clave} no esta permitido.`, 400, 'OPERADOR_NO_PERMITIDO');
        }
        validarClavesSeguras(contenido, ruta ? `${ruta}.${clave}` : clave);
    });
};

const sanitizarPesaje = (payload = {}, { parcial = false } = {}) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw crearErrorPesaje('Los datos del pesaje deben enviarse como un objeto.');
    }
    validarClavesSeguras(payload);
    const datos = {};
    Object.entries(payload).forEach(([campo, valor]) => {
        if (CAMPOS_PROTEGIDOS.has(campo)) {
            throw crearErrorPesaje(`El campo ${campo} es administrado por el sistema.`, 400, 'CAMPO_PROTEGIDO');
        }
        if (!CAMPOS_PESAJE.has(campo)) {
            throw crearErrorPesaje(`El campo ${campo} no forma parte del contrato de pesajes.`, 400, 'CAMPO_NO_PERMITIDO');
        }
        datos[campo] = valor;
    });
    if (!parcial && !datos.animal) throw crearErrorPesaje('El animal es requerido.');
    if (!parcial && (datos.peso === undefined || datos.peso === null || datos.peso === '')) {
        throw crearErrorPesaje('El peso es requerido.');
    }
    return datos;
};

const sanitizarPesajeMasivo = (payload = {}) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw crearErrorPesaje('Los datos del pesaje masivo deben enviarse como un objeto.');
    }
    validarClavesSeguras(payload);
    Object.keys(payload).forEach((campo) => {
        if (CAMPOS_PROTEGIDOS.has(campo)) {
            throw crearErrorPesaje(`El campo ${campo} es administrado por el sistema.`, 400, 'CAMPO_PROTEGIDO');
        }
        if (!CAMPOS_PESAJE_MASIVO.has(campo)) {
            throw crearErrorPesaje(`El campo ${campo} no forma parte del contrato de pesaje masivo.`, 400, 'CAMPO_NO_PERMITIDO');
        }
    });
    return {
        fecha: payload.fecha,
        observaciones: payload.observaciones,
        pesajes: Array.isArray(payload.pesajes) ? payload.pesajes : []
    };
};

const validarFechaPesaje = (fechaValor, fechaNacimiento, ahora = new Date()) => {
    const fecha = new Date(fechaValor || ahora);
    if (Number.isNaN(fecha.getTime())) throw crearErrorPesaje('La fecha del pesaje no es valida.', 400, 'FECHA_INVALIDA');
    if (fecha.getTime() > new Date(ahora).getTime()) {
        throw crearErrorPesaje('La fecha del pesaje no puede estar en el futuro.', 400, 'FECHA_FUTURA');
    }
    if (fechaNacimiento && fecha < new Date(fechaNacimiento)) {
        throw crearErrorPesaje('La fecha del pesaje no puede ser anterior al nacimiento del animal.', 400, 'FECHA_ANTES_NACIMIENTO');
    }
    return fecha;
};

const validarAnimalesUnicos = (entradas = []) => {
    const ids = entradas.map((item) => String(item.animal || ''));
    if (ids.some((id) => !id)) throw crearErrorPesaje('Todos los pesajes deben indicar un animal.');
    if (new Set(ids).size !== ids.length) {
        throw crearErrorPesaje('El envio contiene mas de un pesaje para el mismo animal.', 400, 'ANIMAL_DUPLICADO_EN_PESAJE');
    }
    return ids;
};

const validarDatosPesaje = async (datos, opciones = {}) => {
    const { session } = opciones;
    if (!datos.animal) throw crearErrorPesaje('El animal es requerido.');
    const animal = await Animal.findById(datos.animal).session(session || null);
    if (!animal) throw crearErrorPesaje('Animal no encontrado en la finca activa.', 404, 'ANIMAL_NO_ENCONTRADO');

    const peso = Number(datos.peso);
    if (!Number.isFinite(peso) || peso <= 0) {
        throw crearErrorPesaje('El peso debe ser mayor que cero.');
    }
    const fecha = validarFechaPesaje(datos.fecha, animal.fechaNacimiento);
    return { animal, fecha, peso };
};

const consultaPesajesOrganizacion = (animalId, organizacionId, session) => Pesaje.find({
    animal: animalId,
    organizacionId: organizacionId || obtenerOrganizacionActual()
})
    .setOptions({ omitirAislamientoFinca: true })
    .sort({ fecha: 1, createdAt: 1, _id: 1 })
    .session(session || null);

const actualizarPesoActualAnimal = async (animalId, opciones = {}) => {
    if (!animalId) return null;
    const organizacionId = opciones.organizacionId || obtenerOrganizacionActual();
    const pesajes = await consultaPesajesOrganizacion(animalId, organizacionId, opciones.session);
    let anterior = null;
    for (const pesaje of pesajes) {
        if (anterior) {
            pesaje.aumentoKg = Number(pesaje.peso) - Number(anterior.peso);
            const diferencia = new Date(pesaje.fecha) - new Date(anterior.fecha);
            pesaje.diasDesdeUltimoPesaje = Math.max(0, Math.round(diferencia / MS_DIA));
        } else {
            pesaje.aumentoKg = undefined;
            pesaje.diasDesdeUltimoPesaje = undefined;
        }
        await pesaje.save(opciones.session ? { session: opciones.session } : {});
        anterior = pesaje;
    }

    const animal = await Animal.findOne({ _id: animalId, organizacionId })
        .setOptions({ omitirAislamientoFinca: true })
        .session(opciones.session || null);
    if (!animal) throw crearErrorPesaje('Animal no encontrado en la organizacion.', 404, 'ANIMAL_NO_ENCONTRADO');

    const pesoFallback = animal.pesoCompra ?? animal.pesoNacimiento ?? null;
    const pesoActual = anterior?.peso ?? pesoFallback;
    const fechaUltimoPesaje = anterior?.fecha ?? null;
    const filtro = { _id: animalId, organizacionId };
    if (!opciones.forzar && anterior) {
        filtro.$or = [
            { fechaUltimoPesaje: { $exists: false } },
            { fechaUltimoPesaje: null },
            { fechaUltimoPesaje: { $lte: anterior.fecha } }
        ];
    }
    const actualizado = await Animal.findOneAndUpdate(
        filtro,
        { $set: { pesoActual, fechaUltimoPesaje } },
        { new: true, session: opciones.session, runValidators: true, omitirAislamientoFinca: true }
    );
    return actualizado || animal;
};

const registrarEventoPesaje = async (pesaje, usuarioId, opciones = {}) => {
    if (!pesaje?.animal) return;
    const autorOriginal = pesaje.registradoPor || usuarioId;
    await upsertEventoAnimal({
        animal: pesaje.animal,
        tipoEvento: 'Pesaje',
        fecha: pesaje.fecha,
        titulo: opciones.titulo || 'Pesaje registrado',
        descripcion: opciones.descripcion || `Peso registrado: ${pesaje.peso} kg${pesaje.observaciones ? `. ${pesaje.observaciones}` : ''}`,
        moduloOrigen: 'Pesajes',
        referenciaId: pesaje._id,
        creadoPor: autorOriginal,
        metadata: {
            pesoKg: pesaje.peso,
            tipoPesaje: pesaje.tipoPesaje || 'Individual',
            loteId: pesaje.lote || opciones.loteId || null,
            ...(pesaje.editadoPor ? { editadoPor: pesaje.editadoPor, fechaEdicion: pesaje.fechaEdicion } : {})
        }
    }, { session: opciones.session });

    const loteId = pesaje.lote || opciones.loteId;
    if (loteId && opciones.crearEventoLote !== false) {
        await EventoLote.findOneAndUpdate(
            { lote: loteId, entidadTipo: 'Pesaje', referenciaId: pesaje._id },
            { $set: {
                tipo: 'PESAJE_REGISTRADO',
                fecha: pesaje.fecha,
                titulo: 'Pesaje registrado',
                descripcion: `${pesaje.peso} kg`,
                registradoPor: autorOriginal,
                metadata: { animalId: pesaje.animal, pesoKg: pesaje.peso }
            } },
            { upsert: true, new: true, setDefaultsOnInsert: true, ...(opciones.session ? { session: opciones.session } : {}) }
        );
    }
};

const limpiarEventosPesaje = async (pesajeId, opciones = {}) => {
    const { session } = opciones;
    await eliminarEventosPorReferencia({ moduloOrigen: 'Pesajes', referenciaId: pesajeId, session });
    await EventoLote.deleteMany({ entidadTipo: 'Pesaje', referenciaId: pesajeId }, session ? { session } : {});
    const grupales = await EventoLote.find({ 'metadata.pesajes': pesajeId }).session(session || null);
    for (const evento of grupales) {
        const restantes = (evento.metadata?.pesajes || []).filter((id) => String(id) !== String(pesajeId));
        if (!restantes.length) {
            await EventoLote.deleteOne({ _id: evento._id }, session ? { session } : {});
        } else {
            evento.metadata = { ...evento.metadata, pesajes: restantes };
            evento.titulo = `${restantes.length} pesaje(s) registrados`;
            await evento.save(session ? { session } : {});
        }
    }
};

module.exports = {
    actualizarPesoActualAnimal,
    crearErrorPesaje,
    limpiarEventosPesaje,
    registrarEventoPesaje,
    sanitizarPesaje,
    sanitizarPesajeMasivo,
    validarAnimalesUnicos,
    validarClavesSeguras,
    validarDatosPesaje,
    validarFechaPesaje
};
