# PROMPT PARA CODEX: MÓDULO IATF CONFIGURABLE - PLAN PRO ($35) / PREMIUM ($60)

Eres el Desarrollador Fullstack Senior de GanaderiaRomilio.

Necesito implementar un módulo avanzado de:

IATF
(Inseminación Artificial a Tiempo Fijo)

integrado al módulo de Reproducción existente.

IMPORTANTE:

NO implementar IATF como un único protocolo fijo.

La aplicación debe permitir trabajar con:

- distintos protocolos veterinarios
- diferentes duraciones
- diferentes hormonas/productos
- diferentes momentos de aplicación
- diferentes ventanas de inseminación
- diferentes estrategias post-IATF

La aplicación:

NO prescribe protocolos.
NO recomienda hormonas.
NO decide dosis.
NO sustituye al veterinario.

GanaderiaRomilio únicamente:

- registra
- programa
- ejecuta
- controla inventario
- genera tareas
- conserva trazabilidad
- calcula resultados

del protocolo definido por el profesional responsable.

==================================================
1. REVISIÓN PREVIA OBLIGATORIA
==================================================

Antes de implementar revisar:

- Animal
- Lote
- PertenenciaLote
- RegistroReproductivo
- reproducción bovina actual
- monta natural
- inseminación convencional
- gestación
- partos
- Tarea
- calendario operativo
- calendario lunar informativo
- EventoAnimal / bitácora
- Productos / Insumos
- inventario disponible
- pajuelas / semen si ya existe
- Compras
- Finanzas / MovimientoFinanciero
- Usuarios
- Roles
- PlanService
- planesConfig
- FeatureGate
- Organizacion
- Finca
- tenantContext

NO romper ni duplicar el flujo existente.

==================================================
2. FEATURE COMERCIAL
==================================================

Crear capacidad:

iatfReproductivo

Disponibilidad:

ESENCIAL:
false

GESTION:
false

PRO:
true

PREMIUM:
true

Backend:

requireFeature('iatfReproductivo')

para todos los endpoints operativos IATF.

NO utilizar:

if (plan === 'PRO')

Usar PlanService / capabilities existentes.

==================================================
3. UBICACIÓN EN LA APP
==================================================

NO crear un módulo principal separado en el menú.

Debe estar dentro de:

REPRODUCCIÓN

Ejemplo:

Reproducción

[General]
[Gestaciones]
[IATF]

En Esencial/Gestión:

mostrar IATF bloqueado:

"IATF y protocolos reproductivos avanzados"

"Disponible desde Plan PRO"

==================================================
4. PRINCIPIO DE ARQUITECTURA
==================================================

Separar:

PLANTILLA DEL PROTOCOLO

de:

CAMPAÑA / EJECUCIÓN REAL

Arquitectura:

PlantillaProtocoloIATF
        ↓
CampanaIATF
        ↓
Animales
        ↓
Pasos ejecutados
        ↓
IATF
        ↓
Diagnósticos
        ↓
Resultados

La plantilla describe:

"qué se debe hacer"

La campaña registra:

"qué ocurrió realmente"

==================================================
5. NO USAR LOTEIATF COMO CONCEPTO PRINCIPAL
==================================================

Ya existe:

Lote

como grupo operativo de animales.

No crear confusión usando:

LoteIATF

Preferir:

CampanaIATF

o:

EjecucionProtocoloIATF

Una campaña puede incluir animales provenientes de:

- un Lote reproductivo
- varios grupos
- selección manual

según permisos y validaciones.

==================================================
6. PLANTILLA DE PROTOCOLO
==================================================

Crear:

PlantillaProtocoloIATF

Campos conceptuales:

{
  organizacion,
  finca?,
  nombre,
  descripcion,

  especie: "BOVINO",

  alcance:
    SISTEMA
    ORGANIZACION
    FINCA,

  activo,

  diasPostpartoMinimosRecomendados?,
  
  escalaCondicionCorporal:
    "1-5"
    "1-9",

  condicionCorporalMinima?,

  pasos: [...],

  creadoPor,
  createdAt,
  updatedAt
}

IMPORTANTE:

Los criterios:

diasPostpartoMinimos
condicionCorporalMinima

son criterios configurados por el usuario/veterinario.

NO reglas veterinarias universales de la aplicación.

==================================================
7. PROTOCOLOS DIFERENTES
==================================================

La arquitectura debe poder representar, por ejemplo:

- protocolos P4 + estradiol
- protocolos con eCG
- protocolos sin eCG
- protocolos con cipionato
- protocolos con benzoato
- protocolos basados en GnRH
- CIDR / DIB
- protocolos de 5 días
- protocolos de 7 días
- protocolos de 8 días
- protocolos personalizados

