const Auditoria = require('../models/Auditoria');

const METODOS_AUDITABLES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CAMPOS_SENSIBLES = new Set([
    'contrasena',
    'confirmarContrasena',
    'password',
    'confirmarPassword',
    'token',
    'authorization',
    'resetPasswordToken'
]);

const normalizarClave = (valor = '') => String(valor).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
const CAMPOS_SENSIBLES_NORMALIZADOS = new Set([...CAMPOS_SENSIBLES].map(normalizarClave));
const PATRONES_SENSIBLES = ['contrasena', 'password', 'token', 'secret', 'hash', 'authorization'];

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
            const claveNormalizada = normalizarClave(clave);
            if (CAMPOS_SENSIBLES_NORMALIZADOS.has(claveNormalizada)
                || PATRONES_SENSIBLES.some((patron) => claveNormalizada.includes(patron))) {
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

const sanitizarRuta = (ruta = '') => {
    const [camino, consulta = ''] = String(ruta).split('?');
    if (!consulta) return camino;
    const parametros = new URLSearchParams(consulta);
    for (const clave of parametros.keys()) {
        const claveNormalizada = normalizarClave(clave);
        if (CAMPOS_SENSIBLES_NORMALIZADOS.has(claveNormalizada)
            || PATRONES_SENSIBLES.some((patron) => claveNormalizada.includes(patron))) {
            parametros.set(clave, '[protegido]');
        }
    }
    const consultaSanitizada = parametros.toString();
    return consultaSanitizada ? `${camino}?${consultaSanitizada}` : camino;
};

const obtenerEvento = (req, modulo) => {
    if (req.auditoriaEvento) return req.auditoriaEvento;
    const ruta = String(req.originalUrl || '').split('?')[0];
    if (/\/usuarios\/login$/.test(ruta)) return 'Inicio de sesión';
    if (/recuperar-contrasena$/.test(ruta)) return 'Solicitud de recuperación';
    if (/restablecer-contrasena$/.test(ruta)) return 'Contraseña restablecida';
    if (/invitaciones\/aceptar$/.test(ruta)) return 'Invitación aceptada';
    if (/\/usuarios\/perfil$/.test(ruta) && req.method === 'PUT') return 'Perfil actualizado';
    if (/\/usuarios\/perfil$/.test(ruta) && req.method === 'DELETE') return 'Cuenta anonimizada';
    if (/\/usuarios\/[^/]+\/estado$/.test(ruta)) return 'Estado de membresía actualizado';
    if (/\/usuarios\/[^/]+$/.test(ruta) && req.method === 'PUT') return 'Membresía actualizada';
    if (/\/usuarios\/[^/]+$/.test(ruta) && req.method === 'DELETE') return 'Membresía eliminada';
    if (ruta === '/api/usuarios' && req.method === 'POST') return 'Invitación de usuario enviada';
    if (req.method === 'GET') return `Exportación de ${modulo}`;
    return `${req.method} en ${modulo}`;
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
        admin: 'Administracion SaaS',
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
    const ruta = req.originalUrl || '';
    const esExportacion = req.method === 'GET' && /(?:exportar|exportacion|descargar|download)/i.test(ruta);
    if (!METODOS_AUDITABLES.has(req.method) && !esExportacion) {
        return next();
    }

    const inicio = Date.now();

    res.on('finish', () => {
        const usuario = req.usuario || {};
        const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ');
        const estado = obtenerEstado(res.statusCode);
        const rutaSanitizada = sanitizarRuta(req.originalUrl);
        const modulo = obtenerModulo(rutaSanitizada);

        Auditoria.create({
            organizacionId: req.organizacionId || req.auditoriaOrganizacionId || undefined,
            usuario: usuario.id,
            usuarioNombre: nombre || usuario.nombre || '',
            usuarioCorreo: usuario.correo,
            usuarioRol: usuario.rol,
            accion: req.method,
            evento: obtenerEvento(req, modulo),
            modulo,
            metodo: req.method,
            ruta: rutaSanitizada,
            recursoTipo: modulo,
            recursoId: obtenerRecursoId(req),
            descripcion: `${obtenerEvento(req, modulo)}: ${rutaSanitizada}`,
            datos: sanitizar({
                body: req.body,
                query: req.query,
                antes: req.auditoriaAntes,
                despues: req.auditoriaDespues,
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
    sanitizar,
    sanitizarRuta
};
