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
const { asegurarPuedeCrearAnimal, puedeUsarEspecie } = require('./plan-service');
const { obtenerFincaActual } = require('../context/organizacion-context');
const { validarObjetivoProductivoFinca } = require('./finca-service');
const { obtenerCatalogoRacial, prepararDatosRaciales } = require('./raza-service');
const HistorialCoberturaPotrero = require('../models/HistorialCoberturaPotrero');
const { CATALOGO_PASTOS_BASE } = require('../config/catalogoPastos');
const { guardarCobertura, resolverPastoPorTexto } = require('./potreroCobertura-service');
const Lote = require('../models/Lote');
const { agregarAnimalesAlLote, cerrarPertenencia, validarAnimalParaLote } = require('./lote-service');
const PertenenciaLote = require('../models/PertenenciaLote');
const { PROPOSITOS_LOTE, normalizarPropositoLote, propositoCompatibleConObjetivo } = require('../config/lotes');
const { CATEGORIAS_POR_ESPECIE, obtenerCategoriaAnimal } = require('./categoriaAnimal-service');
const { OBJETIVOS_PRODUCTIVOS, normalizarObjetivoProductivo } = require('../config/objetivosProductivos');

const VERSION_PLANTILLA = '1';
const HOJAS_DATOS = ['POTREROS', 'INVENTARIO', 'FINANZAS', 'PESAJES'];
const HOJAS_AUXILIARES = ['INSTRUCCIONES', 'CATALOGOS'];