NO hardcodear ningún medicamento como obligatorio.

==================================================
8. PASOS DEL PROTOCOLO
==================================================

Cada plantilla contiene:

PasoProtocolo

Ejemplo conceptual:

{
  nombre,

  offsetHorasDesdeInicio,

  tipoAccion,

  ventanaInicioHoras?,
  ventanaFinHoras?,

  productos: [...],

  generaTarea,

  rolResponsable,

  instrucciones,

  obligatorio
}

==================================================
9. TIPOS DE ACCIÓN
==================================================

Soportar inicialmente:

INSERTAR_DISPOSITIVO
RETIRAR_DISPOSITIVO
APLICAR_PRODUCTO
IATF
OBSERVAR_CELO
DIAGNOSTICO_GESTACION
RESINCRONIZACION
MONTA_REPASO
CONTROL
OTRA

NO hacer que todos los protocolos tengan todos los pasos.

==================================================
10. EJEMPLO PROTOCOLO P4/E2
==================================================

La aplicación debe PODER representar:

Día 0

Insertar dispositivo progesterona
+
Aplicar producto configurado

Día 7

Retirar dispositivo
+
Aplicar PGF
+
eCG
+
otro producto

Día 9

IATF

Día 30

Diagnóstico

Pero esto es únicamente una plantilla posible.

==================================================
11. EJEMPLO PROTOCOLO GnRH
==================================================

También debe PODER representar:

Día 0

GnRH
+
CIDR

Día 7

Retiro CIDR
+
PGF

60-66 horas después

IATF
+
GnRH

sin necesidad de:

estradiol
eCG
cipionato

Esto demuestra que el sistema no depende de medicamentos específicos.

==================================================
12. PRODUCTOS DEL PROTOCOLO
==================================================

Cada paso puede tener:

productos

Ejemplo:

{
  productoId,
  dosis,
  unidad,
  viaAdministracion?,
  cantidadPorAnimal,
  observaciones
}

Usar Productos/Insumos existentes.

NO crear otro inventario hormonal separado si el catálogo actual puede manejarlo.

==================================================
13. CATEGORÍAS DE INSUMO
==================================================

Preparar/usar categorías:

HORMONA_REPRODUCTIVA
DISPOSITIVO_REPRODUCTIVO
SEMEN
INSUMO_REPRODUCTIVO
OTRO

No convertir nombres comerciales en enums.

==================================================
14. DOSIS
==================================================

La dosis pertenece:

AL PASO DEL PROTOCOLO

NO al medicamento global necesariamente.

Ejemplo:

Producto X

puede utilizarse en protocolos distintos con dosis distintas.

La aplicación registra lo indicado.

NO recomienda dosis.

==================================================
15. CREAR CAMPAÑA IATF
==================================================

Usuario selecciona:

Nueva campaña IATF

Campos:

Nombre

Finca

Plantilla de protocolo

Fecha/hora Día 0

Veterinario / responsable

Animales

Observaciones

Ejemplo:

IATF Novillas Octubre 2026

==================================================
16. SELECCIÓN DE ANIMALES
==================================================

Permitir:

- seleccionar Lote
- seleccionar animales manualmente
- filtros

Filtros útiles:

sexo
categoría
objetivoProductivo
días posparto
estado reproductivo
condición corporal
lote
edad

Solo:

hembras reproductivamente compatibles.

Validar reglas existentes.

==================================================
17. NO USAR >45 DÍAS COMO REGLA UNIVERSAL
==================================================

NO bloquear automáticamente:

diasPostparto < 45

La plantilla puede tener:

diasPostpartoMinimosRecomendados

Ejemplo:

45
60
otro

Si animal no cumple:

mostrar advertencia:

"Este animal no cumple el criterio configurado para este protocolo."

El veterinario/admin decide según permisos.

==================================================
18. CONDICIÓN CORPORAL
==================================================

Al iniciar campaña permitir registrar:

condicionCorporal

por animal.

Guardar también:

escala utilizada.

Ejemplo:

{
  valor: 3.5,
  escala: "1-5"
}

No asumir siempre escala 1-5.

==================================================
19. SNAPSHOT INICIAL DEL ANIMAL
==================================================

Dentro de campaña guardar snapshot mínimo:

animalId
loteOrigen
diasPostparto
condicionCorporal
estadoReproductivo
categoria

al momento de inicio.

No depender únicamente del estado futuro del Animal.

==================================================
20. PARTICIPANTE IATF
==================================================

Preferir modelo:

ParticipanteIATF

o subdocumento bien estructurado.

Campos:

{
  animal,
  campana,

  condicionCorporal,
  escalaCC,

  estadoParticipacion,

  fechaInseminacion,

  semenUtilizado,

  tecnicoInseminador,

  observaciones,

  resultadoActual
}

==================================================
21. ESTADOS DE PARTICIPACIÓN
==================================================

Separar participación de diagnóstico.

Estados sugeridos:

INSCRITA
EN_PROTOCOLO
PROTOCOLO_COMPLETADO
INSEMINADA
RETIRADA
CANCELADA

NO mezclar todo dentro de:

PREÑADA / VACIA

porque eso corresponde al resultado reproductivo.

==================================================
22. EJECUCIÓN DE PASOS
==================================================

Crear:

EjecucionPasoIATF

Debe registrar:

campana
pasoPlantilla
fechaHoraProgramada
fechaHoraReal
responsable
animalesAplicados
productosRealmenteUtilizados
observaciones
estado

Estados:

PENDIENTE
REALIZADO
PARCIAL
OMITIDO
CANCELADO

==================================================
23. PLANIFICADO ≠ EJECUTADO
==================================================

Muy importante:

crear CampanaIATF

NO significa que los medicamentos ya fueron utilizados.

El inventario NO debe descontarse simplemente por programar.

Descontar al:

EJECUTAR EL PASO

según cantidades realmente utilizadas.

==================================================
24. RESERVA OPCIONAL
==================================================

Si inventario ya permite reservas:

se puede reservar insumo al programar.

Pero:

RESERVADO
≠
CONSUMIDO

Si no existe reserva:

no implementarla únicamente por IATF.

==================================================
25. TAREAS AUTOMÁTICAS
==================================================

Cuando se crea campaña:

generar Tareas según:

pasos.generaTarea = true

Ejemplo:

Retirar dispositivos
Aplicar protocolo Día 7
Realizar IATF
Diagnóstico

NO hardcodear:

Día 7
Día 9
Día 30

Las fechas salen de:

offsetHorasDesdeInicio

de la plantilla.

==================================================
26. UNA TAREA POR ACTIVIDAD DE CAMPAÑA
==================================================

No crear:

30 tareas idénticas

si hay 30 vacas.

Crear:

"Retiro de dispositivos - IATF Octubre"

y dentro:

30 animales.

Reutilizar Tarea existente.

==================================================
27. ASIGNACIÓN
==================================================

Tareas pueden asignarse a:

Veterinario
Encargado
Trabajador autorizado

según rol configurado en paso.

==================================================
28. VENTANAS HORARIAS
==================================================

IATF puede depender de:

horas desde retiro.

Por eso soportar:

ventanaInicioHoras
ventanaFinHoras

Ejemplo:

IATF:

48h
a
56h

después de determinado evento.

Si la plantilla lo configura.

==================================================
29. DEPENDENCIA ENTRE PASOS
==================================================

Además de offset desde Día 0:

preparar capacidad para:

paso relativo a otro paso.

Ejemplo:

IATF
=
52 horas después de RETIRO_DISPOSITIVO

Esto es preferible para protocolos sensibles a ejecución real.

Modelo posible:

referenciaTemporal:

DESDE_INICIO
DESDE_PASO

pasoReferenciaId
offsetHoras

==================================================
30. REPROGRAMACIÓN
==================================================

Si un paso crítico ocurrió tarde:

permitir recalcular pasos dependientes.

NO modificar silenciosamente.

Mostrar:

"El retiro se registró 4 horas después de lo programado."

"Existen actividades dependientes."

[Recalcular]
[Mantener fechas]

Solo usuarios autorizados.

==================================================
31. DISPOSITIVOS P4 / CIDR / DIB
==================================================

NO tratar necesariamente:

dispositivo insertado
=
inventario consumido permanentemente.

Preparar soporte para:

DESECHABLE
REUTILIZABLE_CONTROLADO

según configuración del producto.

==================================================
32. ESTADO DE DISPOSITIVO
==================================================

Si inventario permite unidades individuales:

DISPONIBLE
EN_USO
RETIRADO
DESCARTADO

Opcional:

numeroUsos

NO habilitar reutilización automáticamente.

Debe depender de:

configuración del producto
y decisión autorizada.

==================================================
33. PRODUCTOS HORMONALES
==================================================

Al ejecutar:

APLICAR_PRODUCTO

registrar:

producto
lote
vencimiento si existe
dosis por animal
cantidad total utilizada
responsable

y descontar inventario real.

==================================================
34. PAJUELAS / SEMEN
==================================================

En el paso IATF:

por cada animal inseminado registrar:

pajuelaSemenId
toro
codigoToro
raza
loteSemen
tipoSemen
tecnico
fechaHoraReal

==================================================
35. SEMEN
==================================================

Tipos preparados:

CONVENCIONAL
SEXADO
OTRO

No asumir mismos resultados o protocolo.

==================================================
36. DESCUENTO DE SEMEN
==================================================

Descontar:

1 pajuela

solamente cuando:

inseminación realmente realizada.

Si animal programado no fue inseminado:

NO descontar.

==================================================
37. INSEMINADAS VS INSCRITAS
==================================================

Registrar por separado:

animalesInscritos
animalesQueCompletaron
animalesInseminados

Esto es crucial para métricas.

==================================================
38. ESTADO REPRODUCTIVO DEL ANIMAL
==================================================

Al ejecutar IATF:

integrarse con flujo existente.

Actualizar equivalente a:

INSEMINADA

con:

tipoInseminacion = IATF

No crear estado completamente paralelo si reproducción actual ya soporta IA.

==================================================
39. NO ROMPER IA CONVENCIONAL
==================================================

Debe seguir existiendo:

Monta natural

IA convencional

IATF

como vías reproductivas distintas dentro del mismo historial.

==================================================
40. OBSERVACIÓN DE CELO REPETIDOR
==================================================

Debe ser:

PASO OPCIONAL.

Una plantilla puede incluir:

OBSERVAR_CELO

aprox. 18-24 días post IATF

pero NO todas las campañas deben tenerlo.

==================================================
41. REPETIDORA NO = VACÍA CONFIRMADA
==================================================

Si se observa celo:

registrar:

retornoCeloObservado = true

fecha

observaciones

Puede mostrar:

"Posible no preñez"

NO cambiar automáticamente:

resultadoDiagnostico = VACIA

==================================================
42. MONTA DE REPASO
==================================================

Otra plantilla/estrategia puede indicar:

MONTA_REPASO

por ejemplo después de IATF.

Permitir relacionar:

toro de repaso
fecha inicio
fecha fin

Reutilizar reproducción/monta natural existente.

==================================================
43. DIAGNÓSTICO DE GESTACIÓN
==================================================

No limitar diagnóstico a:

Ecografía D30-35

Crear:

DiagnosticoGestacion

o reutilizar modelo existente.

Campos:

animal
campanaIATF
fecha
metodo
resultado
responsable
observaciones

==================================================
44. MÉTODOS
==================================================

Soportar:

ECOGRAFIA
PALPACION
PAG
OTRO

No asumir que todos se realizan en el mismo día.

==================================================
45. RESULTADOS
==================================================

Resultado:

PREÑADA
VACIA
DUDOSA

Opcional:

REQUIERE_RECONFIRMACION

==================================================
46. DIAGNÓSTICOS MÚLTIPLES
==================================================

Permitir:

D32
Ecografía
Preñada

D60
Reconfirmación
Preñada

No sobrescribir diagnóstico anterior.

==================================================
47. MÉTRICA PRINCIPAL
==================================================

Usar nombre:

PREÑEZ A IATF
(P/AI)

Preferible a:

"Tasa de concepción"

Cálculo:

animalesPreñados
/
animalesRealmenteInseminados
*
100

==================================================
48. NO USAR INSCRITOS COMO DENOMINADOR
==================================================

Ejemplo:

34 inscritas
31 completaron
30 inseminadas
18 preñadas

P/AI:

18 / 30
=
60 %

NO:

18 / 34

==================================================
49. MOSTRAR EMBUDO
==================================================

En campaña mostrar:

Inscritas:
34

Completaron protocolo:
31

Inseminadas:
30

Preñadas D32:
18

P/AI:
60 %

==================================================
50. MÉTRICAS POR FECHA DE DIAGNÓSTICO
==================================================

Si existe:

D32
18 preñadas

y:

D60
17 preñadas

mostrar ambas.

No reemplazar silenciosamente el resultado temprano.

==================================================
51. PÉRDIDA GESTACIONAL
==================================================

Preparar futura métrica:

pérdida entre diagnóstico temprano y reconfirmación.

No llamarla automáticamente:

muerte embrionaria

sin diagnóstico profesional.

==================================================
52. COSTOS REALES
==================================================

NO pedir simplemente:

costoHormonas manual

si podemos obtener costo desde insumos utilizados.

Calcular usando snapshots:

cantidad utilizada
x
costo unitario al momento

más:

semen
honorarios
otros costos.

==================================================
53. SNAPSHOT DE COSTOS
==================================================

Guardar:

costoUnitarioSnapshot

al ejecutar.

Si precio del producto cambia posteriormente:

el costo histórico no cambia.

