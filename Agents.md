Necesito implementar en GanaderiaRomilio el manejo de BANCOS FORRAJEROS / PASTOS DE CORTE dentro del módulo actual de Potreros.

OBJETIVOS:

1. Registrar áreas destinadas a producir forraje para corte y acarreo.
2. Mantenerlas diferenciadas de los potreros donde pastorean animales.
3. Registrar siembra, establecimiento, cortes y cantidades producidas.
4. Tener historial real de producción.
5. Generar próximas actividades de corte mediante Tareas.
6. Preparar datos para futura relación con alimentación y engorde.
7. Crear análisis de rendimiento productivo, PERO disponible solamente desde el plan Gestión.

IMPORTANTE:

NO crear un módulo principal nuevo llamado "Forrajes".

Debe seguir dentro de:

Potreros

Visualmente:

POTREROS

[ Pastoreo ] [ Bancos forrajeros ]

Esto evita aumentar el menú principal y evita mezclar visualmente las métricas de pastoreo con las métricas de corte.

==================================================
1. REVISIÓN PREVIA
==================================================

Antes de modificar:

- revisar Potrero
- revisar RotacionPotrero
- revisar catálogo de pastos recientemente implementado
- revisar HistorialCoberturaPotrero
- revisar potreroRendimientoService
- revisar Tarea
- revisar MovimientoFinanciero
- revisar sistema de planes / PlanService
- revisar FeatureGate
- revisar calendario lunar implementado para tareas de Siembra
- revisar importador

NO duplicar:

- catálogo de pastos
- servicios de rendimiento
- historial de cobertura
- tareas
- lógica de planes

Si CatalogoPasto ya existe, extenderlo para soportar también especies de corte en lugar de crear otro catálogo incompatible.

==================================================
2. CONCEPTO: TIPO DE ÁREA
==================================================

Agregar al Potrero, o adaptar estructura existente:

tipoArea

Valores iniciales:

PASTOREO
BANCO_FORRAJERO

Preparar opcionalmente:

MIXTO

pero NO complicar la primera versión si el modelo actual no lo necesita.

PASTOREO:

animales entran al área.

Sus indicadores principales siguen siendo:

- días ocupados
- ocupación
- rotaciones
- animal-días
- animal-días/ha
- descanso

BANCO_FORRAJERO:

el animal normalmente NO entra.

El forraje se:

- corta
- pica
- transporta
- suministra a animales

Sus indicadores son diferentes:

- kg de forraje producido
- kg/ha/corte
- cortes
- días entre cortes
- producción acumulada
- producción/ha

NO calcular animal-días/ha para un banco forrajero.

==================================================
3. CATÁLOGO ÚNICO DE FORRAJES
==================================================

Extender el catálogo existente para manejar:

tipoUso o usosPermitidos.

Ejemplo:

usosPermitidos: [
  'PASTOREO',
  'CORTE',
  'ENSILAJE'
]

Un mismo material puede admitir más de un uso.

Ejemplo conceptual:

{
  nombre: "Cuba OM-22",
  categoria: "Pasto de corte",
  usosPermitidos: ["CORTE"],
  activo: true
}

No crear listas separadas completamente incompatibles de:

CatalogoPasto
CatalogoForraje

Preferencia:

un catálogo productivo único reutilizable.

Puede renombrarse internamente a:

CatalogoForraje

solo si la migración es segura.

==================================================
4. CATÁLOGO INICIAL DE PASTOS DE CORTE / FORRAJES
==================================================

Agregar:

Cuba OM-22 / Cuba 22
Cuba CT-115
King Grass
Taiwán
Taiwán rojo
Camerún
Maralfalfa
Elefante
Gigante
Caña de azúcar
Imperial
Maíz forrajero
Sorgo forrajero
Prodigioso
Otro

Mantener además los materiales de pastoreo ya existentes:

Brizantha
Toledo
Marandú
Piatá
Xaraés
Diamantes 1
MG-5 Victoria
Mombaza
Tanzania
Massai
Guinea
Estrella Africana
Ratana
Decumbens
Humidícola
Mulato
Mulato II
Tanner
Brachipará
Gamalote
Jaragua
Kikuyo
etc.

