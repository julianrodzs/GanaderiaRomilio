const { Types } = require('mongoose');
const Animal = require('../models/Animal');
const Movimiento = require('../models/MovimientoFinanciero');
const { RegistroReproductivo: Registro } = require('../models/RegistroReproductivo');
const Pertenencia = require('../models/PertenenciaLote');
const Lote = require('../models/Lote');
const Historial = require('../models/HistorialFincaAnimal');
const Traslado = require('../models/TrasladoFinca');
const Usuario = require('../models/Usuario');
const { Tarea } = require('../models/Tarea');
const { Membresia } = require('../models/Membresia');
const { obtenerOrganizacionActual } = require('../context/organizacion-context');
const { rolTienePermiso } = require('../config/permisosRoles');
const { normalizarModulosResumen } = require('./permisosResumenEmail-service');
const { claveDiaEnZona } = require('./fechaZonaHoraria-service');

const normalizarFincaIds = (ids = []) => [...new Set(ids.map((id) => String(id?._id || id)))]
    .filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
const DIA = 86400000;
const diaExpresion = (campo, zona) => ({ $dateToString: { date: campo, format: '%Y-%m-%d', timezone: {
    $cond: [{ $eq: [{ $dateToString: { date: campo, format: '%H:%M:%S.%L', timezone: 'UTC' } }, '00:00:00.000'] }, 'UTC', zona]
} } });
const rango = (desde, hasta) => ({ $gte: desde, $lt: hasta });
const vacio = () => ({ activos: 0, nacimientos: 0, compras: 0, recibidos: 0, ventas: 0, muertes: 0, enviados: 0, variacion: 0 });
const calcularVariacion = (d) => d.nacimientos + d.compras + d.recibidos - d.ventas - d.muertes - d.enviados;
const cajaVacia = () => ({ ingresos: 0, egresos: 0, balance: 0, movimientos: 0, topIngresos: [], topEgresos: [] });

