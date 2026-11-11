const { createHash } = require('node:crypto');
const Aceptacion = require('../models/AceptacionLegal');
const Organizacion = require('../models/Organizacion');
const { Membresia } = require('../models/Membresia');
const { documentos, metadatos, obtenerDocumento } = require('../config/documentosLegales');

const DECLARACIONES = Object.freeze({
    TERMINOS_Y_SUSCRIPCION_ORG: 'Acepto los Términos del Servicio y las Condiciones de Suscripción en representación de la organización.',
    REGLAS_USO_COLABORADOR: 'Acepto las reglas individuales de uso en los Términos del Servicio.',
    CONSENTIMIENTO_PRIVACIDAD_LEY8968: 'He leído la Política de Privacidad y otorgo mi consentimiento informado para el tratamiento de mis datos personales.',
    COMUNICACIONES_OPCIONALES: 'Deseo recibir comunicaciones comerciales, novedades y consejos productivos opcionales.'
});
const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const hash = (valor) => createHash('sha256').update(JSON.stringify(valor)).digest('hex');
const escenarioInvitacion = (invitacion) => invitacion.esActivacionOrganizacion === true
    || (invitacion.requiereContrasena === true && invitacion.rol === 'Administrador') ? 'ORGANIZACION' : 'COLABORADOR';
const objetoCerrado = (valor, campos) => {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw error('Datos legales no válidos.');
    for (const k of Object.keys(valor)) if (!campos.includes(k) || k.startsWith('$') || k.includes('.')) throw error(`Campo legal no permitido: ${k}`);
};
const validarVersiones = (entrada, requeridos) => {
    if (!Array.isArray(entrada) || entrada.length > 4) throw error('Debes indicar las versiones de los documentos presentados.');
    const vistos = new Set();
    for (const referencia of entrada) {
        objetoCerrado(referencia, ['slug', 'version', 'hashSha256']);
        const d = obtenerDocumento(referencia.slug);
        if (!d || vistos.has(d.slug) || referencia.version !== d.version || referencia.hashSha256 !== d.hashSha256) throw error('La versión legal cambió o no es válida. Revisa de nuevo los documentos.', 409);
        vistos.add(d.slug);
    }
    if (requeridos.some((slug) => !vistos.has(slug))) throw error('Faltan las versiones de los documentos que deseas aceptar.');
};
const esRepresentante = async (usuarioId, organizacionId, session) => {
    const org = await Organizacion.findById(organizacionId).session(session).lean();
    const miembro = await Membresia.findOne({ organizacionId, usuario: usuarioId, estado: 'Activo', rol: 'Administrador' }).session(session).lean();
    return Boolean(miembro && (org?.representanteLegalUsuarioId ? String(org.representanteLegalUsuarioId) === String(usuarioId) : miembro.esPrincipal === true));
};
const estadoLegal = async (usuarioId, organizacionId, session) => {
    const propias = await Aceptacion.find({ usuarioId, organizacionId }).session(session).sort({ fechaAceptacion: -1, _id: -1 }).lean();
    const comercial = await Aceptacion.find({ organizacionId, tipoAceptacion: 'TERMINOS_Y_SUSCRIPCION_ORG', otorgado: true }).session(session).lean();
    const vigente = (e, slug) => { const d = obtenerDocumento(slug); return e.documentoSlug === slug && e.versionDocumento === d.version && e.hashTexto === d.hashSha256; };
    return { documentos: metadatos(), borrador: documentos.some((d) => d.estado === 'BORRADOR_PRUEBA'),
        representante: await esRepresentante(usuarioId, organizacionId, session),
        aceptacionComercial: ['terminos', 'suscripciones'].every((s) => comercial.some((e) => vigente(e, s))),
        reglasUso: propias.some((e) => e.otorgado && ['REGLAS_USO_COLABORADOR', 'TERMINOS_Y_SUSCRIPCION_ORG'].includes(e.tipoAceptacion) && vigente(e, 'terminos')),
        privacidad: propias.some((e) => e.otorgado && e.tipoAceptacion === 'CONSENTIMIENTO_PRIVACIDAD_LEY8968' && vigente(e, 'privacidad')),
        comunicacionesOpcionales: propias.find((e) => e.tipoAceptacion === 'COMUNICACIONES_OPCIONALES')?.otorgado === true,
        aceptaciones: propias.map(({ ip, userAgent, ...e }) => e) };
};

