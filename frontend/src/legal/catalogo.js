import catalogo from './documentos.json';
import { SLUGS_PUBLICOS } from './legal.mjs';

export const documentosPublicos = SLUGS_PUBLICOS.map((slug) => catalogo.find((doc) => doc.slug === slug)).filter(Boolean);
