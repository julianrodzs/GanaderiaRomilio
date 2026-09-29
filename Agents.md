Necesito implementar dos nuevos índices productivos a NIVEL DE FINCA en GanaderiaRomilio:

1. ICP = Índice de Crecimiento Porcino
2. IEE = Índice de Eficiencia de Engorde

IMPORTANTE:

Estos índices NO deben mostrarse como índices individuales por animal.

El resultado principal debe representar el rendimiento de la FINCA durante el período seleccionado.

Internamente se pueden usar pesajes individuales para realizar los cálculos correctamente.

No mezclar estos índices con el IPG de cría bovina existente.

Debemos tener tres conceptos independientes:

IPG
→ productividad de cría bovina

ICP
→ crecimiento porcino general de la finca

IEE
→ eficiencia general del engorde de la finca

==================================================
1. PRINCIPIO GENERAL
==================================================

Los índices deben funcionar por período.

Aceptar:

- fechaInicio
- fechaFin

El usuario debe poder consultar:

- este mes
- últimos 3 meses
- últimos 6 meses
- este año
- período personalizado

No guardar el resultado del índice directamente en Animal.

Calcularlo desde los datos históricos.

==================================================
2. METAS PRODUCTIVAS CONFIGURABLES
==================================================

No hardcodear las metas productivas directamente dentro de los servicios de reportes.

Crear una configuración productiva.

Puede llamarse:

ConfiguracionProductiva

o reutilizar una configuración existente si ya existe algo equivalente.

Por ahora puede ser una configuración global de la aplicación.

En el futuro deberá poder pertenecer a cada Organización/Finca cuando se implemente multi-tenant.

Campos sugeridos:

porcinos: {
  gmdFase1KgDia,
  gmdFase2KgDia,
  gmdFase3KgDia,
  gmdDesarrolloKgDia,
  gmdEngordeKgDia,
  pesoObjetivoEngordeKg
}

bovinosEngorde: {
  gmdObjetivoKgDia,
  pesoObjetivoKg
}

Valores iniciales sugeridos para porcinos:

fase1:
0.300 kg/día

fase2:
0.400 kg/día

fase3:
0.550 kg/día

desarrollo:
0.750 kg/día

engorde:
0.850 kg/día

pesoObjetivoEngorde:
110 kg

IMPORTANTE:

Estos valores deben ser editables.

Para bovinos NO imponer una meta universal rígida.

Permitir configurar:

gmdObjetivoKgDia

Ejemplo inicial configurable:

0.90 kg/día

pero tratarlo como una meta de negocio configurable, no como estándar universal.

==================================================
3. ICP - ÍNDICE DE CRECIMIENTO PORCINO
==================================================

El ICP debe responder:

"¿Qué tan cerca está el crecimiento porcino de la finca del objetivo esperado para las etapas productivas?"

El ICP final debe ser un número alrededor de 100.

Interpretación:

100
= crecimiento exactamente en objetivo

> 100
= crecimiento superior al objetivo

< 100
= crecimiento inferior al objetivo

==================================================
4. FUENTE DE DATOS DEL ICP
==================================================

Usar:

- Animal
- Pesaje

Solo animales:

especie = 'Porcino'

estado activo o equivalente según el modelo real.

Para calcular crecimiento se necesitan al menos 2 pesajes válidos.

No usar animales con un solo pesaje para calcular GMD.

No interpretar ausencia de pesajes como crecimiento 0.

==================================================
5. CÁLCULO DE GMD PORCINA
==================================================

Para cada animal porcino con suficientes datos dentro del período:

pesoInicial =
primer pesaje válido considerado

pesoFinal =
último pesaje válido considerado

dias =
diferencia entre fechas

gananciaKg =
pesoFinal - pesoInicial

gmdReal =
gananciaKg / dias

Excluir cálculos donde:

- dias <= 0
- peso inicial inválido
- peso final inválido

Si gananciaKg es negativa:

mantenerla como valor real.

No convertirla automáticamente a 0.

