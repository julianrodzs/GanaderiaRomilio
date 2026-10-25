// Regresion del contrato corregido; sin conexiones a bases de clientes.
require('./ejecutar-regresion.cjs')({
    "modulo": "Lotes y engorde",
    "cobertura": [
        "R1/2/3/15: tenant, etapas opcionales y plantillas por finca",
        "R4/5/6/7/13/17/18: atomicidad, pertenencias, historial y protocolo",
        "R8/16: pesajes durante pertenencia y GMD negativa",
        "R9/10: dependencias circulares y rol sanitario compatible",
        "R11/12: proyección por plan y vigencia de suscripción",
        "R14: fecha civil en Costa Rica"
    ],
    "suites": [
        "tests/lotes-engorde-integridad.test.js",
        "tests/lotesAlimentacion.test.js",
        "tests/protocolos-productivos.test.js",
        "tests/fincas-organizaciones-remediacion.test.js",
        "tests/matriz-planes-seguridad.test.js",
        "tests/tareas-notificaciones-remediacion.test.js"
    ]
});
