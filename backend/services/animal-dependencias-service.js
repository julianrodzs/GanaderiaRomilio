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
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const PertenenciaLote = require('../models/PertenenciaLote');
const Pesaje = require('../models/Pesaje');
const { PlanSanitario } = require('../models/PlanSanitario');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const RegistroSanitario = require('../models/RegistroSanitario');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const TrasladoFinca = require('../models/TrasladoFinca');
const { Tarea } = require('../models/Tarea');
const VentaAnimal = require('../models/VentaAnimal');

const DEFINICIONES_DEPENDENCIAS = Object.freeze([
    ['pesajes', Pesaje, (id) => ({ animal: id })],
    ['fotografias', ArchivoMultimedia, (id) => ({ animalId: id, activo: true })],
    ['aplicaciones sanitarias', AplicacionSanitaria, (id) => ({ animales: id })],
    ['planes sanitarios', PlanSanitario, (id) => ({ animales: id })],
    ['tratamientos sanitarios', TratamientoSanitario, (id) => ({ animales: id })],
    ['registros sanitarios historicos', RegistroSanitario, (id) => ({ animal: id })],
    ['ciclos reproductivos', RegistroReproductivo, (id) => ({ animal: id })],
    ['diagnosticos IATF', DiagnosticoGestacionIATF, (id) => ({ animal: id })],
    ['aplicaciones IATF', EjecucionPasoIATF, (id) => ({ animalesAplicados: id })],
    ['ciclos de engorde', CicloEngorde, (id) => ({ $or: [{ animales: id }, { 'participantesSnapshot.animal': id }, { 'ejecuciones.animales': id }] })],
    ['compras', CompraAnimal, (id) => ({ 'animales.animal': id })],
    ['ventas', VentaAnimal, (id) => ({ 'animales.animal': id })],
    ['descendencia genealogica', Animal, (id) => ({ $or: [{ madre: id }, { padre: id }] })],
    ['camadas como madre', Camada, (id) => ({ madre: id })],
    ['bitacora', EventoAnimal, (id) => ({ animal: id })],
    ['historial de fincas', HistorialFincaAnimal, (id) => ({ animal: id })],
    ['historial de lotes', PertenenciaLote, (id) => ({ animal: id })],
    ['movimientos financieros', MovimientoFinanciero, (id) => ({ animal: id })],
    ['tareas', Tarea, (id) => ({ animal: id })],
    ['campanas IATF', CampanaIATF, (id) => ({ 'participantes.animal': id })],
    ['bandas reproductivas porcinas', BandaReproductivaPorcina, (id) => ({ 'participantes.animal': id })],
    ['traslados entre fincas', TrasladoFinca, (id) => ({ 'animales.animal': id })]
]);

const obtenerDependenciasAnimal = async (animalId) => {
    const resultados = await Promise.all(DEFINICIONES_DEPENDENCIAS.map(async ([nombre, Modelo, crearFiltro]) => ({
        nombre,
        existe: Boolean(await Modelo.exists(crearFiltro(animalId)))
    })));
    return resultados.filter((item) => item.existe).map((item) => item.nombre);
};

const asegurarAnimalSinHistorial = async (animalId) => {
    const dependencias = await obtenerDependenciasAnimal(animalId);
    if (!dependencias.length) return;
    const error = new Error('No se puede eliminar un animal con historial productivo, medico o reproductivo. Utilice el cambio de estado a Muerto, Vendido o Descartado.');
    error.status = 409;
    error.code = 'ANIMAL_HAS_HISTORY';
    error.dependencias = dependencias;
    throw error;
};

module.exports = {
    asegurarAnimalSinHistorial,
    obtenerDependenciasAnimal
};
