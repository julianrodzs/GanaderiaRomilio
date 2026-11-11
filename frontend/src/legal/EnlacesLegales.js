import React from 'react';

export const EnlaceLegal = ({ slug = '', children }) => <a href={`/legal${slug ? `/${slug}` : ''}`} target="_blank" rel="noopener noreferrer">{children}</a>;

const EnlacesLegales = ({ completos = false }) => <nav className="legal-enlaces" aria-label="Centro Legal">
  <EnlaceLegal slug="terminos">Términos</EnlaceLegal>
  <EnlaceLegal slug="privacidad">Privacidad</EnlaceLegal>
  {completos && <EnlaceLegal slug="suscripciones">Suscripciones</EnlaceLegal>}
  <EnlaceLegal slug="soporte">Soporte</EnlaceLegal>
  <EnlaceLegal>Centro Legal</EnlaceLegal>
</nav>;

export default EnlacesLegales;
