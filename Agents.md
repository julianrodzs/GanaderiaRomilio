                    PROTOCOLOS
                        │
       ┌────────────────┼────────────────┐
       │                │                │
      IATF          ENGORDE         PORCINOS
       │                │                │
       └────────────────┼────────────────┘
                        │
               ORQUESTAN ACCIONES
                        │
 ┌──────────┬───────────┼──────────┬──────────┐
 │          │           │          │          │
Reproducción Sanidad Inventario  Tareas    Pesajes
 │          │           │          │          │
 └──────────┴───────────┼──────────┴──────────┘
                        │
                     Animal
                        │
                  Bitácora general

# PROMPT PARA CODEX: PROTOCOLOS PRO/PREMIUM
# ENGORDE BOVINO + REPRODUCCIÓN PORCINA POR BANDAS

Eres el Desarrollador Fullstack Senior de GanaderiaRomilio.

Necesito implementar dos funcionalidades avanzadas para los planes:

PRO ($35)
PREMIUM ($60)

1. Protocolos Productivos de Engorde Bovino
2. Protocolos Reproductivos Porcinos / Manejo por Bandas

Estas funcionalidades deben integrarse con los módulos existentes.

IMPORTANTE:

UN PROTOCOLO NO REEMPLAZA LOS MÓDULOS DE DOMINIO.

El protocolo:

- programa
- coordina
- genera tareas
- controla cumplimiento
- registra ejecución
- consume insumos cuando realmente corresponde
- conecta resultados
- calcula indicadores

pero los datos reales continúan perteneciendo a sus módulos.

Ejemplos:

Engorde
→ utiliza Lotes
→ utiliza Alimentación
→ utiliza Pesajes
→ utiliza Sanidad
→ utiliza Tareas
→ puede preparar una Venta

Porcinos reproductivos
→ utiliza RegistroReproductivo
→ utiliza Camadas
→ utiliza Sanidad
→ utiliza Tareas
→ utiliza Alimentación cuando corresponda
→ utiliza Inventario
→ utiliza IA/Monta existentes

NO crear:

- PesajeEngorde paralelo
- VentaEngorde paralela
- SanidadEngorde paralela
- ReproduccionPorcinaProtocolo paralela
- inventarios separados

==================================================
1. AUDITORÍA PREVIA
==================================================

Antes de implementar revisar:

- Animal
- Lote
- PertenenciaLote
- Lote.etapaOperativa
- objetivoProductivo
- Pesaje
- Sanidad
- PlanSanitario
- TratamientoSanitario
- AplicacionProductoAnimal / AplicacionSanitaria existente
- Productos / Inventario
- PlanAlimentacion
- Racion
- AsignacionRacionLote
- SuministroAlimentacion
- Tarea
- EventoAnimal
- VentaAnimal
- CompraAnimal
- Finanzas
- RegistroReproductivo
- Camada
- reproducción porcina actual
- ciclos reproductivos porcinos
- monta natural
- inseminación
- Usuarios/Roles
- Organizacion
- Finca
- PlanService
- FeatureGate
- sistema IATF si ya existe

Si el módulo IATF ya creó infraestructura reutilizable para:

- plantillas
- versionado
- pasos
- cronogramas
- ejecución programada vs real
- tareas
- auditoría

REUTILIZARLA.

No crear tres motores completamente distintos.

Pero tampoco crear un "mega modelo genérico" que complique todo el sistema.

Extraer únicamente la infraestructura común realmente útil.

==================================================
2. FEATURES POR PLAN
==================================================

Agregar capacidades independientes:

protocolosEngorde
protocolosReproductivosPorcinos

Configuración:

ESENCIAL:
false / false

GESTION:
false / false

PRO:
true / true

PREMIUM:
true / true

Usar:

requireFeature(...)

y PlanService.

NO:

if (plan === "PRO")

Premium tendrá además:

- plantillas compartidas entre fincas
- consolidado
- comparaciones multi-finca
- auditoría avanzada

==================================================
3. PRINCIPIO GENERAL DE PROTOCOLOS
==================================================

Separar siempre:

PLANTILLA
    ↓
EJECUCIÓN REAL
    ↓
RESULTADOS

Una plantilla indica:

"qué debería ocurrir"

La ejecución indica:

"qué ocurrió realmente"

Nunca modificar resultados históricos cuando se edite una plantilla.

==================================================
4. VERSIONADO
==================================================

Toda plantilla debe tener:

version

Al iniciar una ejecución:

guardar snapshot/version.

Ejemplo:

Protocolo Engorde v2

Lote ENG-01
→ usa v2

Posteriormente:

Protocolo Engorde cambia a v3

ENG-01 sigue conservando v2.

==================================================
PARTE A
PROTOCOLOS PRODUCTIVOS DE ENGORDE BOVINO
==================================================

==================================================
5. OBJETIVO DEL PROTOCOLO DE ENGORDE
==================================================

