import React from 'react';
import { EnlaceLegal } from './EnlacesLegales';
import './legal.css';

const CasillasLegales = ({ valores, onChange, organizacion = false, reglasUso = true, privacidad = true, comunicaciones = true, disabled = false }) => {
  const casilla = (clave, texto, obligatoria) => <label className="legal-casilla" key={clave}>
    <input name={clave} type="checkbox" checked={valores[clave] === true} required={obligatoria} onChange={(e) => onChange({ ...valores, [clave]: e.target.checked })} />
    <span>{texto}</span>
  </label>;
  return <fieldset className="legal-casillas" disabled={disabled}><legend>Aceptaciones y consentimientos</legend>
    {organizacion && casilla('terminosOrganizacion', <>Acepto los <EnlaceLegal slug="terminos">Términos del Servicio</EnlaceLegal> y las <EnlaceLegal slug="suscripciones">Condiciones de Suscripción</EnlaceLegal> en representación de la organización.</>, true)}
    {!organizacion && reglasUso && casilla('reglasUso', <>Acepto las reglas individuales de uso en los <EnlaceLegal slug="terminos">Términos del Servicio</EnlaceLegal>.</>, true)}
    {privacidad && casilla('privacidad', <>He leído la <EnlaceLegal slug="privacidad">Política de Privacidad</EnlaceLegal> y otorgo mi consentimiento informado para el tratamiento de mis datos personales.</>, true)}
    {comunicaciones && casilla('comunicacionesOpcionales', <>Deseo recibir comunicaciones comerciales, novedades y consejos productivos opcionales.</>, false)}
  </fieldset>;
};

export default CasillasLegales;
