const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { normalizarId } = require('../services/identificador-service');
const { limpiarDatosTarea, validarTransicionTarea, validarRelacionesTarea, fechaEjecucionTarea, diasHastaTarea } = require('../services/tarea-integridad-service');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { Tarea } = require('../models/Tarea');
const Notificacion = require('../models/Notificacion');
const { Membresia } = require('../models/Membresia');
const Finca = require('../models/Finca');
const Animal = require('../models/Animal');
const EventoAnimal = require('../models/EventoAnimal');
const EventoCamada = require('../models/EventoCamada');
const AlertaCorreo = require('../models/AlertaCorreo');
const { notificarTareaAsignada } = require('../services/tarea-notificacion-service');
const { crearNotificacion, notificarPorRoles, obtenerCantidadNoLeidas } = require('../services/notificacion-service');
const { crearHtml, enviarCorreosTareas } = require('../services/alertasCorreo-service');
const { requirePlanVigente } = require('../middleware/plan');
const controller = require('../controllers/tareaController');
const id = (n) => n.toString(16).padStart(24, '0');
const org = id(1), finca = id(2), fincaB = id(3), usuario = id(4), tareaId = id(5);
const cadena = (valor) => ({
    then(resolve, reject) { return Promise.resolve(typeof valor === 'function' ? valor() : valor).then(resolve, reject); },
    select() { return this; }, populate() { return this; }, session() { return this; },
    lean() { return this; }, sort() { return this; }, setOptions() { return this; }
});
const respuesta = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set(k, v) { this.headers[k] = v; return this; } });
const solicitud = (body = {}, rol = 'Administrador', key = '') => ({ body, params: { id: tareaId }, usuario: { id: usuario, rol }, organizacionId: org, fincaId: finca, get: () => key });

test('IDs de auth, documentos y ObjectIds se normalizan; objetos arbitrarios se rechazan', () => {
    for (const valor of [usuario, { id: usuario }, { _id: usuario }, new mongoose.Types.ObjectId(usuario)]) assert.equal(normalizarId(valor), usuario);
    assert.equal(normalizarId(null), null);
    for (const valor of [{ rol: 'Administrador' }, { id: '[object Object]' }, 'foo', { id: { $ne: null } }]) assert.throws(() => normalizarId(valor));
});

test('DTO rechaza tenant, origen, operaciones y claves anidadas en todos los campos', () => {
    for (const datos of [
        { organizacionId: org }, { fincaId: fincaB }, { creadoPor: usuario }, { operacionesIdempotentes: [] },
        { moduloOrigen: 'Otro' }, { categoriaAutomatica: 'Otra' }, { $set: { estado: 'Completada' } },
        { 'comentarios.0.usuario': usuario }, { animal: { $ne: null } }, { asignadoA: { id: usuario } }
    ]) assert.throws(() => limpiarDatosTarea(datos));
    assert.equal(limpiarDatosTarea({ animal: '', fechaLimite: '' }).animal, null);
    assert.throws(() => limpiarDatosTarea({ fechaProgramada: '2026-02-30' }));
});

test('las relaciones se comprueban usando consultas del contexto de finca', async (t) => {
    let comprobada;
    t.mock.method(Animal, 'exists', (filtro) => { comprobada = filtro; return cadena(null); });
    await assert.rejects(() => validarRelacionesTarea({ animal: id(99) }), /finca activa/);
    assert.equal(comprobada._id, id(99));
});

test('todos los orígenes especializados bloquean finalización y un trabajador no reabre canceladas', () => {
    for (const moduloOrigen of ['Sanidad', 'IATF', 'BandaPorcina', 'BandaReproductivaPorcina', 'ProtocoloEngorde']) {
        assert.throws(() => validarTransicionTarea({ estado: 'Pendiente', moduloOrigen }, 'Completada', true), { codigo: 'PROTOCOLO_REQUIERE_EJECUCION' });
    }
    for (const categoriaAutomatica of ['IATF', 'BANDA_PORCINA', 'PROTOCOLO_ENGORDE']) {
        assert.throws(() => validarTransicionTarea({ estado: 'Pendiente', categoriaAutomatica }, 'Completada', true));
    }
    assert.throws(() => validarTransicionTarea({ estado: 'Cancelada' }, 'Completada', false));
    assert.throws(() => validarTransicionTarea({ estado: 'Completada', referenciaId: tareaId }, 'Pendiente', true, true));
    assert.doesNotThrow(() => validarTransicionTarea({ estado: 'Cancelada' }, 'Pendiente', true, true));
});

