# Razas bovinas, porcinas y descendencia

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
- `fraccionRazaPrincipal` y `fraccionRazaSecundaria`: fracciones opcionales por raza, por ejemplo `3/8` y `5/8`. Son informativas y no cambian ninguna regla productiva.

El catálogo vive en `backend/config/catalogoRacial.js` y las reglas en `backend/services/raza-service.js`.
El frontend obtiene el catálogo mediante `GET /api/animales/catalogos/razas?especie=Bovino|Porcino`; no replica la lista en cada formulario.

El catálogo porcino incluye como núcleo `Large White (Yorkshire)`, `Landrace`, `Duroc`, `Hampshire` y `Pietrain`, además de `Berkshire`, `Chester White`, `Poland China`, `Spotted`, `Criollo`, líneas comerciales y valores de compatibilidad. La selección se basó en la distribución internacional descrita por FAO y en los catálogos educativos de razas porcinas de Oklahoma State University Extension.

### Reglas importantes

- `Brahman cruzado` sin segunda raza se clasifica como `Cruce cebú no definido`.
- Brahman con Angus, Simmental o Charolais se clasifica como `Cebú × Europeo`.
- Brahman con Nelore se clasifica como `Cebuino`.
- Brahman con Senepol se clasifica como `Cebú × Tropical adaptado`.
- Brangus, Simbrah, Beefmaster, Charbray y Santa Gertrudis se clasifican como `Sintético`.
- Un texto no reconocido se conserva y queda con raza principal `Otra`; no se adivina.
- `Yorkshire` y `Large White` se normalizan a `Large White (Yorkshire)`.
- Las fracciones se reducen a su forma canónica (`10/16` pasa a `5/8`), pero la app no deduce la fracción faltante ni exige que ambas sumen uno.

## Migración segura

La migración solo completa campos estructurados faltantes. Nunca modifica `Animal.raza`.

```bash
npm run migrate:razas:check
npm run migrate:razas
npm run migrate:razas-porcinas:check
npm run migrate:razas-porcinas
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

`GET /api/reportes/razas?especie=Bovino|Porcino|Todos` entrega distribución por especie, grupo y detalle racial. `GET /api/reportes/bovinos/razas` se conserva por compatibilidad.

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
- `FRACCION_RAZA_PRINCIPAL`
- `FRACCION_RAZA_SECUNDARIA`
- `MADRE_DIIO`
- `PADRE_DIIO`

Si el padre o la madre existen, la segunda pasada crea la relación interna. Si aún no existen, sus identificadores se conservan para resolución futura.

## Índices MongoDB

Los índices de parentesco incluyen organización y finca, junto con `madre`, `padre`, `madreDiio`, `padreDiio` y `fechaNacimiento`. La consulta racial usa un índice por organización, finca, especie y grupo racial.

## Referencias del catálogo porcino

- FAO, *The State of the World's Animal Genetic Resources for Food and Agriculture*: https://www.fao.org/4/a1250e/a1250e.pdf
- Oklahoma State University Extension, *Marshall County Fair Livestock Exhibits*: https://extension.okstate.edu/county/marshall/county-fair/marshall-county-fair-livestock-exhibits