==================================================
54. HONORARIOS
==================================================

Permitir registrar:

costoVeterinario
costoInseminador
otrosCostos

por campaña.

No obligar.

==================================================
55. COSTO TOTAL
==================================================

Costo campaña:

hormonas
+
dispositivos consumidos
+
semen utilizado
+
honorarios
+
otros

==================================================
56. COSTO POR PREÑEZ
==================================================

Costo por preñez:

costoTotalCampana
/
preñadasConfirmadas

Mostrar según diagnóstico seleccionado.

Ejemplo:

Costo/preñez D32

Costo/preñez D60

si existen ambos.

==================================================
57. INVENTARIO Y COSTOS
==================================================

No duplicar movimientos financieros.

Utilizar:

Productos
Compras
Finanzas

cuando exista asociación confiable.

No inventar costo de un producto sin costo conocido.

==================================================
58. ANIMAL PREÑADO
==================================================

Cuando resultado:

PREÑADA

integrarse con:

RegistroReproductivo
Gestación
línea de tiempo existente

No crear una segunda gestación paralela.

==================================================
59. FECHA PROBABLE DE PARTO
==================================================

NO hardcodear:

IATF + 283 días

para todas las razas.

Usar servicio existente de:

duracionGestacionEstimada

si existe.

Debe poder considerar:

- configuración de finca
- raza madre
- raza/toro
- valor configurado

Fallback:

valor configurable general

pero NO una verdad universal rígida.

==================================================
60. BRAHMAN / BOS INDICUS
==================================================

La arquitectura debe permitir gestaciones esperadas distintas de:

283 días.

No meter:

if Brahman = X

directamente en componentes.

Centralizar en servicio/configuración reproductiva.

==================================================
61. NO GENERAR FECHA DE SECADO
==================================================

GanaderiaRomilio está enfocada en:

carne / cría

NO producción lechera.

Eliminar del flujo IATF:

fecha esperada de secado.

==================================================
62. DESTETE
==================================================

Después de PREÑADA:

puede existir una PROYECCIÓN de parto.

Pero el destete definitivo debe calcularse desde:

PARTO REAL

según regla configurada de finca.

No:

IATF + gestación + destete fijo

como fecha definitiva.

==================================================
63. CELO POSPARTO
==================================================

Igual:

calcular después de:

fechaPartoReal

usando regla existente/configurable.

No crear fecha definitiva desde IATF.

==================================================
64. ANIMAL VACÍO
==================================================

Resultado:

VACIA

NO decidir automáticamente qué hacer.

Mostrar opciones:

Resincronizar
Monta de repaso
IA convencional
Esperar
Otra

==================================================
65. RESINCRONIZACIÓN
==================================================

Si usuario selecciona:

Re-IATF

crear nueva CampanaIATF o participación en campaña posterior.

Relacionar:

campanaAnterior

para trazabilidad.

==================================================
66. NO MODIFICAR PROTOCOLO ORIGINAL
==================================================

Una Re-IATF:

NO cambia la campaña anterior.

Historial:

IATF 1
→ vacía

IATF 2
→ preñada

==================================================
67. KPI DE RESINCRONIZACIÓN FUTURO
==================================================

Preparar para:

preñez acumulada

Ejemplo:

Primera IATF:
60 %

Después Re-IATF:
+20 %

Preñez acumulada:
80 %

No implementar fórmula si todavía no existe metodología consolidada.

==================================================
68. TORO DE REPASO
==================================================

Si se usa:

registrar mediante flujo existente de monta.

Relacionar opcionalmente:

campanaIATFOrigen.

Esto permitirá diferenciar:

preñez por IATF
vs
preñez posterior por toro

cuando sea posible.

==================================================
69. NO ATRIBUIR PREÑEZ INCORRECTAMENTE
==================================================

Si hubo:

IATF
+
toro de repaso

y no existe diagnóstico que permita atribución:

NO afirmar que la gestación fue causada por IATF.

Preparar campo:

origenGestacion:

IATF
MONTA_NATURAL
IA_CONVENCIONAL
INDETERMINADO

==================================================
70. PLANTILLAS INICIALES
==================================================

Podemos incluir plantillas de EJEMPLO, pero no como recomendación veterinaria.

Ejemplos:

IATF P4/E2 7 días
IATF P4/E2 8 días
7-Day CO-Synch + CIDR
Protocolo personalizado

IMPORTANTE:

si no existe información suficientemente validada en el proyecto para dosis:

NO precargar dosis médicas inventadas.

Preferir plantilla estructural sin dosis
o exigir configuración veterinaria.

==================================================
71. PLANTILLAS PERSONALIZADAS
==================================================

