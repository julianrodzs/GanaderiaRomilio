const mongoose = require('mongoose');
const crypto = require('crypto');
const Animal = require('../models/Animal');
const CampanaIATF = require('../models/CampanaIATF');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const Organizacion = require('../models/Organizacion');
const { claveDiaEnZona, parsearFechaCivil } = require('./fechaZonaHoraria-service');
const { BancoSemen, LoteSemen, AsignacionSemenCampana, MovimientoSemen, VentaPajilla } = require('../models/BancoSemen');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { validarClavesSeguras } = require('./movimientoFinanciero-dto');
const { obtenerOrganizacionActual, obtenerFincaActual } = require('../context/organizacion-context');

const errorBanco = (mensaje, status = 400, code = 'SEMEN_INVALID', detalles = {}) => Object.assign(new Error(mensaje), { status, code, ...detalles });
const cantidad = (valor) => {
    const n = Number(valor);
    if (!Number.isSafeInteger(n) || n <= 0 || n > 100000000) throw errorBanco('La cantidad debe ser un entero mayor que cero.');
    return n;
};
const dinero = (valor = 0) => {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100000000000) throw errorBanco('El importe no es valido.');
    return Math.round(n * 100) / 100;
};
const fechaValida = (valor = new Date()) => {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) throw errorBanco('La fecha no es valida.');
    return fecha;
};
const monedaValida = (valor) => {
    if (!['CRC', 'USD'].includes(valor)) throw errorBanco('Selecciona CRC o USD.');
    return valor;
};
const idValido = (valor) => {
    if (typeof valor !== 'string' || !mongoose.isObjectIdOrHexString(valor)) throw errorBanco('El identificador no es valido.');
    return valor;
};
const texto = (valor) => typeof valor === 'string' ? valor.trim().slice(0, 1000) : '';
const motivoValido = (valor) => {
    const motivo = texto(valor);
    if (!motivo) throw errorBanco('El motivo es obligatorio.');
    return motivo;
};
const validarEntrada = (datos) => {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw errorBanco('Se requiere un objeto de datos.');
    validarClavesSeguras(datos);
    if (['organizacionId', 'fincaId', 'stockReproductivo', 'stockComercial', 'totalIngresado', 'saldos'].some((campo) => campo in datos)) {
        throw errorBanco('El contexto y los saldos no se reciben del cliente.');
    }
    if (!obtenerOrganizacionActual() || !obtenerFincaActual()) throw errorBanco('Se requiere una organizacion y finca autorizadas.', 403);
};
const claveOperacion = (datos, prefijo) => {
    const valor = datos.claveIdempotencia;
    if (valor !== undefined && (typeof valor !== 'string' || !valor.trim() || valor.length > 120)) throw errorBanco('Clave de idempotencia no valida.');
    return `${prefijo}:${valor?.trim() || crypto.randomUUID()}`;
};
const comprobarInvariante = (ficha) => {
    const campos = ['stockReproductivo', 'stockComercial', 'asignadoCampanas', 'totalUsadasIATF', 'totalVendidas', 'totalMermas'];
    const suma = campos.reduce((n, campo) => n + Number(ficha[campo] || 0), 0);
    if (suma !== ficha.totalIngresado || campos.some((campo) => !Number.isSafeInteger(ficha[campo]) || ficha[campo] < 0)) throw errorBanco('El saldo del banco no concilia; se requiere revision.', 409, 'SEMEN_INVARIANT');
    for (const [saldo, campo] of [['reproductivo', 'stockReproductivo'], ['comercial', 'stockComercial'], ['asignado', 'asignadoCampanas']]) {
        if (Number(ficha.saldos.CRC[saldo]) + Number(ficha.saldos.USD[saldo]) !== ficha[campo]) throw errorBanco('Los saldos por moneda no concilian.', 409, 'SEMEN_INVARIANT');
    }
    return true;
};
const guardarFicha = async (ficha, session) => {
    for (const m of ['CRC', 'USD']) {
        for (const gaveta of ['reproductivo', 'comercial', 'asignado']) {
            const campo = `valor${gaveta[0].toUpperCase()}${gaveta.slice(1)}`;
            if (Math.abs(ficha.saldos[m][campo]) < 0.000001) ficha.saldos[m][campo] = 0;
        }
    }
    comprobarInvariante(ficha);
    await ficha.save({ session });
    return ficha;
};
const buscarFicha = async (id, session) => {
    const ficha = await BancoSemen.findById(idValido(String(id))).session(session);
    if (!ficha) throw errorBanco('Ficha de semen no encontrada en la finca.', 404);
    return ficha;
};
const registrarMovimiento = async (datos, session) => {
    const [movimiento] = await MovimientoSemen.create([datos], { session, ordered: true });
    return movimiento;
};
const operacionUnica = async (clave, operacion) => {
    const ejecutar = () => ejecutarEnTransaccion(async (session) => {
        const anterior = await MovimientoSemen.findOne({ claveIdempotencia: clave }).session(session);
        if (anterior) return { repetida: true, movimiento: anterior, ficha: await buscarFicha(anterior.fichaSemenId, session) };
        return operacion(session);
    });
    for (let intento = 0; intento < 3; intento++) {
        try { return await ejecutar(); } catch (error) {
            if (error.code !== 11000) throw error;
            if (intento === 2) throw errorBanco('La ficha o referencia ya existe; revisa la operacion antes de reintentar.', 409, 'SEMEN_DUPLICATE');
        }
    }
};
const cambiarSaldo = async ({ ficha, gaveta, n, moneda, costoUnitario, incremento = false, session, acumulado, extra = {} }) => {
    const campo = gaveta === 'REPRODUCTIVO' ? 'stockReproductivo' : gaveta === 'COMERCIAL' ? 'stockComercial' : 'asignadoCampanas';
    const sub = gaveta === 'REPRODUCTIVO' ? 'reproductivo' : gaveta === 'COMERCIAL' ? 'comercial' : 'asignado';
    const valor = `valor${sub[0].toUpperCase()}${sub.slice(1)}`;
    const signo = incremento ? 1 : -1;
    const inc = { [campo]: signo * n, [`saldos.${moneda}.${sub}`]: signo * n, [`saldos.${moneda}.${valor}`]: signo * n * costoUnitario, ...extra };
    if (acumulado) inc[acumulado] = n;
    const actualizado = await BancoSemen.findOneAndUpdate({
        _id: ficha._id,
        ...(!incremento ? { [campo]: { $gte: n }, [`saldos.${moneda}.${sub}`]: { $gte: n } } : {})
    }, { $inc: inc }, { new: true, session });
    if (!actualizado) throw errorBanco(`Saldo insuficiente. Disponible: ${ficha.saldos[moneda][sub]} ${moneda}.`, 400, 'SEMEN_STOCK_INSUFFICIENT', { disponible: ficha.saldos[moneda][sub] });
    return actualizado;
};
const promedio = (ficha, gaveta, moneda) => {
    const sub = gaveta === 'REPRODUCTIVO' ? 'reproductivo' : 'comercial';
    const saldo = ficha.saldos[moneda];
    return saldo[sub] ? saldo[`valor${sub[0].toUpperCase()}${sub.slice(1)}`] / saldo[sub] : 0;
};

