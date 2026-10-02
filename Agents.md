Necesito hacer una LIMPIEZA Y MIGRACIÓN de objetivoProductivo y propósito de Lotes en GanaderiaRomilio.

OBJETIVO:

Eliminar la redundancia entre:

CRIA
REPRODUCCION

y dejar una única categoría:

REPRODUCCION

Esto debe aplicarse tanto a:

BOVINOS
PORCINOS

y debe migrar correctamente todos los datos existentes de clientes.

IMPORTANTE:

NO perder animales.
NO borrar históricos.
NO cambiar especie.
NO modificar información reproductiva.
NO alterar compras, ventas, sanidad, pesajes o genealogía.

==================================================
1. REVISAR IMPLEMENTACIÓN ACTUAL
==================================================

Antes de modificar:

buscar en todo backend y frontend referencias a:

CRIA
Cría
Cria
cría
cria

especialmente en:

Animal
Lote
PertenenciaLote
PlanAlimentacion
Racion
AsignacionPlanAlimentacion
AsignacionRacionLote
Reportes
Filtros
Importador
Dashboard
Inventario
Porcinos
Bovinos
Reproducción
Pesajes
Sanidad
Compras
Ventas
Feature/config files
Enums/constants
validaciones
tests

No hacer únicamente cambio visual.

Necesitamos consistencia en:

BD
backend
frontend
importación
reportes
validaciones

==================================================
2. OBJETIVO PRODUCTIVO FINAL
==================================================

Animal.objetivoProductivo debe utilizar únicamente:

ENGORDE
REPRODUCCION
REEMPLAZO
OTRO
SIN_DEFINIR

o los equivalentes exactos que ya utiliza el proyecto.

Eliminar:

CRIA

como valor permitido.

==================================================
3. SIGNIFICADO
==================================================

REPRODUCCION:

Animales cuyo objetivo productivo actual es formar parte del sistema reproductivo.

Ejemplos bovinos:

- vaca reproductora
- toro reproductor
- novilla incorporada a reproducción

Ejemplos porcinos:

- cerda reproductora
- verraco reproductor
- hembra incorporada al plantel reproductivo

REEMPLAZO:

Animales seleccionados para convertirse posteriormente en reproductores.

Ejemplo:

Novilla de reemplazo

REEMPLAZO
→ posteriormente
REPRODUCCION

==================================================
4. CRÍA NO ES OBJETIVO PRODUCTIVO
==================================================

Eliminar CRIA porque se estaba utilizando como sinónimo de:

REPRODUCCION.

Esto generaba casos como:

Animal A:
Cría

Animal B:
Reproducción

aunque ambos realmente tenían el mismo objetivo.

Después de esta migración:

ambos serán:

REPRODUCCION.

==================================================
5. MIGRACIÓN DE ANIMALES EXISTENTES
==================================================

Crear script de migración específico.

Ejemplo:

scripts/migrations/migrateCriaToReproduccion.js

o ubicación equivalente del proyecto.

Debe buscar TODOS los animales existentes:

Bovinos
Porcinos

sin importar:

estado
finca
fecha
sexo

cuando:

objetivoProductivo corresponda a Cría.

==================================================
6. VALORES A NORMALIZAR
==================================================

Como mínimo reconocer:

"CRIA"
"Cría"
"Cria"
"cría"
"cria"

También:

valores con espacios accidentales:

" Cría"
"Cría "
" Cría "

Normalizar trim/case/acento de manera segura.

Todos deben convertirse a:

REPRODUCCION

o al valor canónico utilizado por el enum actual.

==================================================
7. NO HACER MIGRACIONES AMBIGUAS
==================================================

Si aparecen valores inesperados como:

"Cría y engorde"
"Cría/Reproducción"
"Reproductora cría"
"Cría futura"

NO asumir automáticamente qué significan.

El script debe reportarlos como:

VALORES_NO_RECONOCIDOS