Permitir controlar el ciclo operativo de un lote desde:

RECEPCIÓN
↓
ADAPTACIÓN
↓
DESARROLLO
↓
ENGORDE
↓
FINALIZACIÓN
↓
LISTO PARA VENTA

No necesariamente todas las fincas utilizan todas las etapas.

Las etapas deben ser configurables.

Reutilizar:

Lote.etapaOperativa

si ya contiene:

INGRESO
ADAPTACION
DESARROLLO
ENGORDE
FINALIZACION
LISTO_VENTA
MANTENIMIENTO
OTRA

No crear un segundo estado equivalente.

==================================================
6. MODELO PLANTILLA ENGORDE
==================================================

Crear o adaptar:

PlantillaProtocoloEngorde

Campos conceptuales:

{
  organizacion,
  finca?,

  nombre,
  descripcion,

  especie: "BOVINO",

  alcance:
    FINCA
    ORGANIZACION,

  activo,

  etapas: [...],

  version,

  creadoPor,

  createdAt,
  updatedAt
}

==================================================
7. EJECUCIÓN DEL PROTOCOLO
==================================================

Crear:

CicloEngorde

o:

EjecucionProtocoloEngorde

NO crear otro Lote.

Debe referenciar:

lote

Ejemplo:

{
  organizacion,
  finca,

  lote,

  plantilla,
  versionPlantilla,

  fechaInicio,

  fechaFin,

  estado,

  etapaActual,

  creadoPor
}

Estados:

PROGRAMADO
ACTIVO
FINALIZADO
CANCELADO

==================================================
8. UN PROTOCOLO SE APLICA A UN LOTE
==================================================

Unidad principal:

LOTE

Ejemplo:

ENG-2026-04

No aplicar el protocolo individualmente a 40 animales como 40 procesos separados.

Los animales siguen teniendo:

- pesajes individuales
- sanidad individual
- eventos individuales
- ventas individuales

cuando corresponda.

==================================================
9. ETAPAS CONFIGURABLES
==================================================

Cada plantilla puede definir:

EtapaProtocoloEngorde

Ejemplo:

{
  codigo: "ADAPTACION",

  nombre: "Adaptación",

  orden,

  descripcion,

  criteriosEntrada,

  criteriosSalida,

  acciones,

  objetivos
}

==================================================
10. CRITERIOS DE CAMBIO DE ETAPA
==================================================

NO depender exclusivamente de días.

Soportar inicialmente:

TIEMPO
PESO_PROMEDIO
EVENTO
MANUAL

Preparar para:

GMD

si existe información suficiente.

Ejemplos:

ADAPTACIÓN:

duración sugerida:
21 días

DESARROLLO → FINALIZACIÓN:

pesoPromedio >= 420 kg

FINALIZACIÓN → LISTO_VENTA:

pesoPromedio >= 500 kg

Pero son valores configurados por la finca.

NO valores universales.

==================================================
11. NO CAMBIAR ETAPA SILENCIOSAMENTE
==================================================

Cuando se cumpla un criterio:

mostrar:

"El lote cumple el criterio para avanzar a FINALIZACIÓN."

Opciones:

[Avanzar etapa]
[Mantener etapa]

NO modificar automáticamente el lote salvo que en el futuro exista una configuración explícita.

==================================================
12. OBJETIVOS
==================================================

Una etapa puede tener:

pesoObjetivoKg
gmdObjetivoKgDia
diasObjetivo

Todos opcionales.

Reutilizar campos existentes del Lote cuando corresponda.

No duplicar objetivos innecesariamente.

==================================================
13. FASE RECEPCIÓN
==================================================

Debe poder configurar acciones como:

- registrar recepción
- pesaje inicial
- revisión de identificación
- asignación de ubicación
- clasificación del lote
- revisión sanitaria
- tareas específicas
- inicio de adaptación alimentaria

NO hardcodear medicamentos.

==================================================
14. SANIDAD EN ENGORDE
==================================================

Si el protocolo incluye:

"Aplicación sanitaria de recepción"

el protocolo genera:

actividad/tarea

Al ejecutarla:

usar Sanidad existente.

Si es aplicación única:

AplicacionProductoAnimal
tipo = SANITARIA

Si es tratamiento:

TratamientoSanitario
↓
Aplicaciones correspondientes

NO crear:

TratamientoEngorde.

==================================================
15. MEDICAMENTOS
==================================================

El protocolo puede referenciar:

producto
dosis
unidad

configurados por veterinario/usuario autorizado.

GanaderiaRomilio:

NO recomienda medicamento.
NO recomienda dosis.
NO calcula dosis clínica.

Solo ejecuta lo configurado.

==================================================
16. INVENTARIO
==================================================

Programar:

NO consume inventario.

Ejecutar una aplicación:

SÍ consume la cantidad real.

Ejemplo:

