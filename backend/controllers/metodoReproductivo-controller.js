const servicio = require('../services/servicioReproductivo-service');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { metodoLegado, catalogo } = require('../services/metodoReproductivo-service');
const Animal = require('../models/Animal');

exports.operacion = (accion) => async (req, res) => {
    try {
        const r = await servicio.operarCiclo(req.params.id, accion, req.body, req.usuario.id);
        if (r.$locals.repetida) return res.json(r);
        if (['Cancelado', 'No preñada'].includes(r.estadoCiclo)) {
            await require('../services/reproduccion-service').cancelarTareasAutomaticasDelCiclo(r._id, 'Cancelada por resultado del ciclo reproductivo');
            return res.json(r);
        }
        const animal = await Animal.findById(r.animal);
        const modulo = r.especie === 'Porcino' ? require('../services/reproduccionPorcina-service') : require('../services/reproduccionBovina-service');
        await (r.especie === 'Porcino' ? modulo.sincronizarTareasPorcinas : modulo.sincronizarTareasBovinas)({ registro: r, animal, usuarioId: req.usuario.id });
        res.json(r);
    } catch (e) { res.status(e.status || 400).json({ mensaje: e.message }); }
};

const rango = (query) => {
    if (query.especie && !['Bovino', 'Porcino'].includes(query.especie)) throw Object.assign(new Error('Especie invalida.'), { status: 400 });
    const inicio = query.fechaInicio ? new Date(`${query.fechaInicio}T00:00:00Z`) : null;
    const fin = query.fechaFin ? new Date(`${query.fechaFin}T23:59:59.999Z`) : null;
    if ((inicio && Number.isNaN(+inicio)) || (fin && Number.isNaN(+fin)) || (inicio && fin && inicio > fin)) throw Object.assign(new Error('Rango de fechas invalido.'), { status: 400 });
    const dentro = (d) => d && (!inicio || new Date(d) >= inicio) && (!fin || new Date(d) <= fin);
    dentro.filtro = { ...(inicio ? { $gte: inicio } : {}), ...(fin ? { $lte: fin } : {}) };
    return dentro;
};
exports.partos = async (req, res) => {
    try {
        if (req.query.metodo && !catalogo[req.query.metodo]) return res.status(400).json({ mensaje: 'Metodo invalido.' });
        const dentro = rango(req.query);
        const registros = await RegistroReproductivo.find({ fechaPartoReal: { $ne: null, ...dentro.filtro }, ...(req.query.especie ? { especie: req.query.especie } : {}) }).populate('animal', 'diio nombre identificadorFinca').lean();
        res.json({ aclaracion: 'Partos reales registrados en el periodo; no necesariamente todos los partos de vida del animal.',
            partos: registros.filter((r) => dentro(r.fechaPartoReal) && (!req.query.metodo || metodoLegado(r) === req.query.metodo)).map((r) => ({ _id: r._id, animal: r.animal, fecha: r.fechaPartoReal, metodo: metodoLegado(r), estadoAtribucion: r.estadoAtribucion || 'SIN_SERVICIO' })) });
    } catch (e) { res.status(e.status || 400).json({ mensaje: e.message }); }
};
exports.indicadores = async (req, res) => {
    try {
        if (req.query.metodo && !catalogo[req.query.metodo]) return res.status(400).json({ mensaje: 'Metodo invalido.' });
        const dentro = rango(req.query);
        const filtro = req.query.especie ? { especie: req.query.especie } : {};
        if (req.consolidadoMetodos) {
            const { Membresia } = require('../models/Membresia');
            const { resolverFincasParaReporte } = require('../services/accesoFinca-service');
            const membresia = await Membresia.findById(req.usuario.membresiaId);
            const fincas = await resolverFincasParaReporte({ membresia, organizacionId: req.organizacionId, fincaIds: req.query.fincaIds });
            filtro.fincaId = { $in: fincas.map((f) => f._id) };
        }
        const registros = await RegistroReproductivo.find(filtro).setOptions({ omitirAislamientoFinca: Boolean(req.consolidadoMetodos) }).lean();
        const anterioresPorAnimal = new Map(), intervalosPorCiclo = new Map(), concepcionesPorServicio = new Set();
        for (const r of registros) if (r.estadoAtribucion === 'CONFIRMADA' && r.servicioAtribuidoId && (r.gestacionConfirmada || r.fechaPartoReal || r.historialDiagnosticos?.some((d) => d.resultado === 'PREÑADA'))) concepcionesPorServicio.add(String(r.servicioAtribuidoId));
        for (const r of registros.filter((r) => r.fechaPartoReal).sort((a, b) => new Date(a.fechaPartoReal) - new Date(b.fechaPartoReal))) {
            const clave = `${r.fincaId}:${r.animal}`;
            const anterior = anterioresPorAnimal.get(clave);
            if (anterior && new Date(r.fechaPartoReal) > new Date(anterior)) intervalosPorCiclo.set(String(r._id), (new Date(r.fechaPartoReal) - new Date(anterior)) / 86400000);
            anterioresPorAnimal.set(clave, r.fechaPartoReal);
        }
        const porMetodo = Object.entries(catalogo).filter(([metodo, c]) => (!req.query.metodo || metodo === req.query.metodo) && (!req.query.especie || c.especies.includes(req.query.especie))).map(([metodo, c]) => {
            const servicios = registros.flatMap((r) => (r.servicios || []).filter((s) => !s.anulado && (!s.cicloOrigenId || String(s.cicloOrigenId) === String(r._id)) && s.metodo === metodo && dentro(s.fechaServicio || s.fechaServicioDesde)).map((s) => ({ r, s })));
            const confirmados = servicios.filter(({ s }) => concepcionesPorServicio.has(String(s._id)));
            const perdidas = registros.filter((r) => metodoLegado(r) === metodo && ['ABORTO', 'REABSORCION', 'PERDIDA_GESTACIONAL'].includes(r.resultado?.tipo) && dentro(r.resultado.fecha)).length;
            const partos = registros.filter((r) => metodoLegado(r) === metodo && dentro(r.fechaPartoReal));
            const intervalos = partos.map((r) => intervalosPorCiclo.get(String(r._id))).filter((v) => v != null);
            return { metodo, nombre: c.nombre, servicios: servicios.length, prenecesAtribuidas: confirmados.length, tasaPrenez: servicios.length ? confirmados.length / servicios.length * 100 : null,
                serviciosPorConcepcion: confirmados.length ? servicios.length / confirmados.length : null, partos: partos.length, perdidas,
                partosSinServicio: metodo === 'DESCONOCIDO' ? 0 : partos.filter((r) => !(r.servicios || []).some((s) => !s.anulado)).length,
                intervaloEntrePartosDias: intervalos.length ? intervalos.reduce((a, b) => a + b, 0) / intervalos.length : null };
        });
        res.json({ porMetodo, iaTotal: porMetodo.filter((m) => ['IATF', 'IA_CONVENCIONAL'].includes(m.metodo)).reduce((n, m) => n + m.servicios, 0),
            criterio: 'Partos por fecha real; servicios por fecha de servicio. Las preñeces requieren atribución confirmada. Un método declarado sin servicio no constituye un servicio registrado.' });
    } catch (e) { res.status(e.status || 400).json({ mensaje: e.message }); }
};
