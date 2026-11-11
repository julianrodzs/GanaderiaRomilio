import React from 'react';
import { documentosPublicos } from './catalogo';
import { copiaDescargable, formatearFechaLegal } from './legal.mjs';
import TextoLegal, { IndiceLegal } from './TextoLegal';
import MarcaProducto from '../Components/MarcaProducto';
import './legal.css';

export const descargarDocumento = (doc) => {
  const url = URL.createObjectURL(new Blob([copiaDescargable(doc)], { type: 'text/markdown;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${doc.slug}-${doc.version}-${doc.fechaVigencia}.md`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const CentroLegal = ({ ruta = '/legal' }) => {
  const slug = ruta.replace(/^\/legal\/?/, '').replace(/\/$/, '');
  const doc = documentosPublicos.find((item) => item.slug === slug);
  const borrador = doc ? doc.estado === 'BORRADOR_PRUEBA' : documentosPublicos.some((item) => item.estado === 'BORRADOR_PRUEBA');

  return <div className="legal-publico">
    <title>{`${doc?.titulo || 'Centro Legal'} | CIR Ganadero`}</title>
    {borrador && <meta name="robots" content="noindex" />}
    <header className="legal-cabecera"><a href="/legal" aria-label="CIR Ganadero, Centro Legal"><MarcaProducto /></a><a href="/login">Ingresar</a></header>
    <main className="legal-principal" id="contenido-legal">
      <nav className="legal-migas" aria-label="Ubicación"><a href="/legal">Centro Legal</a>{doc && <span> / {doc.titulo}</span>}</nav>
      <h1>{doc ? doc.titulo : slug ? 'Documento no encontrado' : 'Centro Legal'}</h1>
      {borrador && <p className="legal-borrador" role="note">Borradores públicos de prueba, no documentos jurídicos aprobados. Las fechas de vigencia son fechas de referencia del borrador.</p>}
      {!slug ? <div className="legal-documentos">{documentosPublicos.map((item) => <article key={item.slug}>
        <h2><a href={`/legal/${item.slug}`}>{item.titulo}</a></h2><p>{item.resumen}</p>
        <p className="legal-metadatos">Versión {item.version}<br />Actualización: <time dateTime={item.fechaActualizacion}>{formatearFechaLegal(item.fechaActualizacion)}</time><br />{item.estado === 'BORRADOR_PRUEBA' ? 'Referencia del borrador' : 'Vigencia'}: <time dateTime={item.fechaVigencia}>{formatearFechaLegal(item.fechaVigencia)}</time></p>
      </article>)}</div> : doc ? <>
        <p className="legal-metadatos">Versión {doc.version} · {doc.estado === 'BORRADOR_PRUEBA' ? 'Referencia del borrador' : 'Vigencia'}: <time dateTime={doc.fechaVigencia}>{formatearFechaLegal(doc.fechaVigencia)}</time> · Actualización: <time dateTime={doc.fechaActualizacion}>{formatearFechaLegal(doc.fechaActualizacion)}</time></p>
        <div className="legal-acciones"><button type="button" className="boton-secundario" onClick={() => window.print()}>Imprimir / Guardar PDF</button><button type="button" className="boton-secundario" onClick={() => descargarDocumento(doc)}>Descargar copia (.md)</button></div>
        <div className="legal-lectura"><IndiceLegal contenido={doc.contenido} /><article aria-label={doc.titulo}><TextoLegal contenido={doc.contenido} /><p className="legal-hash">SHA-256: {doc.hashSha256}</p></article></div>
      </> : <p>Este documento no pertenece al Centro Legal público. <a href="/legal">Volver al índice</a></p>}
    </main>
    <footer className="legal-pie">CIR Ganadero · Centro Legal</footer>
  </div>;
};

export default CentroLegal;
