require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const conectarDB = require('../database');
const Organizacion = require('../models/Organizacion');
const Animal = require('../models/Animal');
const VentaAnimal = require('../models/VentaAnimal');
const Potrero = require('../models/Potrero');
const RotacionPotrero = require('../models/RotacionPotrero');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const Pesaje = require('../models/Pesaje');
const EventoAnimal = require('../models/EventoAnimal');
const ImportacionExcel = require('../models/ImportacionExcel');

const sinAislamiento = { omitirAislamientoOrganizacion: true, omitirAislamientoFinca: true };
const consultar = (Modelo, filtro = {}) => Modelo.find(filtro).setOptions(sinAislamiento).lean();
const id = (valor) => String(valor?._id || valor || '');
const firmaMovimiento = (movimiento) => [
    new Date(movimiento.fecha).toISOString().slice(0, 10), Number(movimiento.monto), movimiento.moneda,
    movimiento.categoria, movimiento.descripcion
].join('|');

const categoriaCompatible = (animal) => {
    const permitidas = {
        'Bovino:Macho': ['Ternero', 'Novillo', 'Toro', 'Otro'],
        'Bovino:Hembra': ['Ternera', 'Novilla', 'Vaca', 'Otro'],
        'Porcino:Macho': ['Lechón', 'Cerdo joven', 'Cerdo adulto', 'Otro'],
        'Porcino:Hembra': ['Lechona', 'Cerda joven', 'Chancha', 'Otro']
    };
    return (permitidas[`${animal.especie}:${animal.sexo}`] || []).includes(animal.categoria);
};

const detectarCiclos = (animales) => {
    const porId = new Map(animales.map((animal) => [id(animal), animal]));
    const ciclos = new Set();
    const visitar = (animalId, camino = new Set()) => {
        if (camino.has(animalId)) { camino.forEach((item) => ciclos.add(item)); return; }
        const animal = porId.get(animalId);
        if (!animal) return;
        const siguiente = new Set(camino); siguiente.add(animalId);
        [animal.padre, animal.madre].filter(Boolean).forEach((progenitor) => visitar(id(progenitor), siguiente));
    };
    animales.forEach((animal) => visitar(id(animal)));
    return ciclos;
};

const clavesFinancierasDuplicadas = (movimientos) => {
    const grupos = new Map();
    movimientos.forEach((movimiento) => {
        const clave = firmaMovimiento(movimiento);
        const lista = grupos.get(clave) || []; lista.push(movimiento); grupos.set(clave, lista);
    });
    return [...grupos.entries()].filter(([, lista]) => lista.length > 1).map(([clave, lista]) => ({
        clave, cantidad: lista.length, movimientos: lista.map((item) => id(item))
    }));
};

