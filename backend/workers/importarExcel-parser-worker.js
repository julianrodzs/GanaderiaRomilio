const { parentPort, workerData } = require('node:worker_threads');
const XLSX = require('xlsx');

const crearError = (mensaje, codigo) => Object.assign(new Error(mensaje), { codigo });

const validarFirmaXlsx = (buffer) => {
    const firma = buffer.subarray(0, 4);
    const esZip = firma.length === 4
        && firma[0] === 0x50
        && firma[1] === 0x4b
        && [0x03, 0x05, 0x07].includes(firma[2]);
    if (!esZip) {
        throw crearError('El archivo no es un libro XLSX válido.', 'TIPO_ARCHIVO_INVALIDO');
    }
};

const serializarHoja = (hoja, nombre, limites) => {
    if (hoja['!ref']) {
        const rangoDeclarado = XLSX.utils.decode_range(hoja['!ref']);
        const filasDeclaradas = rangoDeclarado.e.r - rangoDeclarado.s.r + 1;
        const columnasDeclaradas = rangoDeclarado.e.c - rangoDeclarado.s.c + 1;
        if (filasDeclaradas > limites.filas || columnasDeclaradas > limites.columnas) {
            throw crearError(
                `La hoja ${nombre} declara ${filasDeclaradas} filas y ${columnasDeclaradas} columnas; el máximo permitido es ${limites.filas} x ${limites.columnas}.`,
                'DIMENSION_EXCEDIDA'
            );
        }
    }

    const celdas = [];
    let filaMaxima = -1;
    let columnaMaxima = -1;
    for (const [direccion, celda] of Object.entries(hoja)) {
        if (direccion.startsWith('!') || !celda || celda.v === undefined || celda.v === null) continue;
        const posicion = XLSX.utils.decode_cell(direccion);
        filaMaxima = Math.max(filaMaxima, posicion.r);
        columnaMaxima = Math.max(columnaMaxima, posicion.c);
        if (filaMaxima + 1 > limites.filas || columnaMaxima + 1 > limites.columnas) {
            throw crearError(
                `La hoja ${nombre} supera el máximo de ${limites.filas} filas o ${limites.columnas} columnas.`,
                'DIMENSION_EXCEDIDA'
            );
        }
        if (celda.f) {
            throw crearError(`La hoja ${nombre}, celda ${direccion}, contiene una fórmula. Reemplácela por su valor.`, 'FORMULA_NO_PERMITIDA');
        }
        if (typeof celda.v === 'string' && celda.v.length > limites.longitudCelda) {
            throw crearError(
                `La hoja ${nombre}, celda ${direccion}, supera ${limites.longitudCelda} caracteres.`,
                'CELDA_DEMASIADO_LARGA'
            );
        }
        celdas.push([posicion.r, posicion.c, celda.v]);
    }

    if (filaMaxima < 0 || columnaMaxima < 0) return [];
    const matriz = Array.from({ length: filaMaxima + 1 }, () => Array(columnaMaxima + 1).fill(null));
    celdas.forEach(([fila, columna, valor]) => { matriz[fila][columna] = valor; });
    return matriz;
};

try {
    const buffer = Buffer.from(workerData.buffer);
    validarFirmaXlsx(buffer);
    const limites = workerData.limites;
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });
    if (workbook.SheetNames.length > limites.hojas) {
        throw crearError(`El libro supera el máximo de ${limites.hojas} hojas.`, 'DEMASIADAS_HOJAS');
    }
    const hojas = {};
    workbook.SheetNames.forEach((nombre) => {
        hojas[nombre] = serializarHoja(workbook.Sheets[nombre], nombre, limites);
    });
    parentPort.postMessage({ ok: true, workbook: { SheetNames: workbook.SheetNames, Sheets: hojas } });
} catch (error) {
    parentPort.postMessage({
        ok: false,
        error: { mensaje: error.message || 'No se pudo leer el archivo XLSX.', codigo: error.codigo || 'XLSX_INVALIDO' }
    });
}
