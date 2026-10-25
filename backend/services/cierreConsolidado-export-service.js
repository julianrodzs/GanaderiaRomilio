const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const numero = (valor) => Number(valor || 0);
const fechaExcel = (valor) => (valor ? new Date(valor) : null);
const monedasDe = (objeto = {}) => objeto.monedas || {
    CRC: { ingresos: numero(objeto.ingresos), egresos: numero(objeto.egresos), balance: numero(objeto.balance) },
    USD: { ingresos: 0, egresos: 0, balance: 0 }
};
const valorMoneda = (objeto, moneda, campo) => numero(monedasDe(objeto)?.[moneda]?.[campo]);

const filasResumen = (cierre) => [{
    Cierre: cierre.nombre,
    'Fecha inicio': fechaExcel(cierre.fechaInicio),
    'Fecha fin': fechaExcel(cierre.fechaFin),
    Especie: cierre.especie,
    'Versión cálculo': cierre.versionCalculo || 'legacy',
    Fincas: numero(cierre.datos?.consolidado?.fincas),
    'Animales al corte': numero(cierre.datos?.consolidado?.animalesActivos),
    Bovinos: numero(cierre.datos?.consolidado?.bovinos),
    Porcinos: numero(cierre.datos?.consolidado?.porcinos),
    'Ingresos CRC': valorMoneda(cierre.datos?.consolidado, 'CRC', 'ingresos'),
    'Egresos CRC': valorMoneda(cierre.datos?.consolidado, 'CRC', 'egresos'),
    'Balance CRC': valorMoneda(cierre.datos?.consolidado, 'CRC', 'balance'),
    'Ingresos USD': valorMoneda(cierre.datos?.consolidado, 'USD', 'ingresos'),
    'Egresos USD': valorMoneda(cierre.datos?.consolidado, 'USD', 'egresos'),
    'Balance USD': valorMoneda(cierre.datos?.consolidado, 'USD', 'balance'),
    Partos: numero(cierre.datos?.consolidado?.partos),
    Destetes: numero(cierre.datos?.consolidado?.destetes),
    'Aplicaciones sanitarias': numero(cierre.datos?.consolidado?.aplicaciones)
}];

const filasFincas = (cierre) => (cierre.datos?.fincas || []).map((item) => ({
    Código: item.finca?.codigo,
    Finca: item.finca?.nombre,
    'Animales al corte': numero(item.inventario?.activos),
    Bovinos: numero(item.inventario?.bovinos),
    Porcinos: numero(item.inventario?.porcinos),
    'Peso promedio kg': item.inventario?.pesoPromedio ?? '',
    'Ingresos CRC': valorMoneda(item.finanzas, 'CRC', 'ingresos'),
    'Egresos CRC': valorMoneda(item.finanzas, 'CRC', 'egresos'),
    'Balance CRC': valorMoneda(item.finanzas, 'CRC', 'balance'),
    'Ingresos USD': valorMoneda(item.finanzas, 'USD', 'ingresos'),
    'Egresos USD': valorMoneda(item.finanzas, 'USD', 'egresos'),
    'Balance USD': valorMoneda(item.finanzas, 'USD', 'balance'),
    Partos: numero(item.reproduccion?.partos),
    Destetes: numero(item.reproduccion?.destetes),
    Aplicaciones: numero(item.sanidad?.aplicaciones),
    'Tratamientos activos': numero(item.sanidad?.tratamientosActivos)
}));

const aplicarFormatoFechas = (hoja, filas, columnas) => {
    columnas.forEach((columna) => {
        const indice = Object.keys(filas[0] || {}).indexOf(columna);
        if (indice < 0) return;
        for (let fila = 2; fila <= filas.length + 1; fila += 1) {
            const celda = hoja[XLSX.utils.encode_cell({ r: fila - 1, c: indice })];
            if (celda?.v instanceof Date) celda.z = 'dd/mm/yyyy';
        }
    });
};

const exportarCierreExcel = (cierre) => {
    const libro = XLSX.utils.book_new();
    const resumen = filasResumen(cierre);
    const fincas = filasFincas(cierre);
    const metas = (cierre.datos?.metas || []).map((meta) => ({
        Nombre: meta.nombre, Alcance: meta.alcance, Finca: meta.finca?.nombre || 'Organización',
        Inicio: fechaExcel(meta.fechaInicio), Fin: fechaExcel(meta.fechaFin), Metas: JSON.stringify(meta.metas || {})
    }));
    const hojaResumen = XLSX.utils.json_to_sheet(resumen, { cellDates: true });
    const hojaFincas = XLSX.utils.json_to_sheet(fincas, { cellDates: true });
    const hojaEvolucion = XLSX.utils.json_to_sheet(cierre.datos?.evolucionMensual || [], { cellDates: true });
    const hojaMetas = XLSX.utils.json_to_sheet(metas, { cellDates: true });
    aplicarFormatoFechas(hojaResumen, resumen, ['Fecha inicio', 'Fecha fin']);
    aplicarFormatoFechas(hojaMetas, metas, ['Inicio', 'Fin']);
    XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');
    XLSX.utils.book_append_sheet(libro, hojaFincas, 'Fincas');
    XLSX.utils.book_append_sheet(libro, hojaEvolucion, 'Evolución mensual');
    XLSX.utils.book_append_sheet(libro, hojaMetas, 'Metas');
    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', cellDates: true });
};

