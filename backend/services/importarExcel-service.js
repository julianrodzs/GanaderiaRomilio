const XLSX = require('xlsx');
const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const Pesaje = require('../models/Pesaje');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const {
    CATEGORIAS_FINANCIERAS,
    DESTINOS_USO_FINANCIERO,
    METODOS_PAGO_FINANCIERO,
    MONEDAS_FINANCIERAS,
    NATURALEZAS_FINANCIERAS,
    TIPOS_MOVIMIENTO_FINANCIERO
} = require('../config/catalogosFinancieros');

const VERSION_PLANTILLA = '1';
const HOJAS_DATOS = ['POTREROS', 'INVENTARIO', 'FINANZAS', 'PESAJES'];
const HOJAS_AUXILIARES = ['INSTRUCCIONES', 'CATALOGOS'];

const COLUMNAS = {
    POTREROS: {
        requeridas: ['CODIGO', 'NOMBRE'],
        opcionales: ['AREA_HECTAREAS', 'CAPACIDAD_MAXIMA', 'UBICACION', 'ESTADO', 'OBSERVACIONES']
    },
    INVENTARIO: {
        requeridas: ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA'],
        opcionales: [
            'NOMBRE', 'RAZA', 'FECHA_NACIMIENTO', 'MADRE_DIIO', 'PADRE_DIIO',
            'PESO_ACTUAL_KG', 'ESTADO', 'ESTADO_SANITARIO', 'POTRERO_CODIGO', 'OBSERVACIONES'
        ]
    },
    FINANZAS: {
        requeridas: ['FECHA', 'NATURALEZA', 'TIPO_MOVIMIENTO', 'CATEGORIA', 'DESCRIPCION', 'MONTO', 'MONEDA'],
        opcionales: [
            'PRODUCTO', 'CANTIDAD', 'UNIDAD', 'PRECIO_UNITARIO', 'PROVEEDOR', 'DESTINO_USO',
            'METODO_PAGO', 'COMPROBANTE', 'EMPLEADO', 'FINCA', 'OBSERVACIONES'
        ]
    },
    PESAJES: {
        requeridas: ['DIIO', 'FECHA', 'PESO_KG'],
        opcionales: ['OBSERVACIONES']
    }
};

const CATEGORIAS_POR_ESPECIE = {
    Bovino: ['Ternero', 'Novillo', 'Novilla', 'Toro', 'Vaca', 'Otro'],
    Porcino: ['Chancha', 'Verraco', 'Lechón', 'Engorde', 'Reemplazo', 'Otro']
};

const limpiarTexto = (valor) => {
    if (valor === undefined || valor === null) return '';
    return String(valor).trim();
};

const normalizarTexto = (valor) => limpiarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const normalizarEncabezado = (valor) => normalizarTexto(valor)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const valorCanonico = (valor, opciones) => {
    const buscado = normalizarTexto(valor);
    return opciones.find((opcion) => normalizarTexto(opcion) === buscado);
};

const numero = (valor) => {
    if (valor === undefined || valor === null || valor === '') return undefined;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;

    let texto = limpiarTexto(valor).replace(/[₡$\s]/g, '');
    const ultimaComa = texto.lastIndexOf(',');
    const ultimoPunto = texto.lastIndexOf('.');

    if (ultimaComa >= 0 && ultimoPunto >= 0) {
        const separadorDecimal = ultimaComa > ultimoPunto ? ',' : '.';
        const separadorMiles = separadorDecimal === ',' ? /\./g : /,/g;
        texto = texto.replace(separadorMiles, '').replace(separadorDecimal, '.');
    } else if (ultimaComa >= 0) {
        texto = texto.replace(',', '.');
    }

    const resultado = Number(texto);
    return Number.isFinite(resultado) ? resultado : undefined;
};