==================================================
5. LEGUMINOSAS / COMPLEMENTOS
==================================================

Mantener separadas conceptualmente las leguminosas asociadas.

Catálogo inicial:

Maní forrajero
Kudzú
Cratylia
Stylosanthes
Otra
Ninguna

Ejemplo:

Banco Norte

Forraje principal:
Cuba OM-22

Leguminosa asociada:
Cratylia

No confundir ambos como una única especie.

==================================================
6. DATOS DE UN BANCO FORRAJERO
==================================================

Para tipoArea = BANCO_FORRAJERO:

registrar:

nombre
codigo
area
forrajePrincipal
forrajesSecundarios
leguminosasAsociadas

fechaEstablecimiento

intervaloCorteObjetivoDias

observaciones

estado

No guardar manualmente:

ultimoCorte
proximoCorte

si pueden derivarse de los registros de cortes.

Pueden exponerse como campos virtuales/calculados.

==================================================
7. EJEMPLO
==================================================

BANCO NORTE

Área:
0.8 ha

Forraje principal:
Cuba OM-22

Fecha establecimiento:
15/03/2026

Intervalo objetivo:
60 días

Último corte:
22/08/2026

Próximo corte estimado:
21/10/2026

Producción último corte:
4.250 kg

==================================================
8. MODELO DE CORTE
==================================================

Crear:

CorteForraje

o nombre equivalente.

Campos sugeridos:

{
  area: ObjectId ref Potrero,

  fechaCorte: Date,

  forraje: ObjectId ref CatalogoForraje,

  areaCortadaHa: Number,

  cantidadForrajeVerdeKg: Number,

  porcentajeMateriaSeca: Number | null,

  cantidadMateriaSecaKg: Number | null,

  destino: {
    tipo,
    referenciaId,
    descripcion
  },

  responsable: ObjectId,

  observaciones: String,

  registradoPor: ObjectId,

  createdAt,
  updatedAt
}

==================================================
9. ÁREA CORTADA
==================================================

No asumir siempre que se corta el 100 % del banco.

Permitir:

areaCortadaHa

Ejemplo:

Banco:

0.8 ha

Corte realizado:

0.4 ha

Producción:

2.100 kg

Entonces:

kgForrajeVerdePorHa =

2100 / 0.4

NO:

2100 / 0.8

==================================================
10. CANTIDAD PRODUCIDA
==================================================

La medida principal normalizada debe ser:

kg de forraje verde

En frontend permitir ingresar:

kg
toneladas

Si usuario ingresa:

4.25 toneladas

normalizar internamente:

4250 kg

No mezclar unidades sin conversión.

Si posteriormente se permiten:

carretas
sacos
cargas

no convertirlas a kg si no existe un peso equivalente conocido.

==================================================
11. MATERIA SECA
==================================================

porcentajeMateriaSeca:

opcional.

NO obligarlo.

Si existe:

cantidadMateriaSecaKg =

cantidadForrajeVerdeKg *
porcentajeMateriaSeca / 100

Ejemplo:

4250 kg forraje verde

20 % MS

=

850 kg materia seca

NO estimar porcentaje de materia seca automáticamente por especie en esta primera versión.

Si usuario no lo conoce:

cantidadMateriaSecaKg = null

==================================================
12. DESTINO DEL FORRAJE
==================================================

Registrar opcionalmente hacia dónde fue destinado el corte.

Valores iniciales:

FINCA_GENERAL
BOVINOS
PORCINOS
ENGORDE_BOVINO
ENGORDE_PORCINO
LOTE
ANIMAL
OTRO

Si existe modelo de lote:

permitir referencia.

Si no existe:

no inventarlo únicamente por esto.

Conservar:

descripcionDestino

cuando no haya referencia estructurada.

Ejemplo:

Destino:
Engorde bovino

Esto servirá posteriormente para relacionar producción de forraje con alimentación.

==================================================
13. NO CALCULAR CONVERSIÓN ALIMENTICIA
==================================================

IMPORTANTE:

Cantidad cosechada NO significa automáticamente cantidad consumida.

Por tanto todavía NO calcular:

