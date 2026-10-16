const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const Animal = require('../models/Animal');
const ArchivoMultimedia = require('../models/ArchivoMultimedia');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const BandaReproductivaPorcina = require('../models/BandaReproductivaPorcina');
const Camada = require('../models/Camada');
const CampanaIATF = require('../models/CampanaIATF');
const CicloEngorde = require('../models/CicloEngorde');
const CompraAnimal = require('../models/CompraAnimal');
const DiagnosticoGestacionIATF = require('../models/DiagnosticoGestacionIATF');
const EjecucionPasoIATF = require('../models/EjecucionPasoIATF');
const EventoAnimal = require('../models/EventoAnimal');
const Finca = require('../models/Finca');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');
const { InsumoReproductivo } = require('../models/InsumoReproductivo');
const { Membresia } = require('../models/Membresia');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const PertenenciaLote = require('../models/PertenenciaLote');
const Pesaje = require('../models/Pesaje');
const { PlanSanitario } = require('../models/PlanSanitario');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const RegistroSanitario = require('../models/RegistroSanitario');
const ReservaCuotaPlan = require('../models/ReservaCuotaPlan');
const { Tarea } = require('../models/Tarea');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const TrasladoFinca = require('../models/TrasladoFinca');
const VentaAnimal = require('../models/VentaAnimal');
const animalController = require('../controllers/animal-controller');
const pesajeController = require('../controllers/pesaje-controller');
const {
    reservarCriasCamada,
    saldoColectivoCamada,
    validarCantidadesCamada
} = require('../services/camada-service');
const { contarCriasColectivasVivas, ejecutarConReservaCuota } = require('../services/plan-service');
const { consumirSemen, validarCantidadPajuelas } = require('../services/semen-reproductivo-service');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const consultaConSession = (resultado) => ({
    session: () => Promise.resolve(resultado)
});

test('camadas aceptan solo enteros y calculan el remanente colectivo sin doble conteo', () => {
    assert.throws(
        () => validarCantidadesCamada({ nacidosVivos: 7.5 }),
        /entero no negativo/
    );
    assert.throws(
        () => validarCantidadesCamada({ nacidosVivos: 4, muertosPreDestete: 5 }),
        /no pueden superar/
    );
    assert.equal(saldoColectivoCamada({
        nacidosVivos: 10,
        muertosPreDestete: 1,
        criasIndividualizadas: 2,
        criasVendidas: 3
    }), 4);

    const camada = new Camada({
        madre: new Types.ObjectId(),
        codigoCamada: 'CAM-TEST',
        fechaNacimiento: new Date('2026-10-01'),
        nacidosVivos: 2.5
    });
    assert.match(camada.validateSync().errors.nacidosVivos.message, /entero no negativo/);
});

test('la cuota porcina concilia camadas con individualizaciones y ventas confirmadas', async (t) => {
    const originales = {
        camadaFind: Camada.find,
        animalAggregate: Animal.aggregate,
        ventaAggregate: VentaAnimal.aggregate
    };
    t.after(() => {
        Camada.find = originales.camadaFind;
        Animal.aggregate = originales.animalAggregate;
        VentaAnimal.aggregate = originales.ventaAggregate;
    });
    Camada.find = () => ({
        setOptions() { return this; },
        select() { return this; },
        lean: () => Promise.resolve([{
            _id: 'camada-1',
            nacidosVivos: 10,
            muertosPreDestete: 1
        }])
    });
    Animal.aggregate = () => ({
        option: () => Promise.resolve([{ _id: 'camada-1', cantidad: 2 }])
    });
    VentaAnimal.aggregate = () => ({
        option: () => Promise.resolve([{ _id: 'camada-1', cantidad: 3 }])
    });

    assert.equal(await contarCriasColectivasVivas(), 4);
});