const fecha = (valor) => {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate(), 12);
    }

    if (typeof valor === 'number') {
        const partes = XLSX.SSF.parse_date_code(valor);
        if (partes) return new Date(partes.y, partes.m - 1, partes.d, 12);
    }

    const texto = limpiarTexto(valor);
    let coincidencia = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (coincidencia) {
        const [, dia, mes, anio] = coincidencia;
        const resultado = new Date(Number(anio), Number(mes) - 1, Number(dia), 12);
        if (resultado.getFullYear() === Number(anio)
            && resultado.getMonth() === Number(mes) - 1
            && resultado.getDate() === Number(dia)) return resultado;
        return undefined;
    }

    coincidencia = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (coincidencia) {
        const [, anio, mes, dia] = coincidencia;
        const resultado = new Date(Number(anio), Number(mes) - 1, Number(dia), 12);
        if (resultado.getFullYear() === Number(anio)
            && resultado.getMonth() === Number(mes) - 1
            && resultado.getDate() === Number(dia)) return resultado;
    }

    return undefined;
};

const claveFecha = (valor) => {
    const anio = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
};

const filaVacia = (fila = []) => fila.every((valor) => limpiarTexto(valor) === '');

const agregarError = (errores, hoja, fila, campo, valor, mensaje, codigo = 'VALOR_INVALIDO') => {
    errores.push({ hoja, fila, campo, valor: limpiarTexto(valor), mensaje, codigo });
};

const crearLectorFila = (encabezados, fila) => {
    const indice = new Map(encabezados.map((encabezado, posicion) => [encabezado, posicion]));
    return (columna) => fila[indice.get(columna)];
};

const prepararHoja = (workbook, nombreHoja, errores, advertencias) => {
    const nombreReal = workbook.SheetNames.find((nombre) => normalizarTexto(nombre) === nombreHoja);
    if (!nombreReal) return null;

    const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nombreReal], {
        header: 1,
        defval: null,
        raw: true
    });
    const encabezados = (matriz[0] || []).map(normalizarEncabezado);
    const duplicados = encabezados.filter((encabezado, indice) => encabezado && encabezados.indexOf(encabezado) !== indice);
    const configuracion = COLUMNAS[nombreHoja];

    if (duplicados.length) {
        agregarError(errores, nombreHoja, 1, duplicados.join(', '), '', 'Hay encabezados duplicados.', 'ENCABEZADO_DUPLICADO');
    }

    configuracion.requeridas.forEach((columna) => {
        if (!encabezados.includes(columna)) {
            agregarError(errores, nombreHoja, 1, columna, '', `Falta la columna obligatoria ${columna}.`, 'COLUMNA_FALTANTE');
        }
    });

    const permitidas = new Set([...configuracion.requeridas, ...configuracion.opcionales]);
    const desconocidas = encabezados.filter((encabezado) => encabezado && !permitidas.has(encabezado));
    if (desconocidas.length) {
        advertencias.push({
            hoja: nombreHoja,
            mensaje: `Se ignorarán columnas fuera del estándar: ${desconocidas.join(', ')}.`
        });
    }

    return {
        nombreReal,
        encabezados,
        filas: matriz.slice(1),
        columnasValidas: configuracion.requeridas.every((columna) => encabezados.includes(columna)) && !duplicados.length
    };
};

const mapearPotreros = (hoja, errores) => {
    const registros = [];
    const codigos = new Set();

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const codigo = limpiarTexto(leer('CODIGO'));
        const nombre = limpiarTexto(leer('NOMBRE'));
        const area = numero(leer('AREA_HECTAREAS'));
        const capacidadMaxima = numero(leer('CAPACIDAD_MAXIMA'));
        const estadoTexto = limpiarTexto(leer('ESTADO')) || 'Disponible';
        const estado = valorCanonico(estadoTexto, ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento']);

        if (!codigo) agregarError(errores, 'POTREROS', numeroFila, 'CODIGO', '', 'El código es obligatorio.', 'CAMPO_REQUERIDO');
        if (!nombre) agregarError(errores, 'POTREROS', numeroFila, 'NOMBRE', '', 'El nombre es obligatorio.', 'CAMPO_REQUERIDO');
        if (codigo && codigos.has(normalizarTexto(codigo))) agregarError(errores, 'POTREROS', numeroFila, 'CODIGO', codigo, 'El código está repetido dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (limpiarTexto(leer('AREA_HECTAREAS')) && (area === undefined || area < 0)) agregarError(errores, 'POTREROS', numeroFila, 'AREA_HECTAREAS', leer('AREA_HECTAREAS'), 'Debe ser un número mayor o igual a cero.');
        if (limpiarTexto(leer('CAPACIDAD_MAXIMA')) && (capacidadMaxima === undefined || capacidadMaxima < 0)) agregarError(errores, 'POTREROS', numeroFila, 'CAPACIDAD_MAXIMA', leer('CAPACIDAD_MAXIMA'), 'Debe ser un número mayor o igual a cero.');
        if (!estado) agregarError(errores, 'POTREROS', numeroFila, 'ESTADO', estadoTexto, 'Estado de potrero no permitido.');

        if (codigo) codigos.add(normalizarTexto(codigo));
        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            codigo,
            nombre,
            area,
            capacidadMaxima,
            ubicacion: limpiarTexto(leer('UBICACION')) || undefined,
            estado,
            observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined
        });
    });

    return registros;
};