const registrarEntrada = async (datos, usuarioId) => {
    validarEntrada(datos);
    const n = cantidad(datos.cantidad), moneda = monedaValida(datos.moneda), costo = dinero(datos.costoUnitario);
    dinero(n * costo);
    const fecha = fechaValida(datos.fecha);
    if (!['COMPRA', 'COLECTA_PROPIA'].includes(datos.origen)) throw errorBanco('Selecciona compra o colecta propia.');
    let reproductiva, comercial;
    if (datos.destino === 'TODO_REPRODUCTIVO') { reproductiva = n; comercial = 0; }
    else if (datos.destino === 'TODO_COMERCIAL') { reproductiva = 0; comercial = n; }
    else if (datos.destino === 'DIVIDIR') {
        reproductiva = Number(datos.cantidadReproductiva); comercial = Number(datos.cantidadComercial);
        if (![reproductiva, comercial].every((v) => Number.isSafeInteger(v) && v >= 0) || reproductiva + comercial !== n) throw errorBanco('La division debe sumar la cantidad total.');
    } else throw errorBanco('Selecciona el destino de la entrada.');
    const clave = claveOperacion(datos, 'entrada');
    return operacionUnica(clave, async (session) => {
        let ficha;
        if (datos.fichaSemenId) ficha = await buscarFicha(datos.fichaSemenId, session);
        else {
            let identidad;
            if (datos.toroId) {
                const animal = await Animal.findOne({ _id: idValido(datos.toroId), sexo: 'Macho', estado: 'Activo' }).session(session);
                if (!animal) throw errorBanco('El semental debe ser un macho activo de esta finca.');
                identidad = { toroId: animal._id, esExterno: false, nombreSemental: animal.nombre || animal.diio || animal.identificadorFinca, diio: animal.diio || animal.identificadorFinca, raza: animal.raza, especie: animal.especie || 'Bovino' };
                ficha = await BancoSemen.findOne({ toroId: animal._id }).session(session);
            } else {
                if (datos.esExterno !== true || !texto(datos.nombreSemental) || !['Bovino', 'Porcino'].includes(datos.especie)) throw errorBanco('Indica nombre y especie del semental externo.');
                identidad = { esExterno: true, nombreSemental: texto(datos.nombreSemental), diio: texto(datos.diio) || undefined, raza: texto(datos.raza), especie: datos.especie };
                if (identidad.diio) {
                    identidad.diioNormalizado = identidad.diio.normalize('NFKC').toUpperCase();
                    ficha = await BancoSemen.findOne({ esExterno: true, diioNormalizado: identidad.diioNormalizado }).session(session);
                }
            }
            if (ficha && ficha.especie !== identidad.especie) throw errorBanco('El DIIO ya pertenece a una ficha de otra especie.');
            if (!ficha) {
                [ficha] = await BancoSemen.create([{ ...identidad, tipoSemen: datos.tipoSemen || 'CONVENCIONAL', creadoPor: usuarioId }], { session, ordered: true });
            } else if (datos.tipoSemen && datos.tipoSemen !== ficha.tipoSemen) throw errorBanco('El tipo de semen difiere de la ficha existente; requiere revision.');
        }
        const [lote] = await LoteSemen.create([{
            fichaSemenId: ficha._id, origen: datos.origen, fecha, loteProveedor: texto(datos.loteProveedor),
            canastillaTermo: texto(datos.canastillaTermo), cantidad: n, costoUnitario: costo, moneda,
            cantidadReproductiva: reproductiva, cantidadComercial: comercial, creadoPor: usuarioId
        }], { session, ordered: true });
        if (datos.movimientoFinancieroId) {
            const movimiento = await MovimientoFinanciero.findOne({ _id: idValido(datos.movimientoFinancieroId), naturaleza: 'Egreso', moneda }).session(session);
            if (!movimiento) throw errorBanco('El egreso indicado no pertenece a esta finca y moneda.');
            lote.movimientoFinancieroId = movimiento._id;
            await lote.save({ session });
        }
        // Registrar costo de existencias no duplica una compra manual en Finanzas.
        for (const [gaveta, unidades] of [['REPRODUCTIVO', reproductiva], ['COMERCIAL', comercial]]) {
            if (!unidades) continue;
            ficha = await cambiarSaldo({ ficha, gaveta, n: unidades, moneda, costoUnitario: costo, incremento: true, session, acumulado: 'totalIngresado' });
            await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'ENTRADA_LOTE', origen: 'EXTERNO', destino: gaveta, cantidad: unidades, moneda, costoUnitario: costo, loteSemenId: lote._id, usuarioId, claveIdempotencia: unidades === (reproductiva || comercial) && gaveta === (reproductiva ? 'REPRODUCTIVO' : 'COMERCIAL') ? clave : `${clave}:comercial` }, session);
        }
        await guardarFicha(ficha, session);
        return { ficha, lote };
    });
};

