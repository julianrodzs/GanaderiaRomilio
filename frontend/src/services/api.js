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

    throw new Error(data.mensaje || data.message || 'Error en la solicitud');
  }

  return data;
};

export const loginUsuario = ({ correo, contrasena }) => {
  return request('/usuarios/login', {
    method: 'POST',
    body: JSON.stringify({ correo, contrasena })
  });
};

export const solicitarRecuperacionPassword = (correo) => {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ correo })
  });
};

export const restablecerPassword = ({ token, password }) => {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password })
  });
};

export const crearUsuario = (usuario) => {
  return request('/usuarios', {
    method: 'POST',
    body: JSON.stringify(usuario)
  });
};

export const obtenerPerfilUsuario = () => request('/usuarios/perfil');

export const obtenerUsuarios = () => request('/usuarios');

export const actualizarUsuario = (id, usuario) => {
  return request(`/usuarios/${id}`, {
    method: 'PUT',
    body: JSON.stringify(usuario)
  });
};

export const cambiarEstadoUsuario = (id, estado) => {
  return request(`/usuarios/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado })
  });
};

export const eliminarUsuario = (id) => {
  return request(`/usuarios/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerTareas = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/tareas${query ? `?${query}` : ''}`);
};

export const obtenerMisTareas = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/tareas/mis-tareas${query ? `?${query}` : ''}`);
};

export const crearTarea = (tarea) => {
  return request('/tareas', {
    method: 'POST',
    body: JSON.stringify(tarea)
  });
};

export const actualizarTarea = (id, tarea) => {
  return request(`/tareas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(tarea)
  });
};

export const cambiarEstadoTarea = (id, estado) => {
  return request(`/tareas/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado })
  });
};

export const completarTarea = ({ id, observaciones, evidencia }) => {
  const formData = new FormData();
  if (observaciones) formData.append('observaciones', observaciones);
  if (evidencia) formData.append('evidencia', evidencia);

  return request(`/tareas/${id}/completar`, {
    method: 'PATCH',
    body: formData
  });
};

export const agregarComentarioTarea = (id, texto) => {
  return request(`/tareas/${id}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ texto })
  });
};

export const eliminarTarea = (id) => {
  return request(`/tareas/${id}`, {
    method: 'DELETE'
  });
};

export const previsualizarExcel = (archivo, modulos = []) => {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (modulos.length > 0) {
    formData.append('modulos', JSON.stringify(modulos));
  }

  return request('/importar/excel', {
    method: 'POST',
    body: formData
  });
};

export const importarExcel = (archivo, modulos = []) => {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (modulos.length > 0) {
    formData.append('modulos', JSON.stringify(modulos));
  }

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

export const actualizarGenealogiaAnimal = (id, genealogia) => {
  return request(`/animales/${id}/genealogia`, {
    method: 'PUT',
    body: JSON.stringify(genealogia)
  });
};

export const obtenerArbolGenealogico = (animalId, generaciones = 3) => {
  return request(`/genealogia/animal/${animalId}/arbol?generaciones=${generaciones}`);
};

export const obtenerDescendenciaAnimal = (animalId) => {
  return request(`/genealogia/animal/${animalId}/descendencia`);
};

export const obtenerParentesco = ({ animalA, animalB }) => {
  const params = new URLSearchParams();
  if (animalA) params.append('animalA', animalA);
  if (animalB) params.append('animalB', animalB);
  return request(`/genealogia/parentesco?${params.toString()}`);
};

export const evaluarRiesgoCruce = ({ macho, hembra }) => {
  const params = new URLSearchParams();
  if (macho) params.append('macho', macho);
  if (hembra) params.append('hembra', hembra);
  return request(`/genealogia/riesgo-cruce?${params.toString()}`);
};

export const obtenerPesajes = () => request('/pesajes');

export const obtenerPesajesPorAnimal = (animalId) => request(`/pesajes/animal/${animalId}`);

export const crearPesaje = (pesaje) => {
  return request('/pesajes', {
    method: 'POST',
    body: JSON.stringify(pesaje)
  });
};

export const actualizarPesaje = (id, pesaje) => {
  return request(`/pesajes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(pesaje)
  });
};

