const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const request = async (ruta, opciones = {}) => {
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    headers: {
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

export { API_URL };