30 animales programados

28 tratados

inventario:

-28 dosis

NO:

-30.

==================================================
17. ADAPTACIÓN ALIMENTARIA
==================================================

Una etapa puede asignar:

PlanAlimentacion
Racion

Ejemplo:

Adaptación A
↓
Adaptación B
↓
Adaptación C
↓
Ración Engorde

Pero los planes/raciones son los existentes.

NO crear:

RacionEngorde.

==================================================
18. ASIGNACIÓN HISTÓRICA
==================================================

Cuando cambia ración:

usar:

AsignacionRacionLote

Cerrar asignación anterior.

Crear nueva asignación.

Preservar historial.

==================================================
19. ALIMENTACIÓN REAL
==================================================

El protocolo puede indicar:

"Utilizar Ración Adaptación B"

Pero el consumo real sigue registrándose mediante:

SuministroAlimentacion.

No asumir:

ración planificada = alimentación consumida.

==================================================
20. NO CREAR TAREAS DIARIAS DE ALIMENTAR
==================================================

Mantener decisión actual:

alimentar es operación rutinaria.

NO generar:

"Alimentar lote 7am"
"Alimentar lote 12pm"

todos los días.

Sí generar tareas específicas:

- cambiar ración
- revisar rechazo
- pesar lote
- revisar adaptación
- evaluar comederos
- revisar condición
- ejecutar control sanitario

==================================================
21. PESAJE
==================================================

El protocolo puede programar:

Pesaje inicial

Pesaje de control

Pesaje final

Pero debe utilizar:

Pesaje

existente.

==================================================
22. PESAJE GRUPAL
==================================================

Si se ejecuta:

"Pesar lote ENG-01"

abrir flujo de pesaje grupal ya diseñado.

Crear:

un Pesaje por animal.

NO:

PesajeLote.

==================================================
23. PESO PROMEDIO
==================================================

Calcular:

peso promedio actual

desde:

últimos pesajes válidos.

Mostrar cobertura:

31 / 34 animales con peso válido.

NO persistir promedio como verdad histórica.

==================================================
24. GMD
==================================================

Utilizar metodología actual de GMD.

NO crear una fórmula distinta para protocolo de engorde.

Mostrar:

GMD lote
cobertura
período

solo cuando exista información suficiente.

==================================================
25. RECEPCIÓN / ADAPTACIÓN / DESARROLLO
==================================================

Ejemplo de una plantilla POSIBLE:

Recepción

→ pesaje inicial
→ revisión sanitaria
→ asignación ubicación

Adaptación

→ ración A
→ ración B
→ ración C

Desarrollo

→ ración crecimiento
→ pesajes periódicos

Finalización

→ ración finalización
→ seguimiento objetivo de peso

Listo Venta

→ evaluar animales para venta

Esto es un ejemplo.

NO hacerlo obligatorio.

==================================================
26. VENTA
==================================================

El protocolo NO realiza ventas.

Cuando animales cumplan criterios:

mostrar:

"Candidatos para venta"

Ejemplo:

17 / 34 animales alcanzaron peso objetivo.

Botón:

[Preparar venta]

==================================================
27. PREPARAR VENTA
==================================================

Debe abrir:

módulo Ventas existente

con:

lote
animales elegibles

preseleccionados.

Después Ventas maneja:

comprador
peso
precio/kg
monto
estado
comprobante
finanzas
bitácora
Animal.estado

==================================================
28. NO MARCAR AUTOMÁTICAMENTE VENDIDO
==================================================

LISTO_VENTA

NO significa:

VENDIDO.

La venta debe confirmarse en Ventas.

==================================================
29. MUERTES Y SALIDAS DEL LOTE
==================================================

Si un animal:

muere
se vende
se traslada

debe actualizarse pertenencia al lote mediante flujo existente.

El protocolo conserva snapshot/historial.

==================================================
30. COSTOS
==================================================

Para PRO preparar:

costo del ciclo de engorde.

Pero utilizar solamente datos confiables existentes.

Ejemplos:

sanidad utilizada
productos consumidos
costos registrados
otros costos específicos

NO inventar:

costo de alimentación

si todavía no existe costo fiable por alimento/suministro.

==================================================
31. FUTURO COSTO ALIMENTACIÓN
==================================================

Preparar arquitectura para:

costo alimentación
costo/kg ganado
costo/animal
margen lote

cuando existan:

costos fiables
+
suministros
+
pesajes

No implementar métricas falsas.

==================================================
32. NO CALCULAR CONVERSIÓN ALIMENTICIA TODAVÍA
==================================================

No implementar automáticamente:

kg alimento / kg ganancia

si todavía no existe metodología y calidad de datos suficientes.

Dejar preparado.

==================================================
33. KPIs ENGORDE PRO
==================================================

Mostrar cuando existan datos:

Animales inicio

Animales actuales

Peso promedio inicial