Esto puede indicar pérdida de peso.

==================================================
6. DETERMINAR ETAPA PORCINA
==================================================

Revisar si actualmente Animal ya tiene:

- etapa
- categoria
- objetivoProductivo
- peso
- edad

Reutilizar primero lo existente.

No crear campos duplicados.

Necesitamos determinar la etapa productiva para asignar la meta correcta.

Etapas objetivo:

- Fase 1
- Fase 2
- Fase 3
- Desarrollo
- Engorde

Si ya existe una etapa explícita, utilizarla.

Si no existe, preparar un helper centralizado para determinarla según los datos disponibles.

NO inventar rangos de peso arbitrarios sin revisar primero cómo está modelada actualmente la producción porcina.

Si no se puede determinar la etapa:

marcar ese animal como:

sinMetaProductiva

y no incluirlo en el cálculo normalizado del ICP.

==================================================
7. NORMALIZACIÓN DEL CRECIMIENTO
==================================================

Para cada animal:

cumplimientoGmd =
gmdReal / gmdObjetivoEtapa * 100

Ejemplo:

gmdReal:
0.806 kg/día

gmdObjetivo:
0.850 kg/día

cumplimiento:
94.82 %

==================================================
8. ICP GENERAL DE FINCA
==================================================

NO calcular:

promedio simple de todos los porcentajes individuales.

Utilizar ponderación por tiempo real evaluado.

Para cada animal:

animalDiasEvaluados = dias utilizados para calcular su GMD

ICP finca:

SUM(
  cumplimientoGmdAnimal * animalDiasEvaluados
)
/
SUM(animalDiasEvaluados)

Esto permite que un animal observado durante 60 días tenga mayor peso estadístico que uno observado solo durante 5 días.

El resultado final es:

icp

==================================================
9. CLASIFICACIÓN ICP
==================================================

Usar inicialmente estas reglas de negocio:

ICP >= 105
"Por encima del objetivo"

ICP >= 95 y < 105
"En objetivo"

ICP >= 80 y < 95
"Bajo objetivo"

ICP < 80
"Requiere revisión"

IMPORTANTE:

Esta clasificación es una regla interna de negocio.

Debe quedar en configuración o constantes centralizadas.

No presentarla como una escala veterinaria universal.

==================================================
10. RESPUESTA ICP
==================================================

Crear endpoint equivalente:

GET /api/reportes/porcinos/crecimiento

Query:

fechaInicio
fechaFin

Respuesta sugerida:

{
  icp: 94.8,

  clasificacion: "Bajo objetivo",

  resumen: {
    porcinosEvaluados: 82,
    porcinosSinDatosSuficientes: 14,
    animalDiasEvaluados: 4210,
    gananciaKgTotal: 2860,
    gmdRealPonderada: 0.79,
    gmdObjetivoPonderada: 0.83
  },

  porEtapa: [
    {
      etapa: "Desarrollo",
      animales: 35,
      gmdReal: 0.72,
      gmdObjetivo: 0.75,
      cumplimiento: 96
    },
    {
      etapa: "Engorde",
      animales: 47,
      gmdReal: 0.81,
      gmdObjetivo: 0.85,
      cumplimiento: 95.3
    }
  ],

  datosInsuficientes: false
}

==================================================
11. DATOS INSUFICIENTES ICP
==================================================

Si no existen suficientes porcinos con al menos 2 pesajes:

NO devolver:

ICP = 0

porque eso significaría falsamente que el crecimiento fue pésimo.

Devolver:

{
  icp: null,
  datosInsuficientes: true,
  mensaje:
  "No existen suficientes pesajes para calcular el índice de crecimiento porcino."
}

==================================================
12. IEE - ÍNDICE DE EFICIENCIA DE ENGORDE
==================================================

Crear un índice general de engorde a nivel finca.

Debe funcionar para:

- Bovinos de engorde
- Porcinos de engorde

Puede existir una finca:

solo bovina
solo porcina
o mixta

