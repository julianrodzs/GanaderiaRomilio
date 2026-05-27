const crypto = require('crypto');

const crearTokenRecuperacion = () => crypto.randomBytes(32).toString('hex');

const enviarCorreoRecuperacion = async ({ correo, nombre, token }) => {
    const enlaceBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const enlaceRecuperacion = `${enlaceBase}/recuperar-contrasena/${token}`;

    const mensaje = {
        to: correo,
        subject: 'Recuperacion de contrasena - GanaderiaRomilio',
        text: `Hola ${nombre || ''}. Usa este enlace para recuperar tu contrasena: ${enlaceRecuperacion}`,
        html: `
            <p>Hola ${nombre || ''},</p>
            <p>Usa el siguiente enlace para recuperar tu contrasena:</p>
            <p><a href="${enlaceRecuperacion}">${enlaceRecuperacion}</a></p>
            <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
        `
    };

    if (process.env.NODE_ENV !== 'production') {
        console.log('Correo de recuperacion preparado:', mensaje);
        return { enviado: false, modo: 'desarrollo', enlaceRecuperacion };
    }

    return {
        enviado: false,
        modo: 'pendiente_configuracion_smtp',
        enlaceRecuperacion,
        mensaje: 'Configurar proveedor SMTP antes de enviar correos reales'
    };
};

module.exports = {
    crearTokenRecuperacion,
    enviarCorreoRecuperacion
};
