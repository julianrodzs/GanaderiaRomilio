# Tipos de pesaje y sincronizacion con Inventario

Fecha: 2026-11-12. Disponible desde Esencial para Bovino y Porcino.

## Contrato

`Pesaje.tipoPesaje` distingue REGULAR, NACIMIENTO, DESTETE, ENTRADA_ENGORDE y
SALIDA_VENTA. La opcion inicial es Control / Regular. No se agrego otra
pantalla de destete ni un bloqueo comercial nuevo.

El campo anterior tenia otro significado (Individual, Lote, Importacion).
Ese dato ahora se conserva como `origenPesaje`. Los documentos anteriores
se leen como REGULAR conservando su origen; no requieren una migracion
masiva para funcionar. Los filtros de REGULAR tambien incluyen los valores
antiguos y los documentos sin tipo. Al guardar se utiliza el contrato nuevo.
Las importaciones siguen registrando controles regulares y no reclasifican
un hito existente al actualizar el peso.

## Inventario y evidencia

- DESTETE guarda pesoDestete, fechaDestete y edadDesteteDias en Animal.
  La edad usa dias civiles UTC; sin nacimiento valido queda null.
- NACIMIENTO guarda pesoNacimiento. No cambia la fecha de nacimiento.
- Peso actual y fecha del ultimo pesaje siguen correspondiendo al registro
  cronologicamente mas reciente, aunque se corrija un pesaje anterior.
- No se retrocede categoria por edad ni etapa productiva: esos conceptos
  conservan sus reglas existentes.
- Animal.hitosPesaje es trazabilidad interna no editable por el DTO de
  inventario y oculta por defecto. Conserva el valor previo y sincronizado.
- Al eliminar/reclasificar/reasignar el pesaje se restaura el valor previo
  solo cuando el campo todavia coincide con la proyeccion de ese pesaje.
  Una correccion manual posterior no se borra.
- La transaccion incluye pesaje, proyecciones y evento. Un fallo revierte
  todo. Un destete genera un evento Destete vinculado al pesaje, con peso,
  edad y GDP predestete cuando existen peso y fecha de nacimiento validos.
  Editar actualiza el mismo evento; reclasificar sustituye el evento sin
  dejar uno de destete huerfano ni borrar el historial grupal del lote.

Hay un unico pesaje NACIMIENTO y un unico DESTETE por animal/organizacion,
protegidos por indice parcial. Otro intento devuelve 409 y solicita editar
el registro existente; no hay reemplazos silenciosos. Esto tambien protege
creaciones concurrentes y animales trasladados de finca.

## Interfaz

Crear/editar Pesajes y la captura por lote ofrecen el selector de tipo.
DESTETE muestra la nota solicitada sobre la ficha y la bitacora. Listado,
historial individual y reporte de pesajes usan badges con texto legible.
La ficha conserva peso, fecha y tiempo de destete para ambas especies.

## Reportes y exportaciones

El reporte basico existente de peso al destete toma los pesajes DESTETE
como fuente principal y utiliza fichas historicas sin pesaje como respaldo.
Deduplica por animal y respeta especie y fecha. En porcinos muestra dos
cohortes separadas: animales individuales y camadas; no suma ambas como si
fueran registros independientes de una misma poblacion.

El analisis de pesajes historicos conserva su plan actual (desde Gestion),
pero agrega filtro y detalle por tipo. Seleccionar un tipo limita tambien
los puntos utilizados para calcular crecimiento; con un solo punto no se
inventa una GDP. El listado operativo y el reporte basico de destete siguen
disponibles desde Esencial.

GET /api/pesajes acepta tipoPesaje, especie, animal, fechaInicio y fechaFin.
GET /api/reportes/crecimiento-pesajes acepta tipoPesaje ademas de sus filtros.
GET /api/pesajes/exportar?formato=xlsx|pdf exporta con los mismos filtros,
etiquetas legibles y permisos pesajes.ver. El reporte utiliza soloActivos=true
para coincidir con su cohorte. Mas de 10000 filas exige reducir el periodo;
no se truncan datos silenciosamente. Excel protege texto contra formulas y
PDF repite cabeceras y pagina las filas.

## Despliegue

1. Respaldar la base y desplegar backend y frontend de la misma revision.
2. Desde backend ejecutar `npm run indexes:pesajes` contra la base correcta.
   Es aditivo: crea indices de Pesaje, no modifica registros ni elimina
   indices. No ejecutar por defecto otras migraciones.
3. Probar un destete, su correccion y su eliminacion con un animal de prueba.

No se necesitan nuevas variables ni servicios. La preparacion de indices
no se ejecuto contra Atlas durante el desarrollo.

## Verificacion

- `npm test` backend: 526 pruebas aprobadas, incluidas 11 nuevas de HTTP con
  MongoDB local real para Esencial bovino/porcino, GDP, edicion, eliminacion,
  rollback, concurrencia, aislamiento, legados, filtros y archivos XLSX/PDF.
- `npm test` frontend: 98 pruebas aprobadas.
- `npm run build`: correcto.
- `node tests/pesajes.navegador.mjs`: crear, editar, filtrar y eliminar para
  ambas especies en 1440, 820, 390 y 320 px con API ficticia local.
- Smoke integrado: 16 pasos y 9 verificaciones aprobados, incluidos pesajes
  por lote, importaciones y traslados. Evidencia local en TEMP/cir-pesajes-smoke.