El IEE debe permitir obtener:

- IEE bovino
- IEE porcino
- IEE general de finca

IMPORTANTE:

Nunca comparar directamente kg/día de bovinos contra kg/día de porcinos.

Cada especie debe normalizarse primero contra SU PROPIA meta.

==================================================
13. IDENTIFICAR ANIMALES DE ENGORDE
==================================================

Revisar primero si existe:

objetivoProductivo

o campo equivalente.

La lógica objetivo es identificar animales con:

objetivoProductivo = 'Engorde'

No asumir que todo macho está en engorde.

No asumir que todos los porcinos están en engorde.

==================================================
14. COMPONENTES DEL IEE
==================================================

Primera versión del IEE:

60 % Cumplimiento de GMD

25 % Eficiencia del tiempo

15 % Supervivencia

Formula:

IEE =
cumplimientoGmd * 0.60
+
eficienciaTiempo * 0.25
+
supervivencia * 0.15

Para la ponderación:

cada componente puede limitarse a máximo 100.

Esto evita que una GMD extraordinariamente alta compense completamente mortalidad o una mala eficiencia de tiempo.

Ejemplo:

cumplimientoGmdPonderacion =
Math.min(cumplimientoGmd, 100)

==================================================
15. COMPONENTE 1 - CUMPLIMIENTO GMD
==================================================

Para Bovinos:

usar meta:

ConfiguracionProductiva.bovinosEngorde.gmdObjetivoKgDia

Para Porcinos:

usar:

ConfiguracionProductiva.porcinos.gmdEngordeKgDia

Calcular la GMD real agregada de cada especie utilizando los pesajes.

Preferencia:

GMD agregada =
SUM(gananciaKg)
/
SUM(animalDiasEvaluados)

Después:

cumplimientoGmd =
gmdRealAgregada / gmdObjetivo * 100

Calcular independientemente para:

- Bovino
- Porcino

==================================================
16. COMPONENTE 2 - EFICIENCIA DEL TIEMPO
==================================================

Necesitamos:

- peso inicial del período/ciclo
- peso objetivo
- GMD objetivo

Calcular:

kgObjetivoGanancia =
pesoObjetivo - pesoInicialPromedio

diasObjetivo =
kgObjetivoGanancia / gmdObjetivo

Para animales/lotes finalizados, si existe duración real:

eficienciaTiempo =
diasObjetivo / diasReales * 100

Para animales activos:

usar duración proyectada.

kgRestante =
pesoObjetivo - pesoActual

diasRestantesEstimados =
kgRestante / gmdReal

diasProyectados =
diasYaTranscurridos + diasRestantesEstimados

eficienciaTiempo =
diasObjetivo / diasProyectados * 100

Manejar casos donde:

- peso actual >= peso objetivo
- gmdReal <= 0
- peso objetivo no está configurado

Si no existe información suficiente:

no inventar eficiencia.

Marcar componente como:

null

==================================================
17. COMPONENTE 3 - SUPERVIVENCIA
==================================================

Calcular por especie y período.

animalesEngordeIniciales =
animales considerados en engorde durante el período

muertesEngorde =
animales de engorde muertos durante el período

supervivencia =

(animalesEngordeIniciales - muertesEngorde)
/
animalesEngordeIniciales
* 100

IMPORTANTE:

Revisar cómo se registra actualmente fechaMuerte.

Si solo existe estado = Muerto sin fecha confiable:

documentar la limitación.

No usar updatedAt silenciosamente como fecha de muerte sin indicarlo.

==================================================
18. IEE POR ESPECIE
==================================================

Calcular:

ieeBovino

usando:

- cumplimientoGmdBovino
- eficienciaTiempoBovino
- supervivenciaBovina

Calcular:

ieePorcino

usando:

- cumplimientoGmdPorcino
- eficienciaTiempoPorcino
- supervivenciaPorcina

Si un componente no puede calcularse:

NO asignarle 0 automáticamente.

Reponderar únicamente entre componentes disponibles.