const validarCampana = async (id, session, abierta = true) => {
    idValido(String(id));
    const campana = abierta && session
        ? await CampanaIATF.findOneAndUpdate({ _id: id, estado: { $nin: ['FINALIZADA', 'CANCELADA'] } }, { $inc: { revisionSemen: 1 } }, { new: true, session })
        : await CampanaIATF.findById(id).session(session);
    if (!campana) {
        if (abierta && session && await CampanaIATF.exists({ _id: id }).session(session)) throw errorBanco('La campana esta cerrada.', 409);
        throw errorBanco('Campana no encontrada.', 404);
    }
    if (abierta && ['FINALIZADA', 'CANCELADA'].includes(campana.estado)) throw errorBanco('La campana esta cerrada.');
    return campana;
};
const asignarCampana = async (campanaId, datos, usuarioId) => {
    const lista = Array.isArray(datos) ? datos : datos.asignaciones;
    const entrada = Array.isArray(datos) ? {} : datos;
    validarEntrada(entrada);
    if (!Array.isArray(lista) || !lista.length) throw errorBanco('Selecciona semen para asignar.');
    lista.forEach((item) => { validarEntrada(item); idValido(item.fichaSemenId); cantidad(item.cantidad); monedaValida(item.moneda); });
    const clave = claveOperacion(entrada, `asignar:${campanaId}`);
    return operacionUnica(clave, async (session) => {
        await validarCampana(campanaId, session);
        const asignaciones = [];
        for (const [i, item] of lista.entries()) {
            let ficha = await buscarFicha(item.fichaSemenId, session);
            if (ficha.especie !== 'Bovino') throw errorBanco('Las campanas IATF requieren semen bovino.');
            const costo = promedio(ficha, 'REPRODUCTIVO', item.moneda), n = cantidad(item.cantidad);
            ficha = await cambiarSaldo({ ficha, gaveta: 'REPRODUCTIVO', n, moneda: item.moneda, costoUnitario: costo, session });
            ficha = await cambiarSaldo({ ficha, gaveta: 'CAMPANA', n, moneda: item.moneda, costoUnitario: costo, incremento: true, session });
            const [asignacion] = await AsignacionSemenCampana.create([{
                campanaId, fichaSemenId: ficha._id, cantidadAsignada: n, costoUnitarioAplicado: costo, moneda: item.moneda, creadoPor: usuarioId
            }], { session, ordered: true });
            await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'ASIGNACION_CAMPANA', origen: 'REPRODUCTIVO', destino: 'CAMPANA', cantidad: n, moneda: item.moneda, costoUnitario: costo, campanaId, asignacionId: asignacion._id, usuarioId, claveIdempotencia: i === 0 ? clave : `${clave}:${i}` }, session);
            await guardarFicha(ficha, session);
            asignaciones.push(asignacion);
        }
        return asignaciones;
    });
};

