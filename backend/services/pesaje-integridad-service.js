const Pesaje = require('../models/Pesaje');
const Animal = require('../models/Animal');
const EventoLote = require('../models/EventoLote');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('./eventoAnimal-service');
const { obtenerOrganizacionActual } = require('../context/organizacion-context');
const { TIPOS_PESAJE, ETIQUETAS_PESAJE, tipoPesajeVisible, origenPesaje } = require('../config/tiposPesaje');
const { parsearFechaCivil } = require('./fechaZonaHoraria-service');

const CAMPOS_PESAJE = new Set(['animal', 'fecha', 'peso', 'etapaProductiva', 'observaciones', 'tipoPesaje']);
const CAMPOS_PESAJE_MASIVO = new Set(['fecha', 'observaciones', 'pesajes', 'tipoPesaje']);
const CAMPOS_PROTEGIDOS = new Set([
    '_id', '__v', 'organizacionId', 'fincaId', 'registradoPor', 'editadoPor',
    'fechaEdicion', 'aumentoKg', 'diasDesdeUltimoPesaje', 'origenPesaje', 'lote',
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
    if (datos.tipoPesaje !== undefined && !TIPOS_PESAJE.includes(datos.tipoPesaje)) throw crearErrorPesaje('Tipo de pesaje no valido.', 422);
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
    if (payload.tipoPesaje !== undefined && !TIPOS_PESAJE.includes(payload.tipoPesaje)) throw crearErrorPesaje('Tipo de pesaje no valido.', 422);
    return {
        tipoPesaje: payload.tipoPesaje,
        fecha: payload.fecha,
        observaciones: payload.observaciones,
        pesajes: Array.isArray(payload.pesajes) ? payload.pesajes : []
    };
};

const validarFechaPesaje = (fechaValor, fechaNacimiento, ahora = new Date()) => {
    const fecha = typeof fechaValor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaValor)
        ? parsearFechaCivil(fechaValor, 'La fecha del pesaje') : new Date(fechaValor || ahora);
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
    const tipo = datos.tipoPesaje || 'REGULAR';
    if (!TIPOS_PESAJE.includes(tipo)) throw crearErrorPesaje('Tipo de pesaje no valido.', 422);
    if (['DESTETE', 'NACIMIENTO'].includes(tipo)) {
        const existente = await Pesaje.findOne({ animal: animal._id, tipoPesaje: tipo, ...(opciones.pesajeId ? { _id: { $ne: opciones.pesajeId } } : {}) })
            .setOptions({ omitirAislamientoFinca: true }).session(session || null);
        if (existente) throw crearErrorPesaje(`El animal ya tiene un pesaje de ${ETIQUETAS_PESAJE[tipo].toLowerCase()}. Edite ese registro para corregirlo.`, 409, 'HITO_PESAJE_DUPLICADO');
    }
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

    let animal = await Animal.findOne({ _id: animalId, organizacionId }).select('+hitosPesaje')
        .setOptions({ omitirAislamientoFinca: true })
        .session(opciones.session || null);
    if (!animal) throw crearErrorPesaje('Animal no encontrado en la organizacion.', 404, 'ANIMAL_NO_ENCONTRADO');
    animal = await sincronizarHitosAnimal(animal, pesajes, opciones);

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
    for (const pesaje of pesajes.filter((p) => ['DESTETE', 'NACIMIENTO'].includes(p.tipoPesaje))) {
        await registrarEventoPesaje(pesaje, pesaje.registradoPor, { ...opciones, animal, crearEventoLote: false });
    }
    return actualizado || animal;
};

