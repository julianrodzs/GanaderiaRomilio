const CAMPOS_POTRERO = new Set([
    'codigo',
    'nombre',
    'tipoArea',
    'area',
    'capacidadMaxima',
    'ubicacion',
    'ultimaAplicacionHerbicida',
    'ultimaChapia',
    'ultimaFertilizacion',
    'estado',
    'observaciones',
    'responsableCorte'
]);

const CAMPOS_PROGRAMACION = new Set(['fechaPrimerCorte', 'fechaSiembra']);
const CAMPOS_ROTACION = new Set([
    'potrero',
    'lote',
    'loteRef',
    'fechaEntrada',
    'fechaSalida',
    'numeroAnimales',
    'estado',
    'observaciones'
]);
const CAMPOS_PROTEGIDOS = new Set([
    '_id',
    '__v',
    'organizacionId',
    'fincaId',
    'createdAt',
    'updatedAt',
    'diasOcupado',
    'diasDescansoPrevio'
]);

const crearErrorIntegridad = (mensaje, status = 400, codigo = 'DATOS_INVALIDOS') => (
    Object.assign(new Error(mensaje), { status, statusCode: status, codigo })
);

const validarClavesSeguras = (valor, ruta = '') => {
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
        valor.forEach((item, indice) => validarClavesSeguras(item, `${ruta}[${indice}]`));
        return;
    }
    Object.entries(valor).forEach(([clave, contenido]) => {
        if (clave.startsWith('$') || clave.includes('.')) {
            throw crearErrorIntegridad(`El campo ${ruta ? `${ruta}.` : ''}${clave} no esta permitido.`, 400, 'OPERADOR_NO_PERMITIDO');
        }
        validarClavesSeguras(contenido, ruta ? `${ruta}.${clave}` : clave);
    });
};

const sanitizarSegunCampos = (payload = {}, permitidos, extras = new Set()) => {
    validarClavesSeguras(payload);
    const datos = {};
    const adicionales = {};
    Object.entries(payload).forEach(([clave, valor]) => {
        if (CAMPOS_PROTEGIDOS.has(clave)) {
            throw crearErrorIntegridad(`El campo ${clave} es administrado por el sistema.`, 400, 'CAMPO_PROTEGIDO');
        }
        if (permitidos.has(clave)) datos[clave] = valor;
        else if (extras.has(clave)) adicionales[clave] = valor;
        else throw crearErrorIntegridad(`El campo ${clave} no forma parte del contrato permitido.`, 400, 'CAMPO_NO_PERMITIDO');
    });
    return { datos, adicionales };
};

const sanitizarPotrero = (payload = {}) => {
    const { datos, adicionales } = sanitizarSegunCampos(payload, CAMPOS_POTRERO, CAMPOS_PROGRAMACION);
    return { datos, programacion: adicionales };
};

const sanitizarRotacion = (payload = {}, opciones = {}) => {
    const { datos } = sanitizarSegunCampos(payload, CAMPOS_ROTACION);
    if (opciones.aplicarDefaults && datos.estado === undefined) datos.estado = 'Activa';
    return datos;
};

const validarPeriodoRotacion = ({ fechaEntrada, fechaSalida, numeroAnimales }) => {
    const entrada = new Date(fechaEntrada);
    if (!fechaEntrada || Number.isNaN(entrada.getTime())) {
        throw crearErrorIntegridad('La fecha de entrada es obligatoria y debe ser valida.', 400, 'FECHA_ENTRADA_INVALIDA');
    }
    if (fechaSalida) {
        const salida = new Date(fechaSalida);
        if (Number.isNaN(salida.getTime())) {
            throw crearErrorIntegridad('La fecha de salida debe ser valida.', 400, 'FECHA_SALIDA_INVALIDA');
        }
        if (salida < entrada) {
            throw crearErrorIntegridad('La fecha de salida no puede ser anterior a la fecha de entrada.', 400, 'PERIODO_ROTACION_INVALIDO');
        }
    }
    const cantidad = Number(numeroAnimales);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
        throw crearErrorIntegridad('El numero de animales debe ser un entero mayor o igual a uno.', 400, 'CANTIDAD_ANIMALES_INVALIDA');
    }
};

const validarDestinoPastoreo = (potrero) => {
    if (!potrero) throw crearErrorIntegridad('Potrero de destino no encontrado en la finca activa.', 404, 'POTRERO_NO_ENCONTRADO');
    if (potrero.tipoArea !== 'PASTOREO') {
        throw crearErrorIntegridad('Los animales solo pueden ingresar a areas de pastoreo.', 409, 'AREA_NO_APTA_PASTOREO');
    }
    if (['Mantenimiento', 'Inactivo'].includes(potrero.estado)) {
        throw crearErrorIntegridad('El potrero no esta disponible para recibir animales.', 409, 'POTRERO_NO_DISPONIBLE');
    }
    return potrero;
};

module.exports = {
    crearErrorIntegridad,
    sanitizarPotrero,
    sanitizarRotacion,
    validarClavesSeguras,
    validarDestinoPastoreo,
    validarPeriodoRotacion
};
