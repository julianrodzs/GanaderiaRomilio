const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const numero = (valor) => Number(valor || 0);
const fecha = (valor) => valor ? new Date(valor).toLocaleDateString('es-CR') : '';

const filasResumen = (cierre) => [{
    Cierre: cierre.nombre,
    'Fecha inicio': fecha(cierre.fechaInicio),
    'Fecha fin': fecha(cierre.fechaFin),
    Especie: cierre.especie,
    Fincas: numero(cierre.datos?.consolidado?.fincas),
    'Animales activos': numero(cierre.datos?.consolidado?.animalesActivos),
    Bovinos: numero(cierre.datos?.consolidado?.bovinos),
    Porcinos: numero(cierre.datos?.consolidado?.porcinos),
    Ingresos: numero(cierre.datos?.consolidado?.ingresos),
    Egresos: numero(cierre.datos?.consolidado?.egresos),
    Balance: numero(cierre.datos?.consolidado?.balance),
    Partos: numero(cierre.datos?.consolidado?.partos),
    Destetes: numero(cierre.datos?.consolidado?.destetes),
    'Aplicaciones sanitarias': numero(cierre.datos?.consolidado?.aplicaciones)
}];

const filasFincas = (cierre) => (cierre.datos?.fincas || []).map((item) => ({
    Código: item.finca?.codigo,
    Finca: item.finca?.nombre,
    Activos: numero(item.inventario?.activos),
    Bovinos: numero(item.inventario?.bovinos),
    Porcinos: numero(item.inventario?.porcinos),
    'Peso promedio kg': item.inventario?.pesoPromedio ?? '',
    Ingresos: numero(item.finanzas?.ingresos),
    Egresos: numero(item.finanzas?.egresos),
    Balance: numero(item.finanzas?.balance),
    Partos: numero(item.reproduccion?.partos),
    Destetes: numero(item.reproduccion?.destetes),
    Aplicaciones: numero(item.sanidad?.aplicaciones),
    'Tratamientos activos': numero(item.sanidad?.tratamientosActivos)
}));

const exportarCierreExcel = (cierre) => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasResumen(cierre)), 'Resumen');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasFincas(cierre)), 'Fincas');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(cierre.datos?.evolucionMensual || []), 'Evolución mensual');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet((cierre.datos?.metas || []).map((meta) => ({
        Nombre: meta.nombre,
        Alcance: meta.alcance,
        Finca: meta.finca?.nombre || 'Organización',
        Inicio: fecha(meta.fechaInicio),
        Fin: fecha(meta.fechaFin),
        Metas: JSON.stringify(meta.metas || {})
    }))), 'Metas');
    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
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
        .text(`${resumen['Fecha inicio']} a ${resumen['Fecha fin']} · ${resumen.Especie}`);
    documento.moveDown().fillColor('#111111').fontSize(11)
        .text(`Fincas: ${resumen.Fincas}   Animales activos: ${resumen['Animales activos']}   Ingresos: ${resumen.Ingresos}   Egresos: ${resumen.Egresos}   Balance: ${resumen.Balance}`);
    documento.moveDown(1.2).fontSize(13).text('Comparativo por finca');

    const columnas = [36, 210, 295, 365, 455, 545, 635, 720];
    const encabezados = ['Finca', 'Activos', 'Peso kg', 'Ingresos', 'Egresos', 'Balance', 'Partos', 'Destetes'];
    documento.moveDown(0.6).fontSize(9).font('Helvetica-Bold');
    encabezados.forEach((texto, indice) => documento.text(texto, columnas[indice], documento.y, { width: indice === 0 ? 165 : 80 }));
    documento.moveDown(1.2).font('Helvetica');
    filasFincas(cierre).forEach((item) => {
        if (documento.y > 520) documento.addPage();
        const y = documento.y;
        [item.Finca, item.Activos, item['Peso promedio kg'] || '--', item.Ingresos, item.Egresos, item.Balance, item.Partos, item.Destetes]
            .forEach((valor, indice) => documento.text(String(valor ?? '--'), columnas[indice], y, { width: indice === 0 ? 165 : 80 }));
        documento.y = y + 18;
    });
    documento.end();
});

module.exports = {
    exportarCierreExcel,
    exportarCierrePdf,
    filasFincas,
    filasResumen
};
