const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '');

const obtenerTokenSesion = () => {
  const sesionGuardada = localStorage.getItem('ganaderiaSesion');
  if (!sesionGuardada) return '';

  try {
    return JSON.parse(sesionGuardada)?.token || '';
  } catch (error) {
    return '';
  }
};

const request = async (ruta, opciones = {}) => {
  if (!API_URL) {
    throw new Error('VITE_API_URL no configurado');
  }

  const esFormData = opciones.body instanceof FormData;
  const token = obtenerTokenSesion();
  const { headers, ...fetchOpciones } = opciones;
  const headersBase = esFormData
    ? { ...(headers || {}) }
    : {
      'Content-Type': 'application/json',
      ...(headers || {})
    };

  if (token) {
    headersBase.Authorization = `Bearer ${token}`;
  }

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    cache: 'no-store',
    ...fetchOpciones,
    headers: headersBase,
  });

  const data = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    if (respuesta.status === 401) {
      localStorage.removeItem('ganaderiaSesion');
      window.dispatchEvent(new Event('ganaderiaSesionExpirada'));
    }

    throw new Error(data.mensaje || 'Error en la solicitud');
  }

  return data;
};

export const loginUsuario = ({ correo, contrasena }) => {
  return request('/usuarios/login', {
    method: 'POST',
    body: JSON.stringify({ correo, contrasena })
  });
};

export const crearUsuario = (usuario) => {
  return request('/usuarios', {
    method: 'POST',
    body: JSON.stringify(usuario)
  });
};

export const obtenerPerfilUsuario = () => request('/usuarios/perfil');

export const previsualizarExcel = (archivo) => {
  const formData = new FormData();
  formData.append('archivo', archivo);

  return request('/importar/excel', {
    method: 'POST',
    body: formData
  });
};

export const importarExcel = (archivo) => {
  const formData = new FormData();
  formData.append('archivo', archivo);

  return request('/importar/excel/importar', {
    method: 'POST',
    body: formData
  });
};

export const confirmarImportacionExcel = (registros) => {
  return request('/importar/excel/confirmar', {
    method: 'POST',
    body: JSON.stringify({ registros })
  });
};

export const obtenerAnimales = () => request('/animales');

export const crearAnimal = (animal) => {
  return request('/animales', {
    method: 'POST',
    body: JSON.stringify(animal)
  });
};

export const actualizarAnimal = (id, animal) => {
  return request(`/animales/${id}`, {
    method: 'PUT',
    body: JSON.stringify(animal)
  });
};

export const eliminarAnimal = (id) => {
  return request(`/animales/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerPotreros = () => request('/potreros');

export const crearPotrero = (potrero) => {
  return request('/potreros', {
    method: 'POST',
    body: JSON.stringify(potrero)
  });
};

export const actualizarPotrero = (id, potrero) => {
  return request(`/potreros/${id}`, {
    method: 'PUT',
    body: JSON.stringify(potrero)
  });
};

export const eliminarPotrero = (id) => {
  return request(`/potreros/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerRotaciones = () => request('/rotaciones');

export const crearRotacion = (rotacion) => {
  return request('/rotaciones', {
    method: 'POST',
    body: JSON.stringify(rotacion)
  });
};

export const actualizarRotacion = (id, rotacion) => {
  return request(`/rotaciones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(rotacion)
  });
};

export const eliminarRotacion = (id) => {
  return request(`/rotaciones/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerPlanesSanitarios = () => request('/plan-sanitario');

export const crearPlanSanitario = (plan) => {
  return request('/plan-sanitario', {
    method: 'POST',
    body: JSON.stringify(plan)
  });
};

export const actualizarPlanSanitario = (id, plan) => {
  return request(`/plan-sanitario/${id}`, {
    method: 'PUT',
    body: JSON.stringify(plan)
  });
};

export const eliminarPlanSanitario = (id) => {
  return request(`/plan-sanitario/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerRegistrosReproductivos = () => request('/reproduccion');

export const crearRegistroReproductivo = (registro) => {
  return request('/reproduccion', {
    method: 'POST',
    body: JSON.stringify(registro)
  });
};

export const actualizarRegistroReproductivo = (id, registro) => {
  return request(`/reproduccion/${id}`, {
    method: 'PUT',
    body: JSON.stringify(registro)
  });
};

export const eliminarRegistroReproductivo = (id) => {
  return request(`/reproduccion/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerRegistrosReproductivosPorAnimal = (animalId) => request(`/reproduccion/animal/${animalId}`);

export const procesarConteoDrone = ({ imagen, potrero, cantidadEsperada, observaciones }) => {
  const formData = new FormData();
  formData.append('imagen', imagen);
  formData.append('potrero', potrero);
  formData.append('cantidadEsperada', cantidadEsperada);
  formData.append('observaciones', observaciones || '');

  return request('/conteo-drone/procesar', {
    method: 'POST',
    body: formData
  });
};

export const obtenerConteosDrone = () => request('/conteo-drone');

export const obtenerMovimientosFinancieros = () => request('/finanzas');

export const obtenerResumenFinanciero = () => request('/finanzas/resumen');

export const obtenerMovimientosPorTipo = (tipoMovimiento) => request(`/finanzas/tipo/${tipoMovimiento}`);

export const crearMovimientoFinanciero = (movimiento) => {
  return request('/finanzas', {
    method: 'POST',
    body: JSON.stringify(movimiento)
  });
};

export const actualizarMovimientoFinanciero = (id, movimiento) => {
  return request(`/finanzas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(movimiento)
  });
};

export const eliminarMovimientoFinanciero = (id) => {
  return request(`/finanzas/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerResumenReportes = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();

  return request(`/reportes/resumen${query ? `?${query}` : ''}`);
};

export { API_URL };
