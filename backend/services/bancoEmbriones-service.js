const crypto = require('crypto');
const mongoose = require('mongoose');
const { LoteEmbrion: Lote, MovimientoEmbrion: Movimiento, VentaEmbrion: Venta } = require('../models/ProgramaTE');
const Animal = require('../models/Animal');
const Financiero = require('../models/MovimientoFinanciero');
const { ejecutarEnTransaccion: tx } = require('./mongo-transaccion-service');
const { seleccionar } = require('./servicioReproductivo-service');
const { obtenerFincaActual, obtenerOrganizacionActual } = require('../context/organizacion-context');
const { cantidad, fechaValida, monedaValida } = require('./bancoSemen-service');
const error = (mensaje, status = 400, code = 'TE_INVALIDO', extra = {}) => Object.assign(new Error(mensaje), { status, code, ...extra });
const id = (v) => { if (!mongoose.isObjectIdOrHexString(v)) throw error('Identificador invalido.'); return v; };
const dinero = (v = 0) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e11) throw error('Costo o importe invalido.'); return n; };
const motivo = (v) => { if (typeof v !== 'string' || !v.trim()) throw error('El motivo es obligatorio.'); return v.trim().slice(0, 2000); };
const clave = (d, tipo) => {
    if (d.claveIdempotencia !== undefined && (typeof d.claveIdempotencia !== 'string' || !d.claveIdempotencia.trim() || d.claveIdempotencia.length > 120)) throw error('Clave idempotente invalida.');
    return `${tipo}:${d.claveIdempotencia || crypto.randomUUID()}`;
};
const comprobarInvariante = (lote) => {
    const campos = ['stockReproductivo', 'stockComercial', 'asignadoCampanas', 'totalTransferidos', 'totalVendidos', 'totalMermas'];
    if (!Number.isSafeInteger(lote.totalIngresados) || campos.some((k) => !Number.isSafeInteger(lote[k]) || lote[k] < 0) || lote.totalIngresados !== campos.reduce((s, k) => s + lote[k], 0)) throw error('El inventario de embriones no concilia.', 409, 'TE_INVARIANTE');
    return true;
};
const buscarLote = async (loteId, session = null) => {
    const l = await Lote.findById(id(loteId)).session(session);
    if (!l) throw error('Lote de embriones no encontrado en la finca.', 404);
    comprobarInvariante(l); return l;
};
const registrarMovimiento = async (d, session) => (await Movimiento.create([d], { session, ordered: true }))[0];
const cambiarSaldo = async (lote, origen, destino, n, session) => {
    const campos = { REPRODUCTIVO: 'stockReproductivo', COMERCIAL: 'stockComercial', CAMPANA: 'asignadoCampanas', TRANSFERIDO: 'totalTransferidos', CLIENTE: 'totalVendidos', MERMA: 'totalMermas' };
    n = cantidad(n); const de = campos[origen], a = campos[destino];
    if (!de || !a || de === a) throw error('Movimiento de saldo invalido.');
    const actualizado = await Lote.findOneAndUpdate({ _id: lote._id, [de]: { $gte: n } }, { $inc: { [de]: -n, [a]: n } }, { new: true, session });
    if (!actualizado) throw error(`Saldo insuficiente. Disponibles: ${lote[de]}.`, 400, 'TE_SALDO_INSUFICIENTE', { disponible: lote[de] });
    comprobarInvariante(actualizado); return actualizado;
};
const unaVez = async (key, fn) => {
    for (let intento = 0; intento < 3; intento++) {
        try { return await tx(async (session) => {
            const anterior = await Movimiento.findOne({ claveIdempotencia: key }).session(session);
            if (anterior) return { repetida: true, lote: await buscarLote(String(anterior.loteId), session), venta: anterior.ventaId ? await Venta.findById(anterior.ventaId).session(session) : undefined, movimiento: anterior };
            return fn(session);
        }); } catch (e) { if (e.code !== 11000 || intento === 2) throw e; }
    }
};
const validarGenetica = async (d, session) => {
    for (const [campo, sexo] of [['donanteId', 'Hembra'], ['padreId', 'Macho']]) if (d[campo]) {
        const a = await Animal.findOne({ _id: id(d[campo]), sexo, especie: 'Bovino' }).session(session);
        if (!a) throw error(`${campo} no pertenece a la finca o no es bovino del sexo correcto.`);
    }
    for (const campo of ['donanteExterna', 'padreExterno']) if (d[campo]) seleccionar(d[campo], ['nombre', 'diio', 'raza', 'registro']);
    if (!d.donanteId && !d.donanteExterna?.nombre?.trim()) throw error('Indique la donante interna o externa.');
    if (d.donanteId && d.donanteExterna?.nombre || d.padreId && d.padreExterno?.nombre) throw error('No mezcle progenitores internos y externos.');
};
const CAMPOS_LOTE = ['origenLote', 'origenEmbrion', 'donanteId', 'donanteExterna', 'padreId', 'padreExterno', 'estadoConservacion', 'calidadGrado', 'estadio', 'canastillaTermo', 'codigoLote', 'costoUnitario', 'moneda', 'cantidad', 'cantidadReproductiva', 'cantidadComercial', 'fecha', 'claveIdempotencia'];
const crearLote = async (datos, usuarioId, session, internos = {}) => {
    const n = cantidad(datos.cantidad), rep = Number(datos.cantidadReproductiva ?? n), com = Number(datos.cantidadComercial ?? 0);
    if (![rep, com].every((v) => Number.isSafeInteger(v) && v >= 0) || rep + com !== n) throw error('Las gavetas deben sumar la cantidad ingresada.');
    await validarGenetica(datos, session);
    const moneda = monedaValida(datos.moneda), costoUnitario = dinero(datos.costoUnitario);
    const costosUnitarios = internos.costosUnitarios || { CRC: moneda === 'CRC' ? costoUnitario : 0, USD: moneda === 'USD' ? costoUnitario : 0 };
    const permitidos = CAMPOS_LOTE.filter((k) => !['cantidad', 'cantidadReproductiva', 'cantidadComercial', 'fecha', 'claveIdempotencia'].includes(k));
    const data = Object.fromEntries(permitidos.filter((k) => datos[k] !== undefined).map((k) => [k, datos[k]]));
    const [lote] = await Lote.create([{ ...data, ...internos, costosUnitarios, costoUnitario, moneda, stockReproductivo: rep, stockComercial: com, totalIngresados: n }], { session, ordered: true });
    comprobarInvariante(lote);
    await registrarMovimiento({ loteId: lote._id, tipo: datos.origenLote === 'COMPRA' ? 'ENTRADA_COMPRA' : 'ENTRADA_COLECTA', origen: 'EXTERNO', destino: rep && com ? 'DIVIDIDO' : rep ? 'REPRODUCTIVO' : 'COMERCIAL', cantidad: n, usuarioId, claveIdempotencia: internos.claveEntrada || clave(datos, 'entrada') }, session);
    return lote;
};
const entradaCompra = async (datos, usuarioId) => {
    seleccionar(datos, CAMPOS_LOTE);
    if (datos.origenLote && datos.origenLote !== 'COMPRA') throw error('La produccion propia debe ingresar desde su colecta.');
    const key = clave(datos, 'compra');
    return unaVez(key, async (session) => ({ lote: await crearLote({ ...datos, origenLote: 'COMPRA' }, usuarioId, session, { claveEntrada: key }) }));
};
const trasladar = async (loteId, datos, usuarioId) => {
    seleccionar(datos, ['direccion', 'cantidad', 'motivo', 'claveIdempotencia']);
    const razon = motivo(datos.motivo), n = cantidad(datos.cantidad), key = clave(datos, 'traslado');
    if (!['REPRODUCTIVO_A_COMERCIAL', 'COMERCIAL_A_REPRODUCTIVO'].includes(datos.direccion)) throw error('Direccion invalida.');
    const [origen, destino] = datos.direccion.split('_A_');
    return unaVez(key, async (session) => {
        const lote = await cambiarSaldo(await buscarLote(loteId, session), origen, destino, n, session);
        await registrarMovimiento({ loteId, tipo: 'TRASLADO_GAVETA', origen, destino, cantidad: n, motivo: razon, usuarioId, claveIdempotencia: key }, session);
        return { lote };
    });
};
const merma = async (loteId, datos, usuarioId) => {
    seleccionar(datos, ['gaveta', 'cantidad', 'motivo', 'claveIdempotencia']);
    const razon = motivo(datos.motivo), n = cantidad(datos.cantidad), key = clave(datos, 'merma');
    if (!['REPRODUCTIVO', 'COMERCIAL'].includes(datos.gaveta)) throw error('Gaveta invalida.');
    return unaVez(key, async (session) => {
        const lote = await cambiarSaldo(await buscarLote(loteId, session), datos.gaveta, 'MERMA', n, session);
        await registrarMovimiento({ loteId, tipo: 'MERMA', origen: datos.gaveta, destino: 'MERMA', cantidad: n, motivo: razon, usuarioId, claveIdempotencia: key }, session);
        return { lote };
    });
};
const vender = async (datos, usuarioId) => {
    seleccionar(datos, ['loteId', 'comprador', 'cantidad', 'precioUnitario', 'moneda', 'fecha', 'claveIdempotencia']);
    const n = cantidad(datos.cantidad), precioUnitario = dinero(datos.precioUnitario), moneda = monedaValida(datos.moneda), fecha = fechaValida(datos.fecha), key = clave(datos, 'venta');
    const comprador = motivo(datos.comprador), montoTotal = Math.round(dinero(n * precioUnitario) * 100) / 100;
    return unaVez(key, async (session) => {
        const lote = await cambiarSaldo(await buscarLote(datos.loteId, session), 'COMERCIAL', 'CLIENTE', n, session);
        const [venta] = await Venta.create([{ loteId: lote._id, comprador, cantidad: n, precioUnitario, moneda, montoTotal, fecha, creadoPor: usuarioId }], { session, ordered: true });
        const [ingreso] = await Financiero.create([{ fecha, tipoMovimiento: 'Venta de embriones', naturaleza: 'Ingreso', categoria: 'Venta de Genética', descripcion: `Venta de ${n} embriones · ${lote.codigoLote}`, monto: montoTotal, moneda, destinoUso: 'Finca', referenciaModelo: 'VentaEmbrion', referenciaId: venta._id }], { session, ordered: true });
        venta.movimientoFinancieroId = ingreso._id; await venta.save({ session });
        await registrarMovimiento({ loteId: lote._id, tipo: 'VENTA', origen: 'COMERCIAL', destino: 'CLIENTE', cantidad: n, usuarioId, ventaId: venta._id, claveIdempotencia: key }, session);
        return { venta, lote };
    });
};
const anularVenta = async (ventaId, datos, usuarioId) => {
    seleccionar(datos, ['motivo']); const razon = motivo(datos.motivo);
    return tx(async (session) => {
        const venta = await Venta.findOneAndUpdate({ _id: id(ventaId), estado: 'Completada' }, { $set: { estado: 'Anulada', motivoAnulacion: razon, fechaAnulacion: new Date() } }, { new: true, session });
        if (!venta) throw error('Venta inexistente o ya anulada.');
        const lote = await cambiarSaldo(await buscarLote(String(venta.loteId), session), 'CLIENTE', 'COMERCIAL', venta.cantidad, session);
        const original = await Financiero.findOne({ _id: venta.movimientoFinancieroId, referenciaModelo: 'VentaEmbrion', referenciaId: venta._id }).session(session);
        if (!original) throw error('No existe el ingreso original.', 409);
        const { claveDiaEnZona, parsearFechaCivil } = require('./fechaZonaHoraria-service');
        const organizacion = await require('../models/Organizacion').findById(obtenerOrganizacionActual()).session(session);
        const [reversion] = await Financiero.create([{ fecha: parsearFechaCivil(claveDiaEnZona(new Date(), organizacion.zonaHoraria || 'America/Costa_Rica')), tipoMovimiento: 'Venta de embriones', naturaleza: 'Egreso', categoria: original.categoria, descripcion: `Anulacion de venta de embriones: ${razon}`, monto: original.monto, moneda: original.moneda, destinoUso: original.destinoUso, referenciaModelo: 'VentaEmbrion', referenciaId: venta._id }], { session, ordered: true });
        venta.movimientoReversionId = reversion._id; await venta.save({ session });
        await registrarMovimiento({ loteId: lote._id, tipo: 'ANULACION_VENTA', origen: 'CLIENTE', destino: 'COMERCIAL', cantidad: venta.cantidad, motivo: razon, usuarioId, ventaId: venta._id, claveIdempotencia: `anular:${venta._id}` }, session);
        return { venta, lote };
    });
};
const listar = () => Lote.find({}).populate('donanteId padreId', 'nombre diio raza descripcionRacial').sort({ createdAt: -1 }).lean();
const detalle = async (loteId) => ({ lote: await buscarLote(loteId), movimientos: await Movimiento.find({ loteId: id(loteId) }).sort({ createdAt: -1 }).lean() });
module.exports = { error, id, dinero, motivo, clave, comprobarInvariante, buscarLote, registrarMovimiento, cambiarSaldo, unaVez, validarGenetica, crearLote, entradaCompra, trasladar, merma, vender, anularVenta, listar, detalle };
