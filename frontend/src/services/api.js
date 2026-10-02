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
      const sesionGuardada = localStorage.getItem('ganaderiaSesion');
      let sesion = null;
      try {
        sesion = JSON.parse(sesionGuardada || 'null');
      } catch (error) {
        sesion = null;
      }
      window.dispatchEvent(new CustomEvent('ganaderiaSesionExpirada', { detail: { sesion } }));
      localStorage.removeItem('ganaderiaSesion');
    }

    const error = new Error(data.mensaje || data.message || 'Error en la solicitud');
    error.status = respuesta.status;
    error.data = data;
    throw error;
  }

  return data;
};

export const obtenerArchivoProtegido = async (ruta) => {
  if (!ruta) throw new Error('Ruta de archivo requerida');
  const token = obtenerTokenSesion();
  const rutaProtegida = ruta.startsWith('/uploads/')
    ? ruta.replace('/uploads/', '/archivos/')
    : ruta;
  const rutaApi = rutaProtegida.startsWith('/api/') ? rutaProtegida.slice(4) : rutaProtegida;
  const respuesta = await fetch(`${API_URL}${rutaApi}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!respuesta.ok) {
    const data = await respuesta.json().catch(() => ({}));
    throw new Error(data.mensaje || 'No se pudo abrir el archivo');
  }

  return respuesta.blob();
};

export const abrirArchivoProtegido = async (ruta) => {
  const ventana = window.open('about:blank', '_blank');
  if (ventana) ventana.opener = null;
  try {
    const blob = await obtenerArchivoProtegido(ruta);
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    if (ventana) ventana.close();
    throw error;
  }
};

export const obtenerPlanActual = () => request('/plan/actual');

export const obtenerLotes = (filtros = {}) => request(`/lotes${construirQuery(filtros)}`);
export const obtenerLote = (id) => request(`/lotes/${id}`);
export const crearLote = (datos) => request('/lotes', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarLote = (id, datos) => request(`/lotes/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const agregarAnimalesLote = (id, datos) => request(`/lotes/${id}/animales`, { method: 'POST', body: JSON.stringify(datos) });
export const moverAnimalesLote = (id, datos) => request(`/lotes/${id}/mover-animales`, { method: 'POST', body: JSON.stringify(datos) });
export const retirarAnimalesLote = (id, datos) => request(`/lotes/${id}/retirar-animales`, { method: 'POST', body: JSON.stringify(datos) });
export const cerrarLote = (id, datos) => request(`/lotes/${id}/cerrar`, { method: 'POST', body: JSON.stringify(datos) });
export const cambiarEtapaLote = (id, datos) => request(`/lotes/${id}/etapa`, { method: 'PATCH', body: JSON.stringify(datos) });
export const registrarPesajesLote = (id, datos) => request(`/lotes/${id}/pesajes`, { method: 'POST', body: JSON.stringify(datos) });
export const programarTareaLote = (id, datos) => request(`/lotes/${id}/tareas`, { method: 'POST', body: JSON.stringify(datos) });
export const cambiarPotreroLote = (id, datos) => request(`/lotes/${id}/cambiar-potrero`, { method: 'POST', body: JSON.stringify(datos) });
export const obtenerHistorialLote = (id) => request(`/lotes/${id}/historial`);
export const obtenerPlanActualLote = (id) => request(`/lotes/${id}/plan-alimentacion`);
export const asignarPlanLote = (id, datos) => request(`/lotes/${id}/plan-alimentacion`, { method: 'POST', body: JSON.stringify(datos) });
export const obtenerHistorialAlimentacionLote = (id) => request(`/lotes/${id}/historial-alimentacion`);

export const obtenerPlanesAlimentacion = (filtros = {}) => request(`/alimentacion/planes${construirQuery(filtros)}`);
export const obtenerPlanAlimentacion = (id) => request(`/alimentacion/planes/${id}`);
export const crearPlanAlimentacion = (datos) => request('/alimentacion/planes', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarPlanAlimentacion = (id, datos) => request(`/alimentacion/planes/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const asignarLotesPlanAlimentacion = (id, datos) => request(`/alimentacion/planes/${id}/asignar-lotes`, { method: 'POST', body: JSON.stringify(datos) });
export const obtenerAlimentos = (filtros = {}) => request(`/alimentacion/alimentos${construirQuery(filtros)}`);
export const crearAlimento = (datos) => request('/alimentacion/alimentos', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarAlimento = (id, datos) => request(`/alimentacion/alimentos/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const obtenerRaciones = (filtros = {}) => request(`/alimentacion/raciones${construirQuery(filtros)}`);
export const obtenerRacion = (id) => request(`/alimentacion/raciones/${id}`);
export const crearRacion = (datos) => request('/alimentacion/raciones', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarRacion = (id, datos) => request(`/alimentacion/raciones/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const obtenerRacionLote = (id) => request(`/lotes/${id}/racion`);
export const asignarRacionLote = (id, datos) => request(`/lotes/${id}/racion`, { method: 'POST', body: JSON.stringify(datos) });
export const obtenerHistorialRacionesLote = (id) => request(`/lotes/${id}/historial-raciones`);
export const obtenerSuministrosAlimentacion = (filtros = {}) => request(`/alimentacion/suministros${construirQuery(filtros)}`);
export const obtenerSuministroAlimentacion = (id) => request(`/alimentacion/suministros/${id}`);
export const crearSuministroAlimentacion = (datos) => request('/alimentacion/suministros', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarSuministroAlimentacion = (id, datos) => request(`/alimentacion/suministros/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const obtenerCortesAlimentacion = () => request('/alimentacion/origenes/cortes');
export const obtenerResumenAlimentacionHoy = () => request('/alimentacion/resumen-hoy');

export const seleccionarEspeciePlan = (especiePlan) => request('/plan/especie', {
  method: 'PATCH',
  body: JSON.stringify({ especiePlan })
});

export const obtenerFincas = () => request('/fincas');

export const actualizarLineasProductivasFinca = (fincaId, lineasProductivas) => request(`/fincas/${fincaId}/lineas-productivas`, {
  method: 'PATCH',
  body: JSON.stringify({ lineasProductivas })
});

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

export const obtenerUsuariosAsignables = (modulo) => (
  request(`/usuarios/asignables?modulo=${encodeURIComponent(modulo)}`)
);

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

export const obtenerAuditorias = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/auditoria${query ? `?${query}` : ''}`);
};

export const obtenerAuditoria = (id) => request(`/auditoria/${id}`);

export const obtenerOrganizacionesSaas = () => request('/admin/organizaciones');

export const crearOrganizacionSaas = (datos) => request('/admin/organizaciones', {
  method: 'POST',
  body: JSON.stringify(datos)
});

export const cambiarEstadoOrganizacionSaas = (id, estado) => request(`/admin/organizaciones/${id}/estado`, {
  method: 'PATCH',
  body: JSON.stringify({ estado })
});

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

export const obtenerTarea = (id) => request(`/tareas/${id}`);

export const obtenerNotificaciones = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/notificaciones${query ? `?${query}` : ''}`);
};

export const obtenerCantidadNotificacionesNoLeidas = () => request('/notificaciones/no-leidas/count');

export const marcarNotificacionLeida = (id) => request(`/notificaciones/${id}/leida`, {
  method: 'PATCH'
});

export const marcarTodasNotificacionesLeidas = () => request('/notificaciones/marcar-todas-leidas', {
  method: 'PATCH'
});

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

export const cambiarEstadoTarea = (id, estado, observaciones = '') => {
  return request(`/tareas/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado, observaciones })
  });
};

export const completarTarea = ({ id, observaciones, evidencia, idempotencyKey, versionEsperada }) => {
  const formData = new FormData();
  if (observaciones) formData.append('observaciones', observaciones);
  if (evidencia) formData.append('evidencia', evidencia);
  if (versionEsperada) formData.append('versionEsperada', versionEsperada);

  return request(`/tareas/${id}/completar`, {
    method: 'PATCH',
    body: formData,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined
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

export const previsualizarExcel = (archivo) => {
  const formData = new FormData();
  formData.append('archivo', archivo);

  return request('/importar/excel', {
    method: 'POST',
    body: formData
  });
};

export const confirmarImportacionExcel = (importacionId, modo) => {
  return request('/importar/excel/confirmar', {
    method: 'POST',
    body: JSON.stringify({ importacionId, modo })
  });
};

export const descargarPlantillaImportacion = async () => {
  if (!API_URL) throw new Error('VITE_API_URL no configurado');
  const token = obtenerTokenSesion();
  const respuesta = await fetch(`${API_URL}/importar/plantilla`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!respuesta.ok) {
    const data = await respuesta.json().catch(() => ({}));
    throw new Error(data.mensaje || 'No se pudo descargar la plantilla');
  }

  return respuesta.blob();
};

const construirQuery = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const obtenerAnimales = (filtros = {}) => request(`/animales${construirQuery(filtros)}`);

export const obtenerAnimal = (id) => request(`/animales/${id}`);

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

export const actualizarEstadoSanitarioAnimal = (id, datos) => request(`/animales/${id}/estado-sanitario`, {
  method: 'PATCH',
  body: JSON.stringify(datos)
});

export const actualizarEstadoSanitarioAnimales = (datos) => request('/animales/estado-sanitario', {
  method: 'PATCH',
  body: JSON.stringify(datos)
});

export const eliminarAnimal = (id) => {
  return request(`/animales/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerCamadas = (filtros = {}) => request(`/camadas${construirQuery(filtros)}`);

export const obtenerCamadasPorMadre = (madreId) => request(`/camadas/madre/${madreId}`);

export const crearCamada = (camada) => {
  return request('/camadas', {
    method: 'POST',
    body: JSON.stringify(camada)
  });
};

export const actualizarCamada = (id, camada) => {
  return request(`/camadas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(camada)
  });
};

export const registrarDesteteCamada = (id, datos) => {
  return request(`/camadas/${id}/destete`, {
    method: 'PATCH',
    body: JSON.stringify(datos)
  });
};

export const cerrarCamada = (id, observaciones = '') => {
  return request(`/camadas/${id}/cerrar`, {
    method: 'PATCH',
    body: JSON.stringify({ observaciones })
  });
};

export const cancelarCamada = (id, observaciones = '') => {
  return request(`/camadas/${id}/cancelar`, {
    method: 'PATCH',
    body: JSON.stringify({ observaciones })
  });
};

export const eliminarCamada = (id) => {
  return request(`/camadas/${id}`, {
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
  return request(`/animales/${animalId}/descendencia`);
};

export const obtenerCatalogoRacial = (especie = 'Bovino') => request(`/animales/catalogos/razas?especie=${encodeURIComponent(especie)}`);

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

export const obtenerPesajes = (filtros = {}) => request(`/pesajes${construirQuery(filtros)}`);

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

export const obtenerEventosCamada = (camadaId) => request(`/eventos-camada/camada/${camadaId}`);

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

export const obtenerCatalogoPastos = (filtros = {}) => request(`/pastos${construirQuery(filtros)}`);

export const obtenerCoberturaPotrero = (id) => request(`/potreros/${id}/cobertura`);

export const crearCoberturaPotrero = (id, cobertura) => request(`/potreros/${id}/cobertura`, {
  method: 'POST',
  body: JSON.stringify(cobertura)
});

export const actualizarCoberturaPotrero = (id, cobertura) => request(`/potreros/${id}/cobertura`, {
  method: 'PUT',
  body: JSON.stringify(cobertura)
});

export const obtenerRendimientoPotreros = (filtros = {}) => request(`/potreros/rendimiento${construirQuery(filtros)}`);

export const obtenerReporteRendimientoPotreros = (filtros = {}) => request(`/reportes/potreros/rendimiento${construirQuery(filtros)}`);

export const obtenerRendimientoPotrerosPorPasto = (filtros = {}, usarRutaReportes = false) => request(`${usarRutaReportes ? '/reportes/potreros/por-pasto' : '/potreros/rendimiento/por-pasto'}${construirQuery(filtros)}`);

export const obtenerRendimientoPotrero = (id, filtros = {}) => request(`/potreros/${id}/rendimiento${construirQuery(filtros)}`);

export const obtenerCortesForraje = (potreroId, filtros = {}) => request(`/potreros/${potreroId}/cortes${construirQuery(filtros)}`);

export const registrarCorteForraje = (potreroId, datos) => request(`/potreros/${potreroId}/cortes`, {
  method: 'POST',
  body: JSON.stringify(datos)
});

export const obtenerRendimientoForrajes = (filtros = {}) => request(`/reportes/forrajes/rendimiento${construirQuery(filtros)}`);

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

export const obtenerPlanesSanitarios = (filtros = {}) => request(`/plan-sanitario${construirQuery(filtros)}`);

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

export const registrarAplicacionPlanSanitario = (id, datos) => {
  return request(`/plan-sanitario/${id}/registrar-aplicacion`, {
    method: 'PATCH',
    body: JSON.stringify(datos)
  });
};

export const obtenerTratamientosSanitarios = (filtros = {}) => request(`/tratamientos-sanitarios${construirQuery(filtros)}`);

export const obtenerTratamientoSanitario = (id) => request(`/tratamientos-sanitarios/${id}`);

export const crearTratamientoSanitario = (tratamiento) => request('/tratamientos-sanitarios', {
  method: 'POST',
  body: JSON.stringify(tratamiento)
});

export const actualizarTratamientoSanitario = (id, tratamiento) => request(`/tratamientos-sanitarios/${id}`, {
  method: 'PUT',
  body: JSON.stringify(tratamiento)
});

export const registrarAplicacionTratamiento = (id, datos) => request(`/tratamientos-sanitarios/${id}/aplicaciones`, {
  method: 'POST',
  body: JSON.stringify(datos)
});

export const completarTratamientoSanitario = (id, datos = {}) => request(`/tratamientos-sanitarios/${id}/completar`, {
  method: 'PATCH',
  body: JSON.stringify(datos)
});

export const cancelarTratamientoSanitario = (id, datos = {}) => request(`/tratamientos-sanitarios/${id}/cancelar`, {
  method: 'PATCH',
  body: JSON.stringify(datos)
});

export const obtenerAplicacionesSanitarias = (filtros = {}) => request(`/aplicaciones-sanitarias${construirQuery(filtros)}`);

export const obtenerAplicacionSanitaria = (id) => request(`/aplicaciones-sanitarias/${id}`);

export const crearAplicacionSanitariaUnica = (aplicacion) => request('/aplicaciones-sanitarias/unica', {
  method: 'POST',
  body: JSON.stringify(aplicacion)
});

export const obtenerRegistrosReproductivos = (filtros = {}) => request(`/reproduccion${construirQuery(filtros)}`);

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

export const cerrarCicloReproductivo = (id, motivo = '') => {
  return request(`/reproduccion/${id}/cerrar-ciclo`, {
    method: 'PATCH',
    body: JSON.stringify({ motivo })
  });
};

export const cancelarCicloReproductivo = (id, motivo = '') => {
  return request(`/reproduccion/${id}/cancelar-ciclo`, {
    method: 'PATCH',
    body: JSON.stringify({ motivo })
  });
};

export const marcarCicloNoPrenada = (id, motivo = '') => {
  return request(`/reproduccion/${id}/no-prenada`, {
    method: 'PATCH',
    body: JSON.stringify({ motivo })
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

export const procesarConteoDrone = ({ imagen, potrero, cantidadEsperada, observaciones, claveOperacion }) => {
  const formData = new FormData();
  formData.append('imagen', imagen);
  formData.append('potrero', potrero);
  formData.append('cantidadEsperada', cantidadEsperada);
  formData.append('observaciones', observaciones || '');

  return request('/conteo-drone/procesar', {
    method: 'POST',
    body: formData,
    headers: claveOperacion ? { 'Idempotency-Key': claveOperacion } : {}
  });
};

export const obtenerConteosDrone = () => request('/conteo-drone');

export const obtenerMovimientosFinancieros = () => request('/finanzas');

export const obtenerResumenFinanciero = () => request('/finanzas/resumen');

export const obtenerCatalogosFinancieros = () => request('/finanzas/catalogos');

export const obtenerCatalogosFinancierosAdmin = (tipo) => {
  const query = tipo ? `?tipo=${encodeURIComponent(tipo)}` : '';
  return request(`/finanzas/catalogos/admin${query}`);
};

export const crearCatalogoFinanciero = (catalogo) => {
  return request('/finanzas/catalogos', {
    method: 'POST',
    body: JSON.stringify(catalogo)
  });
};

export const actualizarCatalogoFinanciero = (id, catalogo) => {
  return request(`/finanzas/catalogos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(catalogo)
  });
};

export const desactivarCatalogoFinanciero = (id) => {
  return request(`/finanzas/catalogos/${id}/desactivar`, {
    method: 'PATCH'
  });
};

export const activarCatalogoFinanciero = (id) => {
  return request(`/finanzas/catalogos/${id}/activar`, {
    method: 'PATCH'
  });
};

export const eliminarCatalogoFinanciero = (id) => {
  return request(`/finanzas/catalogos/${id}`, {
    method: 'DELETE'
  });
};

export const obtenerResumenConsumoFinanciero = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/finanzas/consumo${query ? `?${query}` : ''}`);
};

export const obtenerResumenPlanillaFinanciera = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/finanzas/planilla-resumen${query ? `?${query}` : ''}`);
};

export const obtenerResumenInversionesFinancieras = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/finanzas/inversiones-resumen${query ? `?${query}` : ''}`);
};

export const obtenerResumenDestinosFinancieros = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/finanzas/destinos-resumen${query ? `?${query}` : ''}`);
};

export const obtenerRevisionDatosFinancieros = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return request(`/finanzas/revision-datos${query ? `?${query}` : ''}`);
};

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
    if (clave === 'animales' || clave === 'camadas') {
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

export const obtenerResumenVentas = ({ fechaInicio, fechaFin, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (especie) params.append('especie', especie);
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
    if (clave === 'animales' || (typeof valor === 'object' && valor !== null)) {
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

export const obtenerResumenCompras = ({ fechaInicio, fechaFin, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (especie) params.append('especie', especie);
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

export const asignarCompraALote = (id, datos) => request(`/compras/${id}/asignar-lote`, { method: 'POST', body: JSON.stringify(datos) });

export const obtenerResumenReportes = ({ fechaInicio, fechaFin, partosFechaInicio, partosFechaFin, diio, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (partosFechaInicio) params.append('partosFechaInicio', partosFechaInicio);
  if (partosFechaFin) params.append('partosFechaFin', partosFechaFin);
  if (diio) params.append('diio', diio);
  if (especie) params.append('especie', especie);
  const query = params.toString();

  return request(`/reportes/resumen${query ? `?${query}` : ''}`);
};

export const obtenerProductividadCria = ({ fechaInicio, fechaFin, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (especie) params.append('especie', especie);
  const query = params.toString();

  return request(`/reportes/productividad${query ? `?${query}` : ''}`);
};

export const obtenerFinanzasCria = ({ fechaInicio, fechaFin, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (especie) params.append('especie', especie);
  const query = params.toString();

  return request(`/reportes/finanzas-cria${query ? `?${query}` : ''}`);
};

export const obtenerSustentabilidadCria = ({ fechaInicio, fechaFin, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (especie) params.append('especie', especie);
  const query = params.toString();

  return request(`/reportes/sustentabilidad-cria${query ? `?${query}` : ''}`);
};

export const obtenerVacasImproductivas = ({
  fechaInicio,
  fechaFin,
  diio,
  mesesSinParto,
  diasAbiertos,
  pesoDesteteMin,
  especie
} = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (diio) params.append('diio', diio);
  if (mesesSinParto) params.append('mesesSinParto', mesesSinParto);
  if (diasAbiertos) params.append('diasAbiertos', diasAbiertos);
  if (pesoDesteteMin) params.append('pesoDesteteMin', pesoDesteteMin);
  if (especie) params.append('especie', especie);
  const query = params.toString();

  return request(`/reportes/vacas-improductivas${query ? `?${query}` : ''}`);
};

export const obtenerReporteCrecimientoPesajes = ({ fechaInicio, fechaFin, animalId, diasSinPesaje, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (animalId) params.append('animalId', animalId);
  if (diasSinPesaje) params.append('diasSinPesaje', diasSinPesaje);
  if (especie) params.append('especie', especie);
  const query = params.toString();

  return request(`/reportes/crecimiento-pesajes${query ? `?${query}` : ''}`);
};

export const obtenerCrecimientoPorcino = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();
  return request(`/reportes/porcinos/crecimiento${query ? `?${query}` : ''}`);
};

export const obtenerEficienciaEngorde = ({ fechaInicio, fechaFin, especie } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  if (especie && especie !== 'Todos') params.append('especie', especie);
  const query = params.toString();
  return request(`/reportes/engorde${query ? `?${query}` : ''}`);
};

export const obtenerReporteRazasBovinas = () => request('/reportes/bovinos/razas');

export const obtenerReporteRazas = ({ especie = 'Todos' } = {}) => request(`/reportes/razas?especie=${encodeURIComponent(especie)}`);

export const obtenerReporteDescendenciaBovina = ({ fechaInicio, fechaFin } = {}) => {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fechaInicio', fechaInicio);
  if (fechaFin) params.append('fechaFin', fechaFin);
  const query = params.toString();
  return request(`/reportes/bovinos/descendencia${query ? `?${query}` : ''}`);
};

export const obtenerConfiguracionProductiva = () => request('/reportes/configuracion-productiva');

export const actualizarConfiguracionProductiva = (configuracion) => request('/reportes/configuracion-productiva', {
  method: 'PUT',
  body: JSON.stringify(configuracion)
});

const construirQueryProductos = (filtros = {}) => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.append(clave, valor);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const obtenerReporteProductosResumen = (filtros = {}) => {
  return request(`/reportes/productos/resumen${construirQueryProductos(filtros)}`);
};

export const obtenerReporteProductosPorProducto = (filtros = {}) => {
  return request(`/reportes/productos/por-producto${construirQueryProductos(filtros)}`);
};

export const obtenerReporteProductosPorCategoria = (filtros = {}) => {
  return request(`/reportes/productos/por-categoria${construirQueryProductos(filtros)}`);
};

export const obtenerReporteProductosCombustibles = (filtros = {}) => {
  return request(`/reportes/productos/combustibles${construirQueryProductos(filtros)}`);
};

export const obtenerReporteProductosPrecioPromedio = (filtros = {}) => {
  return request(`/reportes/productos/precio-promedio${construirQueryProductos(filtros)}`);
};

export const obtenerReporteProductosProveedores = (filtros = {}) => {
  return request(`/reportes/productos/proveedores${construirQueryProductos(filtros)}`);
};

export const obtenerReporteProductosDestinos = (filtros = {}) => {
  return request(`/reportes/productos/destinos${construirQueryProductos(filtros)}`);
};

export const obtenerReporteProductosTop = (filtros = {}) => {
  return request(`/reportes/productos/top${construirQueryProductos(filtros)}`);
};

export const obtenerReporteCamadas = (filtros = {}) => {
  return request(`/reportes/porcinos/camadas${construirQueryProductos(filtros)}`);
};

export const obtenerReporteReproductivoPorcino = (filtros = {}) => {
  return request(`/reportes/porcinos/reproduccion${construirQueryProductos(filtros)}`);
};

export const obtenerReporteTareasCamadas = (filtros = {}) => {
  return request(`/reportes/porcinos/tareas-camadas${construirQueryProductos(filtros)}`);
};

export const obtenerReporteEconomicoCamadas = (filtros = {}) => {
  return request(`/reportes/porcinos/economia-camadas${construirQueryProductos(filtros)}`);
};

export const obtenerReporteSanidad = (filtros = {}) => {
  return request(`/reportes/sanidad${construirQueryProductos(filtros)}`);
};

export const obtenerReporteComprasAnimales = (filtros = {}) => {
  return request(`/reportes/compras-animales${construirQueryProductos(filtros)}`);
};

export const obtenerReporteLotes = (filtros = {}, analitica = false) => request(`/reportes/lotes${analitica ? '/analitica' : ''}${construirQuery(filtros)}`);

export { API_URL };