para revisión.

No migrarlos silenciosamente.

==================================================
8. APLICAR A TODOS LOS CLIENTES
==================================================

La migración NO debe aplicarse solamente a Ganadería Romilio.

Debe ejecutarse sobre todos los documentos Animal existentes en la base de datos actual.

Si ya existe:

organizacionId
fincaId
tenantId

NO filtrar una organización específica.

Migrar:

todos los tenants/clientes.

Si todavía no existe multi-tenant:

migrar toda la colección Animal.

==================================================
9. BOVINOS Y PORCINOS
==================================================

No crear lógica:

if especie === Bovino

La migración aplica a ambas especies.

Ejemplo:

Bovino:

objetivoProductivo:
Cría

↓

REPRODUCCION

Porcino:

objetivoProductivo:
Cría

↓

REPRODUCCION

==================================================
10. MIGRACIÓN IDEMPOTENTE
==================================================

El script debe poder ejecutarse más de una vez sin causar problemas.

Ejemplo:

Primera ejecución:

52 animales Cría
→ 52 migrados

Segunda ejecución:

0 animales pendientes
→ 0 cambios

==================================================
11. DRY RUN
==================================================

Agregar modo:

--dry-run

Ejemplo:

node scripts/migrations/migrateCriaToReproduccion.js --dry-run

Debe mostrar:

Animales revisados: 853

Cría encontrados: 47

Bovinos: 39
Porcinos: 8

Serían migrados: 47

Valores ambiguos: 2

NO modificar BD.

==================================================
12. EJECUCIÓN REAL
==================================================

Ejemplo:

node scripts/migrations/migrateCriaToReproduccion.js

Resultado esperado:

Animales revisados: 853
Migrados: 47
Bovinos: 39
Porcinos: 8
Errores: 0
Valores ambiguos: 0

==================================================
13. LOG DE MIGRACIÓN
==================================================

Mostrar al menos:

_id
DIIO / ID interno si existe
especie
valorAnterior
valorNuevo

No imprimir información sensible innecesaria.

Ejemplo:

Animal 12345
Bovino
Cría
→ REPRODUCCION

==================================================
14. NO CREAR EVENTOANIMAL POR MIGRACIÓN TÉCNICA
==================================================

Preferencia:

NO llenar la bitácora productiva de cada animal con:

"Objetivo cambiado de Cría a Reproducción"

porque no es un cambio real de manejo.

Es una normalización técnica.

Registrar la migración mediante:

log técnico
auditoría de migración

si la infraestructura existe.

==================================================
15. PROPÓSITO DE LOTE
==================================================

Revisar enum actual de:

Lote.proposito

Eliminar también:

CRIA

si existe.

Propósitos recomendados:

ENGORDE
REPRODUCCION
REEMPLAZO
DESTETE
CUARENTENA
VENTA
OTRO

No utilizar:

CRIA

==================================================
16. MIGRAR LOTES EXISTENTES
==================================================

Si existen lotes con:

proposito = CRIA

migrarlos a:

REPRODUCCION.

Reconocer también variantes:

Cría
Cria
cría
cria

Crear la migración dentro del mismo script o una migración separada claramente documentada.

==================================================
17. OBJETIVO PRODUCTIVO VS PROPÓSITO DEL LOTE
==================================================

Después de la limpieza:

Animal:

objetivoProductivo =
REPRODUCCION

puede pertenecer a:

Lote:

proposito =
REPRODUCCION

Esto simplifica validaciones.

==================================================
18. DESTETE NO ES OBJETIVO PRODUCTIVO
==================================================

No agregar:

DESTETE

a Animal.objetivoProductivo.

Destete es:

etapa / agrupación temporal.

Sí puede existir como:

Lote.proposito = DESTETE

==================================================
19. CUARENTENA NO ES OBJETIVO PRODUCTIVO
==================================================

No agregar:

CUARENTENA