Ejemplo:

si solo tenemos:

GMD = 60 %
Supervivencia = 15 %

peso disponible = 75

IEE =
(
GMD * 0.60
+
Supervivencia * 0.15
)
/
0.75

Esto evita castigar al cliente simplemente porque todavía no registra peso objetivo.

Incluir en respuesta:

componentesDisponibles

==================================================
19. IEE GENERAL DE FINCA
==================================================

Si solamente existe una especie en engorde:

IEE finca =
IEE de esa especie

Si existen Bovinos y Porcinos:

NO usar promedio simple.

Ponderar por:

animal-días de engorde evaluados

Ejemplo:

IEE bovino = 92
animalDiasBovino = 5000

IEE porcino = 96
animalDiasPorcino = 2000

IEE finca =

(
92 * 5000
+
96 * 2000
)
/
7000

Esto permite comparar el cumplimiento productivo de ambas actividades sin comparar directamente sus kg/día.

==================================================
20. CLASIFICACIÓN IEE
==================================================

Crear clasificación inicial de negocio:

IEE >= 95
"Excelente desempeño"

IEE >= 85
"Buen desempeño"

IEE >= 70
"Desempeño medio"

IEE < 70
"Requiere revisión"

IMPORTANTE:

Esta clasificación debe quedar centralizada/configurable.

No afirmar que es un estándar universal.

==================================================
21. ENDPOINT IEE
==================================================

Crear equivalente:

GET /api/reportes/engorde

Query:

fechaInicio
fechaFin
especie opcional

especie:

Bovino
Porcino
Todos

Respuesta:

{
  ieeGeneral: 91.7,

  clasificacion: "Buen desempeño",

  componentes: {
    cumplimientoGmd: 93.4,
    eficienciaTiempo: 87.6,
    supervivencia: 99.1
  },

  bovinos: {
    iee: 90.8,
    animalesEvaluados: 75,
    animalDias: 6300,
    gmdReal: 0.84,
    gmdObjetivo: 0.90,
    cumplimientoGmd: 93.3,
    pesoPromedioActual: 412,
    pesoObjetivo: 500,
    eficienciaTiempo: 86.5,
    supervivencia: 99
  },

  porcinos: {
    iee: 94.5,
    animalesEvaluados: 130,
    animalDias: 4100,
    gmdReal: 0.82,
    gmdObjetivo: 0.85,
    cumplimientoGmd: 96.5,
    pesoPromedioActual: 86,
    pesoObjetivo: 110,
    eficienciaTiempo: 91,
    supervivencia: 99.3
  },

  datosInsuficientes: false
}

==================================================
22. OTROS INDICADORES DE ENGORDE
==================================================

Además del IEE, devolver:

- animales actualmente en engorde
- peso promedio actual
- ganancia total de peso
- GMD real
- GMD objetivo
- cumplimiento GMD %
- días promedio en engorde
- peso objetivo
- kg promedio restantes
- días estimados restantes
- animales que ya alcanzaron peso objetivo
- animales sin pesajes recientes

Separar:

bovinos
porcinos

y total cuando tenga sentido.

==================================================
23. FRONTEND
==================================================

No crear un módulo nuevo.

Agregar dentro de Reportes.

Estructura sugerida:

REPORTES

Bovinos
- Cría
- Engorde

Porcinos
- Reproducción
- Camadas
- Crecimiento
- Engorde

==================================================
24. VISTA ICP
==================================================

En:

Reportes > Porcinos > Crecimiento

Mostrar tarjeta principal:

Índice de Crecimiento Porcino

ICP
94.8

"Bajo objetivo"

Debajo:

- Porcinos evaluados
- GMD real
- GMD objetivo
- Ganancia total
- Datos sin suficientes pesajes

Mostrar además comparación por etapa:

Etapa
Animales
GMD real
Meta
Cumplimiento

==================================================
25. VISTA IEE
==================================================

En:

Reportes > Engorde

Mostrar:

Índice de Eficiencia de Engorde