const mapearInventario = (hoja, errores) => {
    const registros = [];
    const diios = new Set();

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const diio = limpiarTexto(leer('DIIO'));
        const especie = valorCanonico(leer('ESPECIE'), ['Bovino', 'Porcino']);
        const sexo = valorCanonico(leer('SEXO'), ['Macho', 'Hembra']);
        const categoriaTexto = limpiarTexto(leer('CATEGORIA'));
        const categoria = especie ? valorCanonico(categoriaTexto, CATEGORIAS_POR_ESPECIE[especie]) : undefined;
        const nacimiento = fecha(leer('FECHA_NACIMIENTO'));
        const pesoActual = numero(leer('PESO_ACTUAL_KG'));
        const estadoTexto = limpiarTexto(leer('ESTADO')) || 'Activo';
        const estado = valorCanonico(estadoTexto, ['Activo', 'Vendido', 'Muerto']);
        const sanitarioTexto = limpiarTexto(leer('ESTADO_SANITARIO')) || 'Sano';
        const estadoSanitario = valorCanonico(sanitarioTexto, ['Sano', 'En observación', 'Enfermo', 'Recuperación']);

        if (!diio) agregarError(errores, 'INVENTARIO', numeroFila, 'DIIO', '', 'El DIIO es obligatorio.', 'CAMPO_REQUERIDO');
        if (!especie) agregarError(errores, 'INVENTARIO', numeroFila, 'ESPECIE', leer('ESPECIE'), 'Usa Bovino o Porcino.');
        if (!sexo) agregarError(errores, 'INVENTARIO', numeroFila, 'SEXO', leer('SEXO'), 'Usa Macho o Hembra.');
        if (!categoria) agregarError(errores, 'INVENTARIO', numeroFila, 'CATEGORIA', categoriaTexto, especie ? `La categoría no corresponde a ${especie}. Opciones: ${CATEGORIAS_POR_ESPECIE[especie].join(', ')}.` : 'La categoría no se puede validar sin una especie válida.');
        if (diio && diios.has(normalizarTexto(diio))) agregarError(errores, 'INVENTARIO', numeroFila, 'DIIO', diio, 'El DIIO está repetido dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (limpiarTexto(leer('FECHA_NACIMIENTO')) && !nacimiento) agregarError(errores, 'INVENTARIO', numeroFila, 'FECHA_NACIMIENTO', leer('FECHA_NACIMIENTO'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (limpiarTexto(leer('PESO_ACTUAL_KG')) && (pesoActual === undefined || pesoActual < 0)) agregarError(errores, 'INVENTARIO', numeroFila, 'PESO_ACTUAL_KG', leer('PESO_ACTUAL_KG'), 'Debe ser un número mayor o igual a cero.');
        if (!estado) agregarError(errores, 'INVENTARIO', numeroFila, 'ESTADO', estadoTexto, 'Estado general no permitido.');
        if (!estadoSanitario) agregarError(errores, 'INVENTARIO', numeroFila, 'ESTADO_SANITARIO', sanitarioTexto, 'Estado sanitario no permitido.');

        if (diio) diios.add(normalizarTexto(diio));
        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            identificadorFinca: diio,
            diio,
            especie,
            sexo,
            categoria,
            nombre: limpiarTexto(leer('NOMBRE')) || undefined,
            raza: limpiarTexto(leer('RAZA')) || undefined,
            fechaNacimiento: nacimiento,
            madreDiio: limpiarTexto(leer('MADRE_DIIO')) || undefined,
            padreDiio: limpiarTexto(leer('PADRE_DIIO')) || undefined,
            pesoActual,
            estado,
            estadoSanitario,
            potreroCodigo: limpiarTexto(leer('POTRERO_CODIGO')) || undefined,
            observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined
        });
    });

    return registros;
};

