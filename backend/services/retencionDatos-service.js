const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_NOTIFICACIONES = 90;
const DIAS_ALERTAS_CORREO = 120;
const DIAS_PURGA_PREVIEW = 7;
const DIAS_PURGA_INVITACION = 30;
const ESTADOS_IMPORTACION_TEMPORAL = ['Pendiente', 'Con errores', 'Expirada', 'Fallida'];
const ESTADOS_INVITACION_TEMPORAL = ['Pendiente', 'Revocada', 'Expirada'];
const despuesDeDias = (fecha, dias) => new Date(new Date(fecha).getTime() + dias * DIA_MS);
const limpiarPayloadImportacion = () => ({ registros: '', errores: '' });

module.exports = { DIA_MS, DIAS_NOTIFICACIONES, DIAS_ALERTAS_CORREO, DIAS_PURGA_PREVIEW,
    DIAS_PURGA_INVITACION, ESTADOS_IMPORTACION_TEMPORAL, ESTADOS_INVITACION_TEMPORAL,
    despuesDeDias, limpiarPayloadImportacion };