const diagnosticarOrganizacion = async (organizacion) => {
    const filtro = { organizacionId: organizacion._id };
    const [animales, ventas, potreros, rotaciones, movimientos, pesajes, eventos, importaciones] = await Promise.all([
        consultar(Animal, filtro),
        consultar(VentaAnimal, { ...filtro, estado: { $ne: 'Anulada' } }),
        consultar(Potrero, filtro),
        consultar(RotacionPotrero, { ...filtro, estado: 'Activa' }),
        consultar(MovimientoFinanciero, filtro),
        consultar(Pesaje, filtro),
        consultar(EventoAnimal, filtro),
        consultar(ImportacionExcel, { ...filtro, estado: { $in: ['Aplicada', 'Confirmada', 'Confirmada con errores'] } })
    ]);
    const vendidos = new Set(ventas.flatMap((venta) => (venta.animales || []).map((item) => id(item.animal))));
    const potrerosPorId = new Map(potreros.map((potrero) => [id(potrero), potrero]));
    const pesajesPorAnimal = new Map();
    pesajes.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).forEach((pesaje) => pesajesPorAnimal.set(id(pesaje.animal), pesaje));
    const animalesPorId = new Map(animales.map((animal) => [id(animal), animal]));
    const ciclos = detectarCiclos(animales);
    const diiosImportados = new Set(importaciones.flatMap((importacion) => (
        importacion.registros?.Animal || []
    ).map((item) => String(item.diio || '').toUpperCase()).filter(Boolean)));
    const firmasFinanzasImportadas = new Set(importaciones.flatMap((importacion) => (
        importacion.registros?.MovimientoFinanciero || []
    )).map(firmaMovimiento));
    const eventosAlta = new Set(eventos.filter((evento) => (
        evento.titulo === 'Alta por importación' || evento.metadata?.origen === 'Importación'
    )).map((evento) => id(evento.animal)));
    const animalesImportados = animales.filter((animal) => animal.importacionOrigen
        || diiosImportados.has(String(animal.diio || animal.identificadorFinca || '').toUpperCase()));

    return {
        organizacion: { _id: id(organizacion), nombre: organizacion.nombre },
        posiblesResucitados: animales.filter((animal) => animal.estado === 'Activo' && (animal.fechaMuerte || vendidos.has(id(animal))))
            .map((animal) => ({ animalId: id(animal), diio: animal.diio || animal.identificadorFinca, fechaMuerte: animal.fechaMuerte || null, ventaVigente: vendidos.has(id(animal)) })),
        potrerosInconsistentes: rotaciones.flatMap((rotacion) => {
            const potrero = potrerosPorId.get(id(rotacion.potrero));
            return !potrero || potrero.estado !== 'Ocupado' || potrero.tipoArea !== 'PASTOREO'
                ? [{ rotacionId: id(rotacion), potreroId: id(rotacion.potrero), estado: potrero?.estado, tipoArea: potrero?.tipoArea }]
                : [];
        }),
        movimientosFinancierosDuplicados: clavesFinancierasDuplicadas(movimientos.filter((movimiento) => (
            movimiento.importacionOrigen || firmasFinanzasImportadas.has(firmaMovimiento(movimiento))
        ))),
        pesosDesincronizados: animales.flatMap((animal) => {
            const ultimo = pesajesPorAnimal.get(id(animal));
            if (!ultimo || Number(animal.pesoActual) === Number(ultimo.peso)) return [];
            return [{ animalId: id(animal), diio: animal.diio || animal.identificadorFinca, pesoActual: animal.pesoActual, ultimoPesaje: ultimo.peso, fechaPesaje: ultimo.fecha }];
        }),
        genealogiasInvalidas: animales.flatMap((animal) => {
            const motivos = [];
            const madre = animalesPorId.get(id(animal.madre));
            const padre = animalesPorId.get(id(animal.padre));
            if (madre && (madre.sexo !== 'Hembra' || madre.especie !== animal.especie || id(madre) === id(animal))) motivos.push('Madre incompatible');
            if (padre && (padre.sexo !== 'Macho' || padre.especie !== animal.especie || id(padre) === id(animal))) motivos.push('Padre incompatible');
            if (ciclos.has(id(animal))) motivos.push('Ciclo genealógico');
            return motivos.length ? [{ animalId: id(animal), diio: animal.diio || animal.identificadorFinca, motivos }] : [];
        }),
        animalesImportadosSinAlta: animalesImportados.filter((animal) => !eventosAlta.has(id(animal)))
            .map((animal) => ({ animalId: id(animal), diio: animal.diio || animal.identificadorFinca })),
        categoriasIncompatibles: animales.filter((animal) => !categoriaCompatible(animal))
            .map((animal) => ({ animalId: id(animal), diio: animal.diio || animal.identificadorFinca, especie: animal.especie, sexo: animal.sexo, categoria: animal.categoria }))
    };
};

const ejecutar = async () => {
    await conectarDB();
    const organizaciones = await Organizacion.find({}).select('nombre').lean();
    const resultados = [];
    for (const organizacion of organizaciones) resultados.push(await diagnosticarOrganizacion(organizacion));
    const reporte = { generadoEn: new Date().toISOString(), soloLectura: true, organizaciones: resultados };
    const argumentoSalida = process.argv.find((item) => item.startsWith('--output='));
    if (argumentoSalida) {
        const salida = path.resolve(argumentoSalida.slice('--output='.length));
        fs.writeFileSync(salida, `${JSON.stringify(reporte, null, 2)}\n`, 'utf8');
        console.log(`Reporte de solo lectura generado en ${salida}`);
    } else {
        console.log(JSON.stringify(reporte, null, 2));
    }
    return reporte;
};

if (require.main === module) {
    ejecutar().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}

module.exports = { categoriaCompatible, detectarCiclos, diagnosticarOrganizacion };
