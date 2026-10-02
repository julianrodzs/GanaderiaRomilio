const Animal = require('../models/Animal');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');

const normalizarIdentificador = (valor) => String(valor || '').trim().toUpperCase();

const esBovino = (animal) => !animal.especie || animal.especie === 'Bovino';

const especieAnimal = (animal) => animal.especie || 'Bovino';

const detalleRacial = (animal) => {
    const principal = `${animal.fraccionRazaPrincipal ? `${animal.fraccionRazaPrincipal} ` : ''}${animal.razaPrincipal || ''}`.trim();
    const secundaria = `${animal.fraccionRazaSecundaria ? `${animal.fraccionRazaSecundaria} ` : ''}${animal.razaSecundaria || ''}`.trim();
    if (principal && secundaria) return `${principal} × ${secundaria}`;
    if (animal.razaPrincipal && !['Otra', 'Desconocida'].includes(animal.razaPrincipal)) {
        const variedad = animal.variedadRacial ? ` ${animal.variedadRacial}` : '';
        const cruce = animal.gradoRacial === 'Cruce no definido' ? ' cruzado' : '';
        return `${animal.fraccionRazaPrincipal ? `${animal.fraccionRazaPrincipal} ` : ''}${animal.razaPrincipal}${variedad}${cruce}`;
    }
    return animal.descripcionRacial || animal.raza || animal.razaPrincipal || 'Sin clasificar';
};

const construirReporteRacial = (animales = [], especie = 'Bovino') => {
    const especiesPermitidas = especie === 'Todos' ? ['Bovino', 'Porcino'] : [especie === 'Porcino' ? 'Porcino' : 'Bovino'];
    const seleccionados = animales.filter((animal) => especiesPermitidas.includes(especieAnimal(animal)));
    const grupos = new Map();

    seleccionados.forEach((animal) => {
        const especieRegistro = especieAnimal(animal);
        const grupo = animal.grupoRacial || 'Desconocido';
        const clave = `${especieRegistro}:${grupo}`;
        if (!grupos.has(clave)) grupos.set(clave, { especie: especieRegistro, grupoRacial: grupo, total: 0, detalles: new Map() });
        const item = grupos.get(clave);
        const detalle = detalleRacial(animal);
        item.total += 1;
        item.detalles.set(detalle, (item.detalles.get(detalle) || 0) + 1);
    });

    const porGrupo = [...grupos.values()]
        .map((item) => ({
            especie: item.especie,
            grupoRacial: item.grupoRacial,
            total: item.total,
            detalles: [...item.detalles.entries()]
                .map(([detalle, total]) => ({ detalle, total }))
                .sort((a, b) => b.total - a.total || a.detalle.localeCompare(b.detalle))
        }))
        .sort((a, b) => a.especie.localeCompare(b.especie) || b.total - a.total || a.grupoRacial.localeCompare(b.grupoRacial));

    return {
        resumen: {
            especie,
            totalAnimales: seleccionados.length,
            totalBovinos: seleccionados.filter(esBovino).length,
            totalPorcinos: seleccionados.filter((animal) => especieAnimal(animal) === 'Porcino').length,
            gruposRepresentados: porGrupo.length,
            pendientesNormalizacion: seleccionados.filter((animal) => !animal.razaPrincipal || !animal.grupoRacial).length
        },
        porGrupo
    };
};

const fechaEnPeriodo = (fecha, fechaInicio, fechaFin) => {
    if (!fecha) return !fechaInicio && !fechaFin;
    const valor = new Date(fecha);
    if (fechaInicio && valor < fechaInicio) return false;
    if (fechaFin && valor > fechaFin) return false;
    return true;
};

const crearMapasAnimales = (animales) => {
    const porId = new Map();
    const porIdentificador = new Map();
    animales.forEach((animal) => {
        porId.set(String(animal._id), animal);
        [animal.diio, animal.identificadorFinca].filter(Boolean).forEach((identificador) => {
            porIdentificador.set(normalizarIdentificador(identificador), animal);
        });
    });
    return { porId, porIdentificador };
};

const resolverProgenitor = (cria, relacion, campoDiio, mapas) => {
    if (cria[relacion]) {
        const id = String(cria[relacion]?._id || cria[relacion]);
        return mapas.porId.get(id) || null;
    }
    return mapas.porIdentificador.get(normalizarIdentificador(cria[campoDiio])) || null;
};

const edadMeses = (fechaNacimiento, hoy = new Date()) => {
    if (!fechaNacimiento) return null;
    const nacimiento = new Date(fechaNacimiento);
    let meses = (hoy.getUTCFullYear() - nacimiento.getUTCFullYear()) * 12;
    meses += hoy.getUTCMonth() - nacimiento.getUTCMonth();
    if (hoy.getUTCDate() < nacimiento.getUTCDate()) meses -= 1;
    return Math.max(meses, 0);
};

const fechaUltimaCria = (crias) => {
    const fechas = crias.map((cria) => cria.fechaNacimiento).filter(Boolean);
    return fechas.length ? new Date(Math.max(...fechas.map((fecha) => new Date(fecha).getTime()))) : null;
};

const resumenCrias = (crias) => ({
    total: crias.length,
    machos: crias.filter((cria) => cria.sexo === 'Macho').length,
    hembras: crias.filter((cria) => cria.sexo === 'Hembra').length,
    vivas: crias.filter((cria) => cria.estado !== 'Muerto').length,
    ultimaCria: fechaUltimaCria(crias)
});

