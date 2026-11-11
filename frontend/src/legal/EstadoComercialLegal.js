import React, { useEffect, useState } from 'react';
import { obtenerEstadoLegal } from '../services/api';
import { EnlaceLegal } from './EnlacesLegales';
import './legal.css';

const EstadoComercialLegal = ({ onAbrirLegal }) => {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vigente = true;
    setError('');
    obtenerEstadoLegal().then((datos) => { if (vigente) setEstado(datos); }).catch((err) => { if (vigente) setError(err.message); });
    return () => { vigente = false; };
  }, [intento]);
  return <section className="legal-comercial" aria-label="Condiciones de suscripción">
    <EnlaceLegal slug="suscripciones">Ver condiciones de suscripción, renovación y cancelación</EnlaceLegal>
    {error ? <p role="alert">{error} <button type="button" className="boton-link" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button></p> : !estado ? <p role="status">Consultando aceptación comercial...</p> : estado.representante ? <>
      <p>Aceptación comercial de la organización: {estado.aceptacionComercial ? (estado.borrador ? 'aceptación registrada de prueba' : 'registrada') : 'pendiente de registro'}.</p>
      {estado.borrador && <p className="legal-borrador">Borradores públicos de prueba, no documentos jurídicos aprobados.</p>}
      {onAbrirLegal ? <button type="button" className="boton-link" onClick={onAbrirLegal}>Legal y privacidad de mi cuenta</button> : <a href="/configuracion#legal-privacidad">Legal y privacidad de mi cuenta</a>}
    </> : <p>Solo el administrador titular designado como representante de la organización puede registrar la aceptación comercial. Los demás colaboradores no aceptan cargos ni condiciones de pago.</p>}
  </section>;
};

export default EstadoComercialLegal;
