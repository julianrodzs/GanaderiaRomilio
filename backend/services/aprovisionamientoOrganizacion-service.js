const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');
const {
    CATEGORIAS_FINANCIERAS,
    DESTINOS_USO_FINANCIERO
} = require('../config/catalogosFinancieros');
const {
    ESPECIES_PRODUCTIVAS,
    OBJETIVOS_PRODUCTIVOS,
    normalizarLineasProductivas
} = require('../config/lineasProductivas');
const { planesConfig } = require('../config/planes');
const CatalogoFinanciero = require('../models/CatalogoFinanciero');
const ConfiguracionProductiva = require('../models/ConfiguracionProductiva');
const Finca = require('../models/Finca');
const { Membresia } = require('../models/Membresia');
const Organizacion = require('../models/Organizacion');
const Usuario = require('../models/Usuario');
const {
    crearTokenRecuperacion,
    enviarCorreoInvitacion
} = require('./correoElectronico-service');

class ErrorAprovisionamiento extends Error {
    constructor(mensaje, status = 400, code = 'PROVISIONING_INVALID_DATA', detalles = {}) {
        super(mensaje);
        this.name = 'ErrorAprovisionamiento';
        this.status = status;
        this.code = code;
        this.detalles = detalles;
    }
}

const normalizarTexto = (valor = '') => String(valor).trim();
const normalizarCorreo = (valor = '') => normalizarTexto(valor).toLowerCase();
const normalizarSlug = (valor = '') => normalizarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const normalizarCatalogo = (valor = '') => normalizarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const lineasPredeterminadas = (codigoPlan, especiePlan) => {
    const especies = codigoPlan === 'ESENCIAL' ? [especiePlan] : ESPECIES_PRODUCTIVAS;
    return especies.filter(Boolean).map((especie) => ({
        especie,
        objetivos: [...OBJETIVOS_PRODUCTIVOS],
        activa: true
    }));
};

const validarDatosAprovisionamiento = (entrada = {}) => {
    const organizacionEntrada = entrada.organizacion || {};
    const fincaEntrada = entrada.finca || {};
    const administradorEntrada = entrada.administrador || {};
    const codigoPlan = normalizarTexto(entrada.plan?.codigo || 'ESENCIAL').toUpperCase();
    const especiePlan = entrada.plan?.especiePlan || null;
    const estadoPlan = entrada.plan?.estado || 'Prueba';
    const nombreOrganizacion = normalizarTexto(organizacionEntrada.nombre);
    const slug = normalizarSlug(organizacionEntrada.slug || nombreOrganizacion);
    const correo = normalizarCorreo(administradorEntrada.correo);

    if (!nombreOrganizacion) throw new ErrorAprovisionamiento('El nombre de la organización es requerido.');
    if (!slug || slug.length < 3) throw new ErrorAprovisionamiento('El identificador de la organización debe tener al menos 3 caracteres.');
    if (!planesConfig[codigoPlan]) throw new ErrorAprovisionamiento('El plan seleccionado no es válido.');
    if (!['Activo', 'Prueba'].includes(estadoPlan)) throw new ErrorAprovisionamiento('El estado inicial del plan no es válido.');
    if (codigoPlan === 'ESENCIAL' && !ESPECIES_PRODUCTIVAS.includes(especiePlan)) {
        throw new ErrorAprovisionamiento('El plan Esencial requiere seleccionar Bovino o Porcino.');
    }
    if (!normalizarTexto(fincaEntrada.nombre)) throw new ErrorAprovisionamiento('El nombre de la finca principal es requerido.');
    if (!normalizarTexto(administradorEntrada.nombre)) throw new ErrorAprovisionamiento('El nombre del administrador es requerido.');
    if (!/^\S+@\S+\.\S+$/.test(correo)) throw new ErrorAprovisionamiento('El correo del administrador no es válido.');

    const lineas = normalizarLineasProductivas(
        fincaEntrada.lineasProductivas?.length
            ? fincaEntrada.lineasProductivas
            : lineasPredeterminadas(codigoPlan, especiePlan)
    );
    if (lineas.length === 0) throw new ErrorAprovisionamiento('La finca debe tener al menos una línea productiva.');
    if (codigoPlan === 'ESENCIAL' && lineas.some((linea) => linea.especie !== especiePlan)) {
        throw new ErrorAprovisionamiento(`El plan Esencial solo permite configurar la especie ${especiePlan}.`);
    }

    return {
        organizacion: {
            nombre: nombreOrganizacion,
            razonSocial: normalizarTexto(organizacionEntrada.razonSocial),
            slug,
            pais: normalizarTexto(organizacionEntrada.pais) || 'Costa Rica',
            zonaHoraria: normalizarTexto(organizacionEntrada.zonaHoraria) || 'America/Costa_Rica'
        },
        plan: {
            codigo: codigoPlan,
            especiePlan: codigoPlan === 'ESENCIAL' ? especiePlan : null,
            estado: estadoPlan,
            referenciaExterna: normalizarTexto(entrada.plan?.referenciaExterna)
        },
        finca: {
            nombre: normalizarTexto(fincaEntrada.nombre),
            codigo: normalizarTexto(fincaEntrada.codigo || 'PRINCIPAL').toUpperCase(),
            ubicacion: normalizarTexto(fincaEntrada.ubicacion),
            descripcion: normalizarTexto(fincaEntrada.descripcion),
            lineasProductivas: lineas
        },
        administrador: {
            nombre: normalizarTexto(administradorEntrada.nombre),
            apellido: normalizarTexto(administradorEntrada.apellido),
            correo,
            telefono: normalizarTexto(administradorEntrada.telefono)
        }
    };
};