const construirReporteDescendencia = ({ animales = [], registros = [], fechaInicio = null, fechaFin = null }) => {
    const bovinos = animales.filter(esBovino);
    const mapas = crearMapasAnimales(bovinos);
    const criasPorMadre = new Map();
    const criasPorPadre = new Map();

    bovinos.filter((cria) => fechaEnPeriodo(cria.fechaNacimiento, fechaInicio, fechaFin)).forEach((cria) => {
        const madre = resolverProgenitor(cria, 'madre', 'madreDiio', mapas);
        const padre = resolverProgenitor(cria, 'padre', 'padreDiio', mapas);
        if (madre) {
            const clave = String(madre._id);
            criasPorMadre.set(clave, [...(criasPorMadre.get(clave) || []), cria]);
        }
        if (padre) {
            const clave = String(padre._id);
            criasPorPadre.set(clave, [...(criasPorPadre.get(clave) || []), cria]);
        }
    });

    const registrosPorAnimal = new Map();
    registros.filter((registro) => registro.animal).forEach((registro) => {
        const id = String(registro.animal?._id || registro.animal);
        registrosPorAnimal.set(id, [...(registrosPorAnimal.get(id) || []), registro]);
    });

    const candidatas = bovinos.filter((animal) => animal.sexo === 'Hembra' && (
        animal.categoria === 'Vaca'
        || animal.objetivoProductivo === 'REPRODUCCION'
        || criasPorMadre.has(String(animal._id))
        || registrosPorAnimal.has(String(animal._id))
    ));
    const candidatos = bovinos.filter((animal) => animal.sexo === 'Macho' && (
        animal.categoria === 'Toro'
        || animal.objetivoProductivo === 'REPRODUCCION'
        || criasPorPadre.has(String(animal._id))
    ));

    const vacas = candidatas.map((animal) => {
        const id = String(animal._id);
        const crias = criasPorMadre.get(id) || [];
        const registrosAnimal = registrosPorAnimal.get(id) || [];
        const partos = registrosAnimal.filter((registro) => registro.fechaPartoReal
            && fechaEnPeriodo(registro.fechaPartoReal, fechaInicio, fechaFin));
        const ultimoRegistro = [...registrosAnimal].sort((a, b) => new Date(b.createdAt || b.fechaMonta || 0) - new Date(a.createdAt || a.fechaMonta || 0))[0];
        const resumen = resumenCrias(crias);
        return {
            animalId: animal._id,
            diio: animal.diio || animal.identificadorFinca,
            nombre: animal.nombre,
            partosRegistrados: partos.length,
            criasRegistradas: resumen.total,
            criasVivas: resumen.vivas,
            machos: resumen.machos,
            hembras: resumen.hembras,
            ultimaCria: resumen.ultimaCria,
            edadMeses: edadMeses(animal.fechaNacimiento),
            estadoReproductivo: ultimoRegistro?.estado || 'Sin registro'
        };
    }).sort((a, b) => b.criasRegistradas - a.criasRegistradas || String(a.diio).localeCompare(String(b.diio)));

    const toros = candidatos.map((animal) => {
        const crias = criasPorPadre.get(String(animal._id)) || [];
        const resumen = resumenCrias(crias);
        const madres = new Set(crias.map((cria) => {
            const madre = resolverProgenitor(cria, 'madre', 'madreDiio', mapas);
            if (madre) return String(madre._id);
            return normalizarIdentificador(cria.madreDiio);
        }).filter(Boolean));
        return {
            animalId: animal._id,
            diio: animal.diio || animal.identificadorFinca,
            nombre: animal.nombre,
            criasRegistradas: resumen.total,
            madresDiferentes: madres.size,
            machos: resumen.machos,
            hembras: resumen.hembras,
            ultimaCria: resumen.ultimaCria
        };
    }).sort((a, b) => b.criasRegistradas - a.criasRegistradas || String(a.diio).localeCompare(String(b.diio)));

    return {
        resumen: {
            vacas: vacas.length,
            toros: toros.length,
            criasRelacionadasConMadre: [...criasPorMadre.values()].reduce((total, lista) => total + lista.length, 0),
            criasRelacionadasConPadre: [...criasPorPadre.values()].reduce((total, lista) => total + lista.length, 0)
        },
        vacas,
        toros
    };
};

const obtenerReporteRacial = async ({ especie = 'Bovino' } = {}) => {
    const especieCanonica = ['Bovino', 'Porcino', 'Todos'].includes(especie) ? especie : 'Bovino';
    const filtro = especieCanonica === 'Todos'
        ? {}
        : especieCanonica === 'Porcino'
            ? { especie: 'Porcino' }
            : { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    return construirReporteRacial(await Animal.find(filtro).lean(), especieCanonica);
};

const obtenerReporteDescendencia = async ({ fechaInicio, fechaFin } = {}) => {
    const [animales, registros] = await Promise.all([
        Animal.find({ $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] }).lean(),
        RegistroReproductivo.find({ $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] }).lean()
    ]);
    return construirReporteDescendencia({ animales, registros, fechaInicio, fechaFin });
};

module.exports = {
    construirReporteDescendencia,
    construirReporteRacial,
    obtenerReporteDescendencia,
    obtenerReporteRacial
};