IEE general:
91.7

Buen desempeño

Componentes:

GMD:
93.4 %

Tiempo:
87.6 %

Supervivencia:
99.1 %

Si la finca tiene ambas especies:

mostrar debajo:

Bovinos
IEE: 90.8

Porcinos
IEE: 94.5

No presentar esto como competencia entre especies.

Solo como desempeño relativo contra las metas propias de cada sistema.

==================================================
26. PROYECCIÓN DE PESO OBJETIVO
==================================================

Mostrar proyección cuando exista información suficiente.

Ejemplo:

Peso promedio actual:
412 kg

Peso objetivo:
500 kg

GMD:
0.84 kg/día

Faltante:
88 kg

Estimación:
105 días

Texto:

"Al ritmo de crecimiento actual, el grupo alcanzaría el peso objetivo aproximadamente en 105 días."

Usar lenguaje de proyección.

No afirmar que es una fecha garantizada.

==================================================
27. NO IMPLEMENTAR TODAVÍA
==================================================

No incluir todavía en IEE:

- conversión alimenticia
- kg alimento / kg ganado
- consumo real de alimento
- costo por kg ganado dentro del índice
- margen económico dentro del índice

Motivo:

la aplicación todavía no controla con suficiente precisión el alimento realmente consumido por cada grupo de engorde.

No deducir consumo desde compras de alimento.

Comprar alimento != consumirlo.

==================================================
28. PREPARAR SEGUNDA VERSIÓN
==================================================

Dejar la arquitectura preparada para posteriormente incorporar:

conversionAlimenticia

y:

eficienciaEconomica

Futura versión del IEE podría incluir:

- GMD
- conversión alimenticia
- supervivencia
- eficiencia económica

Pero NO implementarla ahora.

==================================================
29. SERVICIO CENTRAL
==================================================

Crear:

indicesProductivosService

o equivalente.

Funciones sugeridas:

calcularGmd()
obtenerMetaGmdPorcina()
calcularCumplimientoGmd()
calcularIcpPorcino()
calcularGmdEngordePorEspecie()
calcularEficienciaTiempo()
calcularSupervivenciaEngorde()
calcularIeeEspecie()
calcularIeeGeneral()
obtenerProyeccionPesoObjetivo()

No duplicar fórmulas en controladores.

==================================================
30. REUTILIZAR REPORTES EXISTENTES
==================================================

Antes de programar revisar:

- reporte crecimiento-pesajes
- Pesaje
- Animal
- reporte compras animales
- sustentabilidad
- ventas
- estados de Animal
- categorías porcinas
- objetivoProductivo si ya existe

Ya existen cálculos de crecimiento.

Reutilizar helpers cuando sea posible.

No implementar una segunda versión distinta de GMD en otro archivo si se puede centralizar.

==================================================
31. CASOS DE PRUEBA
==================================================

Probar:

- finca solo bovina
- finca solo porcina
- finca mixta
- animales con 1 pesaje
- animales con varios pesajes
- pérdida de peso
- pesajes el mismo día
- sin metas configuradas
- sin peso objetivo
- animales muertos
- animal que alcanza peso objetivo
- animal sobre peso objetivo
- período sin pesajes
- período que atraviesa cambio de etapa porcina
- mezcla de porcinos en distintas etapas

==================================================
32. PRINCIPIO FINAL
==================================================

Los índices principales son de FINCA.

ICP:

mide qué tan bien está creciendo la producción porcina de la finca respecto a las metas correspondientes a cada etapa.

IEE:

mide qué tan eficientemente está funcionando el engorde total de la finca.

IEE puede consolidar:

- Bovinos
- Porcinos

pero solamente después de normalizar cada especie contra sus propias metas.

No comparar directamente:

kg/día bovino
vs
kg/día porcino.

La jerarquía final debe ser:

IPG
→ Cría bovina

ICP
→ Crecimiento porcino

IEE
→ Engorde bovino/porcino

Todos mostrados principalmente a nivel de FINCA.