const consumirDelBanco = async ({ semenId, cantidad: valor, campanaId, moneda, usuarioId, eventoId = new mongoose.Types.ObjectId(), especie, session }) => {
    let ficha = await buscarFicha(semenId, session);
    const n = cantidad(valor);
    if (especie && ficha.especie !== especie) throw errorBanco('El semen debe pertenecer a la misma especie del animal.');
    const movimientos = [];
    let costoTotal = 0, monedaElegida = moneda;
    if (campanaId) {
        await validarCampana(campanaId, session);
        const asignaciones = await AsignacionSemenCampana.find({ campanaId, fichaSemenId: ficha._id, ...(moneda ? { moneda: monedaValida(moneda) } : {}), $expr: { $gt: [{ $subtract: ['$cantidadAsignada', { $add: ['$cantidadUsada', '$cantidadDevuelta'] }] }, 0] } }).sort({ createdAt: 1, _id: 1 }).session(session);
        const monedas = [...new Set(asignaciones.map((a) => a.moneda))];
        if (!monedaElegida && monedas.length > 1) throw errorBanco('Selecciona la moneda del semen asignado.');
        monedaElegida ||= monedas[0];
        let restante = n;
        for (const a of asignaciones.filter((a) => a.moneda === monedaElegida)) {
            const usar = Math.min(restante, a.cantidadAsignada - a.cantidadUsada - a.cantidadDevuelta);
            if (!usar) continue;
            const resultado = await AsignacionSemenCampana.updateOne({ _id: a._id, cantidadUsada: a.cantidadUsada, cantidadDevuelta: a.cantidadDevuelta }, { $inc: { cantidadUsada: usar } }, { session });
            if (!resultado.modifiedCount) throw errorBanco('La asignacion cambio; intenta nuevamente.', 409);
            ficha = await cambiarSaldo({ ficha, gaveta: 'CAMPANA', n: usar, moneda: monedaElegida, costoUnitario: a.costoUnitarioAplicado, session, acumulado: 'totalUsadasIATF' });
            movimientos.push(await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'CONSUMO_INSEMINACION', origen: 'CAMPANA', destino: 'EXTERNO', cantidad: usar, moneda: monedaElegida, costoUnitario: a.costoUnitarioAplicado, campanaId, asignacionId: a._id, eventoId, usuarioId }, session));
            costoTotal += usar * a.costoUnitarioAplicado; restante -= usar;
            if (!restante) break;
        }
        if (restante) throw errorBanco(`Semen asignado insuficiente. Disponible: ${n - restante}.`, 400, 'SEMEN_STOCK_INSUFFICIENT', { disponible: n - restante });
    } else {
        const monedas = ['CRC', 'USD'].filter((m) => ficha.saldos[m].reproductivo > 0);
        if (!monedaElegida && monedas.length > 1) throw errorBanco('Selecciona la moneda del semen reproductivo.');
        monedaElegida = monedaValida(monedaElegida || monedas[0] || 'CRC');
        const costo = promedio(ficha, 'REPRODUCTIVO', monedaElegida);
        ficha = await cambiarSaldo({ ficha, gaveta: 'REPRODUCTIVO', n, moneda: monedaElegida, costoUnitario: costo, session, acumulado: 'totalUsadasIATF' });
        movimientos.push(await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'CONSUMO_INSEMINACION', origen: 'REPRODUCTIVO', destino: 'EXTERNO', cantidad: n, moneda: monedaElegida, costoUnitario: costo, eventoId, usuarioId }, session));
        costoTotal = n * costo;
    }
    await guardarFicha(ficha, session);
    const costoUnitario = costoTotal / n;
    return {
        insumo: { _id: ficha._id, nombre: ficha.nombreSemental, toro: ficha.nombreSemental, codigoToro: ficha.diio, razaToro: ficha.raza, costoUnitario, moneda: monedaElegida, tipoSemen: ficha.tipoSemen },
        cantidad: n, bancoSemen: true, eventoId,
        snapshot: { bancoSemenId: ficha._id, toroId: ficha.toroId, esExterno: ficha.esExterno, nombre: ficha.nombreSemental, toro: ficha.nombreSemental, codigoToro: ficha.diio, raza: ficha.raza, especie: ficha.especie, tipoSemen: ficha.tipoSemen, cantidad: n, costoUnitario, moneda: monedaElegida, consumoSemenId: eventoId }
    };
};

