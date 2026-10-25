const DB_NAME = 'ganaderia-romilio-offline';
const DB_VERSION = 3;
const DB_REGISTRY_KEY = 'ganaderiaOfflineDatabases';

const STORES = {
  tareas: 'tareas',
  inventario: 'inventario',
  potreros: 'potreros',
  eventosAnimal: 'eventosAnimal',
  cambiosPendientes: 'cambiosPendientes',
  metadata: 'metadata'
};

const normalizarId = (valor) => valor?._id?.toString?.() || valor?.toString?.() || '';

const leerRegistroBases = () => {
  try {
    const registro = JSON.parse(localStorage.getItem(DB_REGISTRY_KEY) || '[]');
    return Array.isArray(registro) ? registro : [];
  } catch (error) {
    return [];
  }
};

const registrarBaseOffline = (nombre) => {
  const sesion = obtenerSesionGuardada();
  const usuarioId = normalizarId(sesion?.usuario?._id || sesion?.usuario?.id);
  if (!usuarioId) return;
  const registro = leerRegistroBases();
  if (!registro.some((item) => item.nombre === nombre && item.usuarioId === usuarioId)) {
    localStorage.setItem(DB_REGISTRY_KEY, JSON.stringify([...registro, { nombre, usuarioId }]));
  }
};

const tokenVigente = (token = '') => {
  try {
    const base = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const datos = JSON.parse(atob(base.padEnd(Math.ceil(base.length / 4) * 4, '=')));
    return Boolean(datos.exp && datos.authTime && Date.now() < datos.exp * 1000);
  } catch (error) {
    return false;
  }
};

export const asegurarSesionOfflineVigente = (sesion = obtenerSesionGuardada()) => {
  if (!sesion?.token || !tokenVigente(sesion.token)) {
    window.dispatchEvent(new CustomEvent('ganaderiaSesionExpirada', { detail: { sesion } }));
    throw new Error('La sesión offline expiró. Conéctate e inicia sesión nuevamente.');
  }
  return sesion;
};

const obtenerSesionGuardada = () => {
  try {
    return JSON.parse(localStorage.getItem('ganaderiaSesion') || 'null');
  } catch (error) {
    return null;
  }
};

export const obtenerContextoOffline = (sesion = obtenerSesionGuardada()) => {
  if (sesion?.token) asegurarSesionOfflineVigente(sesion);
  const organizacionId = normalizarId(sesion?.organizacion?._id || sesion?.usuario?.organizacionId);
  const fincaId = normalizarId(
    sesion?.fincaActiva?._id
    || sesion?.finca?._id
    || sesion?.fincaId
    || sesion?.organizacion?.fincaPrincipal?._id
    || sesion?.organizacion?.fincaPrincipal
  ) || 'finca-principal';
  const usuarioId = normalizarId(sesion?.usuario?._id || sesion?.usuario?.id);

  if (!organizacionId || !usuarioId) {
    throw new Error('No existe un contexto seguro para utilizar datos offline.');
  }

  return {
    organizacionId,
    fincaId,
    usuarioId,
    clave: `${organizacionId}:${fincaId}:${usuarioId}`
  };
};

const ordenarObjeto = (valor) => {
  if (Array.isArray(valor)) return valor.map(ordenarObjeto);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.keys(valor).sort().reduce((resultado, clave) => {
    resultado[clave] = ordenarObjeto(valor[clave]);
    return resultado;
  }, {});
};

const serializarVariante = (variante = 'default') => {
  if (typeof variante === 'string') return variante || 'default';
  return JSON.stringify(ordenarObjeto(variante));
};

const abrirDB = () => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('IndexedDB no esta disponible en este navegador'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (evento) => {
    const db = request.result;

    if (evento.oldVersion < 2) {
      // La version inicial no aislaba datos por cliente.
      Array.from(db.objectStoreNames).forEach((storeName) => db.deleteObjectStore(storeName));
    }
    Object.values(STORES).forEach((storeName) => {
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    });
  };

  request.onsuccess = () => {
    registrarBaseOffline(DB_NAME);
    resolve(request.result);
  };
  request.onerror = () => reject(request.error);
});

const ejecutarTransaccion = async (storeName, modo, operacion) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, modo);
    const resultado = operacion(tx.objectStore(storeName));
    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('La operacion offline fue cancelada'));
    };
  });
};

const obtenerRegistro = async (storeName, id) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
};

const obtenerRegistros = async (storeName) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
};

const claveColeccion = (contexto, storeName, variante) => (
  `${contexto.clave}:${storeName}:${serializarVariante(variante)}`
);

const obtenerMetadata = async (contexto) => (
  obtenerRegistro(STORES.metadata, `${contexto.clave}:estado`)
);

const guardarMetadata = async (cambios = {}, sesion, contextoEsperado = null) => {
  const contextoActual = obtenerContextoOffline(sesion);
  if (contextoEsperado && contextoEsperado.clave !== contextoActual.clave) return false;
  const contexto = contextoEsperado || contextoActual;
  const id = `${contexto.clave}:estado`;
  const actual = await obtenerMetadata(contexto);
  await ejecutarTransaccion(STORES.metadata, 'readwrite', (store) => store.put({
    ...(actual || {}),
    ...contexto,
    ...cambios,
    id
  }));
  return true;
};

