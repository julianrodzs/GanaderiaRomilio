import React, { useEffect, useRef, useState } from 'react';
import { actualizarComunicacionesLegales, crearClaveIdempotencia, obtenerEstadoLegal, registrarAceptacionesLegales } from '../services/api';
import { documentosPublicos } from './catalogo';
import { aceptacionesVacias, catalogoCoincide, claveParaOperacion, documentosParaAceptaciones, formatearFechaLegal, validarAceptaciones } from './legal.mjs';
import CasillasLegales from './CasillasLegales';
import EnlacesLegales from './EnlacesLegales';
import { ContenidoPaginado } from '../Components/PaginacionTabla';
import './legal.css';

const tipos = {
  TERMINOS_Y_SUSCRIPCION_ORG: 'Aceptación comercial de la organización',
  REGLAS_USO_COLABORADOR: 'Reglas individuales de uso',
  CONSENTIMIENTO_PRIVACIDAD_LEY8968: 'Consentimiento informado de privacidad',
  COMUNICACIONES_OPCIONALES: 'Comunicaciones opcionales'
};

export const HistorialLegal = ({ aceptaciones = [], borrador = false }) => <ContenidoPaginado datos={aceptaciones} clavePaginacion="legal-mis-aceptaciones">{(pagina) => <div className="legal-tabla-scroll" tabIndex="0" role="region" aria-label="Mis aceptaciones y consentimientos registrados">
  <table className="legal-evidencias"><caption>Mis aceptaciones y consentimientos registrados</caption><thead><tr><th scope="col">Documento</th><th scope="col">Aceptación</th><th scope="col">Versión</th><th scope="col">Fecha (Costa Rica)</th><th scope="col">Estado</th></tr></thead>
    <tbody>{pagina.length ? pagina.map((item, i) => <tr key={item._id || i}>
      <td>{documentosPublicos.find((doc) => doc.slug === item.documentoSlug)?.titulo || item.documentoSlug}</td>
      <td>{tipos[item.tipoAceptacion] || item.tipoAceptacion}</td><td>{item.versionDocumento}</td>
      <td><time dateTime={item.fechaAceptacion}>{formatearFechaLegal(item.fechaAceptacion, true)}</time></td>
      <td>{item.otorgado ? (borrador || item.versionDocumento?.includes('borrador') ? 'Aceptación registrada de prueba' : 'Otorgado') : 'Revocado / no otorgado'}</td>
    </tr>) : <tr><td colSpan="5">No hay aceptaciones ni consentimientos registrados.</td></tr>}</tbody>
  </table>
</div>}</ContenidoPaginado>;

