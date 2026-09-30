# Razas bovinas y descendencia

## Principios

La descripción usada por el productor y la clasificación analítica son datos complementarios.
`Animal.raza` se conserva por compatibilidad y `descripcionRacial` mantiene el texto conocido en la finca. Los reportes usan los campos estructurados sin reescribir el historial.

La cantidad de crías nunca se guarda como contador en `Animal`. Se deriva de `madre` y `padre`, con respaldo en `madreDiio` y `padreDiio` para datos históricos.

## Campos raciales de Animal

- `raza`: campo histórico compatible.
- `razaPrincipal` y `razaSecundaria`: razas normalizadas conocidas.
- `grupoRacial`: clasificación calculada para reportes.
- `gradoRacial`: `Puro / Registrado`, `Predominante`, `Cruce conocido`, `Cruce no definido` o `Desconocido`.
- `variedadRacial`: variedad opcional, por ejemplo Brahman gris o rojo.
- `descripcionRacial`: descripción libre conservada.
- `composicionRacial`: composición opcional cuando el productor la conoce.

El catálogo vive en `backend/config/catalogoRacial.js` y las reglas en `backend/services/raza-service.js`.
El frontend obtiene el catálogo mediante `GET /api/animales/catalogos/razas`; no replica la lista en cada formulario.

### Reglas importantes

- `Brahman cruzado` sin segunda raza se clasifica como `Cruce cebú no definido`.
- Brahman con Angus, Simmental o Charolais se clasifica como `Cebú × Europeo`.
- Brahman con Nelore se clasifica como `Cebuino`.
- Brahman con Senepol se clasifica como `Cebú × Tropical adaptado`.
- Brangus, Simbrah, Beefmaster, Charbray y Santa Gertrudis se clasifican como `Sintético`.
- Un texto no reconocido se conserva y queda con raza principal `Otra`; no se adivina.

## Migración segura

La migración solo completa campos estructurados faltantes. Nunca modifica `Animal.raza`.

```bash
npm run migrate:razas:check
npm run migrate:razas
```

Ejecutar primero el modo de revisión. Los casos ambiguos y no reconocidos aparecen separados en el resumen para revisión manual.

El 29/09/2026 se aplicó la primera migración: 92 bovinos fueron estructurados, 79 descripciones de cruce quedaron deliberadamente como cruce no definido y no hubo textos sin reconocer. La verificación posterior confirmó los 92 registros como ya estructurados.

## Genealogía y descendencia

La relación por `ObjectId` tiene prioridad. Si no existe, el servicio busca coincidencias por DIIO o identificador de finca legado. Esta compatibilidad permite resolver genealogías importadas aunque el progenitor se haya creado después.

`GET /api/animales/:id/descendencia` devuelve:

- resumen de crías directas por sexo y estado;
- primera y última cría registrada;
- madres diferentes cuando el animal es macho;
- lista navegable de crías.

El endpoint histórico `/api/genealogia/animal/:animalId/descendencia` se conserva para clientes anteriores.

## Reportes

`GET /api/reportes/bovinos/razas` entrega distribución por grupo y detalle racial.

`GET /api/reportes/bovinos/descendencia?fechaInicio=&fechaFin=` entrega:

- vacas: partos, crías, crías vivas, sexo, última cría, edad y estado reproductivo;
- toros: crías, madres diferentes, sexo y última cría.

Los partos se cuentan desde `RegistroReproductivo.fechaPartoReal`. Las crías se cuentan desde genealogía en `Animal`; por eso un parto gemelar puede representar un parto y dos crías.

## Importador

La hoja `INVENTARIO` acepta opcionalmente:

- `RAZA`
- `RAZA_PRINCIPAL`
- `RAZA_SECUNDARIA`
- `DESCRIPCION_RACIAL`
- `GRADO_RACIAL`
- `VARIEDAD_RACIAL`
- `COMPOSICION_RACIAL`
- `MADRE_DIIO`
- `PADRE_DIIO`

Si el padre o la madre existen, la segunda pasada crea la relación interna. Si aún no existen, sus identificadores se conservan para resolución futura.

## Índices MongoDB

Los índices de parentesco incluyen organización y finca, junto con `madre`, `padre`, `madreDiio`, `padreDiio` y `fechaNacimiento`. La consulta racial usa un índice por organización, finca, especie y grupo racial.
