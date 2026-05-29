const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const request = async (ruta, opciones = {}) => {
  const esFormData = opciones.body instanceof FormData;
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    headers: esFormData
      ? { ...(opciones.headers || {}) }
      : {
        'Content-Type': 'application/json',
        ...(opciones.headers || {})
      },
    ...opciones
  });

  const data = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
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

export const obtenerPotreros = () => request('/potreros');

export const obtenerPlanesSanitarios = () => request('/plan-sanitario');

export const crearPlanSanitario = (plan) => {
  return request('/plan-sanitario', {
    method: 'POST',
    body: JSON.stringify(plan)
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

export { API_URL };
