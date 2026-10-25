// Regresion del contrato corregido; sin conexiones a bases de clientes.
require('./ejecutar-regresion.cjs')({
    "modulo": "Reportes e indicadores",
    "cobertura": [
        "RP-01/09/10/11: finanzas por moneda, población histórica y costos de cohorte",
        "RP-03/04/05/06/07/08: especies, estados y datos insuficientes",
        "RP-12/13: consolidación con peso y finca al corte",
        "RP-14/17: exportaciones CRC/USD y encabezados PDF alineados",
        "RP-15: días civiles e instantes en zona horaria",
        "Controles: 205 días, privacidad tenant, GMD y compra final"
    ],
    "suites": [
        "tests/reportes-remediacion.test.js",
        "tests/reporteEspecies-controller.test.js",
        "tests/reporte-multi-finca.test.js",
        "tests/reporte-peso-destete.test.js",
        "tests/reporteComprasAnimales-service.test.js",
        "tests/cierre-consolidado-export.test.js",
        "tests/productividadCria-service.test.js",
        "tests/indicesProductivos-service.test.js",
        "tests/finanzas-calculos.test.js",
        "tests/fincas-organizaciones-remediacion.test.js"
    ]
});
