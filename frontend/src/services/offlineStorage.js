const DB_NAME = 'ganaderia-romilio-offline';
const DB_VERSION = 1;

const STORES = {
  tareas: 'tareas',
  inventario: 'inventario',
  gestacion: 'gestacion',
  potreros: 'potreros',
  cambiosPendientes: 'cambiosPendientes'
};

const abrirDB = () => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('IndexedDB no esta disponible en este navegador'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    Object.values(STORES).forEach((storeName) => {
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    });
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const guardarColeccion = async (storeName, items) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    (items || []).forEach((item) => {
      store.put({
        ...item,
        id: item._id || item.id
      });
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

const obtenerColeccion = async (storeName) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const guardarCambio = async (cambio) => {
  const db = await abrirDB();
  const id = cambio.id || `${cambio.tipo}-${cambio.referenciaId}-${Date.now()}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.cambiosPendientes, 'readwrite');
    tx.objectStore(STORES.cambiosPendientes).put({
      ...cambio,
      id,
      creadoEn: cambio.creadoEn || new Date().toISOString()
    });
    tx.oncomplete = () => {
      window.dispatchEvent(new Event('ganaderiaOfflineCambios'));
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
};

const eliminarCambio = async (id) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.cambiosPendientes, 'readwrite');
    tx.objectStore(STORES.cambiosPendientes).delete(id);
    tx.oncomplete = () => {
      window.dispatchEvent(new Event('ganaderiaOfflineCambios'));
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
};

export const guardarTareasOffline = (tareas) => guardarColeccion(STORES.tareas, tareas);
export const obtenerTareasOffline = () => obtenerColeccion(STORES.tareas);

export const guardarInventarioOffline = (animales) => guardarColeccion(STORES.inventario, animales);
export const obtenerInventarioOffline = () => obtenerColeccion(STORES.inventario);

export const guardarGestacionOffline = (registros) => guardarColeccion(STORES.gestacion, registros);
export const obtenerGestacionOffline = () => obtenerColeccion(STORES.gestacion);

export const guardarPotrerosOffline = (potreros) => guardarColeccion(STORES.potreros, potreros);
export const obtenerPotrerosOffline = () => obtenerColeccion(STORES.potreros);

export const guardarCambiosPendientes = (cambio) => guardarCambio(cambio);
export const obtenerCambiosPendientes = () => obtenerColeccion(STORES.cambiosPendientes);

export const limpiarCambiosPendientes = async (ids = []) => {
  if (ids.length === 0) {
    await guardarColeccion(STORES.cambiosPendientes, []);
    window.dispatchEvent(new Event('ganaderiaOfflineCambios'));
    return true;
  }

  await Promise.all(ids.map(eliminarCambio));
  return true;
};