const mapearFinanzas = (hoja, errores, catalogos) => {
    const registros = [];
    const categorias = catalogos.categorias?.length ? catalogos.categorias : CATEGORIAS_FINANCIERAS;
    const destinos = catalogos.destinosUso?.length ? catalogos.destinosUso : DESTINOS_USO_FINANCIERO;

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const fechaMovimiento = fecha(leer('FECHA'));
        const naturaleza = valorCanonico(leer('NATURALEZA'), NATURALEZAS_FINANCIERAS);
        const tipoMovimiento = valorCanonico(leer('TIPO_MOVIMIENTO'), TIPOS_MOVIMIENTO_FINANCIERO);
        const categoria = valorCanonico(leer('CATEGORIA'), categorias);
        const descripcion = limpiarTexto(leer('DESCRIPCION'));
        const monto = numero(leer('MONTO'));
        const moneda = valorCanonico(leer('MONEDA'), MONEDAS_FINANCIERAS);
        const cantidad = numero(leer('CANTIDAD'));
        const precioUnitario = numero(leer('PRECIO_UNITARIO'));
        const destinoTexto = limpiarTexto(leer('DESTINO_USO'));
        const destinoUso = destinoTexto ? valorCanonico(destinoTexto, destinos) : undefined;
        const metodoTexto = limpiarTexto(leer('METODO_PAGO'));
        const metodoPago = metodoTexto ? valorCanonico(metodoTexto, METODOS_PAGO_FINANCIERO) : undefined;

        if (!fechaMovimiento) agregarError(errores, 'FINANZAS', numeroFila, 'FECHA', leer('FECHA'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (!naturaleza) agregarError(errores, 'FINANZAS', numeroFila, 'NATURALEZA', leer('NATURALEZA'), 'Usa Ingreso o Egreso.');
        if (!tipoMovimiento) agregarError(errores, 'FINANZAS', numeroFila, 'TIPO_MOVIMIENTO', leer('TIPO_MOVIMIENTO'), `Opciones: ${TIPOS_MOVIMIENTO_FINANCIERO.join(', ')}.`);
        if (!categoria) agregarError(errores, 'FINANZAS', numeroFila, 'CATEGORIA', leer('CATEGORIA'), 'La categoría no está activa en el catálogo financiero.');
        if (!descripcion) agregarError(errores, 'FINANZAS', numeroFila, 'DESCRIPCION', '', 'La descripción es obligatoria.', 'CAMPO_REQUERIDO');
        if (monto === undefined || monto < 0) agregarError(errores, 'FINANZAS', numeroFila, 'MONTO', leer('MONTO'), 'Debe ser un número mayor o igual a cero.');
        if (!moneda) agregarError(errores, 'FINANZAS', numeroFila, 'MONEDA', leer('MONEDA'), 'Usa CRC o USD.');
        if (limpiarTexto(leer('CANTIDAD')) && (cantidad === undefined || cantidad < 0)) agregarError(errores, 'FINANZAS', numeroFila, 'CANTIDAD', leer('CANTIDAD'), 'Debe ser un número mayor o igual a cero.');
        if (limpiarTexto(leer('PRECIO_UNITARIO')) && (precioUnitario === undefined || precioUnitario < 0)) agregarError(errores, 'FINANZAS', numeroFila, 'PRECIO_UNITARIO', leer('PRECIO_UNITARIO'), 'Debe ser un número mayor o igual a cero.');
        if (destinoTexto && !destinoUso) agregarError(errores, 'FINANZAS', numeroFila, 'DESTINO_USO', destinoTexto, 'El destino no está activo en el catálogo financiero.');
        if (metodoTexto && !metodoPago) agregarError(errores, 'FINANZAS', numeroFila, 'METODO_PAGO', metodoTexto, `Opciones: ${METODOS_PAGO_FINANCIERO.join(', ')}.`);

        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            fecha: fechaMovimiento,
            naturaleza,
            tipoMovimiento,
            categoria,
            categoriaNormalizada: categoria,
            descripcion,
            monto,
            moneda,
            producto: limpiarTexto(leer('PRODUCTO')) || undefined,
            cantidad,
            unidad: limpiarTexto(leer('UNIDAD')) || undefined,
            precioUnitario,
            proveedor: limpiarTexto(leer('PROVEEDOR')) || undefined,
            destinoUso,
            metodoPago,
            comprobante: limpiarTexto(leer('COMPROBANTE')) || undefined,
            empleado: limpiarTexto(leer('EMPLEADO')) || undefined,
            finca: limpiarTexto(leer('FINCA')) || undefined,
            observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined
        });
    });

    return registros;
};

