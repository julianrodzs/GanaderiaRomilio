# PROMPT PARA CODEX: REDISEÑO VISUAL DE TABLAS Y ORGANIZACIÓN POR SECCIONES PLEGABLES EN REPORTES

## 🎯 OBJETIVO
Corregir los problemas de legibilidad y estilos en la vista de **Reportes** (específicamente en el bloque de *Partos por método reproductivo* e *Indicadores por método*, donde los encabezados y celdas salen pegados sin espaciado y se muestran enums crudos como `SIN_SERVICIO`), y reestructurar toda la pantalla de **Reportes** en **secciones temáticas plegables (acordeones)** con navegación rápida para que sea limpia, ordenada y fácil de explorar en escritorio y móvil.

---

## 🎨 1. CORRECCIÓN DE ESTILOS Y LEGIBILIDAD EN TABLAS DE REPORTES

### A. Tablas con espaciado profesional (Nunca columnas pegadas)
En todas las tablas de `Reportes` (incluyendo *Partos por método reproductivo* e *Indicadores por método*):
1. Aplicar contenedor con `overflow-x: auto`, borde suave (`border: 1px solid #e2e8f0`), `border-radius: 12px` y fondo blanco.
2. La tabla debe tener `width: 100%`, `border-collapse: separate` (o `collapse`) y un `min-width: 720px` para que en pantallas pequeñas haga scroll horizontal limpio sin aplastar los títulos.
3. **Encabezados (`<th>`):**
   - `padding: 12px 16px` mínimo (nunca `0`).
   - Fondo suave (`#f8faf7` o `#f1f5f9`), texto en gris oscuro (`#334155`), tamaño `12px`–`13px`, `font-weight: 700`, borde inferior `1px solid #e2e8f0`.
   - Alineación: texto a la izquierda (`text-align: left`) y columnas numéricas (`Servicios`, `Preñeces atribuidas`, `Preñez / servicios`, `Servicios / concepción`, `Intervalo partos (días)`, `Pérdidas`) alineadas a la derecha o al centro (`text-align: right` / `center`) con `white-space: nowrap` para que no se peguen dos títulos seguidos.
4. **Celdas (`<td>`):**
   - `padding: 12px 16px`, borde inferior `1px solid #f1f5f9`, `vertical-align: middle`.
   - Efecto hover suave en las filas (`#f8fafc`).

### B. Etiquetas legibles (Prohibido mostrar enums crudos de base de datos)
1. En la columna **Atribución**, nunca mostrar `SIN_SERVICIO`, `CONFIRMADA`, `PROBABLE` o `INCIERTA` en texto crudo:
   - `CONFIRMADA` → Badge verde suave: **"Confirmada"**
   - `PROBABLE` → Badge azul/esmeralda suave: **"Probable"**
   - `INCIERTA` → Badge ámbar de advertencia: **"Incierta (requiere revisión)"**
   - `SIN_SERVICIO` → Badge gris neutro: **"Sin servicio registrado"**
2. En la columna **Método**, mostrar badges estilizados con buena ortografía y tildes:
   - `"Monta natural"`
   - `"Inseminación artificial convencional"` *(con tilde)*
   - `"Inseminación a tiempo fijo (IATF)"` *(con tilde)*
   - `"Transferencia de embriones"`
   - `"Desconocido"`
3. Corregir la ortografía y tildes del texto al pie:
   - *"Cohorte de servicios del período. Preñeces atribuidas confirmadas; las atribuciones inciertas no se acreditan a un método. Sin denominador se muestra sin datos."*
4. Estilizar el filtro superior `Método [ Todos ▾ ]` con un `gap: 8px`, etiqueta con `font-weight: 600` y un `<select>` con `padding: 8px 12px`, `border-radius: 8px` y borde `#cbd5e1`.
5. Mostrar el resumen `IA total: X` como una pastilla/chip destacado (`badge`) debajo o junto a la tabla, no como texto suelto sin formato.

---

## 🗂️ 2. REORGANIZACIÓN DE LA PÁGINA DE REPORTES POR SECCIONES PLEGABLES

Organizar todos los bloques y tarjetas existentes de la vista de **Reportes** dentro de **6 secciones temáticas plegables (acordeones)**:

1. **Inventario y Movimiento de Hato** *(Existencias por especie/categoría, altas/bajas/muertes, distribución en finca).*
2. **Reproducción, Gestación y Genética** *(Partos por método reproductivo, Indicadores por método, estado reproductivo, campañas IATF, Banco de Semen y Transferencia de Embriones).*
3. **Producción, Pesajes, Engorde y Potreros** *(GMD, evolución de lotes de engorde, rotación/carga de potreros, alimentación y raciones).*
4. **Sanidad y Periodos de Retiro** *(Tratamientos aplicados, calendario sanitario, animales con retiro de carne activo).*
5. **Comercialización: Compras y Ventas** *(Ventas de ganado, compras de ganado, ventas comerciales de pajillas y embriones).*
6. **Finanzas, Caja y Rentabilidad** *(Ingresos vs egresos separados en `CRC` y `USD`, costos por categoría, rentabilidad por lote/proceso y cierres históricos).*

### Comportamiento de las secciones:
1. **Barra superior de acceso rápido (Pills / Filtros de sección):**
   - Permitir ver **`Todas las secciones`** o filtrar rápidamente una sola sección con un clic, más dos botones de acción rápida: **`Expandir todas`** y **`Contraer todas`**.
2. **Cabecera de cada sección plegable:**
   - Diseño tipo tarjeta moderna con título claro, subtítulo breve explicando qué incluye, contador de sub-reportes disponibles según el plan activo y flecha/ícono animado de expandir/contraer (`▾` / `▸`).
   - Al hacer clic en la cabecera de la sección, se muestra u oculta su contenido suavemente.
   - Por defecto, abrir la primera sección (o recordar en `sessionStorage` cuáles secciones dejó abiertas el usuario para que no se cierren al cambiar filtros de fechas).
3. **Respeto a los Planes:**
   - Mantener intactas las validaciones de plan existentes (si una sub-sección o reporte requiere `GESTION`, `PRO` o `PREMIUM`, mostrar su estado correspondiente sin romper la estructura del acordeón).

---

## 🧪 3. VERIFICACIÓN
1. Comprobar que ninguna tabla de `Reportes` tenga encabezados o celdas pegadas sin separación.
2. Comprobar que no aparezca ningún enum con guion bajo (`SIN_SERVICIO`) ni textos sin tilde (`Inseminacion`, `Preneces`, `metodo`, `periodo`) en la UI.
3. Verificar que expandir/contraer secciones individuales y el botón de "Expandir/Contraer todas" funcionen sin perder los filtros de fecha seleccionados.
4. Ejecutar las suites de pruebas de reportes (`npm test` en backend y `npm run build` en frontend) verificando que los exportables PDF/Excel y las pruebas de regresión sigan en `PASS`.