- conversión alimenticia
- alimento/kg ganado
- IEE alimenticio
- consumo por animal

Un corte puede tener:

- desperdicio
- almacenamiento
- pérdidas
- alimento no consumido

Solo registrar:

producción
destino

Preparar arquitectura futura.

==================================================
14. REGISTRAR CORTE
==================================================

Flujo:

Banco Norte
→ Registrar corte

Fecha:
22/08/2026

Área cortada:
0.8 ha

Cantidad:
4.250 kg

Materia seca:
opcional

Destino:
Engorde bovino

Responsable:
...

Observaciones:
...

Guardar CorteForraje.

==================================================
15. PRÓXIMO CORTE
==================================================

Si existe:

intervaloCorteObjetivoDias

entonces:

proximoCorteEstimado =

ultimoCorte.fechaCorte
+
intervaloCorteObjetivoDias

Ejemplo:

Último corte:
22 agosto

Intervalo objetivo:
60 días

Próximo:
21 octubre

==================================================
16. TAREAS AUTOMÁTICAS
==================================================

Si banco tiene:

intervaloCorteObjetivoDias

después de registrar un corte:

crear o actualizar tarea automática:

"Cortar Banco Norte"

fechaProgramada:
proximoCorteEstimado

moduloOrigen:
Potreros

referenciaId:
Banco/Potrero

categoriaAutomatica:
CORTE_FORRAJE

creadoAutomaticamente:
true

También se debe registrar la tarea del primer corte con la fecha qeu indico porque puede que registre el corte sin haberlo hecho, etonces crear la tarea con el responsable.
Usar estructura real de Tarea.

==================================================
17. NO DUPLICAR TAREAS
==================================================

Si ya existe una tarea automática pendiente para el próximo corte:

actualizarla.

No crear duplicados.

Si usuario registra corte antes de la fecha prevista:

cerrar/completar correctamente la tarea correspondiente
y programar la siguiente.

No modificar tareas ya completadas históricamente.

==================================================
18. SIEMBRA / ESTABLECIMIENTO
==================================================

Al crear o renovar un banco forrajero:

permitir crear tarea:

SIEMBRA

Ejemplo:

"Sembrar Banco Norte - Cuba OM-22"

La tarea debe integrarse con el calendario lunar que ya implementamos.

Cuando usuario:

- crea
- edita
- reprograma

una tarea categoría SIEMBRA:

mostrar:

fase lunar
próximas fases

como información.

NO modificar la fecha automáticamente.

==================================================
19. HISTORIAL DE COBERTURA
==================================================

Reutilizar:

HistorialCoberturaPotrero

si ya existe.

Ejemplo:

Banco Norte

Cuba OM-22
2026-03-15 → 2028-02-01

Maralfalfa
2028-02-02 → actual

Los cortes históricos deben conservar el forraje correcto de su época.

NO mostrar cortes antiguos como Maralfalfa solo porque actualmente el banco tenga Maralfalfa.

==================================================
20. CAMBIO / RENOVACIÓN DE FORRAJE
==================================================

Cuando usuario cambia:

Cuba OM-22
→ Maralfalfa

pedir:

Fecha del cambio/establecimiento

Cerrar cobertura anterior.

Crear cobertura nueva.

Actualizar forraje actual.

NO destruir historial.

==================================================
21. INTERFAZ POTREROS
==================================================

Dentro del módulo actual:

POTREROS

[ Pastoreo ] [ Bancos forrajeros ]

Vista Pastoreo:

mantener funcionamiento actual.

Vista Bancos forrajeros:

mostrar cards/tabla:

Nombre
Área
Forraje
Último corte
Próximo corte
Producción último corte
Estado

Acciones:

Ver
Registrar corte
Editar
Programar actividad

==================================================
22. DETALLE DEL BANCO
==================================================

Secciones:

INFORMACIÓN

Área
Forraje principal
Forrajes asociados
Fecha establecimiento
Intervalo objetivo

ESTADO ACTUAL

Último corte
Días desde último corte
Próximo corte estimado
Días faltantes

HISTORIAL DE CORTES

Fecha
Área cortada
Kg forraje verde
Kg/ha
Materia seca si existe
Destino
Responsable

