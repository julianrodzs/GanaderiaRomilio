require('dotenv').config();

const mongoose = require('mongoose');
const app = require('../app');
const { generarToken } = require('../middleware/auth');
const { Membresia } = require('../models/Membresia');

const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const main = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 5000, autoIndex: false });
    let servidor;
    try {
        const membresias = await Membresia.find({ estado: 'Activo' })
            .sort({ rol: 1 })
            .populate({
                path: 'usuario',
                match: { estado: 'Activo' },
                select: 'correo nombre estado'
            });
        const membresia = membresias.find((item) => item.usuario);
        if (!membresia?.usuario) throw new Error('No hay membresía activa para verificar la API');

        const token = generarToken({
            id: membresia.usuario._id.toString(),
            organizacionId: membresia.organizacionId.toString()
        });

        servidor = app.listen(0, '127.0.0.1');
        await new Promise((resolve) => servidor.once('listening', resolve));
        const puerto = servidor.address().port;
        const headers = { Authorization: `Bearer ${token}` };

        const [perfilRespuesta, animalesRespuesta, fincasRespuesta] = await Promise.all([
            fetch(`http://127.0.0.1:${puerto}/api/usuarios/perfil`, { headers }),
            fetch(`http://127.0.0.1:${puerto}/api/animales`, { headers }),
            fetch(`http://127.0.0.1:${puerto}/api/fincas`, { headers })
        ]);
        const perfil = await perfilRespuesta.json();
        const animales = await animalesRespuesta.json();
        const fincas = await fincasRespuesta.json();
        const fincaPrincipal = Array.isArray(fincas) ? fincas.find((finca) => finca.esPrincipal) : null;

        const resultado = {
            perfilStatus: perfilRespuesta.status,
            animalesStatus: animalesRespuesta.status,
            fincasStatus: fincasRespuesta.status,
            perfilError: perfilRespuesta.ok ? undefined : perfil.mensaje,
            perfilDetalle: perfilRespuesta.ok ? undefined : perfil.error,
            animalesError: animalesRespuesta.ok ? undefined : animales.mensaje,
            animalesDetalle: animalesRespuesta.ok ? undefined : animales.error,
            organizacionId: perfil.usuario?.organizacionId,
            animales: Array.isArray(animales) ? animales.length : null,
            fincaPrincipal: fincaPrincipal?._id || null,
            lineasProductivas: fincaPrincipal?.lineasProductivas || [],
            apiCorrecta: perfilRespuesta.ok
                && animalesRespuesta.ok
                && fincasRespuesta.ok
                && Boolean(perfil.usuario?.organizacionId)
                && Boolean(fincaPrincipal)
                && Array.isArray(animales)
        };
        console.log(JSON.stringify(resultado, null, 2));
        if (!resultado.apiCorrecta) process.exitCode = 1;
    } finally {
        if (servidor) await new Promise((resolve) => servidor.close(resolve));
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error('Error verificando API SaaS:', error);
    process.exitCode = 1;
});
