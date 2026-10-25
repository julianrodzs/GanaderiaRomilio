// Regresion del contrato corregido; sin conexiones a bases de clientes.
require('./ejecutar-regresion.cjs')({
    "modulo": "Usuarios y seguridad",
    "cobertura": [
        "U01/02/03: DTO, invitaciones, cuentas existentes y último administrador",
        "U04/05/06/07/08: JWT estricto, rate limit y recuperación de consumo único",
        "U09/10/11: auditoría redactada y correo sin secretos en logs",
        "U12/13/14: contexto offline y archivos por finca",
        "U15/16/17: cargas opcionales, anonimización y cabeceras HTTP",
        "Controles: roles, cuotas y cambio de organización"
    ],
    "suites": [
        "tests/usuarios-seguridad-remediacion.test.js",
        "tests/multi-organizacion-usuario.test.js",
        "tests/acceso-finca.test.js",
        "tests/usuario-asignable-finca.test.js",
        "tests/matriz-planes-seguridad.test.js",
        "tests/offline-cron-seguridad.test.js"
    ]
});