Peso promedio actual

Peso objetivo

GMD observada

Días en ciclo

Etapa actual

% animales que alcanzaron objetivo

Cobertura pesajes

Cumplimiento protocolo

==================================================
34. CUMPLIMIENTO PROTOCOLO
==================================================

Ejemplo:

Actividades programadas:
12

Realizadas:
10

Omitidas:
1

Pendientes:
1

Cumplimiento:
según metodología definida.

No mezclar esto con productividad.

==================================================
35. DASHBOARD CICLO ENGORDE
==================================================

Ejemplo:

ENG-04

Etapa:
FINALIZACIÓN

Animales:
34

Peso inicial:
351 kg

Peso actual:
462 kg

Objetivo:
500 kg

GMD:
0.84 kg/día

Días:
132

Cobertura peso:
31/34

Próxima actividad:
Pesaje de control

==================================================
36. PREMIUM ENGORDE
==================================================

Premium puede tener:

plantillas alcance ORGANIZACION.

Ejemplo:

"Protocolo corporativo Engorde v4"

utilizado por:

Finca Norte
Finca Sur
Finca El Roble

==================================================
37. PREMIUM CONSOLIDADO
==================================================

Mostrar:

Finca
Lotes activos
Animales
Peso promedio
GMD
Días promedio
Lotes listos venta
Cumplimiento

NO hacer promedio simple de métricas cuando no corresponda.

==================================================
38. DRILL DOWN
==================================================

Premium:

Organización
↓
Finca
↓
Ciclo de engorde
↓
Lote
↓
Animal

==================================================
PARTE B
PROTOCOLOS REPRODUCTIVOS PORCINOS
==================================================

==================================================
39. OBJETIVO
==================================================

Implementar manejo reproductivo porcino estructurado por:

CICLOS
+
BANDAS

Ejemplo:

Banda Octubre A

20 cerdas

Destete
↓
Celo
↓
Servicio / IA
↓
Control retorno
↓
Diagnóstico
↓
Gestación
↓
Preparto
↓
Parto
↓
Destete
↓
Nuevo ciclo

==================================================
40. NO REEMPLAZAR REGISTRO REPRODUCTIVO
==================================================

Ya existe:

RegistroReproductivo

Debe seguir siendo fuente de verdad del ciclo individual de cada cerda.

El protocolo/banda:

COORDINA varios RegistroReproductivo.

NO crear una reproducción paralela.

==================================================
41. MODELO PLANTILLA PORCINA
==================================================

Crear/adaptar:

PlantillaProtocoloReproductivoPorcino

Campos:

{
  organizacion,
  finca?,

  nombre,
  descripcion,

  especie: "PORCINO",

  alcance:
    FINCA
    ORGANIZACION,

  pasos,

  version,

  activo,

  creadoPor
}

==================================================
42. BANDA REPRODUCTIVA
==================================================

Crear:

BandaReproductivaPorcina

Campos conceptuales:

{
  organizacion,
  finca,

  nombre,

  plantilla,
  versionPlantilla,

  fechaInicio,

  animales,

  estado,

  createdBy
}

Estados:

PROGRAMADA
ACTIVA
GESTACION
PARTOS
FINALIZADA
CANCELADA

No sustituye el ciclo individual.

==================================================
43. PARTICIPANTES
==================================================

Cada cerda de la banda debe referenciar su:

RegistroReproductivo

cuando exista.

Guardar snapshot inicial mínimo:

animal
estado reproductivo
paridad
fechaUltimoParto
fechaDestete
condicionCorporal si existe
lote

==================================================
44. PASOS CONFIGURABLES
==================================================

Soportar acciones:

DESTETE
OBSERVAR_CELO
SERVICIO
INSEMINACION
TRATAMIENTO_REPRODUCTIVO
DIAGNOSTICO_GESTACION
CONTROL_REPETICION
PREPARTO
TRASLADO_MATERNIDAD
PARTO
DESTETE_CAMADA
CONTROL
OTRA

No exigir que todas las plantillas tengan todos.

==================================================
45. NO HARDCODEAR DÍAS UNIVERSALES
==================================================

Los tiempos deben pertenecer a la plantilla.

Ejemplo:

Destete
↓
X días/horas
↓
control celo

Servicio
↓
21 días aprox.
↓
control repetidora

Pero:

NO asumir que todas las granjas usan exactamente las mismas ventanas.

==================================================
46. REGLAS ACTUALES DEL CLIENTE
==================================================

Si actualmente GanaderiaRomilio ya tiene reglas porcinas configuradas, por ejemplo:

- control de celo
- diagnóstico
- preparto
- parto
- destete
- nuevo servicio

REUTILIZARLAS o migrarlas a una plantilla.

NO duplicar tareas.

==================================================
47. FECHA REAL MANDA
==================================================

Si:

parto estimado:
10 enero

parto real:
8 enero

