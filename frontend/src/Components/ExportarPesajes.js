import React, { useState } from 'react';
import { descargarPesajes } from '../services/api';
export default function ExportarPesajes({ filtros }) {
  const [error, setError] = useState(''), [cargando, setCargando] = useState(false);
  const descargar = async (formato) => {
    setCargando(true); setError('');
    try {
      const archivo = await descargarPesajes({ ...filtros, formato, soloActivos: 'true' });
      const url = URL.createObjectURL(archivo), enlace = document.createElement('a');
      enlace.href = url; enlace.download = `pesajes.${formato}`; enlace.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  };
  return <div><div className="acciones-tabla"><button type="button" className="boton-secundario compacto" disabled={cargando} title="Descargar pesajes en Excel" onClick={() => descargar('xlsx')}>Excel</button><button type="button" className="boton-secundario compacto" disabled={cargando} title="Descargar pesajes en PDF" onClick={() => descargar('pdf')}>PDF</button></div>{error && <p role="alert">{error}</p>}</div>;
}