export const eliminarPesaje = (id) => {
  return request(`/pesajes/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerEventosAnimal = (animalId) => request(`/eventos-animal/animal/${animalId}`);

export const crearEventoAnimal = (evento) => {
  return request('/eventos-animal', {
    method: 'POST',
    body: JSON.stringify(evento)
  });
};

export const actualizarEventoAnimal = (id, evento) => {
  return request(`/eventos-animal/${id}`, {
    method: 'PUT',
    body: JSON.stringify(evento)
  });
};

export const eliminarEventoAnimal = (id) => {
  return request(`/eventos-animal/${id}`, {
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

export const registrarTerneroDesdeParto = (registroId, ternero) => {
  return request(`/reproduccion/${registroId}/ternero`, {
    method: 'POST',
    body: JSON.stringify(ternero)
  });
};

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

const crearFormDataVenta = (venta) => {
  const formData = new FormData();
  Object.entries(venta).forEach(([clave, valor]) => {
    if (clave === 'comprobante') return;
    if (clave === 'animales') {
      formData.append(clave, JSON.stringify(valor || []));
      return;
    }
    if (valor !== undefined && valor !== null) {
      formData.append(clave, valor);
    }
  });
  if (venta.comprobante) formData.append('comprobante', venta.comprobante);
  return formData;
};

export const obtenerVentas = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/ventas${query ? `?${query}` : ''}`);
};

export const obtenerResumenVentas = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();
  return request(`/ventas/resumen${query ? `?${query}` : ''}`);
};

export const crearVentaAnimal = (venta) => {
  return request('/ventas', {
    method: 'POST',
    body: crearFormDataVenta(venta)
  });
};

export const actualizarVentaAnimal = (id, venta) => {
  return request(`/ventas/${id}`, {
    method: 'PUT',
    body: crearFormDataVenta(venta)
  });
};

export const anularVentaAnimal = (id, motivoAnulacion = '') => {
  return request(`/ventas/${id}/anular`, {
    method: 'PATCH',
    body: JSON.stringify({ motivoAnulacion })
  });
};

export const eliminarVentaAnimal = (id) => {
  return request(`/ventas/${id}`, {
    method: 'DELETE'
  });
};

const crearFormDataCompra = (compra) => {
  const formData = new FormData();
  Object.entries(compra).forEach(([clave, valor]) => {
    if (clave === 'comprobante') return;
    if (clave === 'animales') {
      formData.append(clave, JSON.stringify(valor || []));
      return;
    }
    if (valor !== undefined && valor !== null) {
      formData.append(clave, valor);
    }
  });
  if (compra.comprobante) formData.append('comprobante', compra.comprobante);
  return formData;
};

export const obtenerCompras = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/compras${query ? `?${query}` : ''}`);
};

export const obtenerResumenCompras = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();
  return request(`/compras/resumen${query ? `?${query}` : ''}`);
};

export const crearCompraAnimal = (compra) => {
  return request('/compras', {
    method: 'POST',
    body: crearFormDataCompra(compra)
  });
};

export const actualizarCompraAnimal = (id, compra) => {
  return request(`/compras/${id}`, {
    method: 'PUT',
    body: crearFormDataCompra(compra)
  });
};

export const anularCompraAnimal = (id, motivoAnulacion = '') => {
  return request(`/compras/${id}/anular`, {
    method: 'PATCH',
    body: JSON.stringify({ motivoAnulacion })
  });
};

export const eliminarCompraAnimal = (id) => {
  return request(`/compras/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerResumenReportes = ({ fechaInicio, fechaFin, diio } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (diio) params.append('diio', diio);
  const query = params.toString();

  return request(`/reportes/resumen${query ? `?${query}` : ''}`);
};

export const obtenerProductividadCria = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();

  return request(`/reportes/productividad${query ? `?${query}` : ''}`);
};

export const obtenerFinanzasCria = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();

  return request(`/reportes/finanzas-cria${query ? `?${query}` : ''}`);
};

export const obtenerSustentabilidadCria = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();

  return request(`/reportes/sustentabilidad-cria${query ? `?${query}` : ''}`);
};

export const obtenerVacasImproductivas = ({
  fechaInicio,
  fechaFin,
  diio,
  mesesSinParto,
  diasAbiertos,
  pesoDesteteMin
} = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (diio) params.append('diio', diio);
  if (mesesSinParto) params.append('mesesSinParto', mesesSinParto);
  if (diasAbiertos) params.append('diasAbiertos', diasAbiertos);
  if (pesoDesteteMin) params.append('pesoDesteteMin', pesoDesteteMin);
  const query = params.toString();

  return request(`/reportes/vacas-improductivas${query ? `?${query}` : ''}`);
};

export const obtenerReporteCrecimientoPesajes = ({ fechaInicio, fechaFin, animalId, diasSinPesaje } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (animalId) params.append('animalId', animalId);
  if (diasSinPesaje) params.append('diasSinPesaje', diasSinPesaje);
  const query = params.toString();

  return request(`/reportes/crecimiento-pesajes${query ? `?${query}` : ''}`);
};

export { API_URL };
