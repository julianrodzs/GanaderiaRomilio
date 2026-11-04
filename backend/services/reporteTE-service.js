const Colecta = require('../models/ProgramaTransferencia');
const { CampanaTE, LoteEmbrion } = require('../models/ProgramaTE');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { sumar } = require('./programaTE-service');
const { error } = require('./bancoEmbriones-service');
const agrupar = (filas, campo) => {
    const grupos = new Map();
    for (const f of filas) { const k = f[campo] || 'Sin dato'; if (!grupos.has(k)) grupos.set(k, { nombre: k, transferidos: 0, prenadas: 0 }); const g = grupos.get(k); g.transferidos++; if (f.prenada) g.prenadas++; }
    return [...grupos.values()].map((g) => ({ ...g, tasaPrenez: g.transferidos ? g.prenadas / g.transferidos * 100 : null }));
};
const reporteTE = async ({ fechaInicio, fechaFin, fincas = null } = {}) => {
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00Z`) : null, fin = fechaFin ? new Date(`${fechaFin}T23:59:59.999Z`) : null;
    if (inicio && Number.isNaN(+inicio) || fin && Number.isNaN(+fin) || inicio && fin && inicio > fin) throw error('Rango invalido.');
    const dentro = (f) => f && (!inicio || new Date(f) >= inicio) && (!fin || new Date(f) <= fin);
    const filtro = fincas ? { fincaId: { $in: fincas.map((f) => f._id) } } : {};
    const consultar = (q) => q.setOptions({ omitirAislamientoFinca: Boolean(fincas) }).lean();
    const [colectas, campanas, registros, lotes] = await Promise.all([
        consultar(Colecta.find({ ...filtro, versionProgramaTE: 2 })), consultar(CampanaTE.find(filtro)),
        consultar(RegistroReproductivo.find({ ...filtro, 'servicios.metodo': 'TRANSFERENCIA_EMBRIONES' })), consultar(LoteEmbrion.find(filtro).populate('donanteId padreId', 'diio nombre'))
    ]);
    const mapaLotes = new Map(lotes.map((l) => [String(l._id), l]));
    const detalles = [];
    for (const r of registros) for (const s of r.servicios || []) {
        if (s.metodo !== 'TRANSFERENCIA_EMBRIONES' || s.anulado || s.cicloOrigenId || !dentro(s.fechaServicio)) continue;
        const e = s.embrion || {}, lote = mapaLotes.get(String(e.loteEmbrionId));
        const prenada = r.estadoAtribucion === 'CONFIRMADA' && String(r.servicioAtribuidoId) === String(s._id) && Boolean(r.gestacionConfirmada || r.fechaPartoReal || r.historialDiagnosticos?.some((d) => d.resultado === 'PREÑADA'));
        detalles.push({ registroId: r._id, fincaId: r.fincaId, fecha: s.fechaServicio, prenada, conservacion: e.estadoEmbrion || 'Sin dato',
            donante: lote?.donanteId?.diio || lote?.donanteExterna?.diio || e.donanteDiio || lote?.donanteId?.nombre || e.donanteExternaNombre || String(e.donanteId || 'Sin dato'),
            padre: lote?.padreId?.diio || s.diioSemental || lote?.padreId?.nombre || s.sementalExternoNombre || 'Sin dato',
            tecnico: campanas.flatMap((c) => c.receptoras).find((a) => String(a.registroId) === String(r._id))?.tecnico || 'Sin dato',
            costos: e.costosUnitarios || { CRC: e.moneda === 'CRC' ? e.costo || 0 : 0, USD: e.moneda === 'USD' ? e.costo || 0 : 0 }
        });
    }
    const costosTransferencias = detalles.reduce((t, f) => ({ CRC: t.CRC + (f.costos.CRC || 0), USD: t.USD + (f.costos.USD || 0) }), { CRC: 0, USD: 0 });
    for (const c of campanas) {
        const total = c.receptoras.filter((a) => a.registroId).length, enPeriodo = c.receptoras.filter((a) => a.registroId && dentro(a.fechaTransferencia)).length;
        if (!total) continue; const costos = sumar(c.costos);
        for (const moneda of ['CRC', 'USD']) costosTransferencias[moneda] += costos[moneda] * enPeriodo / total;
    }
    const produccion = colectas.filter((c) => c.estadoProduccion === 'FINALIZADA' && dentro(c.fechaColecta));
    const viables = produccion.reduce((n, c) => n + c.embrionesViables, 0), costosProduccion = sumar(produccion.flatMap((c) => c.costos));
    const prenadas = detalles.filter((f) => f.prenada).length;
    return { transferidos: detalles.length, prenadas, tasaPrenez: detalles.length ? prenadas / detalles.length * 100 : null,
        embrionesViables: viables, costosProduccion, costoPorEmbrionViable: { CRC: viables ? costosProduccion.CRC / viables : null, USD: viables ? costosProduccion.USD / viables : null },
        costosTransferencias, costoPorPrenez: { CRC: prenadas ? costosTransferencias.CRC / prenadas : null, USD: prenadas ? costosTransferencias.USD / prenadas : null },
        porConservacion: agrupar(detalles, 'conservacion'), porDonante: agrupar(detalles, 'donante'), porPadre: agrupar(detalles, 'padre'), porTecnico: agrupar(detalles, 'tecnico'),
        colectas: produccion.map((c) => ({ _id: c._id, nombre: c.nombre, estructuras: c.estructurasRecuperadas, viables: c.embrionesViables, degenerados: c.embrionesDegenerados, costos: sumar(c.costos) })),
        inventarioActual: lotes.reduce((t, l) => ({ reproductivo: t.reproductivo + l.stockReproductivo, comercial: t.comercial + l.stockComercial, reservado: t.reservado + l.asignadoCampanas, mermas: t.mermas + l.totalMermas }), { reproductivo: 0, comercial: 0, reservado: 0, mermas: 0 }),
        porFinca: fincas?.map((f) => ({ fincaId: f._id, nombre: f.nombre, transferidos: detalles.filter((d) => String(d.fincaId) === String(f._id)).length, prenadas: detalles.filter((d) => String(d.fincaId) === String(f._id) && d.prenada).length })),
        criterio: 'Servicios TE reales del periodo; preñeces atribuidas confirmadas. Costos de embriones aplicados mas costos de sincronizacion prorrateados por transferencias; CRC y USD nunca se convierten ni se suman entre si.' };
};
module.exports = { reporteTE, agrupar };