const recopilarResumen = async ({ usuarioId, rol, frecuencia, modulos: solicitados, fincaIds, fincas = [],
    zonaHoraria = 'America/Costa_Rica', ahora = new Date() }) => {
    const organizacion = obtenerOrganizacionActual();
    if (!organizacion) throw Object.assign(new Error('El resumen requiere una organización explícita.'), { code: 'EMAIL_ORGANIZATION_REQUIRED' });
    const organizacionId = new Types.ObjectId(organizacion);
    const ids = normalizarFincaIds(fincaIds);
    if (!ids.length) throw Object.assign(new Error('El destinatario no tiene fincas activas autorizadas para el resumen.'), { code: 'EMAIL_FARM_SCOPE_EMPTY' });
    const filtro = { organizacionId, fincaId: { $in: ids } };
    // Revalidar aquí también: ningún llamador puede habilitar finanzas con un booleano sin rol.
    const modulos = normalizarModulosResumen(solicitados, rol);
    const desde = new Date(ahora.getTime() - (frecuencia === 'Semanal' ? 7 : 1) * DIA);
    const hoy = claveDiaEnZona(ahora, zonaHoraria);
    const finRadar = new Date(`${hoy}T00:00:00Z`);
    finRadar.setUTCDate(finRadar.getUTCDate() + 7);
    const hastaDia = finRadar.toISOString().slice(0, 10);
    const resultado = { periodo: { desde, hasta: ahora, zonaHoraria, frecuencia }, modulos };
    const porFinca = new Map(ids.map((id) => [String(id), { fincaId: String(id),
        nombre: fincas.find((f) => String(f._id) === String(id))?.nombre || 'Finca',
        inventario: vacio(), caja: cajaVacia(), vencidas: 0, partos: 0 }]));

    if (modulos.resumenGanadero) {
        const especies = new Map(['Bovino', 'Porcino'].map((e) => [e, vacio()]));
        const activos = await Animal.aggregate([
            { $match: { ...filtro, estado: 'Activo' } },
            { $group: { _id: { finca: '$fincaId', especie: { $ifNull: ['$especie', 'Bovino'] } }, cantidad: { $sum: 1 } } }
        ]);
        for (const r of activos) {
            if (especies.has(r._id.especie)) especies.get(r._id.especie).activos += r.cantidad;
            porFinca.get(String(r._id.finca)).inventario.activos += r.cantidad;
        }
        const eventos = [
            { tipo: 'nacimientos', fecha: { $cond: [{ $eq: [{ $ifNull: ['$fechaCompra', null] }, null] }, '$fechaNacimiento', null] } },
            { tipo: 'compras', fecha: '$fechaCompra' },
            { tipo: 'ventas', fecha: { $cond: [{ $eq: ['$estado', 'Vendido'] }, '$fechaVenta', null] } },
            { tipo: 'muertes', fecha: { $cond: [{ $eq: ['$estado', 'Muerto'] }, '$fechaMuerte', null] } }
        ];
        // Resolver la finca a la fecha del hecho, no la finca actual tras un traslado.
        // El primer filtro es organizacional; la autorización se aplica después del historial.
        const flujos = await Animal.aggregate([
            { $match: { organizacionId, $or: ['fechaNacimiento', 'fechaCompra', 'fechaVenta', 'fechaMuerte'].map((c) => ({ [c]: rango(desde, ahora) })) } },
            { $project: { especie: { $ifNull: ['$especie', 'Bovino'] }, fincaId: 1, eventos } },
            { $unwind: '$eventos' }, { $match: { 'eventos.fecha': rango(desde, ahora) } },
            { $lookup: { from: Historial.collection.name, let: { animal: '$_id', fecha: '$eventos.fecha' }, pipeline: [
                { $match: { organizacionId, $expr: { $eq: ['$animal', '$$animal'] } } },
                { $facet: {
                    anterior: [{ $match: { $expr: { $lte: ['$fecha', '$$fecha'] } } }, { $sort: { fecha: -1, _id: -1 } }, { $limit: 1 }],
                    primero: [{ $sort: { fecha: 1, _id: 1 } }, { $limit: 1 }]
                } }
            ], as: 'historia' } },
            { $set: { historia: { $first: '$historia' } } },
            { $set: { fincaHecho: { $ifNull: [{ $first: '$historia.anterior.fincaDestino' },
                { $ifNull: [{ $first: '$historia.primero.fincaOrigen' }, { $ifNull: [{ $first: '$historia.primero.fincaDestino' }, '$fincaId'] }] }] } } },
            { $match: { fincaHecho: { $in: ids } } },
            { $group: { _id: { finca: '$fincaHecho', especie: '$especie', tipo: '$eventos.tipo' }, cantidad: { $sum: 1 } } }
        ]);
        const traslados = await Traslado.aggregate([
            { $match: { organizacionId, estado: 'Completado', fecha: rango(desde, ahora), $or: [{ fincaOrigen: { $in: ids } }, { fincaDestino: { $in: ids } }] } },
            { $unwind: '$animales' },
            { $project: { especie: '$animales.especie', eventos: [{ finca: '$fincaOrigen', tipo: 'enviados' }, { finca: '$fincaDestino', tipo: 'recibidos' }] } },
            { $unwind: '$eventos' }, { $match: { 'eventos.finca': { $in: ids } } },
            { $group: { _id: { finca: '$eventos.finca', especie: '$especie', tipo: '$eventos.tipo' }, cantidad: { $sum: 1 } } }
        ]);
        for (const r of [...flujos, ...traslados]) {
            if (especies.has(r._id.especie)) especies.get(r._id.especie)[r._id.tipo] += r.cantidad;
            porFinca.get(String(r._id.finca)).inventario[r._id.tipo] += r.cantidad;
        }
        resultado.inventario = [...especies].map(([especie, datos]) => ({ especie, ...datos, variacion: calcularVariacion(datos) }))
            .filter((d) => Object.entries(d).some(([c, v]) => c !== 'especie' && Number(v) !== 0));
        const engorde = await Pertenencia.aggregate([
            { $match: { ...filtro, activo: true } },
            { $lookup: { from: Lote.collection.name, localField: 'lote', foreignField: '_id', as: 'loteDatos' } },
            { $unwind: '$loteDatos' },
            { $match: { 'loteDatos.organizacionId': organizacionId, 'loteDatos.fincaId': { $in: ids }, 'loteDatos.estado': 'ACTIVO', 'loteDatos.proposito': 'ENGORDE', $expr: { $eq: ['$fincaId', '$loteDatos.fincaId'] } } },
            { $lookup: { from: Animal.collection.name, localField: 'animal', foreignField: '_id', as: 'animalDatos' } },
            { $unwind: '$animalDatos' },
            { $match: { 'animalDatos.organizacionId': organizacionId, 'animalDatos.estado': 'Activo', $expr: { $eq: ['$fincaId', '$animalDatos.fincaId'] } } },
            { $group: { _id: '$animal' } }, { $count: 'cantidad' }
        ]);
        resultado.productivo = { engorde: engorde[0]?.cantidad || 0 };
    }

    if (modulos.finanzas) {
        const filas = await Movimiento.aggregate([
            { $match: { ...filtro, fecha: rango(desde, ahora), excluirConsolidacion: { $ne: true }, grupoAnuladoEn: null,
                alcanceFinanciero: { $ne: 'TRANSFERENCIA_INTERNA' }, naturaleza: { $in: ['Ingreso', 'Egreso'] } } },
            { $group: { _id: { finca: '$fincaId', moneda: { $ifNull: ['$moneda', 'CRC'] }, naturaleza: '$naturaleza',
                categoria: { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$categoriaNormalizada', ''] }, ''] }, { $ne: ['$categoriaNormalizada', 'Otros'] }] }, '$categoriaNormalizada', { $ifNull: ['$categoria', 'Sin categoría'] }] }
            }, monto: { $sum: '$monto' }, movimientos: { $sum: 1 } } }
        ]);
        const monedas = { CRC: cajaVacia(), USD: cajaVacia() };
        const rubros = { CRC: { Ingreso: new Map(), Egreso: new Map() }, USD: { Ingreso: new Map(), Egreso: new Map() } };
        for (const r of filas) {
            const moneda = r._id.moneda, c = r._id.naturaleza === 'Ingreso' ? 'ingresos' : 'egresos';
            if (!monedas[moneda]) continue;
            monedas[moneda][c] += r.monto;
            monedas[moneda].movimientos += r.movimientos;
            const mapa = rubros[moneda][r._id.naturaleza];
            mapa.set(r._id.categoria, (mapa.get(r._id.categoria) || 0) + r.monto);
            if (moneda === 'CRC') porFinca.get(String(r._id.finca)).caja[c] += r.monto;
        }
        for (const [moneda, datos] of Object.entries(monedas)) {
            datos.balance = datos.ingresos - datos.egresos;
            for (const [naturaleza, total, destino] of [['Ingreso', datos.ingresos, 'topIngresos'], ['Egreso', datos.egresos, 'topEgresos']]) {
                datos[destino] = [...rubros[moneda][naturaleza]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
                    .map(([categoria, monto]) => ({ categoria, monto, porcentaje: total ? monto / total * 100 : 0 }));
            }
        }
        if (!monedas.USD.movimientos) delete monedas.USD;
        resultado.finanzas = monedas;
    }

    if (modulos.tareasPendientes) {
        const supervision = ['Administrador', 'Encargado'].includes(rol);
        const filas = await Tarea.aggregate([
            { $match: { ...filtro, ...(!supervision ? { asignadoA: new Types.ObjectId(usuarioId) } : {}),
                $or: [{ estado: { $in: ['Pendiente', 'En proceso'] } }, { estado: 'Completada', fechaCompletada: rango(desde, ahora) }] } },
            { $set: { diaLimite: diaExpresion({ $ifNull: ['$fechaLimite', '$fechaProgramada'] }, zonaHoraria), personal: { $eq: ['$asignadoA', new Types.ObjectId(usuarioId)] } } },
            { $set: { vencida: { $and: [{ $ne: ['$estado', 'Completada'] }, { $lt: ['$diaLimite', hoy] }] } } },
            { $facet: {
                conteos: [{ $group: { _id: { finca: '$fincaId', personal: '$personal', completada: { $eq: ['$estado', 'Completada'] } }, cantidad: { $sum: 1 }, vencidas: { $sum: { $cond: ['$vencida', 1, 0] } } } }],
                urgentes: [{ $match: { estado: { $in: ['Pendiente', 'En proceso'] } } },
                    { $set: { ordenPrioridad: { $indexOfArray: [['Urgente', 'Alta', 'Media', 'Baja'], '$prioridad'] } } },
                    { $sort: { vencida: -1, diaLimite: 1, ordenPrioridad: 1, _id: 1 } }, { $limit: 5 },
                    { $project: { titulo: 1, fincaId: 1, animal: 1, lote: 1, asignadoA: 1, diaLimite: 1, vencida: 1 } }]
            } }
        ]);
        const datos = filas[0] || { conteos: [], urgentes: [] };
        resultado.tareas = { supervision, pendientes: 0, vencidas: 0, completadas: 0, personales: { pendientes: 0, vencidas: 0, completadas: 0 }, urgentes: [] };
        for (const r of datos.conteos) {
            const campo = r._id.completada ? 'completadas' : 'pendientes';
            resultado.tareas[campo] += r.cantidad;
            resultado.tareas.vencidas += r.vencidas;
            if (r._id.personal) { resultado.tareas.personales[campo] += r.cantidad; resultado.tareas.personales.vencidas += r.vencidas; }
            porFinca.get(String(r._id.finca)).vencidas += r.vencidas;
        }
        // Solo se hidratan cinco tareas; no se cargan todas las pendientes en memoria.
        for (const tarea of datos.urgentes) {
            const persona = await Usuario.findOne({ _id: tarea.asignadoA, estado: 'Activo' }).select('nombre').lean();
            const membresia = await Membresia.findOne({ organizacionId, usuario: tarea.asignadoA, estado: 'Activo' }).select('rol accesoTodasFincas fincas').lean();
            const asignacionValida = membresia && (membresia.accesoTodasFincas || membresia.fincas?.some((f) => String(f) === String(tarea.fincaId)));
            const animal = tarea.animal ? await Animal.findOne({ ...filtro, _id: tarea.animal, fincaId: tarea.fincaId }).select('diio nombre identificadorFinca').lean() : null;
            const lote = tarea.lote ? await Lote.findOne({ ...filtro, _id: tarea.lote, fincaId: tarea.fincaId }).select('nombre codigo').lean() : null;
            resultado.tareas.urgentes.push({ titulo: tarea.titulo, finca: porFinca.get(String(tarea.fincaId)).nombre,
                referencia: animal ? [animal.diio || animal.identificadorFinca, animal.nombre].filter(Boolean).join(' ') : lote ? [lote.codigo, lote.nombre].filter(Boolean).join(' ') : '',
                responsable: persona && asignacionValida ? `${persona.nombre} (${membresia.rol})` : 'Responsable no disponible',
                fechaLimite: tarea.diaLimite, estado: tarea.vencida ? 'Vencida' : tarea.diaLimite === hoy ? 'Para hoy' : 'Próxima' });
        }
    }

    const verReproduccion = rolTienePermiso(rol, 'reproduccion.ver');
    const verSanidad = rolTienePermiso(rol, 'sanidad.ver');
    if ((modulos.resumenGanadero || modulos.radarOperativo) && verReproduccion) {
        const gestaciones = await Registro.aggregate([
            { $match: { ...filtro, gestacionConfirmada: true, estadoCiclo: 'Activo', fechaPartoReal: null } },
            { $lookup: { from: Animal.collection.name, localField: 'animal', foreignField: '_id', as: 'hembra' } },
            { $unwind: '$hembra' }, { $match: { 'hembra.organizacionId': organizacionId, 'hembra.estado': 'Activo', 'hembra.sexo': 'Hembra', $expr: { $eq: ['$fincaId', '$hembra.fincaId'] } } },
            { $sort: { fechaPartoEstimada: 1, _id: 1 } },
            { $group: { _id: '$animal', fincaId: { $first: '$fincaId' }, fecha: { $first: '$fechaPartoEstimada' }, diio: { $first: '$hembra.diio' }, nombre: { $first: '$hembra.nombre' } } },
            { $set: { dia: diaExpresion('$fecha', zonaHoraria) } },
            { $facet: { total: [{ $count: 'cantidad' }], proximas: [{ $match: { dia: { $gte: hoy, $lt: hastaDia } } },
                { $group: { _id: '$fincaId', cantidad: { $sum: 1 } } }],
                detalle: [{ $match: { dia: { $gte: hoy, $lt: hastaDia } } }, { $sort: { dia: 1, _id: 1 } }, { $limit: 5 }, { $project: { diio: 1, nombre: 1, dia: 1 } }] } }
        ]);
        const g = gestaciones[0] || { total: [], proximas: [], detalle: [] };
        if (resultado.productivo) resultado.productivo.gestaciones = g.total[0]?.cantidad || 0;
        if (modulos.radarOperativo) {
            resultado.radar = { partos: g.proximas.reduce((s, r) => s + r.cantidad, 0), hembras: g.detalle };
            for (const r of g.proximas) porFinca.get(String(r._id)).partos = r.cantidad;
            resultado.radar.campanas = await Tarea.countDocuments({ ...filtro, estado: { $in: ['Pendiente', 'En proceso'] },
                categoriaAutomatica: { $in: ['IATF', 'TE_DONANTE', 'TETF', 'Transferencia de embriones'] },
                ...(!['Administrador', 'Encargado'].includes(rol) ? { asignadoA: usuarioId } : {}),
                $expr: { $and: [{ $gte: [diaExpresion('$fechaProgramada', zonaHoraria), hoy] }, { $lt: [diaExpresion('$fechaProgramada', zonaHoraria), hastaDia] }] } });
        }
    }
    if (modulos.radarOperativo && verSanidad) {
        resultado.radar = { ...resultado.radar, retiroCarne: await Animal.countDocuments({ ...filtro, estado: 'Activo', fechaFinRetiroCarne: { $gt: ahora } }) };
    }
    if (ids.length >= 2) resultado.fincas = [...porFinca.values()].map((f) => ({ ...f,
        inventario: { ...f.inventario, variacion: calcularVariacion(f.inventario) }, caja: { ...f.caja, balance: f.caja.ingresos - f.caja.egresos } }));
    return resultado;
};

module.exports = { recopilarResumen, normalizarFincaIds, diaExpresion };