const crearCatalogosIniciales = async (organizacionId, session) => {
    const documentos = [
        ...CATEGORIAS_FINANCIERAS.map((nombre) => ({ tipo: 'categoria', nombre })),
        ...DESTINOS_USO_FINANCIERO.map((nombre) => ({ tipo: 'destinoUso', nombre }))
    ].map((item) => ({
        ...item,
        organizacionId,
        nombreNormalizado: normalizarCatalogo(item.nombre),
        activo: true,
        protegido: true
    }));

    await CatalogoFinanciero.insertMany(documentos, { session, ordered: true });
};

const aprovisionarOrganizacion = async (entrada, creadoPor) => {
    const datos = validarDatosAprovisionamiento(entrada);
    const tokenInvitacion = crearTokenRecuperacion();
    const tokenHash = crypto.createHash('sha256').update(tokenInvitacion).digest('hex');
    const session = await mongoose.startSession();
    let resultado;

    try {
        await session.withTransaction(async () => {
            const organizacionDuplicada = await Organizacion.exists({ slug: datos.organizacion.slug }).session(session);
            if (organizacionDuplicada) {
                throw new ErrorAprovisionamiento('Ya existe una organización con ese identificador.', 409, 'ORGANIZATION_SLUG_EXISTS');
            }

            let usuario = await Usuario.findOne({ correo: datos.administrador.correo }).session(session);
            if (usuario) {
                const tieneMembresias = await Membresia.exists({ usuario: usuario._id }).session(session);
                if (tieneMembresias) {
                    throw new ErrorAprovisionamiento(
                        'El correo del administrador ya pertenece a otra organización. Usa un correo diferente.',
                        409,
                        'ADMIN_EMAIL_ALREADY_ASSIGNED'
                    );
                }
            } else {
                const contrasenaTemporal = crypto.randomBytes(32).toString('hex');
                [usuario] = await Usuario.create([{
                    ...datos.administrador,
                    contrasena: await bcrypt.hash(contrasenaTemporal, 10),
                    rol: 'Administrador',
                    estado: 'Activo'
                }], { session });
            }

            usuario.nombre = datos.administrador.nombre;
            usuario.apellido = datos.administrador.apellido;
            usuario.telefono = datos.administrador.telefono;
            usuario.estado = 'Activo';
            usuario.resetPasswordToken = tokenHash;
            usuario.resetPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
            usuario.resetPasswordRequestedAt = new Date();
            await usuario.save({ session });

            const [organizacion] = await Organizacion.create([{
                ...datos.organizacion,
                estado: 'Activa',
                plan: {
                    ...datos.plan,
                    fechaAsignacion: new Date()
                },
                configuracion: {
                    aprovisionadaPor: creadoPor,
                    fechaAprovisionamiento: new Date()
                }
            }], { session });

            const [finca] = await Finca.create([{
                organizacionId: organizacion._id,
                ...datos.finca,
                estado: 'Activa'
            }], { session });

            organizacion.fincaPrincipal = finca._id;
            await organizacion.save({ session });

            const [membresia] = await Membresia.create([{
                organizacionId: organizacion._id,
                usuario: usuario._id,
                rol: 'Administrador',
                estado: 'Activo',
                esPrincipal: true,
                accesoTodasFincas: true,
                fincas: [finca._id]
            }], { session });

            await ConfiguracionProductiva.create([{
                organizacionId: organizacion._id,
                clave: 'principal',
                actualizadoPor: creadoPor
            }], { session });
            await crearCatalogosIniciales(organizacion._id, session);

            resultado = { organizacion, finca, usuario, membresia };
        });
    } finally {
        await session.endSession();
    }

    let invitacion;
    try {
        invitacion = await enviarCorreoInvitacion({
            correo: resultado.usuario.correo,
            nombre: resultado.usuario.nombre,
            organizacion: resultado.organizacion.nombre,
            token: tokenInvitacion
        });
    } catch (error) {
        invitacion = { enviado: false, modo: 'error', mensaje: error.message };
    }

    return {
        organizacion: resultado.organizacion,
        finca: resultado.finca,
        administrador: {
            id: resultado.usuario._id,
            nombre: resultado.usuario.nombre,
            apellido: resultado.usuario.apellido,
            correo: resultado.usuario.correo,
            membresiaId: resultado.membresia._id
        },
        invitacion: {
            enviado: invitacion.enviado === true,
            modo: invitacion.modo || invitacion.proveedor || 'desconocido',
            mensaje: invitacion.enviado
                ? 'La invitación fue enviada al administrador.'
                : 'El cliente fue creado, pero la invitación no se envió. Puedes compartir el enlace de prueba.'
        },
        enlaceInvitacion: process.env.NODE_ENV === 'production' ? undefined : invitacion.enlaceInvitacion
    };
};

module.exports = {
    ErrorAprovisionamiento,
    aprovisionarOrganizacion,
    normalizarSlug,
    validarDatosAprovisionamiento
};