test('fecha offline conserva el instante de campo y rechaza fecha futura/sin zona', () => {
    const ahora = new Date('2026-10-20T20:00:00Z');
    assert.equal(fechaEjecucionTarea('2026-10-20T07:00:00-06:00', ahora).toISOString(), '2026-10-20T13:00:00.000Z');
    for (const valor of ['2026-10-20', '2026-10-20T07:00:00', 'incorrecta', '2026-10-21T00:00:00Z']) assert.throws(() => fechaEjecucionTarea(valor, ahora));
});

test('vencimiento civil conserva el día y usa el hoy de la organización', () => {
    assert.equal(diasHastaTarea('2026-10-20', 'America/Costa_Rica', new Date('2026-10-20T04:00:00Z')), 1);
    assert.equal(diasHastaTarea('2026-10-20', 'America/Costa_Rica', new Date('2026-10-20T13:00:00Z')), 0);
    assert.equal(diasHastaTarea('2026-10-20T02:00:00Z', 'America/Costa_Rica', new Date('2026-10-20T13:00:00Z')), -1);
});

test('una asignación real valida el actor de auth, finca y membresía, crea un aviso y cuenta uno', async (t) => {
    const documentos = [];
    t.mock.method(Finca, 'exists', async () => ({ _id: finca }));
    t.mock.method(Membresia, 'findOne', (filtro) => {
        assert.equal(filtro.organizacionId, org);
        assert.deepEqual(filtro.$or, [{ accesoTodasFincas: true }, { fincas: finca }]);
        return cadena({ usuario: { _id: usuario } });
    });
    t.mock.method(Notificacion, 'findOne', (filtro) => cadena(documentos.find((n) => n.dedupKey === filtro.dedupKey)));
    t.mock.method(Notificacion, 'create', async (datos) => {
        const doc = new Notificacion(datos); await doc.validate(); documentos.push(doc); return doc;
    });
    t.mock.method(Notificacion, 'countDocuments', async (filtro) => {
        assert.equal(filtro.fincaId, finca); assert.equal(filtro.destinatario, usuario);
        return documentos.filter((n) => !n.leida).length;
    });
    await ejecutarConOrganizacion(org, async () => {
        const tarea = { _id: tareaId, titulo: 'Tarea A', asignadoA: usuario, fincaId: finca, asignacionVersion: 'asignacion-1' };
        assert.equal((await notificarTareaAsignada(tarea, { id: usuario, rol: 'Administrador' })).creada, true);
        assert.equal((await notificarTareaAsignada(tarea, { id: usuario })).creada, false);
        assert.equal(await obtenerCantidadNoLeidas(usuario), 1);
        assert.equal(String(documentos[0].actor), usuario);
        documentos[0].leida = true;
        assert.equal((await notificarTareaAsignada({ ...tarea, asignacionVersion: 'asignacion-2' }, { id: usuario })).creada, true);
    }, finca);
});

test('el reparto por rol incluye la finca y no crea avisos para membresía revocada', async (t) => {
    t.mock.method(Membresia, 'find', (filtro) => {
        assert.deepEqual(filtro.$or, [{ accesoTodasFincas: true }, { fincas: finca }]); return cadena([]);
    });
    t.mock.method(Finca, 'exists', async () => ({ _id: finca }));
    t.mock.method(Membresia, 'findOne', () => cadena(null));
    t.mock.method(Notificacion, 'create', () => { throw new Error('No debe crear'); });
    await ejecutarConOrganizacion(org, async () => {
        assert.deepEqual(await notificarPorRoles(['Encargado'], { fincaId: finca }), []);
        assert.equal((await crearNotificacion({ destinatario: usuario, fincaId: finca })).creada, false);
        await assert.rejects(() => crearNotificacion({ destinatario: usuario, fincaId: fincaB }), /finca/);
    }, finca);
});