const mapearPesajes = (hoja, errores, diiosDisponibles) => {
    const registros = [];
    const claves = new Set();

    hoja.filas.forEach((fila, indice) => {
        if (filaVacia(fila)) return;
        const numeroFila = indice + 2;
        const leer = crearLectorFila(hoja.encabezados, fila);
        const inicioErrores = errores.length;
        const diio = limpiarTexto(leer('DIIO'));
        const fechaPesaje = fecha(leer('FECHA'));
        const peso = numero(leer('PESO_KG'));
        const clave = diio && fechaPesaje ? `${normalizarTexto(diio)}|${claveFecha(fechaPesaje)}` : '';

        if (!diio) agregarError(errores, 'PESAJES', numeroFila, 'DIIO', '', 'El DIIO es obligatorio.', 'CAMPO_REQUERIDO');
        if (diio && !diiosDisponibles.has(normalizarTexto(diio))) agregarError(errores, 'PESAJES', numeroFila, 'DIIO', diio, 'El animal no existe ni está incluido en la hoja INVENTARIO.', 'REFERENCIA_NO_ENCONTRADA');
        if (!fechaPesaje) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (peso === undefined || peso <= 0) agregarError(errores, 'PESAJES', numeroFila, 'PESO_KG', leer('PESO_KG'), 'Debe ser un número mayor que cero.');
        if (clave && claves.has(clave)) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'Ya existe otro pesaje para el mismo DIIO y fecha dentro del archivo.', 'DUPLICADO_ARCHIVO');

        if (clave) claves.add(clave);
        if (errores.length !== inicioErrores) return;

        registros.push({ filaOrigen: numeroFila, diio, fecha: fechaPesaje, peso, observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined });
    });

    return registros;
};

const leerVersion = (workbook) => {
    const nombre = workbook.SheetNames.find((item) => normalizarTexto(item) === 'INSTRUCCIONES');
    if (!nombre) return null;
    const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nombre], { header: 1, defval: null, raw: true });
    const fila = matriz.find((item) => normalizarTexto(item[0]) === 'VERSION_PLANTILLA');
    return fila ? limpiarTexto(fila[1]) : null;
};