TAREAS

Próximo corte
Siembra
Fertilización
otras asociadas

==================================================
23. PLANES - FUNCIONALIDAD BÁSICA
==================================================

Toda la gestión de bancos forrajeros debe estar disponible en:

ESENCIAL
GESTION
PRO
PREMIUM

Esto incluye:

- crear banco forrajero
- editar
- catálogo
- registrar cortes
- historial de cortes
- producción de cada corte
- próximo corte
- tareas
- destino
- materia seca opcional

NO bloquear el manejo operativo en Esencial.

==================================================
24. FEATURE DE PLAN
==================================================

Si existe configuración de features:

agregar o utilizar:

bancosForrajeros: true

para TODOS los planes.

Ejemplo:

ESENCIAL:
bancosForrajeros = true

GESTION:
bancosForrajeros = true

PRO:
bancosForrajeros = true

PREMIUM:
bancosForrajeros = true

==================================================
25. QUÉ ES BÁSICO Y QUÉ ES ANALÍTICA
==================================================

IMPORTANTE PARA PLANES:

TODOS LOS PLANES pueden ver en cada banco:

- último corte
- producción de ese corte
- kg/ha de ese corte
- historial de cortes
- próximo corte
- días entre dos cortes concretos

Eso forma parte del manejo operativo.

Lo que se bloquea es:

ANÁLISIS AGREGADO / COMPARATIVO DE RENDIMIENTO.

==================================================
26. ANÁLISIS DE RENDIMIENTO
==================================================

Disponible desde:

GESTION

y también:

PRO
PREMIUM

ESENCIAL:
NO

Usar preferentemente la feature existente:

analiticaProductiva

No crear lógica:

if plan === 'GESTION'

Usar:

requireFeature('analiticaProductiva')

o equivalente.

==================================================
27. ENDPOINT DE ANALÍTICA
==================================================

Crear endpoint equivalente:

GET /api/reportes/forrajes/rendimiento

protegido por:

requireFeature('analiticaProductiva')

Filtros:

fechaInicio
fechaFin
areaId
forrajeId

==================================================
28. INDICADORES DE RENDIMIENTO
==================================================

Para el período:

totalBancos

areaTotalHa

totalCortes

forrajeVerdeTotalKg

materiaSecaTotalKg
solo cuando exista información

produccionForrajeVerdeKgHa

produccionMateriaSecaKgHa
cuando sea posible

promedioKgHaCorte

diasPromedioEntreCortes

cumplimientoIntervaloCorte

produccionPorMes

produccionPorForraje

produccionPorBanco

destinos

==================================================
29. KG/HA/CORTE
==================================================

Para cada corte:

kgHaCorte =

cantidadForrajeVerdeKg
/
areaCortadaHa

Solo calcular si:

areaCortadaHa > 0

No usar área total del banco si se registró área cortada específica.

==================================================
30. PRODUCCIÓN DEL PERÍODO POR HA
==================================================

Diferenciar:

kg/ha/corte

de:

kg/ha acumulados en el período.

Ejemplo:

Banco 1 ha

Corte 1:
4.000 kg

Corte 2:
4.500 kg

Corte 3:
4.200 kg

Producción acumulada:

12.700 kg

Producción período:

12.700 kg/ha

Promedio por corte:

4.233 kg/ha/corte

No confundir ambos indicadores.

==================================================
31. DÍAS ENTRE CORTES
==================================================

Para cada banco:

ordenar cortes cronológicamente.

Calcular:

diasEntreCortes

entre corte N y N+1.

Después:

diasPromedioEntreCortes

minimo
maximo

Comparar con:

intervaloCorteObjetivoDias

==================================================
32. CUMPLIMIENTO DEL INTERVALO
==================================================

NO clasificar automáticamente como "mejor" por cortar más rápido.

Mostrar:

Objetivo:
60 días

Real promedio:
64 días

Diferencia:
+4 días

o:

Objetivo:
60

Real:
55

Diferencia:
-5

La interpretación pertenece al productor/técnico.

==================================================
33. RENDIMIENTO POR FORRAJE
==================================================

Agrupar por:

