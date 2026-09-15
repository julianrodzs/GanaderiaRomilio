const Auditoria = require('../models/Auditoria');

const METODOS_AUDITABLES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CAMPOS_SENSIBLES = new Set([
    'contrasena',
    'confirmarContrasena',
    'password',
    'confirmarPassword',
    'token',
    'authorization',
    'resetPasswordToken',
    'comprobante'
]);

const normalizarClave = (valor = '') => String(valor).trim().toLowerCase();

const truncarTexto = (valor, maximo = 800) => {
    const texto = String(valor || '');
    return texto.length > maximo ? `${texto.slice(0, maximo)}...` : texto;
};

const sanitizar = (valor, profundidad = 0) => {
    if (profundidad > 5) return '[profundidad-maxima]';
    if (valor === null || valor === undefined) return valor;
    if (Array.isArray(valor)) return valor.slice(0, 50).map((item) => sanitizar(item, profundidad + 1));
    if (valor instanceof Date) return valor;

    if (typeof valor === 'object') {
        return Object.entries(valor).reduce((resultado, [clave, contenido]) => {
            if (CAMPOS_SENSIBLES.has(normalizarClave(clave))) {
                resultado[clave] = '[protegido]';
                return resultado;
            }

            resultado[clave] = sanitizar(contenido, profundidad + 1);
            return resultado;
        }, {});
    }

    if (typeof valor === 'string') return truncarTexto(valor);
    return valor;
};

const obtenerModulo = (ruta = '') => {
    const partes = ruta.split('?')[0].split('/').filter(Boolean);
    const modulo = partes[1] || partes[0] || 'general';
    const mapa = {
        animales: 'Inventario',
        camadas: 'Camadas',
        genealogia: 'Genealogia',
        'eventos-animal': 'Bitacora animal',
        'eventos-camada': 'Bitacora camada',
        potreros: 'Potreros',
        rotaciones: 'Potreros',
        pesajes: 'Pesajes',
        sanidad: 'Sanidad',
        'plan-sanitario': 'Sanidad',
        reproduccion: 'Reproduccion',
        costos: 'Finanzas',
        finanzas: 'Finanzas',
        ventas: 'Ventas',
        compras: 'Compras',
        reportes: 'Reportes',
        importar: 'Importar',
        'conteo-drone': 'Drone',
        tareas: 'Tareas',
        usuarios: 'Usuarios',
        auth: 'Autenticacion'
    };

    return mapa[modulo] || modulo;
};

const obtenerRecursoId = (req) => req.params?.id
    || req.params?.animalId
    || req.params?.camadaId
    || undefined;

const obtenerEstado = (codigo) => {
    if (codigo === 401 || codigo === 403) return 'Denegado';
    if (codigo >= 400) return 'Fallido';
    return 'Exitoso';
};

const auditoriaPeticiones = (req, res, next) => {
    if (!METODOS_AUDITABLES.has(req.method)) {
        return next();
    }

    const inicio = Date.now();

    res.on('finish', () => {
        const usuario = req.usuario || {};
        const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ');
        const estado = obtenerEstado(res.statusCode);

        Auditoria.create({
            usuario: usuario.id,
            usuarioNombre: nombre || usuario.nombre || '',
            usuarioCorreo: usuario.correo,
            usuarioRol: usuario.rol,
            accion: req.method,
            modulo: obtenerModulo(req.originalUrl),
            metodo: req.method,
            ruta: req.originalUrl,
            recursoTipo: obtenerModulo(req.originalUrl),
            recursoId: obtenerRecursoId(req),
            descripcion: `${req.method} ${req.originalUrl}`,
            datos: sanitizar({
                body: req.body,
                query: req.query,
                duracionMs: Date.now() - inicio
            }),
            ip: req.ip,
            userAgent: truncarTexto(req.get('user-agent'), 300),
            estado,
            codigoRespuesta: res.statusCode,
            error: estado === 'Exitoso' ? undefined : res.statusMessage
        }).catch((error) => {
            console.error('Error registrando auditoria', error.message);
        });
    });

    next();
};

module.exports = {
    auditoriaPeticiones,
    sanitizar
};