const procesarExcelPreview = async (buffer, opciones = {}) => {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const errores = [];
    const advertencias = [];
    const catalogos = opciones.catalogosFinancieros || {};
    const nombresNormalizados = new Set(workbook.SheetNames.map(normalizarTexto));
    const hojasPresentes = HOJAS_DATOS.filter((nombre) => nombresNormalizados.has(nombre));

    if (!hojasPresentes.length) agregarError(errores, 'ARCHIVO', 0, 'HOJAS', workbook.SheetNames.join(', '), `El libro debe contener al menos una hoja estándar: ${HOJAS_DATOS.join(', ')}.`, 'SIN_HOJAS_ESTANDAR');

    const version = leerVersion(workbook);
    if (!version) advertencias.push({ hoja: 'INSTRUCCIONES', mensaje: 'El archivo no declara VERSION_PLANTILLA. Se validará con la versión actual.' });
    else if (version !== VERSION_PLANTILLA) agregarError(errores, 'INSTRUCCIONES', 1, 'VERSION_PLANTILLA', version, `La versión compatible es ${VERSION_PLANTILLA}.`, 'VERSION_NO_COMPATIBLE');

    workbook.SheetNames.forEach((nombre) => {
        const normalizado = normalizarTexto(nombre);
        if (![...HOJAS_DATOS, ...HOJAS_AUXILIARES].includes(normalizado)) advertencias.push({ hoja: nombre, mensaje: 'Hoja fuera del estándar. No será importada.' });
    });

    const preparadas = {};
    hojasPresentes.forEach((nombre) => { preparadas[nombre] = prepararHoja(workbook, nombre, errores, advertencias); });

    const registros = {
        Potrero: preparadas.POTREROS?.columnasValidas ? mapearPotreros(preparadas.POTREROS, errores) : [],
        Animal: preparadas.INVENTARIO?.columnasValidas ? mapearInventario(preparadas.INVENTARIO, errores) : [],
        MovimientoFinanciero: preparadas.FINANZAS?.columnasValidas ? mapearFinanzas(preparadas.FINANZAS, errores, catalogos) : [],
        Pesaje: []
    };
    const diiosDisponibles = new Set([...(opciones.diiosExistentes || []).map(normalizarTexto), ...registros.Animal.map((animal) => normalizarTexto(animal.diio))]);
    if (preparadas.PESAJES?.columnasValidas) registros.Pesaje = mapearPesajes(preparadas.PESAJES, errores, diiosDisponibles);

    const resumen = {
        Potrero: registros.Potrero.length,
        Animal: registros.Animal.length,
        MovimientoFinanciero: registros.MovimientoFinanciero.length,
        Pesaje: registros.Pesaje.length,
        filasInvalidas: new Set(errores.filter((item) => item.fila > 1).map((item) => `${item.hoja}:${item.fila}`)).size
    };
    const totalRegistros = resumen.Potrero + resumen.Animal + resumen.MovimientoFinanciero + resumen.Pesaje;
    if (hojasPresentes.length && totalRegistros === 0 && errores.length === 0) {
        agregarError(errores, 'ARCHIVO', 0, 'FILAS', '', 'El archivo no contiene filas de datos para importar.', 'SIN_REGISTROS');
    }

    return {
        versionPlantilla: VERSION_PLANTILLA,
        versionArchivo: version,
        valido: errores.length === 0 && hojasPresentes.length > 0 && totalRegistros > 0,
        hojasDetectadas: workbook.SheetNames.map((nombre) => ({ nombre, reconocida: HOJAS_DATOS.includes(normalizarTexto(nombre)), auxiliar: HOJAS_AUXILIARES.includes(normalizarTexto(nombre)) })),
        resumen,
        registros,
        muestras: Object.fromEntries(Object.entries(registros).map(([modelo, items]) => [modelo, items.slice(0, 5)])),
        errores,
        advertencias
    };
};

const sinVacios = (datos) => Object.fromEntries(
    Object.entries(datos).filter(([clave, valor]) => clave !== 'filaOrigen'
        && clave !== 'potreroCodigo'
        && valor !== undefined
        && valor !== null
        && valor !== '')
);

const crearResumenResultado = () => ({ creados: 0, actualizados: 0, duplicados: 0, omitidos: 0, errores: [] });

const registrarErrorConfirmacion = (resumen, registro, error) => {
    resumen.omitidos += 1;
    resumen.errores.push({ fila: registro.filaOrigen, mensaje: error.message });
};

const importarPotreros = async (registros, modo, resultado) => {
    for (const registro of registros) {
        try {
            const existente = await Potrero.findOne({ codigo: registro.codigo });
            if (existente) {
                if (modo === 'solo_crear') {
                    resultado.duplicados += 1;
                    continue;
                }
                Object.assign(existente, sinVacios(registro));
                await existente.save();
                resultado.actualizados += 1;
                continue;
            }
            await Potrero.create(sinVacios(registro));
            resultado.creados += 1;
        } catch (error) {
            registrarErrorConfirmacion(resultado, registro, error);
        }
    }
};