const LegalPrivacidadCuenta = () => {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [aceptaciones, setAceptaciones] = useState(aceptacionesVacias);
  const operacion = useRef(null);
  const operacionComunicaciones = useRef(null);

  useEffect(() => {
    let vigente = true;
    setEstado(null); setError(''); setAceptaciones(aceptacionesVacias());
    obtenerEstadoLegal().then((datos) => { if (vigente) setEstado(datos); })
      .catch((err) => { if (vigente) setError(err.message); });
    return () => { vigente = false; };
  }, [intento]);

  const organizacion = estado?.representante === true && !estado.aceptacionComercial;
  const reglasUso = estado && !estado.reglasUso && !organizacion;
  const privacidad = estado && !estado.privacidad;
  const pendientes = organizacion || reglasUso || privacidad;
  const slugs = ['privacidad', ...(organizacion || reglasUso ? ['terminos'] : []), ...(organizacion ? ['suscripciones'] : [])];
  const documentosActuales = estado && catalogoCoincide(estado.documentos, documentosPublicos, slugs);

  const guardar = async (evento) => {
    evento.preventDefault();
    if (guardando || !documentosActuales) return;
    const validacion = validarAceptaciones(aceptaciones, { organizacion, reglasUso, privacidad });
    if (validacion) { setError(validacion); return; }
    setGuardando(true); setError(''); setMensaje('');
    try {
      const valores = { ...aceptaciones, comunicacionesOpcionales: estado.comunicacionesOpcionales === true };
      const datos = { aceptaciones: valores, documentos: documentosParaAceptaciones(valores, documentosPublicos) };
      await registrarAceptacionesLegales({ ...datos, claveIdempotencia: claveParaOperacion(operacion, datos, crearClaveIdempotencia) });
      setMensaje(estado.borrador ? 'Aceptación registrada de prueba. No corresponde a documentos jurídicos aprobados.' : 'Aceptaciones registradas.');
      setIntento((actual) => actual + 1);
    } catch (err) { setError(err.status === 409 ? 'Los documentos cambiaron. Recarga la página antes de aceptar la versión actual.' : err.message); }
    finally { setGuardando(false); }
  };

  const cambiarComunicaciones = async (otorgado) => {
    if (guardando || !documentosActuales) return;
    setGuardando(true); setError(''); setMensaje('');
    try {
      const datos = { otorgado, documentos: documentosParaAceptaciones({}, documentosPublicos) };
      await actualizarComunicacionesLegales({ ...datos, claveIdempotencia: claveParaOperacion(operacionComunicaciones, datos, crearClaveIdempotencia) });
      setMensaje(estado.borrador ? 'Preferencia registrada de prueba.' : 'Preferencia de comunicaciones registrada.');
      setIntento((actual) => actual + 1);
    } catch (err) { setError(err.status === 409 ? 'Los documentos cambiaron. Recarga la página antes de cambiar el consentimiento.' : err.message); }
    finally { setGuardando(false); }
  };

  return <section className="configuracion-email legal-cuenta" id="legal-privacidad" aria-labelledby="legal-privacidad-titulo">
    <h2 id="legal-privacidad-titulo">Legal y privacidad</h2><EnlacesLegales completos />
    {mensaje && <p role="status" className="form-message">{mensaje}</p>}
    {error && <div role="alert"><p>{error}</p>{!estado && <button type="button" className="boton-secundario" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>}</div>}
    {!estado && !error && <p role="status">Consultando aceptaciones...</p>}
    {estado && <>
      {estado.borrador && <p className="legal-borrador">Borradores públicos de prueba, no documentos jurídicos aprobados. Las fechas de vigencia son fechas de referencia del borrador.</p>}
      {!documentosActuales && <p role="alert">Los documentos cambiaron. Recarga la página antes de registrar aceptaciones o consentimientos.</p>}
      {estado.representante ? <p>Aceptación comercial de la organización: {estado.aceptacionComercial ? (estado.borrador ? 'aceptación registrada de prueba' : 'registrada') : 'pendiente de registro'}.</p> : <p>La aceptación comercial corresponde únicamente al administrador titular designado como representante de la organización.</p>}
      {pendientes && <form onSubmit={guardar}>
        <CasillasLegales valores={aceptaciones} onChange={setAceptaciones} organizacion={organizacion} reglasUso={reglasUso} privacidad={privacidad} comunicaciones={false} disabled={guardando || !documentosActuales} />
        <button type="submit" className="boton-primario" disabled={guardando || !documentosActuales}>{guardando ? 'Registrando...' : 'Registrar aceptaciones pendientes'}</button>
      </form>}
      <div className="legal-preferencia"><label className="legal-casilla">
        <input type="checkbox" checked={estado.comunicacionesOpcionales === true} disabled={guardando || !documentosActuales} onChange={(e) => cambiarComunicaciones(e.target.checked)} />
        <span>Deseo recibir comunicaciones comerciales, novedades y consejos productivos opcionales.</span>
      </label><p>Consentimiento opcional: {estado.comunicacionesOpcionales ? 'otorgado' : 'no otorgado'}. Puedes revocarlo en cualquier momento.</p></div>
      <HistorialLegal aceptaciones={estado.aceptaciones} borrador={estado.borrador} />
    </>}
  </section>;
};

export default LegalPrivacidadCuenta;