a objetivoProductivo.

Puede ser:

Lote.proposito = CUARENTENA.

==================================================
20. VENTA NO ES OBJETIVO PRODUCTIVO
==================================================

No agregar:

VENTA

a objetivoProductivo.

Puede mantenerse como propósito operativo de lote si ya lo utiliza el proyecto.

==================================================
21. FRONTEND - FORMULARIO ANIMAL
==================================================

Actualizar dropdown:

Objetivo productivo

Opciones:

Engorde
Reproducción
Reemplazo
Otro
Sin definir

Eliminar:

Cría

==================================================
22. FILTROS
==================================================

Actualizar filtros de:

Inventario
Pesajes
Lotes
Reportes
Compras
Ventas

para que:

Cría

ya no aparezca como filtro independiente.

Usar:

Reproducción.

==================================================
23. DATOS HISTÓRICOS
==================================================

Después de migrar:

un filtro:

Reproducción

debe incluir animales que antes estaban:

Cría

porque ya estarán almacenados con el valor canónico.

No crear filtros:

Cría + Reproducción

permanentes.

Eso solo perpetuaría la inconsistencia.

==================================================
24. IMPORTADOR
==================================================

El importador debe seguir siendo tolerante con archivos antiguos.

Si un Excel contiene:

Cría
Cria
cría
cria

normalizar automáticamente a:

REPRODUCCION.

Esto es importante porque clientes pueden reutilizar plantillas viejas.

==================================================
25. IMPORTACIONES NUEVAS
==================================================

Nunca guardar nuevamente:

CRIA.

Incluso si viene del Excel:

Cría

el backend debe transformar:

Cría
→ REPRODUCCION

antes de guardar.

==================================================
26. BACKEND COMO ÚLTIMA BARRERA
==================================================

No depender solamente del frontend.

Crear helper central:

normalizarObjetivoProductivo()

o utilizar mecanismo existente.

Ejemplo conceptual:

normalizarObjetivoProductivo("Cría")
→ "REPRODUCCION"

normalizarObjetivoProductivo("Reproducción")
→ "REPRODUCCION"

normalizarObjetivoProductivo("Engorde")
→ "ENGORDE"

==================================================
27. VALOR REPRODUCCIÓN TAMBIÉN DEBE NORMALIZARSE
==================================================

Reconocer:

REPRODUCCION
Reproducción
Reproduccion
reproducción
reproduccion

→

REPRODUCCION

Esto evita nuevas inconsistencias.

==================================================
28. REEMPLAZO
==================================================

Normalizar también variantes obvias:

REEMPLAZO
Reemplazo
reemplazo

→

REEMPLAZO

Sin cambiar su significado.

==================================================
29. ENGORDE
==================================================

Normalizar:

ENGORDE
Engorde
engorde

→

ENGORDE

==================================================
30. CONSTANTE ÚNICA
==================================================

Crear/reutilizar una única definición central.

Ejemplo:

OBJETIVOS_PRODUCTIVOS = {
  ENGORDE: 'ENGORDE',
  REPRODUCCION: 'REPRODUCCION',
  REEMPLAZO: 'REEMPLAZO',
  OTRO: 'OTRO',
  SIN_DEFINIR: 'SIN_DEFINIR'
}

No repetir arrays distintos en:

AnimalForm
LoteForm
Reportes
Importador
etc.

==================================================
31. LABELS
==================================================

Separar:

valor interno

de:

label UI.

Ejemplo:

REPRODUCCION
→
"Reproducción"

REEMPLAZO
→
"Reemplazo"

No guardar labels traducidos directamente si actualmente el proyecto utiliza enums canónicos.

==================================================
32. VALIDACIÓN ANIMAL / LOTE
==================================================

Actualizar reglas de compatibilidad.

Antes podía existir:

Animal:
Cría

Lote:
Reproducción

y provocar incompatibilidad falsa.

Después:

Animal:
REPRODUCCION

Lote:
REPRODUCCION

→ compatible.

==================================================
33. PLANES DE ALIMENTACIÓN
==================================================

Revisar si:

PlanAlimentacion.proposito

puede contener:

CRIA.

Si existe:

migrar:

CRIA
→
REPRODUCCION.

Lo mismo para:

Racion.proposito

si ya se implementó.

==================================================
34. ASIGNACIONES EXISTENTES
==================================================

No modificar:

AsignacionPlanAlimentacion
AsignacionRacionLote

si solo contienen referencias.

Si almacenan snapshot de propósito:

migrar también cualquier:

CRIA
→ REPRODUCCION.

==================================================
35. REPORTES
==================================================

Buscar agregaciones como:

$group por objetivoProductivo

Después de migración:

Reproducción debe aparecer como una sola categoría.

Ejemplo antes:

Cría: 31
Reproducción: 18

Después:

Reproducción: 49

==================================================
36. DASHBOARD
==================================================

Si existe tarjeta/desglose:

Cría
Reproducción

fusionarlas.

Mostrar solamente:

Reproducción.

==================================================
37. PORCINOS
==================================================

Revisar especialmente vistas porcinas.

No confundir:

Reproducción

con:

Camada.

Una cerda puede ser:

objetivoProductivo:
REPRODUCCION

y tener múltiples:

RegistroReproductivo
Camadas

Esto no cambia.

==================================================
38. BOVINOS
==================================================

Una vaca puede ser:

objetivoProductivo:
REPRODUCCION

y continuar con:

gestaciones
partos
terneros
genealogía

sin ninguna modificación adicional.

==================================================
39. SISTEMA PRODUCTIVO "CRÍA"
==================================================

IMPORTANTE:

No eliminar necesariamente el término:

CRÍA

de toda la aplicación.

Puede existir correctamente como:

sistema productivo de la finca.

Ejemplo:

Sistema productivo:

Cría
Engorde
Ciclo completo
Mixto

El término que eliminamos es específicamente:

Animal.objetivoProductivo = CRIA

y:

Lote.proposito = CRIA

cuando significa lo mismo que reproducción.

==================================================
40. NO HACER REEMPLAZO GLOBAL DE TEXTO A CIEGAS
==================================================

MUY IMPORTANTE:

NO hacer:

buscar "Cría"
reemplazar todo por "Reproducción"

porque existen textos donde "cría" es correcto.

Ejemplos:

Sistema de cría bovina

Informe de cría

Costo de cría

Finca de cría

Esos conceptos deben permanecer.

Solo modificar campos/enums donde:

CRIA

se utilizaba como objetivo o propósito reproductivo.

==================================================
41. BACKUP / SEGURIDAD
==================================================

Antes de migración productiva:

documentar recomendación de:

backup/snapshot de MongoDB.

El script debe:

- fallar de manera clara
- no ocultar errores
- devolver exit code incorrecto si falla

==================================================
42. MIGRACIÓN SEGURA
==================================================

Preferir:

bulkWrite

o estrategia eficiente equivalente.

Pero no sacrificar validación.

Ejemplo conceptual:

updateMany(
  {
    objetivoProductivo: {
      $in: [...]
    }
  },
  {
    $set: {
      objetivoProductivo: "REPRODUCCION"
    }
  }
)

Pero revisar primero si existen:

valores inconsistentes
schemas
hooks
multi-tenancy

antes de usar updateMany ciegamente.

==================================================
43. REPORTE ANTES/DESPUÉS
==================================================

El script debe producir:

ANTES

ENGORDE: 302
CRIA: 47
REPRODUCCION: 91
REEMPLAZO: 21
OTRO: 4

DESPUÉS

ENGORDE: 302
REPRODUCCION: 138
REEMPLAZO: 21
OTRO: 4

Comprobar:

totalAntes === totalDespues

Ningún animal desaparece.

