import React from 'react';
import { parsearTextoLegal } from './markdown.mjs';

export const IndiceLegal = ({ contenido }) => <nav className="legal-indice" aria-label="Secciones del documento">
  <h2>Contenido</h2>
  <ol>{parsearTextoLegal(contenido).indice.map(({ id, texto }) => <li key={id}><a href={`#${id}`}>{texto}</a></li>)}</ol>
</nav>;

// markdown-it escapa HTML y valida enlaces; no se aceptan extensiones de HTML crudo.
const TextoLegal = ({ contenido }) => <div className="legal-texto" dangerouslySetInnerHTML={{ __html: parsearTextoLegal(contenido).html }} />;

export default TextoLegal;
