export const crearCacheArchivosProtegidos = ({
  maxEntradas = 150, maxBytes = 50 * 1024 * 1024, vigenciaMs = 5 * 60_000,
  crearUrl = (blob) => URL.createObjectURL(blob), revocarUrl = (url) => URL.revokeObjectURL(url), ahora = Date.now
} = {}) => {
  const entradas = new Map(), pendientes = new Map(), transitorias = new Set();
  let contextoActual = '', bytes = 0;
  const retirar = (entrada) => {
    if (entrada.url) revocarUrl(entrada.url);
    entrada.url = ''; entrada.vigente = false;
    transitorias.delete(entrada);
    if (entradas.get(entrada.clave) === entrada) {
      entradas.delete(entrada.clave); bytes -= entrada.blob.size;
    }
  };
  const limpiar = (ruta) => {
    for (const entrada of [...entradas.values(), ...transitorias]) if (!ruta || entrada.ruta === ruta) retirar(entrada);
    for (const [clave, pendiente] of pendientes) if (!ruta || pendiente.ruta === ruta) {
      pendiente.cancelada = true; pendientes.delete(clave);
    }
    if (!ruta) contextoActual = '';
  };
  const obtener = (contexto, ruta, cargar) => {
    if (!contexto) { limpiar(); return Promise.reject(new Error('No existe una sesion segura para abrir el archivo.')); }
    if (contextoActual !== contexto) { limpiar(); contextoActual = contexto; }
    const clave = JSON.stringify([contexto, ruta]);
    const existente = entradas.get(clave);
    if (existente && ahora() - existente.creadaEn < vigenciaMs) {
      entradas.delete(clave); entradas.set(clave, existente);
      return Promise.resolve(existente);
    }
    if (existente) retirar(existente);
    if (pendientes.has(clave)) return pendientes.get(clave).promesa;
    const pendiente = { ruta, cancelada: false };
    pendiente.promesa = Promise.resolve().then(cargar).then((blob) => {
      if (pendiente.cancelada || contextoActual !== contexto) {
        throw Object.assign(new Error('La sesion, finca o imagen cambio durante la descarga.'), { code: 'REQUEST_CONTEXT_CHANGED' });
      }
      const entrada = { clave, ruta, blob, url: '', usuarios: 0, creadaEn: ahora(), vigente: true, cacheada: blob.size <= maxBytes && maxEntradas > 0 };
      if (entrada.cacheada) {
        entradas.set(clave, entrada); bytes += blob.size;
        while (entradas.size > maxEntradas || bytes > maxBytes) retirar(entradas.values().next().value);
      }
      return entrada;
    }).finally(() => { if (pendientes.get(clave) === pendiente) pendientes.delete(clave); });
    pendientes.set(clave, pendiente);
    return pendiente.promesa;
  };
  return {
    obtener, limpiar,
    obtenerUrl: (entrada) => {
      if (!entrada.vigente) throw new Error('La imagen ya no esta disponible en esta sesion.');
      if (!entrada.url) entrada.url = crearUrl(entrada.blob);
      entrada.usuarios++;
      if (!entrada.cacheada) transitorias.add(entrada);
      return entrada.url;
    },
    liberar: (entrada) => {
      entrada.usuarios = Math.max(entrada.usuarios - 1, 0);
      if (!entrada.cacheada && entrada.usuarios === 0) retirar(entrada);
    },
    estado: () => ({ entradas: entradas.size, bytes, pendientes: pendientes.size })
  };
};

export const cacheArchivosProtegidos = crearCacheArchivosProtegidos();
export const limpiarCacheArchivosProtegidos = (ruta) => cacheArchivosProtegidos.limpiar(
  ruta?.startsWith('/api/') ? ruta.slice(4) : ruta?.startsWith('/uploads/') ? ruta.replace('/uploads/', '/archivos/') : ruta
);

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (evento) => {
    if (evento.key === 'ganaderiaSesion' || evento.key === null) limpiarCacheArchivosProtegidos();
  });
  window.addEventListener('ganaderiaSesionExpirada', () => limpiarCacheArchivosProtegidos());
  window.addEventListener('ganaderiaSesionLimpiada', () => limpiarCacheArchivosProtegidos());
}