const devolverSobrantes = async (campanaId, usuarioId, session) => {
    const asignaciones = await AsignacionSemenCampana.find({ campanaId, $expr: { $gt: [{ $subtract: ['$cantidadAsignada', { $add: ['$cantidadUsada', '$cantidadDevuelta'] }] }, 0] } }).session(session);
    for (const a of asignaciones) {
        const n = a.cantidadAsignada - a.cantidadUsada - a.cantidadDevuelta;
        let ficha = await buscarFicha(a.fichaSemenId, session);
        ficha = await cambiarSaldo({ ficha, gaveta: 'CAMPANA', n, moneda: a.moneda, costoUnitario: a.costoUnitarioAplicado, session });
        ficha = await cambiarSaldo({ ficha, gaveta: 'REPRODUCTIVO', n, moneda: a.moneda, costoUnitario: a.costoUnitarioAplicado, incremento: true, session });
        a.cantidadDevuelta += n; await a.save({ session });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'DEVOLUCION_CAMPANA', origen: 'CAMPANA', destino: 'REPRODUCTIVO', cantidad: n, moneda: a.moneda, costoUnitario: a.costoUnitarioAplicado, campanaId, asignacionId: a._id, usuarioId }, session);
        await guardarFicha(ficha, session);
    }
    return { asignacionesDevueltas: asignaciones.length };
};