const COLUMNAS = {
    POTREROS: {
        requeridas: ['CODIGO', 'NOMBRE'],
        opcionales: [
            'AREA_HECTAREAS', 'CAPACIDAD_MAXIMA', 'UBICACION', 'ESTADO',
            'TIPO_AREA',
            'PASTO', 'PASTO_PRINCIPAL', 'TIPO_PASTO', 'FECHA_ESTABLECIMIENTO_PASTO',
            'DIAS_DESCANSO_OBJETIVO', 'INTERVALO_CORTE_OBJETIVO_DIAS', 'OBSERVACION_COBERTURA', 'OBSERVACIONES'
        ]
    },
    INVENTARIO: {
        requeridas: ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA'],
        opcionales: [
            'NOMBRE', 'RAZA', 'RAZA_PRINCIPAL', 'RAZA_SECUNDARIA', 'DESCRIPCION_RACIAL',
            'GRADO_RACIAL', 'VARIEDAD_RACIAL', 'COMPOSICION_RACIAL',
            'FECHA_NACIMIENTO', 'MADRE_DIIO', 'PADRE_DIIO',
            'PESO_ACTUAL_KG', 'OBJETIVO_PRODUCTIVO', 'ETAPA_PRODUCTIVA', 'ESTADO',
            'ESTADO_SANITARIO', 'POTRERO_CODIGO', 'CODIGO_LOTE', 'NOMBRE_LOTE', 'PROPOSITO_LOTE', 'OBSERVACIONES'
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
        opcionales: ['ETAPA_PRODUCTIVA', 'OBSERVACIONES']
    }
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
        const tipoAreaTexto = limpiarTexto(leer('TIPO_AREA')) || 'PASTOREO';
        const tipoArea = valorCanonico(tipoAreaTexto, ['PASTOREO', 'BANCO_FORRAJERO']);
        const pastoTexto = limpiarTexto(leer('PASTO_PRINCIPAL') || leer('PASTO') || leer('TIPO_PASTO'));
        const fechaEstablecimientoPastoTexto = limpiarTexto(leer('FECHA_ESTABLECIMIENTO_PASTO'));
        const fechaEstablecimientoPasto = fechaEstablecimientoPastoTexto ? fecha(leer('FECHA_ESTABLECIMIENTO_PASTO')) : undefined;
        const diasDescansoObjetivoTexto = limpiarTexto(leer('DIAS_DESCANSO_OBJETIVO'));
        const diasDescansoObjetivo = numero(leer('DIAS_DESCANSO_OBJETIVO'));
        const intervaloCorteTexto = limpiarTexto(leer('INTERVALO_CORTE_OBJETIVO_DIAS'));
        const intervaloCorteObjetivoDias = numero(leer('INTERVALO_CORTE_OBJETIVO_DIAS'));
        const estadoTexto = limpiarTexto(leer('ESTADO')) || 'Disponible';
        const estado = valorCanonico(estadoTexto, ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento']);

        if (!codigo) agregarError(errores, 'POTREROS', numeroFila, 'CODIGO', '', 'El código es obligatorio.', 'CAMPO_REQUERIDO');
        if (!nombre) agregarError(errores, 'POTREROS', numeroFila, 'NOMBRE', '', 'El nombre es obligatorio.', 'CAMPO_REQUERIDO');
        if (codigo && codigos.has(normalizarTexto(codigo))) agregarError(errores, 'POTREROS', numeroFila, 'CODIGO', codigo, 'El código está repetido dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (limpiarTexto(leer('AREA_HECTAREAS')) && (area === undefined || area < 0)) agregarError(errores, 'POTREROS', numeroFila, 'AREA_HECTAREAS', leer('AREA_HECTAREAS'), 'Debe ser un número mayor o igual a cero.');
        if (limpiarTexto(leer('CAPACIDAD_MAXIMA')) && (capacidadMaxima === undefined || capacidadMaxima < 0)) agregarError(errores, 'POTREROS', numeroFila, 'CAPACIDAD_MAXIMA', leer('CAPACIDAD_MAXIMA'), 'Debe ser un número mayor o igual a cero.');
        if (fechaEstablecimientoPastoTexto && !fechaEstablecimientoPasto) agregarError(errores, 'POTREROS', numeroFila, 'FECHA_ESTABLECIMIENTO_PASTO', leer('FECHA_ESTABLECIMIENTO_PASTO'), 'Fecha inválida. Use DD/MM/AAAA.');
        if (diasDescansoObjetivoTexto && (diasDescansoObjetivo === undefined || diasDescansoObjetivo < 0)) agregarError(errores, 'POTREROS', numeroFila, 'DIAS_DESCANSO_OBJETIVO', leer('DIAS_DESCANSO_OBJETIVO'), 'Debe ser un número mayor o igual a cero.');
        if (!estado) agregarError(errores, 'POTREROS', numeroFila, 'ESTADO', estadoTexto, 'Estado de potrero no permitido.');
        if (!tipoArea) agregarError(errores, 'POTREROS', numeroFila, 'TIPO_AREA', tipoAreaTexto, 'Use PASTOREO o BANCO_FORRAJERO.');
        if (intervaloCorteTexto && (intervaloCorteObjetivoDias === undefined || intervaloCorteObjetivoDias < 1)) agregarError(errores, 'POTREROS', numeroFila, 'INTERVALO_CORTE_OBJETIVO_DIAS', leer('INTERVALO_CORTE_OBJETIVO_DIAS'), 'Debe ser un número mayor o igual a uno.');

        if (codigo) codigos.add(normalizarTexto(codigo));
        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            codigo,
            nombre,
            tipoArea,
            area,
            capacidadMaxima,
            ubicacion: limpiarTexto(leer('UBICACION')) || undefined,
            estado,
            pastoTexto: pastoTexto || undefined,
            fechaEstablecimientoPasto,
            diasDescansoObjetivo,
            intervaloCorteObjetivoDias,
            observacionCobertura: limpiarTexto(leer('OBSERVACION_COBERTURA')) || undefined,
            observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined
        });
    });

    return registros;
};

