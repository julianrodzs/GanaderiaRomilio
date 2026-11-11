import MarkdownIt from 'markdown-it';
import { enlaceSeguro } from './legal.mjs';

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
markdown.disable('image');
markdown.validateLink = (url) => enlaceSeguro(url) !== null;
markdown.core.ruler.push('secciones-legales', (state) => {
  state.env.indiceLegal = [];
  for (let i = 0; i < state.tokens.length; i += 1) {
    const token = state.tokens[i];
    if (token.type === 'heading_open') {
      const id = `seccion-${state.env.indiceLegal.length + 1}`;
      token.attrSet('id', id);
      const texto = (state.tokens[i + 1]?.children || []).filter((item) => item.type === 'text' || item.type === 'code_inline').map((item) => item.content).join('');
      state.env.indiceLegal.push({ id, texto });
      if (token.tag === 'h1') {
        token.tag = 'h2';
        state.tokens[i + 2].tag = 'h2';
      }
    }
    if (token.type === 'inline') for (const child of token.children || []) {
      if (child.type === 'link_open' && !child.attrGet('href')?.startsWith('#')) {
        child.attrSet('target', '_blank'); child.attrSet('rel', 'noopener noreferrer');
      }
    }
  }
});

export const parsearTextoLegal = (contenido = '') => {
  const entorno = {};
  return { html: markdown.render(contenido, entorno), indice: entorno.indiceLegal };
};
