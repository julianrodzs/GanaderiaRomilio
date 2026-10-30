# Documentacion comercial y legal de CIR Ganadero

Estado del paquete: BORRADOR INTERNO. No publicar ni solicitar aceptacion todavia.
Version de trabajo: 0.1. Fecha de preparacion: 2026-10-27.

Estos archivos son borradores adaptados al producto, no un dictamen juridico ni una
certificacion de cumplimiento. Requieren decisiones del operador, revision juridica
y comprobacion de la operacion real antes de aprobarse.

## Documentos

| Archivo | Destino | Proposito |
| --- | --- | --- |
| [Ficha del operador y decisiones](FICHA_OPERADOR_Y_DECISIONES.md) | Interno | Resolver identidad legal, contactos, cobros, soporte y conservacion. |
| [Terminos del servicio](TERMINOS_DEL_SERVICIO.md) | Publico, tras aprobacion | Regular la relacion de uso del software. |
| [Politica de privacidad](POLITICA_DE_PRIVACIDAD.md) | Publico, tras aprobacion | Informar sobre datos personales y derechos. |
| [Aviso y consentimientos](AVISO_Y_CONSENTIMIENTOS_DATOS.md) | Formulario, tras aprobacion | Separar informacion previa y autorizaciones por finalidad. |
| [Suscripciones y cancelaciones](CONDICIONES_DE_SUSCRIPCION.md) | Publico, tras aprobacion | Explicar precios, limites, pagos y salida. |
| [Soporte](CONDICIONES_DE_SOPORTE.md) | Publico, tras aprobacion | Delimitar canales y alcance del acompanamiento. |
| [Anexo de tratamiento](ANEXO_TRATAMIENTO_DE_DATOS.md) | Contractual | Delimitar instrucciones y responsabilidades con clientes empresariales. |
| [Orden de servicio](ORDEN_DE_SERVICIO.md) | Una copia por cliente | Documentar el acuerdo concreto, incluido un piloto o cobro manual. |
| [Registro de tratamientos y proveedores](REGISTRO_TRATAMIENTOS_Y_PROVEEDORES.md) | Interno | Inventariar datos, accesos, servicios y decisiones de conservacion. |
| [Derechos, bajas e incidentes](PROCEDIMIENTO_DERECHOS_BAJAS_E_INCIDENTES.md) | Interno | Guiar solicitudes y operaciones controladas. |
| [Implementacion legal](IMPLEMENTACION_LEGAL.md) | Desarrollo y QA | Especificar publicacion y evidencia de aceptacion aun no implementadas. |

## Como completar el paquete

1. Completar la ficha del operador. Los textos como `{{PROVEEDOR_LEGAL}}` son campos
   pendientes, no valores predeterminados. Toda marca `PENDIENTE` bloquea la
   aprobacion de su documento, salvo que se retire expresamente por no aplicar.
2. Revisar los borradores con asesor juridico de la jurisdiccion del operador y
   de los mercados atendidos. Evaluar normativa vigente, caracter empresarial o
   de consumo de cada relacion, registro de bases de datos y tratamiento exterior.
3. Comprobar proveedores, ubicaciones, exportaciones, respaldo/restauracion,
   eliminacion, horarios y pagos realmente disponibles. Registrar evidencia.
4. Aprobar documentos por separado: identificador, version, aprobador y fecha de
   vigencia. Conservar la copia exacta de cada version entregada o aceptada.
5. Publicar paginas accesibles sin cuenta e implementar el flujo descrito en
   [Implementacion legal](IMPLEMENTACION_LEGAL.md). Estos Markdown no crean rutas,
   checkboxes, registros de aceptacion, trabajos de borrado ni envios de correo.
6. Para un alta manual, completar una orden por cliente y entregar las versiones
   aprobadas antes de contratar. No marcar retroactivamente aceptaciones de usuarios.

## Criterios antes de publicar

- [ ] Identidad legal, contactos y jurisdiccion confirmados; sin campos pendientes.
- [ ] Revision juridica de los textos y del consentimiento que corresponda.
- [ ] Precios finales, impuestos, moneda, renovacion y reembolsos confirmados.
- [ ] Proveedores y regiones verificadas en las cuentas contratadas.
- [ ] Plazos de soporte, exportacion, retencion y borrado respaldados por procesos.
- [ ] Aviso visible sobre apariencia publica y datos guardados en dispositivos.
- [ ] Versiones aprobadas, rutas publicas y prueba de aceptacion verificadas.
- [ ] Solicitudes de privacidad y cancelacion probadas con aislamiento de cliente.
- [ ] Cliente recibe su orden y documentos; operador conserva evidencia restringida.

## Fuentes tecnicas y legales de consulta

El contrato no debe copiar indiscriminadamente todas las capacidades del catalogo.
La configuracion efectiva del backend y la orden aprobada determinan lo ofrecido.

- [Configuracion de planes](../../backend/config/planes.js).
- [Documentacion de planes](../../backend/documentation/planes-saas.md).
- [Imagenes y R2](../../backend/documentation/apariencia-imagenes-r2.md).
- [Cierre tecnico local](../../AUDIT_CIERRE_PRE_LANZAMIENTO.md): no certifica servicios externos.
- [Ley 8968, publicacion oficial del INAMU](https://formatos.inamu.go.cr/SIDOC/DOCS/ley_8968.pdf).
- [PRODHAB: preguntas frecuentes](https://www.prodhab.go.cr/preguntasfrecuentes.aspx).
- [MEIC: orientacion sobre comercio electronico](https://www.meic.go.cr/wp-content/uploads/2025/06/CharlaComercio-electronico-2025.pdf).
- [SCIJ: consulta normativa de comercio electronico](https://sinalevi.go.cr/ResultadosNormativa/Informacion?param1=107373&param2=151629&param3=1).

Consultas de referencia realizadas el 2026-10-27. La orientacion del MEIC no
sustituye la revision del texto legal vigente ni resuelve por si sola su aplicacion
a cada contrato. No se copiaron clausulas de otros SaaS ni se declara cumplimiento
automatico de normativa extranjera.
