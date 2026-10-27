import React from 'react';
import ImagenPersonalizada from './ImagenPersonalizada';
import { imagenRemota } from '../utils/apariencia.mjs';

const imagenAcceso = imagenRemota(import.meta.env.VITE_LOGIN_IMAGEN_URL);
export const estiloAcceso = imagenAcceso ? {
  backgroundImage: `linear-gradient(rgba(20, 62, 34, 0.52), rgba(20, 62, 34, 0.72)), url(${JSON.stringify(imagenAcceso)})`
} : undefined;

const MarcaProducto = () => (
  <div className="marca-producto">
    <ImagenPersonalizada
      src={import.meta.env.VITE_LOGO_PRODUCTO_URL}
      alt="Logo CIR Ganadero"
      className="login-logo"
      vacio="CIR"
    />
    <strong>CIR Ganadero</strong>
  </div>
);

export default MarcaProducto;