Admin/Veterinario autorizado puede:

Duplicar plantilla

Editar:

pasos
tiempos
productos
dosis
roles
tareas

No modificar campañas históricas ya iniciadas.

==================================================
72. VERSIONADO DE PLANTILLA
==================================================

Cuando inicia campaña:

guardar snapshot/version de plantilla.

Si mañana se edita:

no cambiar campaña antigua.

Ejemplo:

Plantilla versión 3

Campaña Octubre
→ mantiene versión 3

Plantilla actual:
versión 4

==================================================
73. PERMISOS
==================================================

Administrador:

gestionar campañas
plantillas
resultados

Veterinario:

crear/configurar protocolo
ejecutar pasos
registrar diagnósticos
IATF

Encargado:

ver campañas
ejecutar actividades permitidas

Trabajador:

ver/ejecutar tareas asignadas
NO cambiar dosis/protocolo salvo permiso

Adaptar a permisos actuales.

==================================================
74. CALENDARIO OPERATIVO
==================================================

Todas las tareas IATF deben aparecer en:

Calendario Operativo

Ejemplo:

8 oct
IATF Octubre
Retiro dispositivo
34 animales

10 oct
IATF
30 animales

31 oct
Diagnóstico

==================================================
75. CALENDARIO LUNAR
==================================================

Como reproducción ya soporta información lunar:

mostrar fase lunar junto a fechas si feature/configuración está activa.

Solo informativo.

NO modificar protocolos según luna.

==================================================
76. VISTA PRINCIPAL IATF
==================================================

Ruta:

/reproduccion/iatf

Tabs sugeridos:

[Campañas]
[Protocolos]

No crear demasiadas pestañas.

==================================================
77. LISTADO DE CAMPAÑAS
==================================================

Mostrar:

Nombre
Finca
Protocolo
Inicio
Animales
Inseminadas
Preñadas
P/AI
Estado

Estados:

PROGRAMADA
EN_CURSO
DIAGNOSTICO
FINALIZADA
CANCELADA

==================================================
78. DETALLE DE CAMPAÑA
==================================================

Encabezado:

IATF Octubre 2026

Protocolo:
P4/E2 7 días

Finca:
El Roble

Responsable:
...

Estado:
En curso

==================================================
79. LÍNEA DE TIEMPO
==================================================

Mostrar:

Día 0
✓ Inicio

Día 7
✓ Retiro

Día 9
● IATF

Día 30
○ Diagnóstico

Pero usar fechas/horas reales de la plantilla.

No asumir siempre esos días.

==================================================
80. PROGRAMADO VS REAL
==================================================

Cada paso debe mostrar:

Programado:
10 oct 08:00

Real:
10 oct 09:17

Diferencia:
+1h17

Esto aporta trazabilidad.

==================================================
81. ANIMALES DE CAMPAÑA
==================================================

Tabla:

Animal
DIIO
CC
Estado protocolo
IATF
Semen
Resultado
Último diagnóstico

Permitir operación masiva.

==================================================
82. EJECUCIÓN MASIVA
==================================================

Ejemplo:

Paso:
Retiro dispositivo

Seleccionar:

30 animales

Registrar:

producto
dosis
hora
responsable

Aplicar.

Pero guardar trazabilidad por animal cuando corresponda.

==================================================
83. RESULTADOS MASIVOS
==================================================

Diagnóstico:

Animal 001:
PREÑADA

002:
VACIA

003:
PREÑADA

...

Guardar en bloque.

==================================================
84. KPIS
==================================================

Mostrar:

Inscritas

Completaron

Inseminadas

Preñadas

Vacías

Dudosas

P/AI

Costo campaña

Costo/preñez

==================================================
85. TORO / SEMEN
==================================================

Si se usaron varios toros:

mostrar:

Toro
Inseminadas
Preñadas
P/AI observado

Ejemplo:

Toro A:
10 / 18

Toro B:
8 / 12

==================================================
86. NO DECLARAR "MEJOR TORO"
==================================================

No decir automáticamente:

"Toro A es superior"

porque existen:

n pequeño
selección de animales
condición corporal
técnico
protocolo
otros factores.

Usar:

"Resultados observados"

==================================================
87. CONDICIÓN CORPORAL
==================================================

Permitir análisis futuro:

P/AI según rango de CC.

Ejemplo:

CC <3:
...

CC 3-3.5:
...

CC >3.5:
...

Desde analítica correspondiente.

No hacer recomendaciones automáticas.

==================================================
88. PLAN PRO
==================================================

PRO obtiene:

- protocolos IATF
- campañas
- tareas
- inventario
- semen
- diagnósticos
- métricas
- costos
- comparaciones
- historial