todas las actividades dependientes del PARTO REAL deben recalcularse desde:

8 enero

No desde estimación anterior.

==================================================
48. DEPENDENCIAS
==================================================

Permitir pasos relativos a:

INICIO
DESTETE
SERVICIO
IA
PARTO_ESTIMADO
PARTO_REAL
DESTETE_REAL
OTRO_PASO

Ejemplo:

Destete camada
=
31 días después de parto real

si esa finca lo configura.

==================================================
49. SERVICIO
==================================================

Soportar:

MONTA_NATURAL
IA_CONVENCIONAL
IA_PROGRAMADA
OTRO

No asumir inseminación para todas las granjas.

==================================================
50. MONTA NATURAL
==================================================

Si servicio es natural:

usar flujo reproductivo existente.

Registrar:

verraco
fecha
responsable
observaciones

==================================================
51. INSEMINACIÓN
==================================================

Si se utiliza IA:

usar flujo actual de inseminación.

Registrar cuando corresponda:

semen
verraco
lote semen
fecha/hora
técnico

y descontar inventario real.

==================================================
52. IATF PORCINA / IA PROGRAMADA
==================================================

La arquitectura debe permitir en el futuro:

protocolos de IA a tiempo fijo porcina

sin hardcodear hormonas.

Puede usar:

pasos
productos
horas
IA

de forma similar al motor IATF bovino.

Pero GanaderiaRomilio:

NO prescribe tratamientos reproductivos.

==================================================
53. PRODUCTOS REPRODUCTIVOS
==================================================

Si un protocolo porcino utiliza:

producto hormonal
vitamina
otro insumo

registrar mediante:

AplicacionProductoAnimal

con categoría adecuada.

Ejemplo:

REPRODUCTIVA

NO marcar automáticamente como:

TratamientoSanitario.

==================================================
54. SANIDAD PORCINA
==================================================

Si el protocolo contiene una actividad realmente sanitaria:

vacunación
desparasitación
tratamiento

usar Sanidad existente.

==================================================
55. UNA APLICACIÓN NO ES SIEMPRE UN TRATAMIENTO
==================================================

Mantener distinción:

AplicacionProductoAnimal

vs

TratamientoSanitario

Ejemplo:

una aplicación reproductiva:
AplicacionProductoAnimal
categoria REPRODUCTIVA

Un tratamiento clínico:
TratamientoSanitario
↓
Aplicaciones

==================================================
56. INVENTARIO
==================================================

Programación:

NO consume.

Aplicación real:

consume.

IA real:

consume semen.

No descontar producto porque existe una tarea futura.

==================================================
57. CONTROL DE REPETIDORA
==================================================

Permitir paso:

CONTROL_REPETICION

Si se observa celo:

registrar:

retornoCelo = true
fecha
observaciones

NO marcar automáticamente:

VACIA

si no existe diagnóstico.

==================================================
58. DIAGNÓSTICO
==================================================

Usar reproducción existente.

Resultados:

PREÑADA
VACIA
DUDOSA

o equivalentes actuales.

No crear diagnóstico paralelo.

==================================================
59. CERDA NO PREÑADA
==================================================

Si resulta VACIA:

permitir:

nuevo servicio
nueva IA
resincronización
cerrar ciclo
otro

No decidir automáticamente.

==================================================
60. NUEVO CICLO
==================================================

Si comienza un nuevo intento:

cerrar correctamente ciclo anterior.

Mantener:

estadoCiclo
fechaCierre
motivoCierre
activoParaAlertas

según modelo actual.

==================================================
61. PREPARTO
==================================================

El protocolo puede programar:

preparar maternidad
traslado
revisión
alimentación específica
actividad sanitaria configurada

Pero reutilizar módulos existentes.

==================================================
62. ALIMENTACIÓN EN PREPARTO
==================================================

Si corresponde cambiar ración:

usar:

PlanAlimentacion
Racion
AsignacionRacionLote

NO crear:

RacionCerdaPreparto paralela.

==================================================
63. PARTO
==================================================

Cuando ocurre:

PARTO REAL

usar flujo existente.

Debe poder crear/actualizar:

Camada

Registrar datos existentes como:

nacidos
nacidos vivos
muertos
otros indicadores actuales

NO duplicar Camada.

==================================================
64. CAMADA
==================================================

Banda reproductiva:

puede contener múltiples cerdas.

Cada parto:

genera su propia Camada.

No crear una camada única para toda la banda.

==================================================
65. ACTIVIDADES DE LECHONES
==================================================

La plantilla puede contener pasos dependientes del parto:

ejemplo:

Día +X
actividad sanitaria

Día +Y
iniciar alimento

Día +Z
destete

Pero TODOS los tiempos son configurables.

==================================================
66. REGLAS EXISTENTES DE LECHONES
==================================================

Si actualmente existen automatizaciones específicas para:

hierro
vitaminización
desparasitación
circovirus
alimento iniciador
desarrollo
engorde

NO duplicarlas.

Integrarlas mediante protocolo o reutilizar generadores actuales.

==================================================
67. MEDICAMENTOS DE LECHONES
==================================================

Si una actividad implica aplicación:

usar:

AplicacionProductoAnimal

si los lechones están individualizados.

Si el sistema maneja la Camada como unidad en ese momento:

utilizar arquitectura actual.

No crear identificaciones artificiales solamente para el protocolo.

==================================================
68. DESTETE
==================================================

Usar:

fechaDesteteReal

cuando se realiza.

No mantener como definitiva únicamente:

fecha estimada.

Actualizar ciclo reproductivo de la madre.

==================================================
69. DESPUÉS DEL DESTETE
==================================================

La plantilla puede iniciar:

nuevo ciclo reproductivo

o:

programar evaluación para próximo servicio.

No crear automáticamente servicio real.

==================================================
70. TAREAS
==================================================

Generar tareas por actividad de banda.

Ejemplo:

"Control celo - Banda Octubre A"

NO:

20 tareas idénticas

si puede gestionarse en una sola actividad con lista de animales.

==================================================
71. TAREAS INDIVIDUALES
==================================================

Cuando exista una excepción individual:

Cerda 104
requiere revisión

sí puede generarse tarea individual.

==================================================
72. PROGRAMADO VS REAL
==================================================

Cada paso:

Programado
Real
Responsable
Estado

Estados:

PENDIENTE
REALIZADO
PARCIAL
OMITIDO
CANCELADO

==================================================
73. ANIMALES CON DIFERENTE RESULTADO
==================================================

Una banda puede comenzar:

20 cerdas

Después:

17 preñadas
3 vacías

La banda continúa.

Las 3 vacías pueden:

salir del flujo
repetir servicio
entrar otra banda

No obligar a toda la banda a permanecer sincronizada.

==================================================
74. MÉTRICAS PORCINAS
==================================================

Reutilizar reportes existentes cuando sea posible.

Mostrar por banda:

Hembras iniciales
Servidas
Preñadas
Vacías
Partos
Camadas
Nacidos
Nacidos vivos
Destetados

==================================================
75. DENOMINADORES EXPLÍCITOS
==================================================

No mostrar porcentajes ambiguos.

Ejemplo:

Preñez:

17 preñadas
/
20 servidas

=
85 %

Si alguna no fue servida:

NO usarla en denominador incorrecto.

==================================================
76. TASA DE PARTOS
==================================================

Si se implementa:

partos
/
hembras servidas elegibles

según metodología ya utilizada por reportes.

No inventar fórmula diferente dentro del protocolo.

==================================================
77. INTERVALO DESTETE-SERVICIO
==================================================

Calcular desde fechas reales:

fechaServicio
-
fechaDestete

cuando existan.

==================================================
78. REPETIDORAS
==================================================

Permitir:

cantidad
porcentaje

con denominador explícito.

No diagnosticar causa.

==================================================
79. CAMADAS
==================================================

Reutilizar métricas actuales de Camadas.

Ejemplo:

nacidos totales
nacidos vivos
destetados

No recalcular diferente dentro de Banda.

==================================================
80. ECONOMÍA POR CAMADA
==================================================

Si ya existe reporte:

economía por camada

REUTILIZARLO.

No duplicar modelo económico.

==================================================
81. COSTO DEL PROTOCOLO PORCINO
==================================================

PRO puede acumular:

productos utilizados
semen
servicios/honorarios
otros costos

si existen datos confiables.

Mostrar:

costo banda

Opcionalmente:

costo/preñez
costo/camada

solo si metodología y datos son correctos.

==================================================
82. NO DOBLE CONTABILIDAD
==================================================

Producto comprado:

ya pudo generar egreso.

Su uso en protocolo:

sirve para costeo productivo.

NO crear otro egreso financiero al consumirlo.

==================================================
83. VISTA PORCINA
==================================================

Dentro de:

Reproducción → Porcinos

agregar:

[Individual]
[Bandas]
[Protocolos]

o adaptar navegación existente.

No crear nuevo módulo principal.

==================================================
84. LISTA DE BANDAS
==================================================

Mostrar:

Banda
Finca
Protocolo
Fecha inicio
Hembras
Servidas
Preñadas
Partos
Estado

==================================================
85. DETALLE BANDA
==================================================

Ejemplo:

BANDA OCTUBRE A

20 hembras

Estado:
Gestación

CRONOGRAMA

✓ Destete
✓ Servicio
✓ Control
✓ Diagnóstico
○ Preparto
○ Partos
○ Destete

==================================================
86. TABLA DE CERDAS
==================================================

Animal
Paridad
Destete
Servicio
Método
Resultado
Parto esperado
Parto real
Camada
Estado

==================================================
87. OPERACIONES MASIVAS
==================================================