const COLUMNAS_PDF = [
    { clave: 'Finca', titulo: 'Finca', x: 36, ancho: 125 },
    { clave: 'Animales al corte', titulo: 'Animales', x: 164, ancho: 52 },
    { clave: 'Ingresos CRC', titulo: 'Ing. CRC', x: 219, ancho: 70 },
    { clave: 'Egresos CRC', titulo: 'Egr. CRC', x: 292, ancho: 70 },
    { clave: 'Balance CRC', titulo: 'Bal. CRC', x: 365, ancho: 70 },
    { clave: 'Ingresos USD', titulo: 'Ing. USD', x: 438, ancho: 65 },
    { clave: 'Egresos USD', titulo: 'Egr. USD', x: 506, ancho: 65 },
    { clave: 'Balance USD', titulo: 'Bal. USD', x: 574, ancho: 65 },
    { clave: 'Partos', titulo: 'Partos', x: 642, ancho: 43 },
    { clave: 'Destetes', titulo: 'Destetes', x: 688, ancho: 48 }
];

const dibujarEncabezadoTabla = (documento, y) => {
    documento.font('Helvetica-Bold').fontSize(8);
    const alturas = COLUMNAS_PDF.map((columna) => documento.heightOfString(columna.titulo, { width: columna.ancho }));
    COLUMNAS_PDF.forEach((columna) => documento.text(columna.titulo, columna.x, y, { width: columna.ancho }));
    documento.font('Helvetica');
    return y + Math.max(...alturas, 10) + 7;
};

const dibujarFilaTabla = (documento, fila, y) => {
    documento.fontSize(8);
    const valores = COLUMNAS_PDF.map((columna) => String(fila[columna.clave] ?? '--'));
    const alturas = valores.map((valor, indice) => documento.heightOfString(valor, { width: COLUMNAS_PDF[indice].ancho }));
    valores.forEach((valor, indice) => documento.text(valor, COLUMNAS_PDF[indice].x, y, { width: COLUMNAS_PDF[indice].ancho }));
    return y + Math.max(...alturas, 10) + 7;
};

const exportarCierrePdf = (cierre) => new Promise((resolve, reject) => {
    const documento = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const partes = [];
    documento.on('data', (parte) => partes.push(parte));
    documento.on('end', () => resolve(Buffer.concat(partes)));
    documento.on('error', reject);
    const resumen = filasResumen(cierre)[0];
    documento.fontSize(18).text(cierre.nombre || 'Cierre histórico');
    documento.moveDown(0.35).fontSize(10).fillColor('#405047')
        .text(`${new Date(cierre.fechaInicio).toLocaleDateString('es-CR', { timeZone: 'UTC' })} a ${new Date(cierre.fechaFin).toLocaleDateString('es-CR', { timeZone: 'UTC' })} · ${resumen.Especie}`);
    documento.moveDown().fillColor('#111111').fontSize(10)
        .text(`CRC: ingresos ${resumen['Ingresos CRC']} · egresos ${resumen['Egresos CRC']} · balance ${resumen['Balance CRC']}`)
        .text(`USD: ingresos ${resumen['Ingresos USD']} · egresos ${resumen['Egresos USD']} · balance ${resumen['Balance USD']}`);
    documento.moveDown(0.8).fontSize(13).text('Comparativo por finca');
    let y = dibujarEncabezadoTabla(documento, documento.y + 6);
    filasFincas(cierre).forEach((fila) => {
        const altura = Math.max(...COLUMNAS_PDF.map((columna) => documento.heightOfString(String(fila[columna.clave] ?? '--'), { width: columna.ancho }))) + 7;
        if (y + altura > documento.page.height - 36) {
            documento.addPage();
            y = dibujarEncabezadoTabla(documento, 36);
        }
        y = dibujarFilaTabla(documento, fila, y);
    });
    documento.end();
});

module.exports = {
    COLUMNAS_PDF,
    dibujarEncabezadoTabla,
    dibujarFilaTabla,
    exportarCierreExcel,
    exportarCierrePdf,
    filasFincas,
    filasResumen
};