forrajePrincipal / forraje registrado en CorteForraje.

Ejemplo:

Cuba OM-22

Bancos:
3

Área evaluada:
2.4 ha

Cortes:
14

Forraje producido:
63.500 kg

Promedio:
4.535 kg/ha/corte

Intervalo promedio:
58 días

==================================================
34. RENDIMIENTO POR BANCO
==================================================

Ejemplo:

Banco Norte

Forraje:
Cuba OM-22

Área:
0.8 ha

Cortes:
6

Total:
25.400 kg

Promedio:
5.292 kg/ha/corte

Días promedio:
61

==================================================
35. COMPARAR EL MISMO FORRAJE
==================================================

Permitir:

Cuba OM-22

Banco Norte:
5.200 kg/ha/corte

Banco Sur:
4.400 kg/ha/corte

Banco Bajo:
3.900 kg/ha/corte

Esto puede ayudar a detectar diferencias de:

- suelo
- manejo
- fertilización
- humedad
- edad del cultivo

Pero NO afirmar automáticamente causalidad.

==================================================
36. NO DECIR "MEJOR FORRAJE"
==================================================

Usar lenguaje:

"Rendimiento observado"

"Mayor producción registrada"

"Producción promedio en esta finca"

NO usar:

"Este es el mejor pasto"

"Este forraje es superior"

porque existen múltiples factores de manejo.

==================================================
37. GRÁFICOS
==================================================

En análisis avanzado incluir:

Producción mensual
→ línea

Kg/ha/corte por banco
→ barras

Producción por forraje
→ barras

Días entre cortes
→ tendencia/histórico

Destino del forraje
→ distribución si tiene datos suficientes

==================================================
38. DATOS INSUFICIENTES
==================================================

Si hay un único corte:

se puede mostrar:

producción del corte
kg/ha/corte

pero NO:

promedio entre cortes

Si no existe área cortada:

NO inventar kg/ha.

Si no existe materia seca:

NO estimarla.

Mostrar:

"Sin información suficiente"

en vez de cero cuando cero sería engañoso.

==================================================
39. FRONTEND - ESENCIAL
==================================================

Usuario Esencial entra a Banco Norte.

Puede ver:

Área:
0.8 ha

Cuba OM-22

Último corte:
22 agosto

Producción:
4.250 kg

Rendimiento de ese corte:
5.313 kg/ha

Próximo corte:
21 octubre

Historial:
...

Pero en sección:

ANÁLISIS DE RENDIMIENTO

mostrar tarjeta bloqueada:

"Análisis de rendimiento de forrajes"

"Disponible desde el plan Gestión."

[Mejorar plan]

Usar FeatureGate existente.

==================================================
40. FRONTEND - GESTIÓN / PRO / PREMIUM
==================================================

Además del manejo operativo:

mostrar:

ANÁLISIS DE RENDIMIENTO

Tarjetas:

Producción total
63.500 kg

Producción/ha
...

Cortes
14

Promedio kg/ha/corte
...

Intervalo promedio
...

Luego:

Producción mensual

Rendimiento por banco

Rendimiento por forraje

==================================================
41. BACKEND TAMBIÉN DEBE PROTEGER
==================================================

No basta con ocultar frontend.

Si Esencial llama:

GET /api/reportes/forrajes/rendimiento

responder:

403

{
  code: "PLAN_FEATURE_NOT_AVAILABLE",
  feature: "analiticaProductiva",
  message:
    "El análisis de rendimiento de forrajes está disponible desde el plan Gestión."
}

==================================================
42. RELACIÓN CON FINANZAS - PREPARAR
==================================================

En el futuro queremos poder asociar:

MovimientoFinanciero
→ Banco forrajero

Ejemplos:

fertilizante
semilla
mano de obra
herbicida
combustible

Entonces podremos calcular:

costo/ha
costo/corte
costo/kg forraje producido

NO implementar estos indicadores si actualmente los movimientos financieros no se pueden asociar correctamente al área.

Pero dejar referencias preparadas.

==================================================
43. FUTURO: COSTO POR KG DE FORRAJE
==================================================

Cuando existan costos confiables:

costoKgForraje =

