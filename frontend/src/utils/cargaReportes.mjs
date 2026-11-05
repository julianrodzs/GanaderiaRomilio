// Una entrada vigente por consulta; las respuestas antiguas nunca sustituyen filtros nuevos.
export function crearCargaReportes(notificar, concurrencia = 4) {
  const cache = new Map();
  let actuales = new Map(), cola = [], ejecutando = 0, habilitada = true;
  const drenar = () => {
    while (habilitada && ejecutando < concurrencia && cola.length) {
      const entrada = cola.shift();
      if (cache.get(entrada.id) !== entrada) continue;
      if (actuales.get(entrada.id)?.firma !== entrada.firma) {
        cache.delete(entrada.id);
        continue;
      }
      ejecutando++;
      Promise.resolve().then(entrada.ejecutar).then(
        (datos) => { entrada.datos = datos; },
        (error) => { entrada.error = error?.status === 403 ? 'UPGRADE' : (error?.message || 'No se pudo cargar este reporte.'); }
      ).finally(() => {
        entrada.cargando = false;
        entrada.actualizadoEn = new Date();
        ejecutando--;
        if (habilitada) { notificar(); drenar(); }
      });
    }
  };
  return {
    actualizar(tareas) {
      habilitada = true;
      actuales = new Map(tareas.map((t) => [t.id, t]));
      for (const tarea of tareas) {
        if (cache.get(tarea.id)?.firma === tarea.firma) continue;
        const entrada = { ...tarea, cargando: true, datos: null, error: '' };
        cache.set(tarea.id, entrada);
        cola.push(entrada);
      }
      drenar();
      notificar();
    },
    leer(tarea) { const entrada = cache.get(tarea.id); return entrada?.firma === tarea.firma ? entrada : null; },
    pausar() { habilitada = false; actuales = new Map(); }
  };
}
