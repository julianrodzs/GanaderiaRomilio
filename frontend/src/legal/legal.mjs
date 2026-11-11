export const SLUGS_PUBLICOS = ['terminos', 'privacidad', 'suscripciones', 'soporte'];

export const esRutaLegal = (ruta = '') => /^\/legal(?:\/|$)/.test(ruta);

export const aceptacionesVacias = () => ({
  reglasUso: false, terminosOrganizacion: false, privacidad: false, comunicacionesOpcionales: false
});

export const documentosParaAceptaciones = (aceptaciones, documentos) => {
  const slugs = new Set(['privacidad']);
  if (aceptaciones.reglasUso || aceptaciones.terminosOrganizacion) slugs.add('terminos');
  if (aceptaciones.terminosOrganizacion) slugs.add('suscripciones');
  return documentos.filter((doc) => slugs.has(doc.slug))
    .map(({ slug, version, hashSha256 }) => ({ slug, version, hashSha256 }));
};

export const catalogoCoincide = (metadatos, documentos, slugs) => Array.isArray(metadatos)
  && slugs.every((slug) => {
    const local = documentos.find((doc) => doc.slug === slug);
    const remoto = metadatos.find((doc) => doc.slug === slug);
    return local && remoto && local.version === remoto.version && local.hashSha256 === remoto.hashSha256;
  });

export const validarAceptaciones = (aceptaciones, { organizacion = false, reglasUso = true, privacidad = true } = {}) => {
  if (organizacion && !aceptaciones.terminosOrganizacion) return 'Debes aceptar los Términos y las Condiciones de Suscripción en representación de la organización.';
  if (reglasUso && !organizacion && !aceptaciones.reglasUso) return 'Debes aceptar las reglas individuales de uso.';
  if (privacidad && !aceptaciones.privacidad) return 'Debes otorgar el consentimiento informado de privacidad.';
  return '';
};

export const claveParaOperacion = (referencia, datos, crearClave) => {
  const firma = JSON.stringify(datos);
  if (referencia.current?.firma !== firma) referencia.current = { firma, clave: crearClave() };
  return referencia.current.clave;
};

export const copiaDescargable = (doc) => `# ${doc.titulo}\n\nVersión: ${doc.version}\nEstado: ${doc.estado}\n${doc.estado === 'BORRADOR_PRUEBA' ? 'Fecha de referencia del borrador' : 'Fecha de vigencia'}: ${doc.fechaVigencia}\nActualización: ${doc.fechaActualizacion}\nSHA-256: ${doc.hashSha256}\n\n${doc.contenido}`;

export const formatearFechaLegal = (fecha, conHora = false) => {
  if (!fecha) return 'Sin fecha';
  const valor = new Date(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T12:00:00-06:00` : fecha);
  if (Number.isNaN(valor.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica', dateStyle: 'medium', ...(conHora ? { timeStyle: 'short' } : {})
  }).format(valor);
};

export const enlaceSeguro = (url) => /^(https?:\/\/|mailto:|\/legal(?:[\/#]|$)|#[\w-]+)/i.test(url) ? url : null;