const trasladar = async (id, datos, usuarioId) => {
    validarEntrada(datos);
    const motivo = motivoValido(datos.motivo), n = cantidad(datos.cantidad), moneda = monedaValida(datos.moneda);
    const rutas = { REPRODUCTIVO_A_COMERCIAL: ['REPRODUCTIVO', 'COMERCIAL'], COMERCIAL_A_REPRODUCTIVO: ['COMERCIAL', 'REPRODUCTIVO'] };
    if (!rutas[datos.direccion]) throw errorBanco('Direccion no valida.');
    const [origen, destino] = rutas[datos.direccion], clave = claveOperacion(datos, `traslado:${id}`);
    return operacionUnica(clave, async (session) => {
        let ficha = await buscarFicha(id, session);
        const costo = promedio(ficha, origen, moneda);
        ficha = await cambiarSaldo({ ficha, gaveta: origen, n, moneda, costoUnitario: costo, session });
        ficha = await cambiarSaldo({ ficha, gaveta: destino, n, moneda, costoUnitario: costo, incremento: true, session });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'TRASLADO_INTERNO', origen, destino, cantidad: n, moneda, costoUnitario: costo, motivo, usuarioId, claveIdempotencia: clave }, session);
        return guardarFicha(ficha, session);
    });
};
const ajustar = async (id, datos, usuarioId) => {
    validarEntrada(datos);
    const n = cantidad(datos.cantidad), moneda = monedaValida(datos.moneda), motivo = motivoValido(datos.motivo);
    if (!['REPRODUCTIVO', 'COMERCIAL'].includes(datos.gaveta) || !['ENTRADA', 'MERMA'].includes(datos.operacion)) throw errorBanco('Selecciona gaveta y ajuste de entrada o merma.');
    const clave = claveOperacion(datos, `ajuste:${id}`);
    return operacionUnica(clave, async (session) => {
        let ficha = await buscarFicha(id, session);
        const entrada = datos.operacion === 'ENTRADA';
        const costo = entrada ? dinero(datos.costoUnitario) : promedio(ficha, datos.gaveta, moneda);
        ficha = await cambiarSaldo({ ficha, gaveta: datos.gaveta, n, moneda, costoUnitario: costo, incremento: entrada, session, acumulado: entrada ? 'totalIngresado' : 'totalMermas' });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: entrada ? 'AJUSTE' : 'MERMA', origen: entrada ? 'EXTERNO' : datos.gaveta, destino: entrada ? datos.gaveta : 'MERMA', cantidad: n, moneda, costoUnitario: costo, motivo, usuarioId, claveIdempotencia: clave }, session);
        return guardarFicha(ficha, session);
    });
};