Permitir:

Registrar servicio

Registrar IA

Registrar diagnóstico

Registrar actividad

para varias hembras.

Pero conservar registros individuales.

==================================================
88. PREMIUM PORCINO
==================================================

Premium:

plantillas organizacionales.

Ejemplo:

Protocolo reproductivo porcino v5

disponible en:

Finca A
Finca B
Finca C

==================================================
89. CONSOLIDADO PREMIUM PORCINO
==================================================

Mostrar por finca:

Bandas
Hembras servidas
Preñadas
Partos
Nacidos vivos
Destetados
Intervalo destete-servicio

==================================================
90. NO PROMEDIAR PORCENTAJES
==================================================

Ejemplo:

Preñez consolidada:

SUM(preñadas)
/
SUM(servidas)

NO:

promedio simple de % por finca.

==================================================
PARTE C
INFRAESTRUCTURA COMPARTIDA
==================================================

==================================================
91. MOTOR COMÚN
==================================================

Si IATF ya implementó componentes para:

- plantilla
- versión
- pasos
- dependencias
- horarios
- ejecución
- tareas

extraer/reutilizar una infraestructura común.

Por ejemplo:

ProtocolSchedulerService

ProtocolTaskService

ProtocolExecutionService

No necesariamente un único modelo MongoDB genérico.

==================================================
92. PASOS RELATIVOS
==================================================

Soportar:

DESDE_INICIO
DESDE_PASO
DESDE_EVENTO_REAL

Ejemplos:

Porcino:

Destete real
+ X días
→ control

Engorde:

Inicio adaptación
+ X días
→ revisión

==================================================
93. CRONOGRAMA
==================================================

Nunca perder diferencia entre:

fecha programada
fecha real.

==================================================
94. REPROGRAMACIÓN
==================================================

Si cambia un evento base:

mostrar pasos dependientes.

Permitir:

[Recalcular]
[Mantener]

No modificar silenciosamente.

==================================================
95. TAREAS
==================================================

Un protocolo puede generar Tareas.

Pero Tarea sigue siendo modelo existente.

Guardar referencia:

tipoOrigen:
PROTOCOLO

origenId

pasoId

según arquitectura actual.

==================================================
96. DEDUPLICACIÓN
==================================================

No crear tareas duplicadas cuando:

- se recalcula cronograma
- se edita fecha
- se reinicia UI
- endpoint se reintenta

Usar dedupKey/idempotencia.

==================================================
97. APLICACIONES
==================================================

Aplicaciones reales deben utilizar concepto común:

AplicacionProductoAnimal

con:

categoria:

SANITARIA
REPRODUCTIVA
NUTRICIONAL
OTRA

si este refactor ya fue aprobado.

Mantener backwards compatibility con:

AplicacionSanitaria

si actualmente existe.

==================================================
98. BITÁCORA
==================================================

Registrar eventos relevantes.

Engorde:

inicio ciclo
cambio etapa
pesaje clave
listo venta
fin ciclo

Porcinos:

inicio banda/ciclo
servicio
diagnóstico
parto
destete
cierre

No saturar bitácora con cada tarea menor.

==================================================
99. VENTAS
==================================================

Solamente Engorde puede ofrecer:

Preparar Venta.

Siempre abrir:

Ventas existente.

No crear venta dentro de protocolos.

==================================================
100. FINANZAS
==================================================

Los protocolos pueden utilizar costos operativos para análisis.

No sustituir:

Finanzas.

No duplicar movimientos.

==================================================
101. MULTI-TENANT
==================================================

Todos los nuevos modelos deben incluir:

organizacion
finca

según arquitectura actual.

Toda query debe validar tenant.

==================================================
102. REFERENCIAS
==================================================

Validar que:

lote
animal
producto
ración
plan
usuario
venta
camada
registro reproductivo

pertenezcan a:

misma organización

y finca cuando corresponda.

==================================================
103. PLANTILLAS PREMIUM
==================================================

PRO:

plantillas de finca.

PREMIUM:

puede crear plantilla con:

alcance ORGANIZACION.

==================================================
104. NO MODIFICAR CAMPAÑAS HISTÓRICAS
==================================================

Cambiar plantilla:

NO cambia:

CicloEngorde activo/histórico
BandaPorcina activa/histórica.

Usar snapshots/versionado.

==================================================
105. PERMISOS
==================================================

Administrador:

gestionar plantillas y ejecuciones.

Encargado:

ejecutar protocolo según permisos.

Veterinario:

configurar/ejecutar pasos sanitarios/reproductivos permitidos.

Trabajador:

ver y ejecutar tareas asignadas.

No permitir modificar:

dosis
protocolos
criterios

sin permiso.

==================================================
106. FRONTEND ENGORDE
==================================================

Dentro de:

Lotes

o sección productiva correspondiente:

Detalle Lote
→ Protocolo