==================================================
89. PREMIUM
==================================================

PREMIUM obtiene además contexto multi-finca.

Ejemplo:

IATF consolidado organización

Finca A:
P/AI 61 %

Finca B:
56 %

Finca C:
64 %

Siempre como:

resultados observados.

==================================================
90. CONSOLIDADO PREMIUM
==================================================

Premium puede ver:

campañas
animales inseminados
preñadas
P/AI ponderada correctamente
costos
costo/preñez

por finca.

No promedio simple de porcentajes.

==================================================
91. MÉTRICA CONSOLIDADA
==================================================

P/AI organización:

SUM(preñadas)
/
SUM(inseminadas)

NO:

(P/AI finca A + P/AI finca B) / N

==================================================
92. TENANT
==================================================

Todos los modelos:

organizacion
finca

según arquitectura multi-tenant.

No confiar en finca enviada por frontend.

==================================================
93. SEGURIDAD
==================================================

Todas las consultas deben estar scopeadas.

Campaña de Organización A:

nunca accesible desde B.

Validar referencias:

animal
producto
semen
lote
usuario

pertenecen al tenant permitido.

==================================================
94. ENDPOINTS
==================================================

Adaptar a arquitectura real.

Sugeridos:

GET /api/iatf/protocolos
POST /api/iatf/protocolos
GET /api/iatf/protocolos/:id
PUT /api/iatf/protocolos/:id

POST /api/iatf/campanas
GET /api/iatf/campanas
GET /api/iatf/campanas/:id

POST /api/iatf/campanas/:id/pasos/:pasoId/ejecutar

POST /api/iatf/campanas/:id/inseminaciones

POST /api/iatf/campanas/:id/diagnosticos

GET /api/iatf/campanas/:id/metricas

POST /api/iatf/campanas/:id/finalizar

POST /api/iatf/campanas/:id/cancelar

==================================================
95. SERVICE
==================================================

Crear:

iatfService

y servicios auxiliares si conviene.

Funciones:

crearPlantilla()
versionarPlantilla()

crearCampana()
calcularCronograma()

generarTareas()

ejecutarPaso()

registrarProductosUtilizados()

registrarIATF()

descontarPajuelas()

registrarDiagnostico()

calcularPrenezIATF()

calcularCostos()

calcularCostoPorPrenez()

resincronizar()

finalizarCampana()

==================================================
96. NO PONER LÓGICA MÉDICA EN CONTROLLER
==================================================

Controllers:

validan request
llaman service
responden

Toda lógica de protocolo:

servicios.

==================================================
97. TRANSACCIONES
==================================================

Usar transacciones cuando una operación implique:

- ejecución paso
- descuento inventario
- creación registros
- bitácora

Si falla:

no dejar inventario descontado sin registro reproductivo.

==================================================
98. BITÁCORA
==================================================

Crear EventoAnimal:

Inicio protocolo IATF

Inseminación IATF

Diagnóstico

Preñez confirmada

Salida/cancelación del protocolo

sin saturar bitácora con cada detalle técnico si no aporta.

==================================================
99. EVENTO DE CAMPAÑA
==================================================

Si infraestructura lo permite:

EventoCampanaIATF

para:

creada
paso ejecutado
reprogramada
diagnóstico realizado
finalizada

==================================================
100. CANCELACIÓN
==================================================

Cancelar campaña:

NO borrar.

Cancelar tareas pendientes.

NO revertir automáticamente:

productos ya usados
semen usado
acciones realizadas.

Conservar historial.

==================================================
101. ANIMAL RETIRADO
==================================================

Permitir retirar individualmente:

enfermedad
venta
muerte
decisión veterinaria
otro

No eliminarlo de campaña histórica.

==================================================
102. IMPORTANTE: INVENTARIO
==================================================

Productos:

descontar únicamente al ejecutar.

Semen:

descontar al inseminar.

Dispositivos:

manejar según configuración de consumo/reutilización.

No descontar todo en Día 0 solamente porque campaña fue creada.

==================================================
103. FINANZAS
==================================================

No crear automáticamente:

egreso financiero

si el producto ya fue comprado y registrado como egreso.

Usar:

costo histórico del consumo

para analítica IATF.

Evitar doble contabilización.

==================================================
104. FUTURO
==================================================

Dejar preparado para:

- resincronización avanzada
- protocolos por categoría
- semen sexado
- evaluación por toro
- evaluación por técnico
- P/AI por condición corporal
- P/AI por finca
- P/AI por protocolo
- pérdida gestacional
- costo acumulado por gestación
- comparación entre campañas