const vender = async (datos, usuarioId) => {
    validarEntrada(datos);
    const n = cantidad(datos.cantidad), precio = dinero(datos.precioUnitario), moneda = monedaValida(datos.moneda), fecha = fechaValida(datos.fecha);
    if (!texto(datos.comprador)) throw errorBanco('El comprador es requerido.');
    const monto = dinero(n * precio), clave = claveOperacion(datos, 'venta');
    return operacionUnica(clave, async (session) => {
        let ficha = await buscarFicha(datos.fichaSemenId, session);
        const monedasStock = ['CRC', 'USD'].filter((m) => ficha.saldos[m].comercial > 0);
        if (!datos.monedaStock && monedasStock.length > 1) throw errorBanco('Selecciona la moneda de costo de las existencias.');
        const monedaStock = monedaValida(datos.monedaStock || monedasStock[0] || moneda);
        const costo = promedio(ficha, 'COMERCIAL', monedaStock);
        ficha = await cambiarSaldo({ ficha, gaveta: 'COMERCIAL', n, moneda: monedaStock, costoUnitario: costo, session, acumulado: 'totalVendidas' });
        const [venta] = await VentaPajilla.create([{ fichaSemenId: ficha._id, nombreSemental: ficha.nombreSemental, diio: ficha.diio, comprador: texto(datos.comprador), cantidad: n, precioUnitario: precio, moneda, monedaCosto: monedaStock, montoTotal: monto, fecha, costoUnitarioAplicado: costo, creadoPor: usuarioId }], { session, ordered: true });
        const [ingreso] = await MovimientoFinanciero.create([{
            fecha, tipoMovimiento: 'Venta de pajillas', naturaleza: 'Ingreso', categoria: 'Venta de Genética', descripcion: `Venta de ${n} pajillas de ${ficha.nombreSemental}`, producto: ficha.nombreSemental, cantidad: n, unidad: 'UNIDAD', monto, moneda, destinoUso: 'Finca', referenciaModelo: 'VentaPajilla', referenciaId: venta._id
        }], { session, ordered: true });
        venta.movimientoFinancieroId = ingreso._id; await venta.save({ session });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'VENTA', origen: 'COMERCIAL', destino: 'CLIENTE', cantidad: n, moneda: monedaStock, costoUnitario: costo, ventaPajillaId: venta._id, usuarioId, claveIdempotencia: clave }, session);
        await guardarFicha(ficha, session);
        return venta;
    });
};
const anularVenta = async (id, datos, usuarioId) => {
    validarEntrada(datos);
    const motivo = motivoValido(datos.motivo);
    return ejecutarEnTransaccion(async (session) => {
        const venta = await VentaPajilla.findOneAndUpdate({ _id: idValido(id), estado: 'Completada' }, { $set: { estado: 'Anulada', motivoAnulacion: motivo, fechaAnulacion: new Date(), anuladoPor: usuarioId } }, { new: true, session });
        if (!venta) throw errorBanco('La venta no existe en esta finca o ya estaba anulada.');
        let ficha = await buscarFicha(venta.fichaSemenId, session);
        ficha = await cambiarSaldo({ ficha, gaveta: 'COMERCIAL', n: venta.cantidad, moneda: venta.monedaCosto || venta.moneda, costoUnitario: venta.costoUnitarioAplicado, incremento: true, session, extra: { totalVendidas: -venta.cantidad } });
        const original = await MovimientoFinanciero.findOne({ _id: venta.movimientoFinancieroId, referenciaModelo: 'VentaPajilla', referenciaId: venta._id }).session(session);
        if (!original) throw errorBanco('No se encontro el ingreso original; se requiere revision.', 409);
        const organizacion = await Organizacion.findById(obtenerOrganizacionActual()).select('zonaHoraria').session(session);
        const fechaContable = parsearFechaCivil(claveDiaEnZona(new Date(), organizacion?.zonaHoraria || 'America/Costa_Rica'));
        const [reversion] = await MovimientoFinanciero.create([{ fecha: fechaContable, tipoMovimiento: 'Venta de pajillas', naturaleza: 'Egreso', categoria: original.categoria, descripcion: `Anulacion de venta de pajillas: ${motivo}`, monto: original.monto, moneda: original.moneda, destinoUso: original.destinoUso, referenciaModelo: 'VentaPajilla', referenciaId: venta._id }], { session, ordered: true });
        venta.movimientoReversionId = reversion._id; await venta.save({ session });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'ANULACION_VENTA', origen: 'CLIENTE', destino: 'COMERCIAL', cantidad: venta.cantidad, moneda: venta.monedaCosto || venta.moneda, costoUnitario: venta.costoUnitarioAplicado, motivo, usuarioId, ventaPajillaId: venta._id, claveIdempotencia: `anular:${venta._id}` }, session);
        await guardarFicha(ficha, session);
        return venta;
    });
};

