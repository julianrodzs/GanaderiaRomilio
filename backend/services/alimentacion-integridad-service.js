const CAMPOS_TENANT = new Set(['organizacionId', 'fincaId']);
const CAMPOS_LECTURA = new Set(['_id', '__v', 'createdAt', 'updatedAt']);

const crearError = (mensaje, status = 400, codigo = 'PAYLOAD_INVALIDO') => Object.assign(
    new Error(mensaje),
    { status, codigo }
);

const validarClavesSeguras = (valor, ruta = 'payload') => {
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
        valor.forEach((item, indice) => validarClavesSeguras(item, `${ruta}[${indice}]`));
        return;
    }
    Object.entries(valor).forEach(([clave, contenido]) => {
        if (clave.startsWith('$') || clave.includes('.')) {
            throw crearError(`La clave ${ruta}.${clave} no está permitida.`, 400, 'OPERADOR_NO_PERMITIDO');
        }
        if (CAMPOS_TENANT.has(clave)) {
            throw crearError('La organización y la finca se obtienen de la sesión autenticada.', 403, 'TENANT_NO_EDITABLE');
        }
        validarClavesSeguras(contenido, `${ruta}.${clave}`);
    });
};

const copiarPermitidos = (datos = {}, permitidos = []) => {
    validarClavesSeguras(datos);
    const permitidosSet = new Set(permitidos);
    const desconocidos = Object.keys(datos).filter((clave) => !permitidosSet.has(clave) && !CAMPOS_LECTURA.has(clave));
    if (desconocidos.length) {
        throw crearError(`Campos no permitidos: ${desconocidos.join(', ')}.`, 400, 'CAMPOS_NO_PERMITIDOS');
    }
    return Object.fromEntries(Object.entries(datos).filter(([clave]) => permitidosSet.has(clave) && datos[clave] !== undefined));
};

const sanitizarPresentacion = (item = {}) => copiarPermitidos(
    item,
    ['_id', 'nombre', 'unidad', 'cantidadBaseKg', 'estimada', 'activo']
);

const sanitizarAlimento = (datos = {}) => {
    const limpio = copiarPermitidos(datos, [
        'nombre', 'tipo', 'catalogoPasto', 'descripcion', 'activo', 'presentaciones', 'metadataNutricional'
    ]);
    if (limpio.presentaciones) limpio.presentaciones = limpio.presentaciones.map(sanitizarPresentacion);
    return limpio;
};

const sanitizarComponenteRacion = (item = {}) => copiarPermitidos(
    item,
    ['_id', 'alimento', 'cantidad', 'unidad', 'presentacion', 'baseCalculo', 'observaciones']
);

const sanitizarRacion = (datos = {}) => {
    const limpio = copiarPermitidos(datos, [
        'nombre', 'descripcion', 'especie', 'proposito', 'etapa', 'planAlimentacion',
        'detalles', 'activo', 'observaciones'
    ]);
    if (limpio.detalles) limpio.detalles = limpio.detalles.map(sanitizarComponenteRacion);
    return limpio;
};

const sanitizarPlanAlimentacion = (datos = {}) => copiarPermitidos(datos, [
    'nombre', 'descripcion', 'especie', 'proposito', 'etapa', 'tipoManejoAlimenticio',
    'vigenciaInicio', 'vigenciaFin', 'activo', 'observaciones', 'lotes', 'confirmarDesactivacion'
]);

const validarVigenciaPlanAlimentacion = (datos = {}, actual = {}) => {
    const inicio = datos.vigenciaInicio === undefined ? actual.vigenciaInicio : datos.vigenciaInicio;
    const fin = datos.vigenciaFin === undefined ? actual.vigenciaFin : datos.vigenciaFin;
    if ((inicio && Number.isNaN(new Date(inicio).getTime())) || (fin && Number.isNaN(new Date(fin).getTime()))) {
        throw crearError('La vigencia del plan contiene una fecha inválida.', 400, 'VIGENCIA_INVALIDA');
    }
    if (inicio && fin && new Date(fin) < new Date(inicio)) {
        throw crearError('La fecha final del plan no puede ser anterior a la fecha inicial.', 400, 'VIGENCIA_INVALIDA');
    }
};

const sanitizarDetalleSuministro = (item = {}) => copiarPermitidos(item, [
    '_id', 'alimento', 'cantidadIngresada', 'unidadIngresada', 'presentacionId',
    'factorConversionKg', 'tipoMedicion', 'sobranteKg', 'origenTipo',
    'origenReferenciaId', 'observaciones'
]);

const sanitizarSuministro = (datos = {}, { actualizacion = false } = {}) => {
    const permitidos = actualizacion
        ? ['fechaHora', 'detalles', 'observaciones', 'motivoCorreccion']
        : ['lote', 'fechaHora', 'racion', 'detalles', 'responsable', 'observaciones', 'claveIdempotencia'];
    const limpio = copiarPermitidos(datos, permitidos);
    if (limpio.detalles) limpio.detalles = limpio.detalles.map(sanitizarDetalleSuministro);
    return limpio;
};

const sanitizarAsignacion = (datos = {}, { multiple = false } = {}) => copiarPermitidos(
    datos,
    multiple ? ['lotes', 'fechaInicio', 'observaciones'] : ['racion', 'plan', 'fechaInicio', 'observaciones']
);

module.exports = {
    copiarPermitidos,
    sanitizarAlimento,
    sanitizarAsignacion,
    sanitizarPlanAlimentacion,
    sanitizarRacion,
    sanitizarSuministro,
    validarVigenciaPlanAlimentacion,
    validarClavesSeguras
};