==================================================
105. NO HACER TODAVÍA
==================================================

NO implementar:

recomendaciones veterinarias automáticas

selección automática de hormonas

selección automática de protocolo

cálculo automático de dosis según peso

diagnóstico de fertilidad

ranking genético del toro

predicción IA de preñez

==================================================
106. MIGRACIÓN
==================================================

El módulo nuevo no debe afectar:

Monta natural

IA convencional

Gestaciones existentes

Registros históricos.

Si existe modelo IA actual:

adaptar relaciones de forma backwards-compatible.

==================================================
107. TESTS IMPORTANTES
==================================================

Probar:

Pro crea protocolo
Premium crea protocolo

Gestión:
403

Esencial:
403

protocolo con P4/E2

protocolo GnRH/CIDR

protocolo sin eCG

protocolo personalizado

pasos diferentes

Día 7 vs Día 8

IATF 48h
IATF 56h
IATF 66h

campaña con lote

campaña selección manual

CC 1-5

CC 1-9

producto insuficiente

semen insuficiente

paso parcial

animal retirado

inseminación realizada

inseminación no realizada

diagnóstico preñada

diagnóstico vacía

diagnóstico dudosa

reconfirmación

resincronización

toro de repaso

cancelación campaña

costos

costo/preñez

P/AI correcto

tenant isolation

==================================================
108. PRUEBA DE DENOMINADOR
==================================================

Caso:

34 inscritas

31 completaron

30 inseminadas

18 preñadas

Debe resultar:

P/AI = 60 %

==================================================
109. PRUEBA DE COSTO
==================================================

Costo real:

Hormonas:
₡180.000

Semen:
₡240.000

Veterinario:
₡120.000

Otros:
₡30.000

Total:
₡570.000

Preñadas:
18

Costo/preñez:
₡31.666,67

==================================================
110. PRUEBA DE FECHA PARTO
==================================================

Confirmar que:

fechaProbableParto

NO se calcula siempre:

IATF + 283.

Debe usar:

servicio reproductivo/configuración existente.

==================================================
111. PRUEBA DE DESTETE
==================================================

Confirmar:

destete definitivo

NO se genera desde IATF.

Debe depender posteriormente de:

parto real.

==================================================
112. PRUEBA DE SECADO
==================================================

Confirmar:

NO se crea tarea/fecha de secado.

Producción lechera está fuera del alcance actual.

==================================================
113. UX
==================================================

El usuario debe sentir que está manejando:

UNA CAMPAÑA REPRODUCTIVA

no un formulario enorme de medicamentos.

Flujo ideal:

1. Elegir protocolo.
2. Elegir animales.
3. Registrar CC.
4. Elegir fecha inicio.
5. Sistema genera cronograma.
6. Ejecutar tareas.
7. Registrar IATF.
8. Registrar diagnósticos.
9. Ver resultados.

==================================================
114. EJEMPLO VISUAL
==================================================

IATF OCTUBRE 2026

Protocolo:
P4/E2 7 días

Animales:
34

Estado:
En curso


CRONOGRAMA

03 oct
✓ Inicio protocolo

10 oct
✓ Retiro dispositivo

12 oct
✓ IATF
30 inseminadas

02 nov
○ Diagnóstico


RESULTADOS

Inscritas:
34

Completaron:
31

Inseminadas:
30

Preñadas:
18

P/AI:
60 %

Costo/preñez:
₡31.667

==================================================
115. PRINCIPIO DE DISEÑO
==================================================

NO construir:

"IATF = receta fija"

Construir:

"IATF = ejecución controlada de un protocolo veterinario configurable"

GanaderiaRomilio debe conocer:

QUÉ se programó
QUÉ se ejecutó
CUÁNDO
A QUÉ animales
QUÉ productos se utilizaron
QUÉ semen se utilizó
QUIÉN lo hizo
CUÁNTO costó
CUÁL fue el resultado

pero NO decidir:

qué medicamento usar
qué dosis utilizar
qué protocolo es mejor.

==================================================
116. ENTREGA DE CODEX
==================================================

Al finalizar reportar:

- modelos revisados
- modelos creados
- modelos modificados
- integración con Reproducción
- integración con Animal
- integración con Lotes
- integración con Productos/Inventario
- manejo de dispositivos
- integración con semen
- integración con Tareas
- cronograma configurable
- plantillas implementadas
- versionado
- campañas
- ejecución de pasos
- diagnósticos
- métricas
- P/AI
- costos
- costo/preñez
- FeatureGate PRO/PREMIUM
- tenant isolation
- migraciones
- índices
- pruebas realizadas
- cualquier parte que haya quedado preparada pero no implementada