Mostrar:

Etapa actual
Cronograma
Objetivos
Próximas actividades
Pesajes
GMD
Alimentación
Sanidad
Candidatos venta

==================================================
107. FRONTEND PORCINOS
==================================================

Dentro de:

Reproducción Porcina

mostrar:

Bandas
Protocolos

No nuevo menú principal.

==================================================
108. UI GATING
==================================================

Esencial/Gestión:

mostrar capacidad bloqueada cuando tenga sentido.

Texto:

"Protocolos productivos avanzados"

"Disponible desde Plan PRO"

No romper funciones normales existentes.

==================================================
109. FUNCIONES NORMALES SIGUEN DISPONIBLES
==================================================

IMPORTANTE:

Un usuario Esencial/Gestión sigue pudiendo:

- pesar
- alimentar
- registrar sanidad
- reproducir
- vender
- manejar lotes

según capacidades actuales.

Lo exclusivo PRO/PREMIUM es:

ORQUESTAR TODO COMO PROTOCOLO AVANZADO.

==================================================
110. TESTS ENGORDE
==================================================

Probar:

crear plantilla

versionar plantilla

crear ciclo con lote

cambio etapa manual

criterio por tiempo

criterio por peso

pesaje grupal

asignación ración

cambio ración

aplicación sanitaria

inventario real

tarea automática

animal vendido

animal muerto

lote listo venta

preparar venta

cancelar ciclo

no borrar historial

==================================================
111. TESTS PORCINOS
==================================================

Probar:

crear plantilla

crear banda

20 cerdas

destete

servicio natural

IA

control repetidora

diagnóstico

preñada

vacía

parto estimado

parto real diferente

recalcular tareas

camada

destete

nuevo ciclo

cerda retirada

banda parcial

cancelación

==================================================
112. TESTS PLANES
==================================================

ESENCIAL:
403 protocolo

GESTION:
403 protocolo

PRO:
permitido

PREMIUM:
permitido

==================================================
113. TEST PREMIUM
==================================================

Pro:

NO consolidado organización.

Premium:

plantillas organizacionales
+
consolidado.

==================================================
114. TEST TENANT
==================================================

Organización A:

NO puede:

ver
editar
ejecutar
referenciar

protocolos/ciclos/bandas de Organización B.

==================================================
115. NO IMPLEMENTAR
==================================================

NO implementar:

recomendaciones veterinarias automáticas

selección automática de medicamentos

selección automática de dietas

formulación nutricional profesional

dosis clínicas automáticas

predicción IA de gestación

predicción IA de engorde

venta automática

conversión alimenticia sin datos suficientes

ranking automático de finca/veterinario/toro basado en muestras pequeñas

==================================================
116. OBJETIVO COMERCIAL
==================================================

PRO debe responder a:

"Quiero controlar procesos productivos completos y medir sus resultados."

Ejemplo:

Lote de engorde:

Recepción
→ Adaptación
→ Desarrollo
→ Finalización
→ Venta

Porcinos:

Destete
→ Servicio
→ Gestación
→ Parto
→ Destete

==================================================
117. OBJETIVO PREMIUM
==================================================

PREMIUM debe responder a:

"Quiero que todas mis fincas trabajen con procesos estandarizados y poder comparar los resultados."

Ejemplo:

PROTOCOLO CORPORATIVO DE ENGORDE v4

Finca A
Finca B
Finca C

o:

PROTOCOLO REPRODUCTIVO PORCINO v3

Finca Norte
Finca Sur

==================================================
118. PRINCIPIO FINAL
==================================================

PROTOCOLO
≠
MÓDULO PARALELO

PROTOCOLO
=
ORQUESTADOR

Debe reutilizar:

Lotes
Animales
Reproducción
Camadas
Pesajes
Alimentación
Sanidad
Inventario
Tareas
Ventas
Finanzas
Bitácora

Cada módulo continúa siendo:

FUENTE DE VERDAD

de su propio dominio.

==================================================
119. ENTREGA FINAL
==================================================

Al finalizar informar:

- arquitectura encontrada
- infraestructura IATF reutilizada
- componentes comunes creados
- modelos nuevos
- modelos modificados
- PlantillaProtocoloEngorde
- CicloEngorde
- etapas implementadas
- criterios implementados
- integración con Lotes
- integración con Pesajes
- integración con Alimentación
- integración con Sanidad
- integración con Inventario
- integración con Ventas
- métricas de engorde

- PlantillaProtocoloReproductivoPorcino
- BandaReproductivaPorcina
- integración con RegistroReproductivo
- integración con Camada
- servicios/IA
- diagnósticos
- parto
- destete
- tareas
- métricas porcinas

- FeatureGate PRO/PREMIUM
- funcionalidades Premium multi-finca
- tenant isolation
- índices
- migraciones
- tests
- funcionalidades preparadas para futuro pero no implementadas