const importarAnimales = async (registros, modo, resultado) => {
    for (const registro of registros) {
        try {
            const existente = await Animal.findOne({ $or: [{ diio: registro.diio }, { identificadorFinca: registro.diio }] });
            const datos = sinVacios(registro);
            if (registro.potreroCodigo) {
                const potrero = await Potrero.findOne({ codigo: registro.potreroCodigo }).select('_id');
                if (!potrero) throw new Error(`No existe el potrero ${registro.potreroCodigo}.`);
                datos.potreroActual = potrero._id;
            }

            if (existente) {
                if (modo === 'solo_crear') {
                    resultado.duplicados += 1;
                    continue;
                }
                Object.assign(existente, datos);
                await existente.save();
                resultado.actualizados += 1;
                continue;
            }
            await Animal.create(datos);
            resultado.creados += 1;
        } catch (error) {
            registrarErrorConfirmacion(resultado, registro, error);
        }
    }

    for (const registro of registros) {
        if (!registro.madreDiio && !registro.padreDiio) continue;
        const animal = await Animal.findOne({ $or: [{ diio: registro.diio }, { identificadorFinca: registro.diio }] });
        if (!animal) continue;
        const [madre, padre] = await Promise.all([
            registro.madreDiio ? Animal.findOne({ $or: [{ diio: registro.madreDiio }, { identificadorFinca: registro.madreDiio }] }).select('_id') : null,
            registro.padreDiio ? Animal.findOne({ $or: [{ diio: registro.padreDiio }, { identificadorFinca: registro.padreDiio }] }).select('_id') : null
        ]);
        if (madre) animal.madre = madre._id;
        if (padre) animal.padre = padre._id;
        if (madre || padre) {
            animal.origenGenealogico = 'Interno';
            await animal.save();
        }
    }
};

const recalcularPesajesAnimal = async (animalId) => {
    const pesajes = await Pesaje.find({ animal: animalId }).sort({ fecha: 1, createdAt: 1 });
    let anterior = null;
    for (const pesaje of pesajes) {
        if (anterior) {
            pesaje.aumentoKg = pesaje.peso - anterior.peso;
            pesaje.diasDesdeUltimoPesaje = Math.max(0, Math.round((pesaje.fecha - anterior.fecha) / 86400000));
        } else {
            pesaje.aumentoKg = undefined;
            pesaje.diasDesdeUltimoPesaje = undefined;
        }
        await pesaje.save();
        anterior = pesaje;
    }
    if (anterior) await Animal.findByIdAndUpdate(animalId, { pesoActual: anterior.peso });
};

const importarPesajes = async (registros, modo, resultado, usuarioId) => {
    const animalesAfectados = new Set();
    for (const registro of registros) {
        try {
            const animal = await Animal.findOne({ $or: [{ diio: registro.diio }, { identificadorFinca: registro.diio }] }).select('_id');
            if (!animal) throw new Error(`No existe el animal ${registro.diio}.`);
            const inicio = new Date(registro.fecha);
            inicio.setHours(0, 0, 0, 0);
            const fin = new Date(inicio);
            fin.setDate(fin.getDate() + 1);
            const existente = await Pesaje.findOne({ animal: animal._id, fecha: { $gte: inicio, $lt: fin } });

            if (existente) {
                if (modo === 'solo_crear') {
                    resultado.duplicados += 1;
                    continue;
                }
                existente.peso = registro.peso;
                if (registro.observaciones) existente.observaciones = registro.observaciones;
                await existente.save();
                resultado.actualizados += 1;
            } else {
                await Pesaje.create({
                    animal: animal._id,
                    fecha: registro.fecha,
                    peso: registro.peso,
                    observaciones: registro.observaciones,
                    registradoPor: usuarioId
                });
                resultado.creados += 1;
            }
            animalesAfectados.add(animal._id.toString());
        } catch (error) {
            registrarErrorConfirmacion(resultado, registro, error);
        }
    }

    for (const animalId of animalesAfectados) await recalcularPesajesAnimal(animalId);
};

const importarFinanzas = async (registros, resultado) => {
    for (const registro of registros) {
        try {
            await MovimientoFinanciero.create(sinVacios(registro));
            resultado.creados += 1;
        } catch (error) {
            registrarErrorConfirmacion(resultado, registro, error);
        }
    }
};

const confirmarImportacionExcel = async (payload, opciones = {}) => {
    const registros = payload?.registros || {};
    const modo = ['crear_actualizar', 'solo_crear'].includes(opciones.modo) ? opciones.modo : 'crear_actualizar';
    const resultado = {
        Potrero: crearResumenResultado(),
        Animal: crearResumenResultado(),
        MovimientoFinanciero: crearResumenResultado(),
        Pesaje: crearResumenResultado()
    };

    await importarPotreros(registros.Potrero || [], modo, resultado.Potrero);
    await importarAnimales(registros.Animal || [], modo, resultado.Animal);
    await importarPesajes(registros.Pesaje || [], modo, resultado.Pesaje, opciones.usuarioId);
    await importarFinanzas(registros.MovimientoFinanciero || [], resultado.MovimientoFinanciero);

    return { mensaje: 'Importación estándar confirmada.', modo, resultado };
};

