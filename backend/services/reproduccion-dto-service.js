const CAMPOS_COMUNES = [
    'animal',
    'asignadoA',
    'especie',
    'diasDestetePorcino',
    'diasCeloPostDestetePorcino',
    'tipoRegistro',
    'tipoInseminacion',
    'semenUtilizado',
    'semen',
    'cantidadPajuelas',
    'monedaSemen',
    'destinoCrias',
    'cantidadCriasEstimada',
    'cantidadCrias',
    'fechaInseminacion',
    'fechaMonta',
    'fechaPartoEstimada',
    'fechaPartoReal',
    'fechaProximoCelo',
    'fechaDestete',
    'observaciones'
];

const CAMPOS_CREACION = new Set([...CAMPOS_COMUNES, 'cerrarCicloAnterior']);
const CAMPOS_ACTUALIZACION = new Set(CAMPOS_COMUNES);

const errorDto = (mensaje, code = 'REPRODUCCION_DTO_INVALIDO') => Object.assign(
    new Error(mensaje),
    { status: 422, code }
);

const validarClavesMongo = (valor, ruta = 'body') => {
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
        valor.forEach((item, indice) => validarClavesMongo(item, `${ruta}[${indice}]`));
        return;
    }

    Object.entries(valor).forEach(([clave, contenido]) => {
        if (clave.startsWith('$') || clave.includes('.')) {
            throw errorDto(`La propiedad ${ruta}.${clave} no está permitida.`, 'REPRODUCCION_OPERADOR_MONGO_RECHAZADO');
        }
        validarClavesMongo(contenido, `${ruta}.${clave}`);
    });
};

const limpiarDto = (datos, permitidos) => {
    validarClavesMongo(datos);
    const recibidos = Object.keys(datos || {});
    const desconocidos = recibidos.filter((campo) => !permitidos.has(campo));
    if (desconocidos.length) {
        throw errorDto(`Campos no permitidos en reproducción: ${desconocidos.join(', ')}.`);
    }
    return Object.fromEntries(recibidos.map((campo) => [campo, datos[campo]]));
};

const limpiarCrearRegistroReproductivo = (datos = {}) => limpiarDto(datos, CAMPOS_CREACION);
const limpiarActualizarRegistroReproductivo = (datos = {}) => limpiarDto(datos, CAMPOS_ACTUALIZACION);

module.exports = {
    CAMPOS_ACTUALIZACION,
    CAMPOS_CREACION,
    limpiarActualizarRegistroReproductivo,
    limpiarCrearRegistroReproductivo,
    validarClavesMongo
};
