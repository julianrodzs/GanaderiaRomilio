const crypto = require('crypto');
const { obtenerOrganizacionActual } = require('../context/organizacion-context');
const { Membresia } = require('../models/Membresia');

const crearTokenRecuperacion = () => crypto.randomBytes(32).toString('hex');

const obtenerRemitente = () => process.env.EMAIL_FROM || 'Ganaderia Romilio <onboarding@resend.dev>';
const obtenerRemitenteRecuperacion = () => (
    process.env.EMAIL_PASSWORD_RESET_FROM
    || process.env.EMAIL_FROM
    || 'Ganaderia Romilio <notificaciones@alertas.ganaderiaromilio.com>'
);

const obtenerDestinatariosAdministradores = async (organizacionId = obtenerOrganizacionActual()) => {
    if (process.env.EMAIL_TEST_TO) {
        return [process.env.EMAIL_TEST_TO];
    }

    if (!organizacionId) return [];

    const membresias = await Membresia.find({
        organizacionId,
        rol: 'Administrador',
        estado: 'Activo'
    }).populate({
        path: 'usuario',
        match: { estado: 'Activo' },
        select: 'correo nombre apellido'
    });
    const correosAdministradores = membresias
        .map((membresia) => membresia.usuario?.correo)
        .filter(Boolean);

    if (correosAdministradores.length > 0) {
        return correosAdministradores;
    }

    return [];
};

const enviarCorreoResend = async ({ to, subject, html, text, from }) => {
    const destinatarios = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

    if (destinatarios.length === 0) {
        return {
            enviado: false,
            modo: 'sin_destinatarios',
            mensaje: 'No hay destinatarios configurados para este correo'
        };
    }

    const mensaje = {
        from: from || obtenerRemitente(),
        to: destinatarios,
        subject,
        html,
        text
    };

    if (!process.env.RESEND_API_KEY) {
        console.log('Correo preparado sin RESEND_API_KEY:', mensaje);
        return {
            enviado: false,
            modo: 'pendiente_resend_api_key',
            mensaje
        };
    }

    const respuesta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(mensaje)
    });

    const data = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
        throw new Error(data.message || data.error || 'Error enviando correo con Resend');
    }

    return {
        enviado: true,
        proveedor: 'resend',
        id: data.id,
        destinatarios
    };
};

const enviarCorreoAdministradores = async ({ subject, html, text }) => {
    const destinatarios = await obtenerDestinatariosAdministradores();

    return enviarCorreoResend({
        to: destinatarios,
        subject,
        html,
        text
    });
};

const enviarCorreoRecuperacion = async ({ correo, nombre, token }) => {
    const enlaceBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const enlaceRecuperacion = `${enlaceBase}/restablecer-contrasena/${token}`;

    const mensaje = {
        from: obtenerRemitenteRecuperacion(),
        to: correo,
        subject: 'Recuperacion de cuenta - Ganaderia Romilio',
        text: `Hola ${nombre || ''}. Usa este enlace para crear una nueva contrasena. El enlace vence en 30 minutos: ${enlaceRecuperacion}`,
        html: `
            <p>Hola ${nombre || ''},</p>
            <p>Recibimos una solicitud para recuperar el acceso a tu cuenta de Ganaderia Romilio.</p>
            <p>Usa el siguiente enlace para crear una nueva contrasena. El enlace vence en 30 minutos:</p>
            <p><a href="${enlaceRecuperacion}">${enlaceRecuperacion}</a></p>
            <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
        `
    };

    const resultado = await enviarCorreoResend(mensaje);

    return {
        ...resultado,
        enlaceRecuperacion
    };
};

const enviarCorreoInvitacion = async ({ correo, nombre, organizacion, token }) => {
    const enlaceBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const enlaceInvitacion = `${enlaceBase}/restablecer-contrasena/${token}`;
    const resultado = await enviarCorreoResend({
        from: obtenerRemitenteRecuperacion(),
        to: correo,
        subject: `Invitacion a ${organizacion} - Ganaderia Romilio`,
        text: `Hola ${nombre || ''}. Tu cuenta para ${organizacion} esta lista. Crea tu contrasena desde este enlace: ${enlaceInvitacion}`,
        html: `
            <p>Hola ${nombre || ''},</p>
            <p>Tu cuenta para <strong>${organizacion}</strong> ya esta disponible en Ganaderia Romilio.</p>
            <p>Crea tu contrasena desde el siguiente enlace:</p>
            <p><a href="${enlaceInvitacion}">${enlaceInvitacion}</a></p>
            <p>El enlace vence en 24 horas.</p>
        `
    });

    return { ...resultado, enlaceInvitacion };
};

module.exports = {
    crearTokenRecuperacion,
    enviarCorreoAdministradores,
    enviarCorreoInvitacion,
    enviarCorreoRecuperacion,
    enviarCorreoResend,
    obtenerDestinatariosAdministradores
};
