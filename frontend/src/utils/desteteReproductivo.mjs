import { claveFechaCalendario } from './fechasCalendario.mjs';

export const prepararCambioDestete = (registro, fecha, motivo) => {
  const anterior = claveFechaCalendario(registro?.fechaDestete);
  if (fecha === anterior) return {};
  if (!fecha || claveFechaCalendario(fecha) !== fecha) throw new Error('Indica una fecha estimada de destete válida.');
  if (!registro?.fechaPartoReal || fecha < claveFechaCalendario(registro.fechaPartoReal)) throw new Error('El destete estimado no puede ser anterior al parto real.');
  if (motivo.trim().length < 3 || motivo.trim().length > 1000) throw new Error('Indica el motivo del cambio de destete (entre 3 y 1000 caracteres).');
  return { fechaDestete: fecha, motivoCambioDestete: motivo.trim() };
};

export const esTareaDesteteBovino = (tarea = {}) => tarea?.moduloOrigen === 'Reproduccion'
  && tarea.especie === 'Bovino' && tarea.claveAutomatica === 'destete' && Boolean(tarea.animal && tarea.referenciaId);

export const AVISO_DESTETE_REAL = 'Al completar esta tarea, la fecha de ejecución se guardará como fecha real de destete en la ficha de la cría vinculada, no la fecha programada. Si ya tiene un destete real registrado, se conservará. Si la tarea solo está vinculada a la madre, registra primero la cría o completa el dato desde Inventario.';