const hojaConColumnas = (columnas, anchos) => {
    const hoja = XLSX.utils.aoa_to_sheet([columnas]);
    hoja['!cols'] = anchos.map((wch) => ({ wch }));
    hoja['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(columnas.length - 1)}1` };
    return hoja;
};

const generarPlantillaExcel = (catalogos = {}) => {
    const categorias = catalogos.categorias?.length ? catalogos.categorias : CATEGORIAS_FINANCIERAS;
    const destinos = catalogos.destinosUso?.length ? catalogos.destinosUso : DESTINOS_USO_FINANCIERO;
    const libro = XLSX.utils.book_new();
    const instrucciones = [
        ['VERSION_PLANTILLA', VERSION_PLANTILLA],
        ['IMPORTADOR', 'GanaderiaRomilio - formato estándar'],
        ['USO', 'Conserve los nombres de hojas y columnas. Puede eliminar hojas que no vaya a importar.'],
        ['FECHAS', 'Use DD/MM/AAAA.'],
        ['INVENTARIO', 'DIIO, ESPECIE, SEXO y CATEGORIA son obligatorios.'],
        ['FINANZAS', 'Las categorías y destinos deben existir y estar activos en Catálogos de Finanzas.'],
        ['PESAJES', 'Hoja opcional. El DIIO debe existir o venir en INVENTARIO.'],
        ['ROTACIONES', 'No forman parte del importador estándar. Se gestionan dentro de la aplicación.']
    ];
    const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
    hojaInstrucciones['!cols'] = [{ wch: 24 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'INSTRUCCIONES');

    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.POTREROS.requeridas, ...COLUMNAS.POTREROS.opcionales], [18, 28, 18, 20, 28, 18, 45]), 'POTREROS');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.INVENTARIO.requeridas, ...COLUMNAS.INVENTARIO.opcionales], [18, 14, 12, 18, 24, 20, 20, 18, 18, 18, 16, 22, 20, 45]), 'INVENTARIO');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.FINANZAS.requeridas, ...COLUMNAS.FINANZAS.opcionales], [16, 14, 24, 22, 42, 16, 12, 28, 14, 14, 18, 26, 22, 20, 22, 22, 45]), 'FINANZAS');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.PESAJES.requeridas, ...COLUMNAS.PESAJES.opcionales], [18, 16, 14, 45]), 'PESAJES');

    const largo = Math.max(categorias.length, destinos.length, TIPOS_MOVIMIENTO_FINANCIERO.length, 8);
    const filasCatalogos = [['CATEGORIAS_FINANCIERAS', 'DESTINOS_USO', 'TIPOS_MOVIMIENTO', 'NATURALEZAS', 'MONEDAS', 'ESPECIES', 'SEXOS', 'ESTADOS_POTRERO']];
    for (let indice = 0; indice < largo; indice += 1) {
        filasCatalogos.push([
            categorias[indice] || '',
            destinos[indice] || '',
            TIPOS_MOVIMIENTO_FINANCIERO[indice] || '',
            NATURALEZAS_FINANCIERAS[indice] || '',
            MONEDAS_FINANCIERAS[indice] || '',
            ['Bovino', 'Porcino'][indice] || '',
            ['Macho', 'Hembra'][indice] || '',
            ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento'][indice] || ''
        ]);
    }
    const hojaCatalogos = XLSX.utils.aoa_to_sheet(filasCatalogos);
    hojaCatalogos['!cols'] = Array.from({ length: 8 }, () => ({ wch: 26 }));
    XLSX.utils.book_append_sheet(libro, hojaCatalogos, 'CATALOGOS');

    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
    COLUMNAS,
    HOJAS_DATOS,
    VERSION_PLANTILLA,
    confirmarImportacionExcel,
    generarPlantillaExcel,
    procesarExcelPreview
};