const guardarColeccion = async (storeName, items, variante = 'default', contextoEsperado = null) => {
  const contextoActual = obtenerContextoOffline();
  if (contextoEsperado && contextoEsperado.clave !== contextoActual.clave) return false;
  const contexto = contextoEsperado || contextoActual;
  const varianteNormalizada = serializarVariante(variante);
  const actualizadoEn = new Date().toISOString();
  await ejecutarTransaccion(storeName, 'readwrite', (store) => store.put({
    id: claveColeccion(contexto, storeName, varianteNormalizada),
    ...contexto,
    variante: varianteNormalizada,
    actualizadoEn,
    items: items || []
  }));
  if (obtenerContextoOffline().clave !== contexto.clave) return false;
  const metadata = await obtenerMetadata(contexto);
  await guardarMetadata({
    recursos: {
      ...(metadata?.recursos || {}),
      [`${storeName}:${varianteNormalizada}`]: actualizadoEn
    }
  }, undefined, contexto);
  return true;
};

const obtenerColeccion = async (storeName, variante = 'default') => {
  const contexto = obtenerContextoOffline();
  const registro = await obtenerRegistro(
    storeName,
    claveColeccion(contexto, storeName, serializarVariante(variante))
  );
  return registro?.items || [];
};

const generarClaveIdempotencia = () => (
  globalThis.crypto?.randomUUID?.()
  || `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const emitirCambio = () => window.dispatchEvent(new Event('ganaderiaOfflineCambios'));

const guardarCambio = async (cambio) => {
  const contexto = obtenerContextoOffline();
  const id = cambio.id || generarClaveIdempotencia();
  const ahora = new Date().toISOString();
  const registro = {
    ...cambio,
    ...contexto,
    id,
    idempotencyKey: cambio.idempotencyKey || id,
    estadoSincronizacion: cambio.estadoSincronizacion || 'Pendiente',
    intentos: cambio.intentos || 0,
    creadoEn: cambio.creadoEn || ahora,
    actualizadoEn: ahora
  };

  await ejecutarTransaccion(STORES.cambiosPendientes, 'readwrite', (store) => store.put(registro));
  emitirCambio();
  return registro;
};

export const actualizarCambioPendiente = async (id, cambios) => {
  const contexto = obtenerContextoOffline();
  const actual = await obtenerRegistro(STORES.cambiosPendientes, id);
  if (!actual || actual.clave !== contexto.clave) return null;

  const actualizado = {
    ...actual,
    ...cambios,
    id: actual.id,
    clave: actual.clave,
    actualizadoEn: new Date().toISOString()
  };
  await ejecutarTransaccion(STORES.cambiosPendientes, 'readwrite', (store) => store.put(actualizado));
  emitirCambio();
  return actualizado;
};

export const eliminarCambioPendiente = async (id) => {
  const contexto = obtenerContextoOffline();
  const actual = await obtenerRegistro(STORES.cambiosPendientes, id);
  if (!actual || actual.clave !== contexto.clave) return false;
  await ejecutarTransaccion(STORES.cambiosPendientes, 'readwrite', (store) => store.delete(id));
  emitirCambio();
  return true;
};

export const guardarTareasOffline = (tareas, opciones = {}) => guardarColeccion(
  STORES.tareas,
  tareas,
  { filtros: opciones.filtros || {} },
  opciones.contexto
);
// Actualizar todas las variantes (agenda, mes y filtros) del mismo contexto.
export const actualizarTareaEnCache = async (tarea) => {
  const contexto = obtenerContextoOffline();
  const registros = await obtenerRegistros(STORES.tareas);
  if (obtenerContextoOffline().clave !== contexto.clave) return;
  await ejecutarTransaccion(STORES.tareas, 'readwrite', (store) => {
    registros.filter((registro) => registro.clave === contexto.clave).forEach((registro) => {
      const items = registro.items.map((item) => item._id === tarea._id ? { ...tarea } : item);
      store.put({ ...registro, items, actualizadoEn: new Date().toISOString() });
    });
  });
};
export const obtenerTareasOffline = (opciones = {}) => obtenerColeccion(
  STORES.tareas,
  { filtros: opciones.filtros || {} }
);

export const guardarInventarioOffline = (animales, opciones = {}) => guardarColeccion(
  STORES.inventario,
  animales,
  { especie: opciones.especie || 'Bovino' },
  opciones.contexto
);
export const obtenerInventarioOffline = (opciones = {}) => obtenerColeccion(
  STORES.inventario,
  { especie: opciones.especie || 'Bovino' }
);

export const guardarPotrerosOffline = (potreros, opciones = {}) => guardarColeccion(STORES.potreros, potreros, 'default', opciones.contexto);
export const obtenerPotrerosOffline = () => obtenerColeccion(STORES.potreros);

export const guardarEventosAnimalOffline = (animalId, eventos, opciones = {}) => guardarColeccion(
  STORES.eventosAnimal,
  eventos,
  { animalId: normalizarId(animalId) },
  opciones.contexto
);
export const obtenerEventosAnimalOffline = (animalId) => obtenerColeccion(
  STORES.eventosAnimal,
  { animalId: normalizarId(animalId) }
);

export const guardarCambiosPendientes = (cambio) => guardarCambio(cambio);

export const obtenerCambiosPendientes = async () => {
  const contexto = obtenerContextoOffline();
  const registros = await obtenerRegistros(STORES.cambiosPendientes);
  return registros
    .filter((registro) => registro.clave === contexto.clave)
    .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
};

export const limpiarCambiosPendientes = async (ids = []) => {
  const cambios = await obtenerCambiosPendientes();
  const idsObjetivo = ids.length ? ids : cambios.map((cambio) => cambio.id);
  await Promise.all(idsObjetivo.map(eliminarCambioPendiente));
  emitirCambio();
  return true;
};

export const registrarResultadoSincronizacion = async (resultado = {}, opciones = {}) => {
  await guardarMetadata({
    ultimaSincronizacion: new Date().toISOString(),
    ultimoResultadoSincronizacion: resultado
  });
  if (opciones.notificar !== false) {
    window.dispatchEvent(new Event('ganaderiaOfflineSincronizado'));
  }
};

export const obtenerEstadoSincronizacionOffline = async () => {
  const contexto = obtenerContextoOffline();
  const registro = await obtenerMetadata(contexto);
  return {
    ultimaSincronizacion: registro?.ultimaSincronizacion || null,
    ultimoResultadoSincronizacion: registro?.ultimoResultadoSincronizacion || null,
    recursos: registro?.recursos || {}
  };
};

const limpiarStorePorContexto = async (storeName, contexto) => {
  const registros = await obtenerRegistros(storeName);
  const ids = registros.filter((registro) => registro.clave === contexto.clave).map((registro) => registro.id);
  if (!ids.length) return;
  await ejecutarTransaccion(storeName, 'readwrite', (store) => ids.forEach((id) => store.delete(id)));
};

export const limpiarDatosOfflineContexto = async (sesion) => {
  const contexto = obtenerContextoOffline(sesion);
  await Promise.all(Object.values(STORES).map((storeName) => limpiarStorePorContexto(storeName, contexto)));
  emitirCambio();
};

const perteneceAUsuario = (registro, usuarioId) => String(registro?.clave || '').split(':').at(-1) === String(usuarioId);

const eliminarBase = (nombre) => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase(nombre);
  request.onsuccess = () => resolve(true);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error(`La base offline ${nombre} está en uso.`));
});

const limpiarBasesHeredadasUsuario = async (usuarioId) => {
  const registro = leerRegistroBases();
  const registradas = registro
    .filter((item) => item.usuarioId === usuarioId && item.nombre !== DB_NAME)
    .map((item) => item.nombre);
  let detectadas = [];
  if (typeof indexedDB.databases === 'function') {
    const bases = await indexedDB.databases();
    detectadas = bases
      .map((base) => base.name)
      .filter((nombre) => nombre && nombre !== DB_NAME && nombre.startsWith(DB_NAME) && nombre.includes(usuarioId));
  }
  await Promise.all([...new Set([...registradas, ...detectadas])].map(eliminarBase));
  localStorage.setItem(
    DB_REGISTRY_KEY,
    JSON.stringify(registro.filter((item) => item.usuarioId !== usuarioId))
  );
};

export const obtenerCambiosPendientesUsuario = async (sesion) => {
  const usuarioId = normalizarId(sesion?.usuario?._id || sesion?.usuario?.id);
  if (!usuarioId) return [];
  const registros = await obtenerRegistros(STORES.cambiosPendientes);
  return registros.filter((registro) => perteneceAUsuario(registro, usuarioId));
};

export const limpiarDatosOfflineUsuario = async (sesion) => {
  const usuarioId = normalizarId(sesion?.usuario?._id || sesion?.usuario?.id);
  if (!usuarioId) return;
  await Promise.all(Object.values(STORES).map(async (storeName) => {
    const registros = await obtenerRegistros(storeName);
    const ids = registros.filter((registro) => perteneceAUsuario(registro, usuarioId)).map((registro) => registro.id);
    if (ids.length) await ejecutarTransaccion(storeName, 'readwrite', (store) => ids.forEach((id) => store.delete(id)));
  }));
  await limpiarBasesHeredadasUsuario(usuarioId);
  if ('caches' in window) {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((nombre) => /ganaderia|api-cache/i.test(nombre)).map((nombre) => caches.delete(nombre)));
  }
  emitirCambio();
};

export const limpiarTodosDatosOffline = () => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    resolve(true);
    return;
  }
  const request = indexedDB.deleteDatabase(DB_NAME);
  request.onsuccess = () => {
    localStorage.removeItem(DB_REGISTRY_KEY);
    resolve(true);
  };
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('No se pudo limpiar el almacenamiento offline porque esta en uso.'));
});

export const limpiarCacheApiLegado = async () => {
  if (!('caches' in window)) return;
  await caches.delete('api-cache');
};
