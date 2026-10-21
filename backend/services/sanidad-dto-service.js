const CAMPOS_TENANT = new Set(['organizacionId', 'fincaId']);

const CAMPOS_PLAN = [
    'grupoGanado', 'especie', 'lote', 'animales', 'animalDiio', 'actividad', 'producto',
    'marca', 'dosis', 'viaAplicacion', 'criterioPeso', 'fechaAplicacion',
    'frecuenciaCantidad', 'frecuenciaUnidad', 'responsable', 'asignadoA', 'observaciones'
];
const CAMPOS_TRATAMIENTO = [
    'animales', 'especie', 'lote', 'motivo', 'diagnostico', 'producto', 'dosis',
    'viaAplicacion', 'diasRetiroCarne', 'fechaInicio', 'cantidadAplicaciones',
    'intervaloDias', 'responsable', 'veterinario', 'asignadoA', 'observaciones',
    'registrarPrimeraAplicacion', 'fechaPrimeraAplicacion', 'observacionesPrimeraAplicacion',
    'actualizarEstadoSanitario', 'estadoSanitario', 'motivoCambioEstadoSanitario'
];
const CAMPOS_APLICACION = [
    'animales', 'especie', 'lote', 'fechaAplicacion', 'producto', 'tipo', 'dosis',
    'viaAplicacion', 'diasRetiroCarne', 'responsableUsuario', 'motivo', 'observaciones',
    'estadoSanitarioFinal', 'motivoCambioEstadoSanitario'
];
const CAMPOS_CIERRE = [
    'fechaFin', 'observaciones', 'motivo', 'estadoSanitarioFinal', 'motivoCambioEstadoSanitario'
];
const CAMPOS_REGISTRO_LEGADO = [
    'animal', 'fecha', 'tipo', 'producto', 'dosis', 'viaAplicacion', 'responsable',
    'proximaAplicacion', 'observaciones'
];

const crearErrorPayload = (mensaje) => {
    const error = new Error(mensaje);
    error.status = 400;
    error.code = 'SANIDAD_PAYLOAD_INVALIDO';
    return error;
};

const validarEstructuraSegura = (valor, ruta = 'payload') => {
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
        valor.forEach((item, indice) => validarEstructuraSegura(item, `${ruta}[${indice}]`));
        return;
    }

    for (const [clave, contenido] of Object.entries(valor)) {
        if (clave.startsWith('$') || clave.includes('.')) {
            throw crearErrorPayload(`La llave ${ruta}.${clave} no está permitida`);
        }
        if (CAMPOS_TENANT.has(clave)) {
            throw crearErrorPayload(`${clave} se obtiene de la sesión y no puede enviarse en el payload`);
        }
        validarEstructuraSegura(contenido, `${ruta}.${clave}`);
    }
};

const sanitizar = (datos, camposPermitidos) => {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
        throw crearErrorPayload('El payload sanitario debe ser un objeto');
    }
    validarEstructuraSegura(datos);
    const permitidos = new Set(camposPermitidos);
    const desconocidos = Object.keys(datos || {}).filter((campo) => !permitidos.has(campo));
    if (desconocidos.length) {
        throw crearErrorPayload(`Campos no permitidos: ${desconocidos.join(', ')}`);
    }
    return Object.fromEntries(
        Object.entries(datos || {}).filter(([campo]) => permitidos.has(campo))
    );
};

module.exports = {
    sanitizarAplicacionSanitaria: (datos) => sanitizar(datos, CAMPOS_APLICACION),
    sanitizarCierreTratamiento: (datos) => sanitizar(datos, CAMPOS_CIERRE),
    sanitizarPlanSanitario: (datos) => sanitizar(datos, CAMPOS_PLAN),
    sanitizarRegistroSanitario: (datos) => sanitizar(datos, CAMPOS_REGISTRO_LEGADO),
    sanitizarTratamientoSanitario: (datos) => sanitizar(datos, CAMPOS_TRATAMIENTO),
    validarEstructuraSegura
};
