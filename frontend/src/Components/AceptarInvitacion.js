import React, { useEffect, useRef, useState } from 'react';
import { aceptarInvitacionExistente, aceptarInvitacionNueva, crearClaveIdempotencia, obtenerContextoInvitacion } from '../services/api';
import MarcaProducto, { estiloAcceso } from './MarcaProducto';
import CasillasLegales from '../legal/CasillasLegales';
import EnlacesLegales from '../legal/EnlacesLegales';
import { documentosPublicos } from '../legal/catalogo';
import { aceptacionesVacias, catalogoCoincide, claveParaOperacion, documentosParaAceptaciones, validarAceptaciones } from '../legal/legal.mjs';

export const enviarAceptacionInvitacion = ({ contexto, token, contrasena, legal }) => contexto.requiereCuentaExistente === true
  ? aceptarInvitacionExistente(token, legal)
  : aceptarInvitacionNueva(token, contrasena, legal);

const AceptarInvitacion = ({ token, sesion, onVolver }) => {
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const [contexto, setContexto] = useState(null);
  const [errorContexto, setErrorContexto] = useState('');
  const [intento, setIntento] = useState(0);
  const [completada, setCompletada] = useState(false);
  const [aceptaciones, setAceptaciones] = useState(aceptacionesVacias);
  const operacion = useRef(null);

  useEffect(() => {
    let vigente = true;
    setContexto(null); setErrorContexto(''); setAceptaciones(aceptacionesVacias());
    obtenerContextoInvitacion(token).then((datos) => {
      if (!['ORGANIZACION', 'COLABORADOR'].includes(datos.escenario)) throw new Error('No se pudo determinar el tipo de invitación.');
      if (vigente) setContexto(datos);
    }).catch((error) => { if (vigente) setErrorContexto(error.message); });
    return () => { vigente = false; };
  }, [token, intento]);

  const organizacion = contexto?.escenario === 'ORGANIZACION';
  const documentosActuales = contexto && catalogoCoincide(contexto.documentos, documentosPublicos,
    organizacion ? ['terminos', 'suscripciones', 'privacidad'] : ['terminos', 'privacidad']);
  const cuentaExistente = contexto?.requiereCuentaExistente === true;
  const necesitaLogin = cuentaExistente && !sesion;
  const irIniciarSesion = () => { localStorage.setItem('ganaderiaInvitacionPendiente', token); onVolver(); };

  const aceptar = async (evento) => {
    evento.preventDefault();
    if (cargando || completada || !documentosActuales || necesitaLogin) return;
    const errorLegal = validarAceptaciones(aceptaciones, { organizacion });
    if (errorLegal) { setMensaje(errorLegal); return; }
    if (!cuentaExistente && contrasena !== confirmacion) { setMensaje('Las contraseñas no coinciden.'); return; }
    try {
      setCargando(true); setMensaje('');
      const datos = { aceptaciones, documentos: documentosParaAceptaciones(aceptaciones, documentosPublicos) };
      const legal = { ...datos, claveIdempotencia: claveParaOperacion(operacion, { token, ...datos }, crearClaveIdempotencia) };
      const respuesta = await enviarAceptacionInvitacion({ contexto, token, contrasena, legal });
      localStorage.removeItem('ganaderiaInvitacionPendiente');
      setCompletada(true);
      setMensaje(contexto.borrador ? 'Aceptación registrada de prueba. No corresponde a documentos jurídicos aprobados.' : respuesta.mensaje || 'Invitación aceptada.');
    } catch (error) { setMensaje(error.status === 409 ? 'Los documentos cambiaron. Recarga la página antes de aceptar la versión actual.' : error.message); } finally { setCargando(false); }
  };

  return <section className="auth-panel">
    <div className="auth-copy" style={estiloAcceso}><MarcaProducto /><p className="eyebrow">Invitación</p><h1>Acceso a una organización</h1><p>La invitación es personal, vence en 72 horas y solo puede utilizarse una vez.</p></div>
    <form className="auth-card" onSubmit={aceptar}>
      <h2>Aceptar invitación</h2>
      {mensaje && <div className="alerta-formulario" role="status">{mensaje}</div>}
      {!contexto && !errorContexto && <p role="status">Consultando invitación...</p>}
      {errorContexto && <div role="alert"><p>{errorContexto}</p><button type="button" className="boton-secundario" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button></div>}
      {contexto && <>
        <p>{contexto.organizacionNombre} · {organizacion ? 'Activación de organización' : 'Incorporación de colaborador'}</p>
        {contexto.borrador && <p className="legal-borrador">Borradores públicos de prueba, no documentos jurídicos aprobados.</p>}
        {!documentosActuales && <p role="alert">Los documentos cambiaron. Recarga esta página para consultar y aceptar la versión actual.</p>}
        {necesitaLogin ? <button type="button" className="boton-primario" onClick={irIniciarSesion}>Iniciar sesión con mi cuenta</button> : !completada && <>
      {!cuentaExistente && <>
        <label>Nueva contraseña<input type="password" minLength="10" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required /></label>
        <label>Confirmar contraseña<input type="password" minLength="10" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} required /></label>
      </>}
      <CasillasLegales valores={aceptaciones} onChange={setAceptaciones} organizacion={organizacion} disabled={cargando || !documentosActuales} />
      <button className="boton-primario" type="submit" disabled={cargando || !documentosActuales}>{cargando ? 'Registrando...' : cuentaExistente ? `Aceptar con ${sesion.usuario?.correo || 'mi cuenta'}` : 'Crear cuenta y aceptar'}</button>
      </>}
      </>}
      <EnlacesLegales completos />
      <button className="boton-link auth-link" type="button" onClick={onVolver}>Volver</button>
    </form>
  </section>;
};

export default AceptarInvitacion;
