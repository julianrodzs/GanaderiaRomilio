const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { ETIQUETAS_PESAJE, tipoPesajeVisible } = require('../config/tiposPesaje');
const textoExcel = (v) => /^[=+@-]/.test(String(v || '')) ? `'${v}` : String(v || '');
const filasPesajes = (pesajes) => pesajes.map((p) => ({
    Fecha: new Date(p.fecha).toLocaleDateString('es-CR', { timeZone: 'UTC' }),
    DIIO: textoExcel(p.animal?.diio || p.animal?.identificadorFinca || '--'),
    Nombre: textoExcel(p.animal?.nombre), Especie: p.animal?.especie || 'Bovino',
    'Tipo de pesaje': ETIQUETAS_PESAJE[tipoPesajeVisible(p.tipoPesaje)], 'Peso kg': p.peso
}));
const exportarPesajesExcel = (pesajes) => {
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(filasPesajes(pesajes), { header: ['Fecha', 'DIIO', 'Nombre', 'Especie', 'Tipo de pesaje', 'Peso kg'] });
    hoja['!cols'] = [14, 20, 30, 14, 24, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, hoja, 'Pesajes');
    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
};
const exportarPesajesPdf = (pesajes) => new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 }), partes = [];
    doc.on('data', (p) => partes.push(p)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    doc.fontSize(18).text('Pesajes de animales');
    const columnas = [100, 145, 170, 85, 155, 85], claves = ['Fecha', 'DIIO', 'Nombre', 'Especie', 'Tipo de pesaje', 'Peso kg'];
    let y = 76;
    const fila = (valores, encabezado = false) => {
        doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        valores = valores.map((v) => String(v ?? '--').length > 180 ? `${String(v).slice(0, 177)}...` : String(v ?? '--'));
        const altura = Math.max(...valores.map((v, i) => doc.heightOfString(v, { width: columnas[i] - 8 })), 12) + 10;
        if (y + altura > doc.page.height - 36) { doc.addPage(); y = 36; fila(claves, true); }
        doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        let x = 36;
        valores.forEach((v, i) => { doc.text(String(v ?? '--'), x, y, { width: columnas[i] - 8 }); x += columnas[i]; });
        y += altura;
    };
    fila(claves, true); filasPesajes(pesajes).forEach((f) => fila(claves.map((k) => f[k]))); doc.end();
});
module.exports = { filasPesajes, exportarPesajesExcel, exportarPesajesPdf };