test('dos ventas concurrentes no pueden consumir la ultima cria colectiva dos veces', async (t) => {
    const originales = {
        findById: Camada.findById,
        findOneAndUpdate: Camada.findOneAndUpdate
    };
    t.after(() => Object.assign(Camada, originales));

    const estado = {
        _id: 'camada-1',
        estado: 'Activa',
        nacidosVivos: 1,
        muertosPreDestete: 0,
        criasIndividualizadas: 0,
        criasVendidas: 0,
        criasParaVenta: 1,
        controlPoblacionInicializado: true
    };
    Camada.findById = () => consultaConSession({ ...estado });
    Camada.findOneAndUpdate = async (filtro, actualizacion) => {
        const cantidad = actualizacion.$inc.criasVendidas;
        const saldo = estado.nacidosVivos - estado.muertosPreDestete
            - estado.criasIndividualizadas - estado.criasVendidas;
        const ventaDisponible = estado.criasParaVenta - estado.criasVendidas;
        if (saldo < cantidad || ventaDisponible < cantidad) return null;
        estado.criasVendidas += cantidad;
        return { ...estado };
    };

    const resultados = await Promise.allSettled([
        reservarCriasCamada({ camadaId: estado._id, cantidad: 1, destino: 'venta' }),
        reservarCriasCamada({ camadaId: estado._id, cantidad: 1, destino: 'venta' })
    ]);
    assert.equal(resultados.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(resultados.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(resultados.find((item) => item.status === 'rejected').reason.code, 'CAMADA_STOCK_INSUFICIENTE');
    assert.equal(estado.criasVendidas, 1);
});

test('dos altas concurrentes compitiendo por el ultimo cupo aprueban exactamente una', async (t) => {
    const originales = {
        reservaFind: ReservaCuotaPlan.findOneAndUpdate,
        reservaUpdate: ReservaCuotaPlan.updateOne,
        animalAggregate: Animal.aggregate,
        camadaFind: Camada.find
    };
    t.after(() => {
        ReservaCuotaPlan.findOneAndUpdate = originales.reservaFind;
        ReservaCuotaPlan.updateOne = originales.reservaUpdate;
        Animal.aggregate = originales.animalAggregate;
        Camada.find = originales.camadaFind;
    });

    let activos = 209;
    const reservas = [];
    ReservaCuotaPlan.findOneAndUpdate = async (filtro, actualizacion) => {
        if (actualizacion.$setOnInsert) return { reservas: [...reservas] };
        if (reservas.length) return null;
        reservas.push(actualizacion.$push.reservas);
        return { reservas: [...reservas] };
    };
    ReservaCuotaPlan.updateOne = async (filtro, actualizacion) => {
        const token = actualizacion.$pull?.reservas?.token;
        if (token) {
            const indice = reservas.findIndex((item) => item.token === token);
            if (indice >= 0) reservas.splice(indice, 1);
        }
        return { modifiedCount: 1 };
    };
    Animal.aggregate = () => ({ option: () => Promise.resolve([{ _id: 'Bovino', cantidad: activos }]) });
    Camada.find = () => ({
        setOptions() { return this; },
        select() { return this; },
        lean: () => Promise.resolve([])
    });

    const permiso = {
        actual: 209,
        limite: 210,
        configuracion: { especies: { modo: 'AMBAS' } },
        especiePlan: null
    };
    const alta = () => ejecutarConReservaCuota({
        permiso,
        recurso: 'animales',
        organizacionId: 'organizacion-1',
        cantidad: 1,
        operacion: async () => {
            await esperar(35);
            activos += 1;
            return activos;
        }
    });

    const resultados = await Promise.allSettled([alta(), alta()]);
    assert.equal(resultados.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(resultados.filter((item) => item.status === 'rejected').length, 1);
    const rechazo = resultados.find((item) => item.status === 'rejected').reason;
    assert.equal(rechazo.status, 422);
    assert.match(rechazo.message, /No hay cupo/);
    assert.equal(activos, 210);
});

test('el endpoint impide borrar fisicamente un animal con pesajes', async (t) => {
    const modelos = [
        Pesaje, ArchivoMultimedia, AplicacionSanitaria, PlanSanitario, TratamientoSanitario,
        RegistroSanitario, RegistroReproductivo, DiagnosticoGestacionIATF, EjecucionPasoIATF,
        CicloEngorde, CompraAnimal, VentaAnimal, Animal, Camada, EventoAnimal,
        HistorialFincaAnimal, PertenenciaLote, MovimientoFinanciero, Tarea,
        CampanaIATF, BandaReproductivaPorcina, TrasladoFinca
    ];
    const existsOriginales = modelos.map((modelo) => modelo.exists);
    const findOriginal = Animal.findById;
    const deleteOriginal = Animal.findByIdAndDelete;
    t.after(() => {
        modelos.forEach((modelo, indice) => { modelo.exists = existsOriginales[indice]; });
        Animal.findById = findOriginal;
        Animal.findByIdAndDelete = deleteOriginal;
    });
    modelos.forEach((modelo) => { modelo.exists = async () => null; });
    Pesaje.exists = async () => ({ _id: 'pesaje-1' });
    Animal.findById = async () => ({ _id: 'animal-1' });
    let eliminado = false;
    Animal.findByIdAndDelete = async () => { eliminado = true; };

    const respuesta = { statusCode: 200, body: null };
    const res = {
        status(code) { respuesta.statusCode = code; return this; },
        json(body) { respuesta.body = body; return this; }
    };
    await animalController.deleteAnimal({ params: { id: 'animal-1' } }, res);
    assert.equal(respuesta.statusCode, 409);
    assert.equal(respuesta.body.code, 'ANIMAL_HAS_HISTORY');
    assert.ok(respuesta.body.dependencias.includes('pesajes'));
    assert.equal(eliminado, false);
});

test('el semen exige pajuelas enteras, stock suficiente y vigencia a la fecha real', async (t) => {
    assert.equal(validarCantidadPajuelas(1), 1);
    assert.throws(() => validarCantidadPajuelas(1.5), /entero mayor que cero/);
    const registroFraccionario = new RegistroReproductivo({
        animal: new Types.ObjectId(),
        cantidadPajuelas: 1.5
    });
    assert.match(registroFraccionario.validateSync().errors.cantidadPajuelas.message, /numero entero/);
    const semenFraccionario = new InsumoReproductivo({
        nombre: 'Lote fraccionario',
        categoria: 'SEMEN',
        unidad: 'PAJUELA',
        cantidadDisponible: 1.5
    });
    assert.match(semenFraccionario.validateSync().errors.cantidadDisponible.message, /numero entero/);

    const originales = {
        findOneAndUpdate: InsumoReproductivo.findOneAndUpdate,
        findById: InsumoReproductivo.findById
    };
    t.after(() => Object.assign(InsumoReproductivo, originales));
    let actualizacionCapturada;
    InsumoReproductivo.findOneAndUpdate = async (filtro, actualizacion) => {
        actualizacionCapturada = { filtro, actualizacion };
        return { _id: 'semen-1', nombre: 'Lote A', cantidadDisponible: 3 };
    };
    const consumo = await consumirSemen({
        semenId: 'semen-1',
        cantidad: 2,
        fechaInseminacion: '2026-10-15'
    });
    assert.equal(consumo.cantidad, 2);
    assert.equal(actualizacionCapturada.actualizacion.$inc.cantidadDisponible, -2);
    assert.equal(actualizacionCapturada.filtro.cantidadDisponible.$gte, 2);

    InsumoReproductivo.findOneAndUpdate = async () => null;
    InsumoReproductivo.findById = () => consultaConSession({
        _id: 'semen-vencido',
        fechaVencimiento: new Date('2026-10-14')
    });
    await assert.rejects(
        consumirSemen({ semenId: 'semen-vencido', cantidad: 1, fechaInseminacion: '2026-10-15' }),
        (error) => error.code === 'SEMEN_EXPIRED' && error.status === 422
    );
});

test('el historial de pesos omite el filtro de finca actual pero respeta fincas autorizadas', async (t) => {
    const originales = {
        animalFindById: Animal.findById,
        membresiaFindById: Membresia.findById,
        fincaFind: Finca.find,
        pesajeFind: Pesaje.find
    };
    t.after(() => {
        Animal.findById = originales.animalFindById;
        Membresia.findById = originales.membresiaFindById;
        Finca.find = originales.fincaFind;
        Pesaje.find = originales.pesajeFind;
    });

    Animal.findById = () => ({ select: () => Promise.resolve({ _id: 'animal-1', organizacionId: 'org-1' }) });
    Membresia.findById = async () => ({ organizacionId: 'org-1', accesoTodasFincas: true, fincas: [] });
    Finca.find = () => ({
        setOptions() { return this; },
        sort() { return this; },
        lean: () => Promise.resolve([{ _id: 'finca-1' }, { _id: 'finca-2' }])
    });
    let filtroCapturado;
    let opcionesCapturadas;
    const pesajesEsperados = [
        { _id: 'p-2', fincaId: { _id: 'finca-2', nombre: 'Destino' } },
        { _id: 'p-1', fincaId: { _id: 'finca-1', nombre: 'Origen' } }
    ];
    Pesaje.find = (filtro) => {
        filtroCapturado = filtro;
        const consulta = {
            setOptions(opciones) { opcionesCapturadas = opciones; return this; },
            sort() { return this; },
            populate() { return this; },
            then(resolve) { resolve(pesajesEsperados); }
        };
        return consulta;
    };

    const respuesta = { statusCode: 200, body: null };
    const res = {
        status(code) { respuesta.statusCode = code; return this; },
        json(body) { respuesta.body = body; return this; }
    };
    await pesajeController.getPesajesPorAnimal({
        params: { animalId: 'animal-1' },
        usuario: { membresiaId: 'membresia-1' }
    }, res);

    assert.equal(respuesta.statusCode, 200);
    assert.deepEqual(respuesta.body, pesajesEsperados);
    assert.equal(opcionesCapturadas.omitirAislamientoFinca, true);
    assert.deepEqual(filtroCapturado.$or[0].fincaId.$in, ['finca-1', 'finca-2']);
    assert.deepEqual(filtroCapturado.$or[1], { fincaId: { $exists: false } });
});
