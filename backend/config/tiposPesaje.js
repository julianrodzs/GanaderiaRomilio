const TIPOS_PESAJE = Object.freeze(['REGULAR', 'NACIMIENTO', 'DESTETE', 'ENTRADA_ENGORDE', 'SALIDA_VENTA']);
const ORIGENES_PESAJE = Object.freeze(['Individual', 'Lote', 'Importacion']);
const ETIQUETAS_PESAJE = Object.freeze({ REGULAR: 'Regular', NACIMIENTO: 'Nacimiento', DESTETE: 'Destete', ENTRADA_ENGORDE: 'Entrada a engorde', SALIDA_VENTA: 'Salida / Venta' });
const tipoPesajeVisible = (valor) => TIPOS_PESAJE.includes(valor) ? valor : 'REGULAR';
const origenPesaje = (pesaje) => pesaje.origenPesaje || (ORIGENES_PESAJE.includes(pesaje.tipoPesaje) ? pesaje.tipoPesaje : 'Individual');
const filtroTipoPesaje = (tipo) => {
    if (!tipo || tipo === 'Todos') return {};
    if (!TIPOS_PESAJE.includes(tipo)) throw Object.assign(new Error('Tipo de pesaje no valido.'), { status: 422 });
    return tipo === 'REGULAR' ? { $or: [{ tipoPesaje: { $in: ['REGULAR', ...ORIGENES_PESAJE] } }, { tipoPesaje: null }] } : { tipoPesaje: tipo };
};
module.exports = { TIPOS_PESAJE, ORIGENES_PESAJE, ETIQUETAS_PESAJE, tipoPesajeVisible, origenPesaje, filtroTipoPesaje };
