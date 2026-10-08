const CAMPOS_ANIMAL_PERMITIDOS = Object.freeze([
    'identificadorFinca', 'diio', 'especie', 'categoria', 'objetivoProductivo',
    'etapaProductiva', 'nombre', 'sexo', 'raza', 'razaPrincipal', 'razaSecundaria',
    'grupoRacial', 'gradoRacial', 'variedadRacial', 'descripcionRacial',
    'composicionRacial', 'fraccionRazaPrincipal', 'fraccionRazaSecundaria',
    'madreDiio', 'padreDiio', 'padre', 'madre', 'origenGenealogico',
    'padreExternoNombre', 'madreExternaNombre', 'registroGenealogico',
    'observacionesGenealogicas', 'fechaNacimiento', 'fechaDesteteEstimada',
    'fechaDestete', 'pesoNacimiento', 'pesoDestete', 'pesoActual', 'pesoCompra',
    'pesoVenta', 'precioCompraPorKg', 'precioVentaPorKg', 'montoCompra',
    'montoVenta', 'proveedorCompra', 'camadaOrigen', 'comprador', 'fechaCompra',
    'fechaVenta', 'fechaMuerte', 'estado', 'observaciones'
]);

const CAMPOS_INTERNOS = new Set([
    '_id', '__v', 'organizacionId', 'fincaId', 'compraId', 'ventaId',
    'potreroActual', 'loteActual', 'createdAt', 'updatedAt'
]);

const crearErrorDto = (mensaje, code = 'INVALID_ANIMAL_PAYLOAD') => {
    const error = new Error(mensaje);
    error.status = 422;
    error.code = code;
    return error;
};

const validarClavesSeguras = (valor, ruta = '') => {
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
        valor.forEach((item, indice) => validarClavesSeguras(item, `${ruta}[${indice}]`));
        return;
    }
    Object.entries(valor).forEach(([clave, contenido]) => {
        if (clave.startsWith('$') || clave.includes('.')) {
            throw crearErrorDto(`La clave ${ruta ? `${ruta}.` : ''}${clave} no está permitida.`, 'MONGODB_OPERATOR_NOT_ALLOWED');
        }
        validarClavesSeguras(contenido, ruta ? `${ruta}.${clave}` : clave);
    });
};

const sanitizarAnimal = (payload = {}, { crear = false } = {}) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw crearErrorDto('Los datos del animal deben enviarse como un objeto.');
    }
    validarClavesSeguras(payload);

    const internosRecibidos = Object.keys(payload).filter((campo) => CAMPOS_INTERNOS.has(campo));
    if (internosRecibidos.some((campo) => ['organizacionId', 'fincaId'].includes(campo))) {
        throw crearErrorDto(
            'Este formulario no permite cambiar la organización o la finca. Use Trasladar animales para conservar el historial.',
            'ANIMAL_TENANT_FIELD_NOT_ALLOWED'
        );
    }

    const permitidos = new Set(CAMPOS_ANIMAL_PERMITIDOS);
    if (crear) permitidos.add('estadoSanitario');
    return Object.fromEntries(
        Object.entries(payload).filter(([campo]) => permitidos.has(campo))
    );
};

module.exports = {
    CAMPOS_ANIMAL_PERMITIDOS,
    sanitizarAnimal,
    validarClavesSeguras
};
