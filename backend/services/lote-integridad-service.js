const CAMPOS_CREACION = new Set([
    'codigo', 'nombre', 'especie', 'proposito', 'etapaOperativa', 'fechaInicio',
    'descripcion', 'pesoObjetivoKg', 'gmdObjetivoKgDia', 'ubicacionActual', 'animales'
]);
const CAMPOS_ACTUALIZACION = new Set([
    'codigo', 'nombre', 'especie', 'proposito', 'etapaOperativa', 'fechaInicio',
    'descripcion', 'pesoObjetivoKg', 'gmdObjetivoKgDia'
]);
const CAMPOS_TENANT = new Set(['organizacionId', 'fincaId']);
const CAMPOS_INTERNOS = new Set([
    '_id', '__v', 'createdAt', 'updatedAt', 'estado', 'fechaCierre', 'creadoPor',
    'ubicacionActual', 'gmdFinalLote', 'kilosGanadosTotales', 'diasTotalesCiclo',
    'cantidadAnimalesCierre', 'pesoPromedioFinalKg', 'coberturaPesajesFinal',
    'revisionPoblacion'
]);

const errorDto = (mensaje, codigo = 'LOTE_DTO_INVALIDO') => Object.assign(
    new Error(mensaje),
    { status: 422, codigo }
);

const validarClavesSeguras = (valor, ruta = 'body') => {
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
        valor.forEach((item, indice) => validarClavesSeguras(item, `${ruta}[${indice}]`));
        return;
    }
    Object.entries(valor).forEach(([clave, contenido]) => {
        if (clave.startsWith('$') || clave.includes('.')) {
            throw errorDto(`La propiedad ${ruta}.${clave} no está permitida.`, 'LOTE_OPERADOR_MONGO_RECHAZADO');
        }
        if (CAMPOS_TENANT.has(clave)) {
            throw errorDto(`${clave} se obtiene de la sesión y no puede enviarse en el payload.`, 'LOTE_TENANT_RECHAZADO');
        }
        validarClavesSeguras(contenido, `${ruta}.${clave}`);
    });
};

const limpiar = (datos, permitidos) => {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
        throw errorDto('El payload del lote debe ser un objeto.');
    }
    validarClavesSeguras(datos);
    const desconocidos = Object.keys(datos).filter((campo) => !permitidos.has(campo));
    if (desconocidos.length) {
        const protegidos = desconocidos.filter((campo) => CAMPOS_INTERNOS.has(campo));
        throw errorDto(
            protegidos.length
                ? `Campos internos no permitidos: ${protegidos.join(', ')}.`
                : `Campos no permitidos en lotes: ${desconocidos.join(', ')}.`
        );
    }
    return Object.fromEntries(Object.entries(datos).filter(([campo]) => permitidos.has(campo)));
};

const normalizarOpcionales = (datos) => ({
    ...datos,
    ...(Object.hasOwn(datos, 'etapaOperativa') ? { etapaOperativa: datos.etapaOperativa || null } : {}),
    ...(Object.hasOwn(datos, 'descripcion') ? { descripcion: datos.descripcion?.trim() || null } : {}),
    ...(Object.hasOwn(datos, 'pesoObjetivoKg') ? { pesoObjetivoKg: datos.pesoObjetivoKg === '' ? null : datos.pesoObjetivoKg } : {}),
    ...(Object.hasOwn(datos, 'gmdObjetivoKgDia') ? { gmdObjetivoKgDia: datos.gmdObjetivoKgDia === '' ? null : datos.gmdObjetivoKgDia } : {}),
    ...(Object.hasOwn(datos, 'ubicacionActual') ? { ubicacionActual: datos.ubicacionActual || null } : {})
});

const sanitizarCreacionLote = (datos = {}) => normalizarOpcionales(limpiar(datos, CAMPOS_CREACION));
const sanitizarActualizacionLote = (datos = {}) => normalizarOpcionales(limpiar(datos, CAMPOS_ACTUALIZACION));

module.exports = {
    CAMPOS_ACTUALIZACION,
    CAMPOS_CREACION,
    sanitizarActualizacionLote,
    sanitizarCreacionLote,
    validarClavesSeguras
};