costosBancoPeriodo
/
kgForrajeProducidoPeriodo

Esto será analítica avanzada.

NO inventarlo ahora con gastos generales de toda la finca.

==================================================
44. RELACIÓN FUTURA CON ENGORDE
==================================================

Guardar destino permitirá posteriormente relacionar:

Banco
→ Corte
→ kg producidos
→ lote destino

y eventualmente:

lote
→ pesajes
→ GMD

Pero NO asumir todavía:

kg cosechado = kg consumido.

Por eso todavía no modificar:

ICP
IEE
conversión alimenticia

con estos datos.

==================================================
45. IMPORTADOR
==================================================

Permitir importar:

tipoArea
forrajePrincipal
fechaEstablecimiento
intervaloCorteObjetivoDias

Opcionalmente historial:

fechaCorte
cantidadForrajeVerdeKg
areaCortadaHa

No obligar a tener historial previo.

==================================================
46. MIGRACIÓN
==================================================

Potreros actuales:

tipoArea = PASTOREO

solo si esta inferencia es completamente segura.

Si no:

hacer migración controlada.

No transformar ningún potrero existente en Banco Forrajero automáticamente.

Los nuevos bancos:

tipoArea = BANCO_FORRAJERO

==================================================
47. ÍNDICES MONGODB
==================================================

Revisar y agregar índices útiles:

CorteForraje.area
CorteForraje.fechaCorte
CorteForraje.forraje

Posiblemente compuesto:

area + fechaCorte

No duplicar índices existentes.

==================================================
48. CASOS DE PRUEBA
==================================================

Probar:

- banco Cuba OM-22
- banco King Grass
- banco Maralfalfa
- banco con leguminosa
- banco sin fecha establecimiento
- corte de toda el área
- corte parcial
- toneladas convertidas a kg
- corte sin materia seca
- corte con materia seca
- varios cortes
- un solo corte
- sin cortes
- cambio de Cuba OM-22 a Maralfalfa
- historial antes/después del cambio
- tarea de próximo corte
- evitar duplicado de tarea
- tarea de siembra
- calendario lunar en tarea de siembra
- Esencial accediendo al manejo operativo
- Esencial intentando análisis
- Gestión accediendo a análisis
- Pro accediendo a análisis
- Premium accediendo a análisis

==================================================
49. RESULTADO DE NEGOCIO
==================================================

La estructura comercial debe quedar:

ESENCIAL

✓ Bancos forrajeros
✓ Registro de pastos de corte
✓ Historial de cortes
✓ Cantidad producida
✓ kg/ha del corte individual
✓ Próximo corte
✓ Tareas
✓ Siembra
✓ Calendario lunar informativo

✗ Análisis agregado de rendimiento


GESTIÓN

Todo Esencial

+

✓ Análisis de rendimiento
✓ Producción histórica
✓ Comparación de bancos
✓ Comparación por forraje
✓ Tendencias


PRO

Todo Gestión

+

futuras relaciones económicas avanzadas


PREMIUM

Todo Pro

+

futura consolidación multi-finca

==================================================
50. PRINCIPIO FINAL
==================================================

No queremos crear simplemente:

"un campo de pasto de corte".

Queremos modelar un pequeño sistema productivo:

BANCO FORRAJERO
      ↓
FORRAJE
      ↓
ESTABLECIMIENTO
      ↓
CORTE
      ↓
CANTIDAD PRODUCIDA
      ↓
DESTINO
      ↓
PRÓXIMO CORTE
      ↓
TAREA

y desde Gestión:

HISTORIAL DE CORTES
      ↓
ANÁLISIS DE RENDIMIENTO
      ↓
kg/ha
kg/ha/corte
producción por período
intervalos
comparación de bancos
comparación de forrajes

Todo dentro de Potreros.

No crear un nuevo módulo del menú.

Al finalizar indicar:

- modelos creados/modificados
- catálogo extendido
- semillas agregadas
- endpoints creados
- servicios creados
- tareas automáticas implementadas
- integración con calendario lunar
- FeatureGate implementado
- endpoints protegidos por plan
- migraciones
- cambios al importador
- pruebas realizadas