const mapearInventario = (hoja, errores, lotesExistentes = []) => {
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
        const categoriaCalculada = especie && sexo && nacimiento
            ? obtenerCategoriaAnimal({ especie, sexo, fechaNacimiento: nacimiento })
            : null;
        const pesoActual = numero(leer('PESO_ACTUAL_KG'));
        const estadoTexto = limpiarTexto(leer('ESTADO')) || 'Activo';
        const estado = valorCanonico(estadoTexto, ['Activo', 'Vendido', 'Muerto']);
        const sanitarioTexto = limpiarTexto(leer('ESTADO_SANITARIO')) || 'Sano';
        const estadoSanitario = valorCanonico(sanitarioTexto, ['Sano', 'En observación', 'Enfermo', 'Recuperación']);
        const objetivoTexto = limpiarTexto(leer('OBJETIVO_PRODUCTIVO'));
        const objetivoProductivo = objetivoTexto ? normalizarObjetivoProductivo(objetivoTexto) : 'SIN_DEFINIR';
        const etapaTexto = limpiarTexto(leer('ETAPA_PRODUCTIVA'));
        const etapaProductiva = etapaTexto ? valorCanonico(etapaTexto, ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde']) : undefined;
        const codigoLote = limpiarTexto(leer('CODIGO_LOTE'));
        const nombreLote = limpiarTexto(leer('NOMBRE_LOTE'));
        const propositoLoteTexto = limpiarTexto(leer('PROPOSITO_LOTE'));
        const propositoLote = propositoLoteTexto ? normalizarPropositoLote(propositoLoteTexto) : undefined;
        const loteExistente = codigoLote
            ? lotesExistentes.find((item) => normalizarTexto(item.codigo) === normalizarTexto(codigoLote))
            : null;

        if (!diio) agregarError(errores, 'INVENTARIO', numeroFila, 'DIIO', '', 'El DIIO es obligatorio.', 'CAMPO_REQUERIDO');
        if (!especie) agregarError(errores, 'INVENTARIO', numeroFila, 'ESPECIE', leer('ESPECIE'), 'Usa Bovino o Porcino.');
        if (!sexo) agregarError(errores, 'INVENTARIO', numeroFila, 'SEXO', leer('SEXO'), 'Usa Macho o Hembra.');
        if (!categoria) agregarError(errores, 'INVENTARIO', numeroFila, 'CATEGORIA', categoriaTexto, especie ? `La categoría no corresponde a ${especie}. Opciones: ${CATEGORIAS_POR_ESPECIE[especie].join(', ')}.` : 'La categoría no se puede validar sin una especie válida.');
        if (categoria && categoriaCalculada && categoria !== categoriaCalculada) agregarError(errores, 'INVENTARIO', numeroFila, 'CATEGORIA', categoriaTexto, `Por edad y sexo corresponde ${categoriaCalculada}.`, 'CATEGORIA_EDAD_SEXO_INCOMPATIBLE');
        if (diio && diios.has(normalizarTexto(diio))) agregarError(errores, 'INVENTARIO', numeroFila, 'DIIO', diio, 'El DIIO está repetido dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (limpiarTexto(leer('FECHA_NACIMIENTO')) && !nacimiento) agregarError(errores, 'INVENTARIO', numeroFila, 'FECHA_NACIMIENTO', leer('FECHA_NACIMIENTO'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (limpiarTexto(leer('PESO_ACTUAL_KG')) && (pesoActual === undefined || pesoActual < 0)) agregarError(errores, 'INVENTARIO', numeroFila, 'PESO_ACTUAL_KG', leer('PESO_ACTUAL_KG'), 'Debe ser un número mayor o igual a cero.');
        if (!estado) agregarError(errores, 'INVENTARIO', numeroFila, 'ESTADO', estadoTexto, 'Estado general no permitido.');
        if (!estadoSanitario) agregarError(errores, 'INVENTARIO', numeroFila, 'ESTADO_SANITARIO', sanitarioTexto, 'Estado sanitario no permitido.');
        if (objetivoTexto && !objetivoProductivo) agregarError(errores, 'INVENTARIO', numeroFila, 'OBJETIVO_PRODUCTIVO', objetivoTexto, 'Objetivo productivo no permitido.');
        if (etapaTexto && !etapaProductiva) agregarError(errores, 'INVENTARIO', numeroFila, 'ETAPA_PRODUCTIVA', etapaTexto, 'Etapa productiva no permitida.');
        if (etapaProductiva && especie !== 'Porcino') agregarError(errores, 'INVENTARIO', numeroFila, 'ETAPA_PRODUCTIVA', etapaTexto, 'La etapa productiva por fases aplica únicamente a porcinos.');
        if (propositoLoteTexto && !propositoLote) agregarError(errores, 'INVENTARIO', numeroFila, 'PROPOSITO_LOTE', propositoLoteTexto, `Opciones: ${PROPOSITOS_LOTE.join(', ')}.`);
        if (codigoLote && !loteExistente) agregarError(errores, 'INVENTARIO', numeroFila, 'CODIGO_LOTE', codigoLote, 'El lote no existe. Créalo antes de importar; el importador no crea lotes silenciosamente.', 'REFERENCIA_NO_ENCONTRADA');
        if (loteExistente && loteExistente.estado !== 'ACTIVO') agregarError(errores, 'INVENTARIO', numeroFila, 'CODIGO_LOTE', codigoLote, 'El lote indicado no está activo.');
        if (loteExistente && especie && loteExistente.especie !== especie) agregarError(errores, 'INVENTARIO', numeroFila, 'CODIGO_LOTE', codigoLote, 'La especie del lote no coincide con la del animal.');
        if (loteExistente && propositoLote && loteExistente.proposito !== propositoLote) agregarError(errores, 'INVENTARIO', numeroFila, 'PROPOSITO_LOTE', propositoLote, 'El propósito indicado no coincide con el lote existente.');
        if (loteExistente && !propositoCompatibleConObjetivo(loteExistente.proposito, objetivoProductivo)) agregarError(errores, 'INVENTARIO', numeroFila, 'OBJETIVO_PRODUCTIVO', objetivoTexto, 'El objetivo productivo no es compatible con el propósito del lote.');

        if (diio) diios.add(normalizarTexto(diio));
        if (errores.length !== inicioErrores) return;

        registros.push({
            filaOrigen: numeroFila,
            identificadorFinca: diio,
            diio,
            especie,
            sexo,
            categoria,
            objetivoProductivo,
            etapaProductiva,
            nombre: limpiarTexto(leer('NOMBRE')) || undefined,
            raza: limpiarTexto(leer('RAZA')) || undefined,
            razaPrincipal: limpiarTexto(leer('RAZA_PRINCIPAL')) || undefined,
            razaSecundaria: limpiarTexto(leer('RAZA_SECUNDARIA')) || undefined,
            descripcionRacial: limpiarTexto(leer('DESCRIPCION_RACIAL')) || undefined,
            gradoRacial: limpiarTexto(leer('GRADO_RACIAL')) || undefined,
            variedadRacial: limpiarTexto(leer('VARIEDAD_RACIAL')) || undefined,
            composicionRacial: limpiarTexto(leer('COMPOSICION_RACIAL')) || undefined,
            fechaNacimiento: nacimiento,
            madreDiio: limpiarTexto(leer('MADRE_DIIO')) || undefined,
            padreDiio: limpiarTexto(leer('PADRE_DIIO')) || undefined,
            pesoActual,
            estado,
            estadoSanitario,
            potreroCodigo: limpiarTexto(leer('POTRERO_CODIGO')) || undefined,
            codigoLote: codigoLote || undefined,
            nombreLote: nombreLote || undefined,
            propositoLote,
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
        const etapaTexto = limpiarTexto(leer('ETAPA_PRODUCTIVA'));
        const etapaProductiva = etapaTexto ? valorCanonico(etapaTexto, ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde']) : undefined;
        const clave = diio && fechaPesaje ? `${normalizarTexto(diio)}|${claveFecha(fechaPesaje)}` : '';

        if (!diio) agregarError(errores, 'PESAJES', numeroFila, 'DIIO', '', 'El DIIO es obligatorio.', 'CAMPO_REQUERIDO');
        if (diio && !diiosDisponibles.has(normalizarTexto(diio))) agregarError(errores, 'PESAJES', numeroFila, 'DIIO', diio, 'El animal no existe ni está incluido en la hoja INVENTARIO.', 'REFERENCIA_NO_ENCONTRADA');
        if (!fechaPesaje) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'Usa una fecha válida en formato DD/MM/AAAA.');
        if (peso === undefined || peso <= 0) agregarError(errores, 'PESAJES', numeroFila, 'PESO_KG', leer('PESO_KG'), 'Debe ser un número mayor que cero.');
        if (clave && claves.has(clave)) agregarError(errores, 'PESAJES', numeroFila, 'FECHA', leer('FECHA'), 'Ya existe otro pesaje para el mismo DIIO y fecha dentro del archivo.', 'DUPLICADO_ARCHIVO');
        if (etapaTexto && !etapaProductiva) agregarError(errores, 'PESAJES', numeroFila, 'ETAPA_PRODUCTIVA', etapaTexto, 'Etapa productiva no permitida.');

        if (clave) claves.add(clave);
        if (errores.length !== inicioErrores) return;

        registros.push({ filaOrigen: numeroFila, diio, fecha: fechaPesaje, peso, etapaProductiva, observaciones: limpiarTexto(leer('OBSERVACIONES')) || undefined });
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
        Animal: preparadas.INVENTARIO?.columnasValidas ? mapearInventario(preparadas.INVENTARIO, errores, opciones.lotesExistentes || []) : [],
        MovimientoFinanciero: preparadas.FINANZAS?.columnasValidas ? mapearFinanzas(preparadas.FINANZAS, errores, catalogos) : [],
        Pesaje: []
    };
    const resolverCobertura = opciones.resolverPasto || resolverPastoPorTexto;
    for (const potrero of registros.Potrero) {
        if (!potrero.pastoTexto) continue;
        const categoria = potrero.tipoArea === 'BANCO_FORRAJERO' ? 'Pasto de corte' : 'Pasto';
        const uso = potrero.tipoArea === 'BANCO_FORRAJERO' ? 'CORTE' : 'PASTOREO';
        const catalogado = await resolverCobertura(potrero.pastoTexto, categoria, uso);
        if (catalogado) {
            potrero.pastoPrincipal = catalogado._id;
        } else {
            potrero.descripcionCobertura = potrero.pastoTexto;
            advertencias.push({
                hoja: 'POTREROS',
                mensaje: `Fila ${potrero.filaOrigen}: el pasto "${potrero.pastoTexto}" no está en el catálogo y quedará pendiente de revisión.`
            });
        }
    }
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
        && clave !== 'codigoLote'
        && clave !== 'nombreLote'
        && clave !== 'propositoLote'
        && clave !== 'pastoTexto'
        && clave !== 'pastoPrincipal'
        && clave !== 'fechaEstablecimientoPasto'
        && clave !== 'diasDescansoObjetivo'
        && clave !== 'observacionCobertura'
        && clave !== 'descripcionCobertura'
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
                if (registro.pastoTexto || registro.diasDescansoObjetivo !== undefined || registro.intervaloCorteObjetivoDias !== undefined || registro.observacionCobertura) {
                    const vigente = await HistorialCoberturaPotrero.findOne({ potrero: existente._id, fechaFin: null });
                    const mismaCobertura = String(vigente?.pastoPrincipal || '') === String(registro.pastoPrincipal || '')
                        && String(vigente?.descripcionCobertura || '') === String(registro.descripcionCobertura || '');
                    if (!vigente || !mismaCobertura
                        || Number(vigente.diasDescansoObjetivo ?? -1) !== Number(registro.diasDescansoObjetivo ?? -1)
                        || Number(vigente.intervaloCorteObjetivoDias ?? -1) !== Number(registro.intervaloCorteObjetivoDias ?? -1)
                        || String(vigente.observacionCobertura || '') !== String(registro.observacionCobertura || '')) {
                        await guardarCobertura(existente._id, {
                            pastoPrincipal: registro.pastoPrincipal,
                            descripcionCobertura: registro.descripcionCobertura,
                            fechaEstablecimientoPasto: registro.fechaEstablecimientoPasto,
                            fechaCambio: registro.fechaEstablecimientoPasto || new Date(),
                            diasDescansoObjetivo: registro.diasDescansoObjetivo,
                            intervaloCorteObjetivoDias: registro.intervaloCorteObjetivoDias,
                            observacionCobertura: registro.observacionCobertura
                        }, { soloInicial: !vigente });
                    }
                }
                resultado.actualizados += 1;
                continue;
            }
            const creado = await Potrero.create(sinVacios(registro));
            if (registro.pastoTexto || registro.diasDescansoObjetivo !== undefined || registro.intervaloCorteObjetivoDias !== undefined || registro.observacionCobertura) {
                await guardarCobertura(creado._id, {
                    pastoPrincipal: registro.pastoPrincipal,
                    descripcionCobertura: registro.descripcionCobertura,
                    fechaEstablecimientoPasto: registro.fechaEstablecimientoPasto,
                    fechaCambio: registro.fechaEstablecimientoPasto || new Date(),
                    diasDescansoObjetivo: registro.diasDescansoObjetivo,
                    intervaloCorteObjetivoDias: registro.intervaloCorteObjetivoDias,
                    observacionCobertura: registro.observacionCobertura
                }, { soloInicial: true });
            }
            resultado.creados += 1;
        } catch (error) {
            registrarErrorConfirmacion(resultado, registro, error);
        }
    }
};

