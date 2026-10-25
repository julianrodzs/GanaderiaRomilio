// Regresion del contrato corregido; sin conexiones a bases de clientes.
require('./ejecutar-regresion.cjs')({
    "modulo": "Importaciones",
    "cobertura": [
        "IM-01/02: DTO, ZIP/XLSX, fórmulas, dimensiones y worker sin bloqueo",
        "IM-03/04/05: reclamo concurrente, deduplicación y rollback de 300 filas",
        "IM-06/07/08/09: cambios mínimos, pesaje inicial, genealogía e identidad",
        "IM-10/11/12: estados, vigencia y conservación de datos existentes",
        "IM-13/14/15: fechas, números ambiguos y columnas estándar",
        "IM-18/19/20: cuota, especie, referencias y categoría/sexo"
    ],
    "suites": [
        "tests/importar-remediacion.test.js",
        "tests/importarExcel-service.test.js",
        "tests/inventario-integridad.test.js",
        "tests/matriz-planes-seguridad.test.js",
        "tests/finanzas-integridad.test.js",
        "tests/pesajes-integridad.test.js"
    ]
});
