const eliminarPorPrefijos = (storage, prefijos) => {
  if (!storage) return;
  const claves = [];
  for (let i = 0; i < storage.length; i++) {
    const clave = storage.key(i);
    if (prefijos.some((prefijo) => clave?.startsWith(prefijo))) claves.push(clave);
  }
  claves.forEach((clave) => storage.removeItem(clave));
};

export const limpiarDatosSecundariosSesion = (ventana = globalThis.window) => {
  if (!ventana) return;
  // Los almacenes pueden estar bloqueados independientemente (modo privado).
  try { eliminarPorPrefijos(ventana.localStorage, ['ganaderiaApariencia:']); } catch { /* Limpieza de los demas almacenes continua. */ }
  try { eliminarPorPrefijos(ventana.sessionStorage, ['ganaderiaAccion', 'ganaderia-romilio:paginacion:', 'cir:reportes:secciones:']); } catch { /* No bloquear el cierre de sesion. */ }
  ventana.dispatchEvent(new CustomEvent('ganaderiaSesionLimpiada'));
};

export const observarCierreSesion = (alCerrar, ventana = globalThis.window) => {
  if (!ventana) return () => {};
  const alCambiar = (evento) => {
    if (evento.storageArea && evento.storageArea !== ventana.localStorage) return;
    if (evento.key !== 'ganaderiaSesion' && evento.key !== null) return;
    // No cerrar una sesion nueva por un evento de logout antiguo encolado.
    if (ventana.localStorage.getItem('ganaderiaSesion')) return;
    let anterior = null;
    try { anterior = JSON.parse(evento.oldValue || 'null'); } catch { /* Contexto corrupto. */ }
    limpiarDatosSecundariosSesion(ventana);
    alCerrar(anterior);
  };
  ventana.addEventListener('storage', alCambiar);
  return () => ventana.removeEventListener('storage', alCambiar);
};