const importarAnimales = async (registros, modo, resultado, usuarioId) => {
    for (const registro of registros) {
        try {
            const existente = await Animal.findOne({ $or: [{ diio: registro.diio }, { identificadorFinca: registro.diio }] });
            let datos = sinVacios(registro);
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
                const estadoFinal = datos.estado || existente.estado;
                const especieFinal = datos.especie || existente.especie || 'Bovino';
                const objetivoFinal = datos.objetivoProductivo || existente.objetivoProductivo;
                if (especieFinal !== existente.especie || String(objetivoFinal || '') !== String(existente.objetivoProductivo || '')) {
                    await validarObjetivoProductivoFinca({
                        fincaId: obtenerFincaActual(),
                        especie: especieFinal,
                        objetivoProductivo: objetivoFinal
                    });
                }
                if (estadoFinal === 'Activo') {
                    const permisoEspecie = await puedeUsarEspecie(datos.especie || existente.especie || 'Bovino');
                    if (!permisoEspecie.permitido) throw new Error(permisoEspecie.message);
                    if (existente.estado !== 'Activo') {
                        await asegurarPuedeCrearAnimal({ especie: datos.especie || existente.especie || 'Bovino' });
                    }
                    if (existente.loteActual) {
                        const loteActual = await Lote.findById(existente.loteActual);
                        if (loteActual) validarAnimalParaLote({ ...existente.toObject(), ...datos, especie: especieFinal, objetivoProductivo: objetivoFinal, estado: estadoFinal }, loteActual);
                    }
                }
                datos = prepararDatosRaciales(datos, existente.toObject());
                Object.assign(existente, datos);
                await existente.save();
                if (estadoFinal !== 'Activo') {
                    const pertenencia = await PertenenciaLote.findOne({ animal: existente._id, activo: true });
                    if (pertenencia) await cerrarPertenencia(pertenencia, {
                        motivoSalida: `Salida automática por estado ${estadoFinal}`,
                        usuarioId
                    });
                }
                resultado.actualizados += 1;
                continue;
            }
            if ((datos.estado || 'Activo') === 'Activo') {
                await asegurarPuedeCrearAnimal({ especie: datos.especie || 'Bovino' });
            }
            await validarObjetivoProductivoFinca({
                fincaId: obtenerFincaActual(),
                especie: datos.especie || 'Bovino',
                objetivoProductivo: datos.objetivoProductivo
            });
            datos = prepararDatosRaciales(datos);
            await Animal.create(datos);
            resultado.creados += 1;
        } catch (error) {
            registrarErrorConfirmacion(resultado, registro, error);
        }
    }

    for (const registro of registros) {
        if (!registro.codigoLote) continue;
        try {
            const [animal, lote] = await Promise.all([
                Animal.findOne({ $or: [{ diio: registro.diio }, { identificadorFinca: registro.diio }] }),
                Lote.findOne({ codigo: registro.codigoLote.toUpperCase() })
            ]);
            if (!animal) continue;
            if (!lote) throw new Error(`No existe el lote ${registro.codigoLote}.`);
            if (String(animal.loteActual || '') === String(lote._id)) continue;
            await agregarAnimalesAlLote(lote._id, {
                animales: [animal._id],
                permitirMover: true,
                motivoEntrada: 'Asignación desde importación estándar',
                motivoSalida: 'Cambio de lote desde importación estándar'
            }, usuarioId);
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
            const animal = await Animal.findOne({ $or: [{ diio: registro.diio }, { identificadorFinca: registro.diio }] }).select('_id etapaProductiva');
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
                if (registro.etapaProductiva) existente.etapaProductiva = registro.etapaProductiva;
                if (registro.observaciones) existente.observaciones = registro.observaciones;
                await existente.save();
                resultado.actualizados += 1;
            } else {
                await Pesaje.create({
                    animal: animal._id,
                    fecha: registro.fecha,
                    peso: registro.peso,
                    etapaProductiva: registro.etapaProductiva || animal.etapaProductiva,
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
    await importarAnimales(registros.Animal || [], modo, resultado.Animal, opciones.usuarioId);
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
        ['INVENTARIO', 'DIIO, ESPECIE, SEXO y CATEGORIA son obligatorios. Si incluye FECHA_NACIMIENTO, la categoría debe coincidir con edad y sexo. Cría se acepta como formato antiguo y se normaliza a REPRODUCCION.'],
        ['RAZAS', 'RAZA conserva la descripción libre. RAZA_PRINCIPAL y RAZA_SECUNDARIA permiten normalizar bovinos.'],
        ['GENEALOGIA', 'MADRE_DIIO y PADRE_DIIO se enlazan si existen; si no, se conservan para resolverlos después.'],
        ['FINANZAS', 'Las categorías y destinos deben existir y estar activos en Catálogos de Finanzas.'],
        ['PESAJES', 'Hoja opcional. El DIIO debe existir o venir en INVENTARIO.'],
        ['PASTOS', 'En POTREROS use TIPO_AREA y PASTO_PRINCIPAL. BANCO_FORRAJERO acepta forrajes de corte.'],
        ['ROTACIONES', 'No forman parte del importador estándar. Se gestionan dentro de la aplicación.']
    ];
    const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
    hojaInstrucciones['!cols'] = [{ wch: 24 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'INSTRUCCIONES');

    XLSX.utils.book_append_sheet(libro, hojaConColumnas(
        ['CODIGO', 'NOMBRE', 'TIPO_AREA', 'AREA_HECTAREAS', 'CAPACIDAD_MAXIMA', 'UBICACION', 'ESTADO', 'PASTO_PRINCIPAL', 'FECHA_ESTABLECIMIENTO_PASTO', 'DIAS_DESCANSO_OBJETIVO', 'INTERVALO_CORTE_OBJETIVO_DIAS', 'OBSERVACION_COBERTURA', 'OBSERVACIONES'],
        [18, 28, 22, 18, 20, 28, 18, 28, 24, 24, 28, 38, 45]
    ), 'POTREROS');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.INVENTARIO.requeridas, ...COLUMNAS.INVENTARIO.opcionales], [18, 14, 12, 18, 24, 20, 20, 18, 18, 18, 16, 22, 20, 18, 22, 20, 45]), 'INVENTARIO');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.FINANZAS.requeridas, ...COLUMNAS.FINANZAS.opcionales], [16, 14, 24, 22, 42, 16, 12, 28, 14, 14, 18, 26, 22, 20, 22, 22, 45]), 'FINANZAS');
    XLSX.utils.book_append_sheet(libro, hojaConColumnas([...COLUMNAS.PESAJES.requeridas, ...COLUMNAS.PESAJES.opcionales], [18, 16, 14, 45]), 'PESAJES');

    const catalogoRacial = obtenerCatalogoRacial();
    const pastos = CATALOGO_PASTOS_BASE.filter((item) => item.categoria === 'Pasto').map((item) => item.nombre);
    const forrajesCorte = CATALOGO_PASTOS_BASE.filter((item) => item.categoria === 'Pasto de corte').map((item) => item.nombre);
    const leguminosas = CATALOGO_PASTOS_BASE.filter((item) => item.categoria === 'Leguminosa/Forraje').map((item) => item.nombre);
    const largo = Math.max(categorias.length, destinos.length, TIPOS_MOVIMIENTO_FINANCIERO.length, catalogoRacial.razas.length, pastos.length, forrajesCorte.length, CATEGORIAS_POR_ESPECIE.Bovino.length, CATEGORIAS_POR_ESPECIE.Porcino.length, OBJETIVOS_PRODUCTIVOS.length, PROPOSITOS_LOTE.length, 8);
    const filasCatalogos = [['CATEGORIAS_FINANCIERAS', 'DESTINOS_USO', 'TIPOS_MOVIMIENTO', 'NATURALEZAS', 'MONEDAS', 'ESPECIES', 'SEXOS', 'CATEGORIAS_BOVINOS', 'CATEGORIAS_PORCINOS', 'OBJETIVOS_PRODUCTIVOS', 'PROPOSITOS_LOTE', 'ESTADOS_POTRERO', 'TIPOS_AREA', 'RAZAS_BOVINAS', 'GRADOS_RACIALES', 'COMPOSICIONES_RACIALES', 'PASTOS', 'FORRAJES_CORTE', 'LEGUMINOSAS_FORRAJES']];
    for (let indice = 0; indice < largo; indice += 1) {
        filasCatalogos.push([
            categorias[indice] || '',
            destinos[indice] || '',
            TIPOS_MOVIMIENTO_FINANCIERO[indice] || '',
            NATURALEZAS_FINANCIERAS[indice] || '',
            MONEDAS_FINANCIERAS[indice] || '',
            ['Bovino', 'Porcino'][indice] || '',
            ['Macho', 'Hembra'][indice] || '',
            CATEGORIAS_POR_ESPECIE.Bovino[indice] || '',
            CATEGORIAS_POR_ESPECIE.Porcino[indice] || '',
            OBJETIVOS_PRODUCTIVOS[indice] || '',
            PROPOSITOS_LOTE[indice] || '',
            ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento'][indice] || '',
            ['PASTOREO', 'BANCO_FORRAJERO'][indice] || '',
            catalogoRacial.razas[indice] || '',
            catalogoRacial.gradosRaciales[indice] || '',
            catalogoRacial.composicionesRaciales[indice] || '',
            pastos[indice] || '',
            forrajesCorte[indice] || '',
            leguminosas[indice] || ''
        ]);
    }
    const hojaCatalogos = XLSX.utils.aoa_to_sheet(filasCatalogos);
    hojaCatalogos['!cols'] = Array.from({ length: 19 }, () => ({ wch: 26 }));
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