test('cada administrador recibe solo tareas de sus fincas y deduplicación por destinatario', async (t) => {
    const adminA = id(10), adminB = id(11), envios = [], guardadas = [];
    t.mock.method(Membresia, 'find', () => cadena([
        { organizacionId: org, fincas: [finca], usuario: { _id: adminA, correo: 'a@example.invalid' } },
        { organizacionId: org, fincas: [fincaB], usuario: { _id: adminB, correo: 'b@example.invalid' } }
    ]));
    t.mock.method(Finca, 'find', (filtro) => cadena(filtro._id.$in.map((_id) => ({ _id }))));
    t.mock.method(AlertaCorreo, 'findOne', async () => null);
    t.mock.method(AlertaCorreo, 'findOneAndUpdate', async (filtro) => { guardadas.push(filtro.clave); });
    t.mock.method(global, 'fetch', async (url, opciones) => {
        envios.push(JSON.parse(opciones.body)); return { ok: true, json: async () => ({ id: 'simulado' }) };
    });
    const prev = { key: process.env.RESEND_API_KEY, test: process.env.EMAIL_TEST_TO, enabled: process.env.EMAIL_ALERTS_ENABLED };
    process.env.RESEND_API_KEY = 'solo-prueba'; delete process.env.EMAIL_TEST_TO; delete process.env.EMAIL_ALERTS_ENABLED;
    try {
        const resultado = await ejecutarConOrganizacion(org, () => enviarCorreosTareas([
            { tarea: { _id: id(20), titulo: 'Solo finca A', fincaId: finca }, fecha: new Date(), dias: 0, asunto: 'Tareas' },
            { tarea: { _id: id(21), titulo: 'Solo finca B', fincaId: fincaB }, fecha: new Date(), dias: 0, asunto: 'Tareas' }
        ]));
        assert.equal(resultado.enviadas, 2);
        assert.match(envios[0].html, /Solo finca A/); assert.doesNotMatch(envios[0].html, /Solo finca B/);
        assert.match(envios[1].html, /Solo finca B/); assert.doesNotMatch(envios[1].html, /Solo finca A/);
        assert.ok(guardadas[0].endsWith(adminA)); assert.ok(guardadas[1].endsWith(adminB));
    } finally {
        for (const [clave, valor] of [['RESEND_API_KEY', prev.key], ['EMAIL_TEST_TO', prev.test], ['EMAIL_ALERTS_ENABLED', prev.enabled]]) {
            if (valor === undefined) delete process.env[clave]; else process.env[clave] = valor;
        }
    }
});