==================================================
44. VALIDACIÓN DE TOTALES
==================================================

Comprobar:

cantidad total Animal antes
=
cantidad total Animal después.

También por especie:

Bovinos antes
=
Bovinos después

Porcinos antes
=
Porcinos después

==================================================
45. PRUEBAS
==================================================

Crear pruebas para:

"Cría"
→ REPRODUCCION

"Cria"
→ REPRODUCCION

"CRIA"
→ REPRODUCCION

"cria"
→ REPRODUCCION

" Reproducción "
→ REPRODUCCION

Engorde
→ ENGORDE

Reemplazo
→ REEMPLAZO

Animal bovino Cría
→ migrado

Animal porcino Cría
→ migrado

Lote Cría
→ Reproducción

Plan alimentación Cría
→ Reproducción

Ración Cría
→ Reproducción

importación Excel Cría
→ Reproducción

valor ambiguo
→ no migrar automáticamente

segunda ejecución del script
→ 0 cambios

==================================================
46. MIGRACIÓN DE CLIENTES EXISTENTES
==================================================

El resultado final esperado es:

CLIENTE A

Bovinos:
17 objetivo Cría

↓

17 REPRODUCCION


CLIENTE B

Porcinos:
8 objetivo Cría

↓

8 REPRODUCCION


CLIENTE C

Bovinos:
Cría: 4
Reproducción: 7

↓

Reproducción: 11

Sin perder ningún animal.

==================================================
47. NO CAMBIAR OBJETIVO REEMPLAZO
==================================================

Un animal:

REEMPLAZO

NO debe convertirse automáticamente en:

REPRODUCCION.

Aunque eventualmente vaya a ser reproductor.

El cambio:

REEMPLAZO
→ REPRODUCCION

es un cambio productivo real y debe ocurrir cuando el productor lo determine.

La migración solo:

CRIA
→ REPRODUCCION.

==================================================
48. RESULTADO FINAL
==================================================

Debe quedar una taxonomía consistente:

ANIMAL

Objetivo productivo:

ENGORDE
REPRODUCCION
REEMPLAZO
OTRO
SIN_DEFINIR


LOTE

Propósito:

ENGORDE
REPRODUCCION
REEMPLAZO
DESTETE
CUARENTENA
VENTA
OTRO

==================================================
49. EJEMPLOS FINALES
==================================================

VACA REPRODUCTORA

objetivoProductivo:
REPRODUCCION

Lote:
REP-01

Estado reproductivo:
GESTANTE


NOVILLA DE REEMPLAZO

objetivoProductivo:
REEMPLAZO

Lote:
REEMP-01


NOVILLO

objetivoProductivo:
ENGORDE

Lote:
ENG-01


CERDA REPRODUCTORA

objetivoProductivo:
REPRODUCCION

Lote:
POR-REP-01


CERDA JOVEN SELECCIONADA

objetivoProductivo:
REEMPLAZO

Lote:
POR-REEMP-01

==================================================
50. DOCUMENTACIÓN
==================================================

Actualizar documentación técnica indicando:

"Cría" ya no es un objetivo productivo.

Cuando se habla de:

Animal destinado a producir descendencia

usar:

REPRODUCCION.

"Cría" puede seguir utilizándose para describir:

sistema productivo de cría bovina/porcina.

==================================================
51. ENTREGA FINAL DE CODEX
==================================================

Al terminar informar:

- archivos modificados
- enums modificados
- referencias a CRIA encontradas
- cuáles fueron modificadas
- cuáles se conservaron porque realmente significaban sistema de cría
- script de migración creado
- comando dry-run
- comando ejecución real
- cantidad de documentos afectados
- migración de bovinos
- migración de porcinos
- migración de lotes
- migración de planes/raciones si aplicaba
- importador actualizado
- frontend actualizado
- reportes actualizados
- pruebas realizadas
- cualquier valor ambiguo encontrado