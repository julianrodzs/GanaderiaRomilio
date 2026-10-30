const CAMPOS_MOVIMIENTO_MANUAL = Object.freeze([
    'fecha', 'tipoMovimiento', 'naturaleza', 'categoria', 'descripcion',
    'producto', 'cantidad', 'unidad', 'precioUnitario', 'destinoUso',
    'monto', 'moneda',
    'metodoPago', 'proveedor', 'empleado', 'finca', 'potrero', 'animal',
    'observaciones'
]);

const CATEGORIAS_SIMPLIFICADAS = Object.freeze({
    Planilla: 'Mano de Obra / Jornales',
    Inversion: 'Inversiones / Infraestructura'
});

const CAMPOS_INTERNOS = new Set([
    '_id', '__v', 'organizacionId', 'fincaId', 'categoriaNormalizada',
    'unidadNormalizada', 'factorUnidad', 'cantidadFisica', 'precioUnitarioFisico',
    'referenciaId', 'referenciaModelo', 'alcanceFinanciero', 'grupoConsolidacion',
    'fincaContraparte', 'excluirConsolidacion', 'porcentajeDistribucion',
    'createdAt', 'updatedAt'
]);

const CAMPOS_TENANT = new Set(['organizacionId', 'fincaId']);
const CAMPOS_ORIGEN = new Set([
    'referenciaId', 'referenciaModelo', 'alcanceFinanciero', 'grupoConsolidacion',
    'fincaContraparte', 'excluirConsolidacion', 'porcentajeDistribucion'
]);

const crearErrorDto = (mensaje, code = 'INVALID_FINANCIAL_PAYLOAD') => Object.assign(new Error(mensaje), {
    status: 422,
    code
});

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

const sanitizarMovimientoManual = (payload = {}) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw crearErrorDto('Los datos del movimiento deben enviarse como un objeto.');
    }
    validarClavesSeguras(payload);
    if (payload.tipoMovimiento === 'Venta de pajillas') {
        throw crearErrorDto('Las ventas de pajillas se registran desde Ventas para conciliar existencias e ingreso.', 'FINANCIAL_ORIGIN_REQUIRED');
    }

    const recibidos = Object.keys(payload);
    if (recibidos.some((campo) => CAMPOS_TENANT.has(campo))) {
        throw crearErrorDto(
            'La organización y la finca del movimiento se obtienen de la sesión autenticada.',
            'FINANCIAL_TENANT_FIELD_NOT_ALLOWED'
        );
    }
    if (recibidos.some((campo) => CAMPOS_ORIGEN.has(campo))) {
        throw crearErrorDto(
            'El origen y los campos de consolidación no pueden modificarse desde el registro manual de Finanzas.',
            'FINANCIAL_ORIGIN_FIELD_NOT_ALLOWED'
        );
    }

    const permitidos = new Set(CAMPOS_MOVIMIENTO_MANUAL);
    const sanitizado = Object.fromEntries(
        Object.entries(payload).filter(([campo]) => permitidos.has(campo) && !CAMPOS_INTERNOS.has(campo))
    );
    if (CATEGORIAS_SIMPLIFICADAS[sanitizado.tipoMovimiento]) {
        sanitizado.naturaleza = 'Egreso';
        sanitizado.categoria = sanitizado.categoria || CATEGORIAS_SIMPLIFICADAS[sanitizado.tipoMovimiento];
    }
    return sanitizado;
};

module.exports = {
    CAMPOS_MOVIMIENTO_MANUAL,
    CATEGORIAS_SIMPLIFICADAS,
    sanitizarMovimientoManual,
    validarClavesSeguras
};