test('HTML de tareas y organización escapa etiquetas, comillas y ampersand', () => {
    const html = crearHtml('<Avisos>', [{ tarea: { titulo: '<a href="x">A&B</a>' }, fecha: new Date(), dias: 0 }], "Finca 'A'");
    assert.doesNotMatch(html, /<a href/); assert.match(html, /&lt;a href=&quot;x&quot;&gt;A&amp;B/);
    assert.match(html, /Finca &#39;A&#39;/);
});

for (const estado of ['Suspendido', 'Cancelado']) test(`plan ${estado} recibe 403 antes de mutar`, async () => {
    const actual = { codigo: 'PRO', estado, vigente: false, organizacion: { estado: 'Activa' }, configuracion: {} };
    const res = respuesta(); let next = false;
    await requirePlanVigente({ obtenerPlanActual: async () => actual })(solicitud(), res, () => { next = true; });
    assert.equal(res.code, 403); assert.equal(next, false);
});

// Doble transaccional: solo publica escrituras al confirmar. No sustituye probar MongoDB replica set.
const escenario = (t, cambios = {}) => {
    let persistida = { _id: tareaId, titulo: 'Revisar', tipo: 'Pesaje', animal: id(8), asignadoA: usuario, estado: 'Pendiente',
        organizacionId: org, fincaId: finca, fechaProgramada: new Date('2026-10-19'), createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-19'), operacionesIdempotentes: [], ...cambios };
    let borradores, eventos = [], fallo = false;
    const session = { async withTransaction(fn) {
        borradores = structuredClone(persistida); const anteriores = [...eventos];
        try { await fn(); persistida = structuredClone(borradores); } catch (e) { eventos = anteriores; throw e; }
    }, async endSession() {} };
    const cargar = () => {
        const tarea = structuredClone(borradores || persistida);
        Object.defineProperty(tarea, 'save', { value: async ({ session: recibida }) => {
            assert.equal(recibida, session); borradores = structuredClone(tarea); return tarea;
        } });
        return tarea;
    };
    t.mock.method(mongoose, 'startSession', async () => session);
    t.mock.method(Tarea, 'findById', () => cadena(cargar));
    t.mock.method(Animal, 'exists', () => cadena({ _id: id(8) }));
    t.mock.method(EventoAnimal, 'findOneAndUpdate', async (filtro, actualizacion, opciones) => {
        assert.equal(opciones.session, session); if (fallo) throw new Error('Fallo de bitácora simulado');
        eventos.push(actualizacion.$set); return actualizacion.$set;
    });
    t.mock.method(EventoAnimal, 'deleteMany', async () => ({}));
    t.mock.method(EventoCamada, 'deleteMany', async () => ({}));
    return { estado: () => persistida, eventos: () => eventos, fallar: (valor) => { fallo = valor; } };
};

test('replay después de reasignar deniega antes de retornar datos', async (t) => {
    escenario(t, { asignadoA: id(9), estado: 'Completada', operacionesIdempotentes: [{ clave: 'conocida', usuario, tipo: 'Completar tarea' }] });
    const res = respuesta(); await controller.completarTarea(solicitud({}, 'Trabajador', 'conocida'), res);
    assert.equal(res.code, 403); assert.equal(res.headers['X-Idempotent-Replay'], undefined); assert.equal(res.body._id, undefined);
});

test('fallo de bitácora revierte tarea y clave; reintentar completa una sola vez con fecha de campo', async (t) => {
    const e = escenario(t); e.fallar(true);
    const req = solicitud({ fechaEjecucionReal: '2026-10-19T07:00:00-06:00' }, 'Administrador', 'offline-1');
    let res = respuesta(); await controller.completarTarea(req, res);
    assert.equal(res.code, 400); assert.equal(e.estado().estado, 'Pendiente'); assert.equal(e.estado().operacionesIdempotentes.length, 0);
    e.fallar(false); res = respuesta(); await controller.completarTarea(req, res);
    assert.equal(res.code, 200); assert.equal(e.estado().fechaCompletada.toISOString(), '2026-10-19T13:00:00.000Z');
    assert.ok(e.estado().fechaRecepcionCompletado > e.estado().fechaCompletada);
    assert.equal(e.eventos().length, 1); assert.equal(e.eventos()[0].tipoEvento, 'Observacion');
    assert.equal(e.eventos()[0].fecha.toISOString(), '2026-10-19T13:00:00.000Z');
    res = respuesta(); await controller.completarTarea(req, res);
    assert.equal(res.headers['X-Idempotent-Replay'], 'true'); assert.equal(e.eventos().length, 1);
});

test('PUT y PATCH comparten el bloqueo de protocolos y canceladas', async (t) => {
    escenario(t, { categoriaAutomatica: 'BANDA_PORCINA', referenciaId: id(50) });
    for (const accion of [controller.actualizarTarea, controller.cambiarEstadoTarea, controller.completarTarea]) {
        const res = respuesta(); await accion(solicitud(accion === controller.completarTarea ? {} : { estado: 'Completada' }), res);
        assert.equal(res.code, 409);
    }
    const res = respuesta(); await controller.actualizarTarea(solicitud({ $set: { estado: 'Completada' } }), res);
    assert.equal(res.code, 400);
});

test('DELETE de tarea de origen conserva la referencia y no borra datos', async (t) => {
    escenario(t, { moduloOrigen: 'Sanidad', referenciaId: id(99) });
    t.mock.method(Tarea, 'deleteOne', () => { throw new Error('No debe borrar'); });
    const res = respuesta(); await controller.eliminarTarea(solicitud(), res); assert.equal(res.code, 409);
});

test('estado y completar rechazan una cancelada; PUT rechaza versiones desactualizadas', async (t) => {
    const e = escenario(t, { estado: 'Cancelada' });
    for (const accion of [controller.cambiarEstadoTarea, controller.completarTarea]) {
        const res = respuesta(); await accion(solicitud(accion === controller.completarTarea ? {} : { estado: 'Completada' }, 'Trabajador'), res);
        assert.equal(res.code, 409);
    }
    const res = respuesta(); await controller.actualizarTarea(solicitud({ observaciones: 'Cambio', versionEsperada: '2026-10-01' }), res);
    assert.equal(res.code, 409); assert.equal(e.estado().observaciones, undefined);
});

test('migración solo recupera finca de entidad y organización verificables, sin adivinar tras cambios', async () => {
    const { resolverFincaLegada } = require('../scripts/migrarFincasNotificaciones');
    const aviso = { entidadTipo: 'Tarea', entidadId: tareaId, organizacionId: org, createdAt: new Date('2026-10-02') };
    let actualizada = new Date('2026-10-01');
    const catalogo = { Tarea: { collection: { findOne: async (filtro) => {
        assert.deepEqual(filtro, { _id: tareaId, organizacionId: org });
        return { fincaId: finca, updatedAt: actualizada };
    } } } };
    const fincas = { findOne: async (filtro) => { assert.equal(filtro.organizacionId, org); return { _id: finca }; } };
    assert.equal(await resolverFincaLegada(aviso, catalogo, fincas), finca);
    actualizada = new Date('2026-10-03');
    assert.equal(await resolverFincaLegada(aviso, catalogo, fincas), null);
    assert.equal(await resolverFincaLegada({ ...aviso, entidadTipo: 'constructor' }, catalogo, fincas), null);
});