const registrar = async ({ entrada, usuarioId, organizacionId, rol, contexto, session, ip = '', userAgent = '', escenario = 'PANEL', soloComunicaciones = false }) => {
    objetoCerrado(entrada, soloComunicaciones ? ['otorgado', 'documentos', 'claveIdempotencia'] : ['aceptaciones', 'documentos', 'claveIdempotencia']);
    const clave = entrada.claveIdempotencia;
    if (typeof clave !== 'string' || !clave.trim() || clave.length > 120) throw error('Se requiere una clave de solicitud legal válida.');
    const a = soloComunicaciones ? { comunicacionesOpcionales: entrada.otorgado } : entrada.aceptaciones;
    objetoCerrado(a, ['reglasUso', 'terminosOrganizacion', 'privacidad', 'comunicacionesOpcionales']);
    for (const v of Object.values(a)) if (typeof v !== 'boolean') throw error('Las casillas legales deben ser valores booleanos.');
    if (soloComunicaciones && typeof a.comunicacionesOpcionales !== 'boolean') throw error('Indica si deseas otorgar o revocar las comunicaciones opcionales.');
    const representante = escenario === 'ORGANIZACION' || (escenario === 'PANEL' && await esRepresentante(usuarioId, organizacionId, session));
    if (a.terminosOrganizacion && !representante) throw error('Solo el administrador titular puede aceptar las condiciones en representación de la organización.', 403);
    if (escenario === 'ORGANIZACION' && a.terminosOrganizacion !== true) throw error('Debes aceptar los Términos y las Condiciones de Suscripción en representación de la organización.');
    if (escenario === 'COLABORADOR' && a.reglasUso !== true) throw error('Debes aceptar las reglas individuales de uso.');
    if (escenario !== 'PANEL' && a.privacidad !== true) throw error('Debes otorgar por separado el consentimiento informado de privacidad.');
    const filas = [];
    if (a.terminosOrganizacion) for (const slug of ['terminos', 'suscripciones']) filas.push(['TERMINOS_Y_SUSCRIPCION_ORG', slug, true]);
    if (a.reglasUso) filas.push(['REGLAS_USO_COLABORADOR', 'terminos', true]);
    if (a.privacidad) filas.push(['CONSENTIMIENTO_PRIVACIDAD_LEY8968', 'privacidad', true]);
    if (Object.hasOwn(a, 'comunicacionesOpcionales')) filas.push(['COMUNICACIONES_OPCIONALES', 'privacidad', a.comunicacionesOpcionales]);
    if (!filas.length) throw error('Selecciona la aceptación que deseas registrar.');
    validarVersiones(entrada.documentos, [...new Set(filas.map((f) => f[1]))]);
    const solicitudHash = hash({ a: Object.fromEntries(Object.entries(a).sort(([x], [y]) => x.localeCompare(y))),
        documentos: entrada.documentos.map(({ slug, version, hashSha256 }) => ({ slug, version, hashSha256 })).sort((x, y) => x.slug.localeCompare(y.slug)), contexto });
    const anteriores = await Aceptacion.find({ usuarioId, organizacionId, claveSolicitud: clave }).select('+solicitudHash').session(session).lean();
    if (anteriores.length) {
        if (anteriores.some((e) => e.solicitudHash !== solicitudHash)) throw error('La clave legal ya fue usada para otra solicitud.', 409);
        return anteriores;
    }
    return Aceptacion.create(filas.map(([tipoAceptacion, slug, otorgado]) => {
        const d = obtenerDocumento(slug);
        return { usuarioId, organizacionId, rolEnMomento: rol, contexto, tipoAceptacion, otorgado, documentoSlug: slug,
            versionDocumento: d.version, estadoDocumento: d.estado, hashTexto: d.hashSha256, copiaTextoExacto: d.contenido,
            declaracion: otorgado || tipoAceptacion !== 'COMUNICACIONES_OPCIONALES' ? DECLARACIONES[tipoAceptacion] : 'No deseo recibir comunicaciones comerciales, novedades ni consejos productivos opcionales.',
            ip: String(ip).slice(0, 128), userAgent: String(userAgent).slice(0, 1000), claveSolicitud: clave, solicitudHash };
    }), { session, ordered: true });
};

module.exports = { registrar, estadoLegal, esRepresentante, validarVersiones, escenarioInvitacion, DECLARACIONES };