const listarBanco = (filtros = {}) => BancoSemen.find(['Bovino', 'Porcino'].includes(filtros.especie) ? { especie: filtros.especie } : {}).sort({ nombreSemental: 1, diio: 1 }).lean();
const revertirConsumo = async ({ eventoId, usuarioId, motivo, session }) => {
    motivo = motivoValido(motivo);
    const movimientos = await MovimientoSemen.find({ eventoId, tipo: 'CONSUMO_INSEMINACION' }).session(session);
    if (!movimientos.length) throw errorBanco('El consumo no tiene trazabilidad para anularlo automaticamente.');
    for (const m of movimientos) {
        if (await MovimientoSemen.exists({ reversaDe: m._id }).session(session)) throw errorBanco('La inseminacion ya estaba anulada.');
        let ficha = await buscarFicha(m.fichaSemenId, session);
        let destino = m.origen;
        if (m.asignacionId) {
            const a = await AsignacionSemenCampana.findById(m.asignacionId).session(session);
            const campana = await validarCampana(m.campanaId, session, false);
            if (!a || a.cantidadUsada < m.cantidad) throw errorBanco('La asignacion no concilia con el consumo.', 409);
            a.cantidadUsada -= m.cantidad;
            if (['FINALIZADA', 'CANCELADA'].includes(campana.estado)) { destino = 'REPRODUCTIVO'; a.cantidadDevuelta += m.cantidad; }
            await a.save({ session });
        }
        ficha = await cambiarSaldo({ ficha, gaveta: destino, n: m.cantidad, moneda: m.moneda, costoUnitario: m.costoUnitario, incremento: true, session, extra: { totalUsadasIATF: -m.cantidad } });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'AJUSTE', origen: 'EXTERNO', destino, cantidad: m.cantidad, moneda: m.moneda, costoUnitario: m.costoUnitario, motivo, usuarioId, campanaId: m.campanaId, asignacionId: m.asignacionId, eventoId, reversaDe: m._id, claveIdempotencia: `revertir:${m._id}` }, session);
        await guardarFicha(ficha, session);
    }
    return { consumosRevertidos: movimientos.length };
};
const detalleBanco = async (id) => ({ ficha: await buscarFicha(id, null), movimientos: await MovimientoSemen.find({ fichaSemenId: idValido(id) }).sort({ createdAt: -1 }).lean() });
const listarAsignaciones = (campanaId) => AsignacionSemenCampana.find({ campanaId }).populate('fichaSemenId').sort({ createdAt: 1 }).lean();
const listarVentas = (filtros = {}) => VentaPajilla.find({ ...(filtros.fechaInicio || filtros.fechaFin ? { fecha: { ...(filtros.fechaInicio ? { $gte: fechaValida(filtros.fechaInicio) } : {}), ...(filtros.fechaFin ? { $lt: new Date(fechaValida(filtros.fechaFin).getTime() + 86400000) } : {}) } } : {}) }).sort({ fecha: -1, _id: -1 }).lean();
const resumenVentas = async () => {
    const org = await Organizacion.findById(obtenerOrganizacionActual()).select('zonaHoraria').lean();
    const periodo = claveDiaEnZona(new Date(), org?.zonaHoraria || 'America/Costa_Rica').slice(0, 7);
    const [year, month] = periodo.split('-').map(Number);
    const filas = await MovimientoFinanciero.aggregate([
        { $match: { referenciaModelo: 'VentaPajilla', fecha: { $gte: new Date(Date.UTC(year, month - 1, 1)), $lt: new Date(Date.UTC(year, month, 1)) } } },
        { $group: { _id: '$moneda', neto: { $sum: { $cond: [{ $eq: ['$naturaleza', 'Ingreso'] }, '$monto', { $multiply: ['$monto', -1] }] } } } }
    ]);
    return { periodo, CRC: filas.find((f) => f._id === 'CRC')?.neto || 0, USD: filas.find((f) => f._id === 'USD')?.neto || 0 };
};

module.exports = { errorBanco, cantidad, comprobarInvariante, registrarEntrada, asignarCampana, consumirDelBanco, devolverSobrantes, trasladar, ajustar, vender, anularVenta, listarBanco, detalleBanco, listarAsignaciones, listarVentas, resumenVentas, buscarFicha, guardarFicha, registrarMovimiento, cambiarSaldo, promedio, validarEntrada, fechaValida, monedaValida, validarCampana, revertirConsumo };