const edadEnDias = (nacimiento, fecha) => {
    if (!nacimiento || !fecha) return null;
    const inicio = new Date(nacimiento), fin = new Date(fecha);
    if (!Number.isFinite(+inicio) || !Number.isFinite(+fin)) return null;
    const dias = Math.round((Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate()) - Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate())) / MS_DIA);
    return dias >= 0 ? dias : null;
};
const sincronizarHitosAnimal = async (animal, pesajes, opciones) => {
    const fuentes = animal.hitosPesaje?.toObject?.() || {};
    const set = {}, unset = {};
    for (const [clave, tipo, campos] of [
        ['nacimiento', 'NACIMIENTO', { peso: 'pesoNacimiento' }],
        ['destete', 'DESTETE', { peso: 'pesoDestete', fecha: 'fechaDestete', edadDias: 'edadDesteteDias' }]
    ]) {
        const vigente = pesajes.findLast((p) => p.tipoPesaje === tipo);
        const fuente = fuentes[clave];
        if (vigente) {
            const anterior = fuente?.anterior || Object.fromEntries(Object.entries(campos).map(([k, campo]) => [k, animal[campo] ?? null]));
            const valores = { peso: vigente.peso, fecha: vigente.fecha, edadDias: edadEnDias(animal.fechaNacimiento, vigente.fecha) };
            for (const [k, campo] of Object.entries(campos)) { set[campo] = valores[k]; animal[campo] = valores[k]; }
            set[`hitosPesaje.${clave}`] = { pesaje: vigente._id, anterior, sincronizado: Object.fromEntries(Object.keys(campos).map((k) => [k, valores[k]])) };
        } else if (fuente) {
            for (const [k, campo] of Object.entries(campos)) {
                const igual = k === 'fecha' ? +(animal[campo] || 0) === +(fuente.sincronizado?.[k] || 0) : (animal[campo] ?? null) === (fuente.sincronizado?.[k] ?? null);
                if (igual) { set[campo] = fuente.anterior?.[k] ?? null; animal[campo] = set[campo]; }
            }
            unset[`hitosPesaje.${clave}`] = '';
            if (clave === 'destete') {
                set.edadDesteteDias = edadEnDias(animal.fechaNacimiento, animal.fechaDestete);
                animal.edadDesteteDias = set.edadDesteteDias;
            }
        }
    }
    if (Object.keys(set).length || Object.keys(unset).length) await Animal.updateOne(
        { _id: animal._id, organizacionId: animal.organizacionId },
        { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { session: opciones.session, omitirAislamientoFinca: true, runValidators: true }
    );
    return animal;
};

const registrarEventoPesaje = async (pesaje, usuarioId, opciones = {}) => {
    if (!pesaje?.animal) return;
    const autorOriginal = pesaje.registradoPor || usuarioId;
    const tipo = tipoPesajeVisible(pesaje.tipoPesaje);
    const animal = opciones.animal || await Animal.findById(pesaje.animal).setOptions({ omitirAislamientoFinca: true }).session(opciones.session || null);
    const edad = edadEnDias(animal?.fechaNacimiento, pesaje.fecha);
    const gdp = tipo === 'DESTETE' && edad > 0 && animal?.pesoNacimiento > 0 ? Number(((pesaje.peso - animal.pesoNacimiento) / edad).toFixed(3)) : null;
    const descripcionDestete = `Destete registrado: ${pesaje.peso} kg${edad !== null ? `; edad: ${edad} dias` : ''}${gdp !== null ? `; GDP predestete: ${gdp} kg/dia` : ''}${pesaje.observaciones ? `. ${pesaje.observaciones}` : ''}`;
    await upsertEventoAnimal({
        animal: pesaje.animal,
        tipoEvento: tipo === 'DESTETE' ? 'Destete' : 'Pesaje',
        fecha: pesaje.fecha,
        titulo: tipo === 'DESTETE' ? 'Peso al destete registrado' : tipo === 'NACIMIENTO' ? 'Peso al nacimiento registrado' : opciones.titulo || 'Pesaje registrado',
        descripcion: tipo === 'DESTETE' ? descripcionDestete : opciones.descripcion || `Peso registrado: ${pesaje.peso} kg${pesaje.observaciones ? `. ${pesaje.observaciones}` : ''}`,
        moduloOrigen: 'Pesajes',
        referenciaId: pesaje._id,
        creadoPor: autorOriginal,
        metadata: {
            pesoKg: pesaje.peso,
            tipoPesaje: tipo,
            origenPesaje: origenPesaje(pesaje),
            edadDesteteDias: tipo === 'DESTETE' ? edad : null,
            gdpPredestete: gdp,
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
    if (opciones.soloAnimal) return;
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
