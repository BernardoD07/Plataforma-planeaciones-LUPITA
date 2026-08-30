# PlaneacionesLUPITA&lt;3

Plataforma web sobre Google Apps Script para armar **planes de trabajo de
educación secundaria** con el formato oficial (membrete institucional, tablas 1
a 4, observaciones y firmas), maquetarlos arrastrando bloques como en un
documento, guardarlos en **Google Drive** y descargarlos en PDF o Word.

Se organiza por **plantillas**: cada plantilla guarda el membrete de una unidad
escolar y, dentro de ella, viven todas las planeaciones hechas con ese membrete.
Así queda el historial agrupado —«Plantilla química» con sus doce planeaciones—
y se puede duplicar una plantilla para partir de ella y cambiarle lo que haga
falta.

La **IA es opcional**: la planeación se puede escribir completa a mano. Si se
activa, solo redacta las tablas 3 y 4 (el proyecto y sus fases) y todo queda
editable.

---

## 1. Archivos del proyecto

| Archivo | Qué contiene |
|---|---|
| `appsscript.json` | Manifiesto: zona horaria, scopes, servicio avanzado de Docs, config del Web App |
| `Code.gs` | `doGet`, `include`, configuración, catálogos (ejes, campos, firmas) y utilidades |
| `IA.gs` | Prompts opcionales para tablas 3 y 4 + adaptador Gemini / OpenAI / Anthropic |
| `Tiempos.gs` | Reparto de las sesiones de la tabla 1 entre las fases de la tabla 4 |
| `Almacen.gs` | Drive: plantillas, sus carpetas de planeaciones e imágenes |
| `Documento.gs` | Construcción del Google Doc por bloques, fusión de celdas y exportación |
| `Index.html` | Estructura del frontend (bienvenida + 5 pasos + modal de configuración) |
| `Styles.html` | Estilos. **Todo el tema vive en los tokens de `:root`** |
| `JavaScript.html` | Galería, wizard, editor arrastrable, vista previa y llamadas al servidor |
| `_demo/` | Banco de pruebas local con backend simulado. **No se sube a Apps Script** |

---

## 2. Instalación paso a paso

### 2.1 Crear el proyecto

1. Entra a <https://script.google.com> → **Nuevo proyecto**.
2. Ponle nombre: `PlaneacionesLUPITA`.
3. Menú ⚙ **Configuración del proyecto** → activa
   *«Mostrar el archivo de manifiesto appsscript.json en el editor»*.

### 2.2 Copiar los archivos

En el editor, crea cada archivo con **exactamente** estos nombres (sin la extensión
`.gs`/`.html`, que el editor añade solo):

- Scripts (`Archivo ▸ Secuencia de comandos`): `Code`, `IA`, `Tiempos`, `Almacen`, `Documento`
- HTML (`Archivo ▸ HTML`): `Index`, `Styles`, `JavaScript`

Pega el contenido de cada archivo de esta carpeta en el que le corresponde y
sustituye el `appsscript.json` por el de aquí.

> Con [`clasp`](https://github.com/google/clasp) basta `clasp create` y
> `clasp push`: el `.claspignore` ya deja fuera `_demo/`, `.claude/` y el README.

### 2.3 Activar el servicio avanzado de Google Docs

Necesario **solo** para que las celdas combinadas de la tabla 1 se fusionen de
verdad. Sin él la planeación se genera igual, pero esas celdas aparecen como
celdas vacías contiguas.

1. En el panel izquierdo, **Servicios** → ＋.
2. Elige **Google Docs API**, deja el identificador `Docs`, versión `v1` → **Añadir**.

Si copiaste el `appsscript.json` de esta carpeta, el servicio ya viene declarado.

### 2.4 Obtener una API key de IA (opcional)

| Proveedor | Dónde se obtiene | Modelo sugerido |
|---|---|---|
| Google Gemini | <https://aistudio.google.com/apikey> | `gemini-2.0-flash` |
| OpenAI | <https://platform.openai.com/api-keys> | `gpt-4o` |
| Anthropic | <https://console.anthropic.com/settings/keys> | `claude-sonnet-4-5` |

Sin clave, el interruptor «Redactar con IA» queda deshabilitado y la plataforma
funciona igual capturando todo a mano.

### 2.5 Desplegar como aplicación web

1. **Implementar ▸ Nueva implementación** → tipo **Aplicación web**.
2. Configura:
   - *Ejecutar como*: **Usuario que accede** — así cada docente guarda en **su
     propio Drive**.
   - *Quién tiene acceso*: **Cualquier usuario con cuenta de Google** (o
     *Solo yo* mientras pruebas).
3. **Implementar** → **Autorizar acceso** → elige tu cuenta.
4. Aparecerá *«Google no ha verificado esta aplicación»*: **Configuración avanzada
   ▸ Ir a … (no seguro)**. Es normal en scripts propios sin verificación de marca.
5. Copia la **URL de la aplicación web** y ábrela.

### 2.6 Permisos que se solicitarán

| Scope | Para qué |
|---|---|
| `documents` | Crear y escribir el Google Doc de la planeación |
| `drive` | Carpetas, JSON de planeaciones, logotipos y exportación a PDF/Word |
| `script.external_request` | Llamar a la API de IA y al endpoint de exportación de Drive |
| `script.scriptapp` | Obtener el token con el que se exporta el documento |
| `userinfo.email` | Mostrar quién está usando la app |

---

## 3. Cómo se usa

### Paso 0 · Mis plantillas

La pantalla de inicio es una galería de tarjetas, una por plantilla, con su
unidad de procedencia, su ciclo escolar y cuántas planeaciones lleva dentro.

- **Abrir** despliega el historial de esa plantilla y el botón **＋ Nueva
  planeación**.
- **🧬 Duplicar** crea una copia con otro nombre, con el mismo membrete y su
  propia carpeta vacía: sirve para partir de una que ya funciona.
- **Papelera** manda a la papelera de Drive la plantilla *y* sus planeaciones
  (todo recuperable).

Ejemplo de uso: «Plantilla prueba» para la planeación de esta semana y
«Plantilla química» para llevar el control de todo el curso.

### Paso 1 · Membrete

Lo que no cambia entre planeaciones:

- el **nombre de la plantilla**, con el que la reconoces en la galería;
- **tres logotipos** (Secretaría de Educación, unidad de procedencia y unidad de
  enseñanza), que se suben a Drive y se insertan en el documento;
- los **datos educativos** que van como título, la **unidad de procedencia** y su
  **clave de centro de trabajo**, el **ciclo escolar** y el título
  **PLAN DE TRABAJO**;
- el bloque de **firmas**: cuántas son, cuántas van por renglón y, en cada una,
  el encabezado (`ELABORÓ DOCENTE EN FORMACIÓN`, `REVISÓ`…), el cargo y el nombre
  que va bajo la línea.

**💾 Guardar plantilla** la deja en Drive y le crea su carpeta. La última usada
se carga sola al abrir la app.

### Paso 2 · Datos

**Tabla 1** (escuela, turno, CCT, docente, practicante, nivel, grado y grupo,
ciclo escolar, campo formativo, disciplina, semanas, sesiones, tiempo por sesión
y periodo) y **tabla 2** (contenido, temas, procesos de desarrollo de
aprendizaje, ejes articuladores, campos formativos con que se vincula,
metodología, técnicas, evaluación formativa y sumativa, y cuántas fases tendrá
el proyecto).

El ciclo escolar de la plantilla se copia solo al de la tabla 1.

### Paso 3 · Proyecto y fases

**Tabla 3** (nombre del proyecto, problemática, propósito y producto final) y
**tabla 4** (una tarjeta por fase con su nombre, el **encabezado de la columna
que se construye** —cambia en cada fase—, las actividades, los recursos y las
sesiones).

El interruptor **Redactar con IA** es opcional. Encendido, el botón
**✨ Generar tablas 3 y 4** propone todo a partir de lo capturado en el paso 2, y
cada fase gana un botón **✨ Otras ideas** para rehacerla sola. Apagado, se
escribe a mano y la IA no se usa nunca.

**⚖️ Balancear sesiones** reparte las sesiones de la tabla 1 entre las fases hasta
que el contador quede en verde. Abajo va el campo de **Observaciones**.

### Paso 4 · Documento

La hoja de la derecha es el documento real:

- **arrastra** cualquier bloque por su asa (⠿) para reordenarlo, en la hoja o en
  la lista de la izquierda;
- **haz clic en cualquier celda** para escribir directamente sobre ella;
- el **ojo** oculta un bloque sin borrarlo;
- el panel de apariencia cambia orientación, papel, tipografía, tamaño y colores.

Si editas a mano, esos cambios mandan sobre los datos de los pasos anteriores;
**🔄 Rehacer desde los datos** los descarta y vuelve a construir el documento.

**✅ Confirmar planeación y generar** escribe el Google Doc en tu Drive, guarda la
planeación dentro de su plantilla y muestra los botones para **abrirla en Docs**,
**descargar el PDF** y **descargar el Word**.

### Estructura creada en Drive

```
Planeaciones Secundaria/
├── 01 Planeaciones (JSON)/
│     ├── Plantilla química [ab12cd]/     planeaciones de esa plantilla
│     └── Plantilla prueba [ef34gh]/
├── 02 Documentos generados/   los Google Docs de salida
├── 03 Plantillas/             el membrete y las firmas de cada plantilla
└── 04 Imágenes/               logotipos
```

Nada se borra de forma definitiva: «Papelera» envía el archivo a la papelera de Drive.
Si le cambias el nombre a una plantilla, su carpeta se renombra sola.

---

## 4. Cómo se arma el documento

El cliente convierte el estado en una lista de **bloques**, y esa misma lista
pinta la vista previa y viaja al servidor. Por eso lo que se ve es lo que sale.

| Bloque | Qué escribe |
|---|---|
| `logos` | Tabla sin bordes de 1 × 3 con los logotipos |
| `texto` | Renglones centrados del membrete y el `PLAN DE TRABAJO` |
| `tabla` | Tablas 1 a 4 y observaciones, con `colspan`/`rowspan` |
| `firmas` | Tabla sin bordes con encabezado, cargo, línea y nombre |
| `espacio` | Separación vertical |

Las celdas con `colspan`/`rowspan` se dibujan primero como celdas contiguas y se
fusionan después con la API avanzada de Docs (`aplicarFusiones_`), tabla por
tabla y de abajo hacia arriba para que los índices no se muevan.

---

## 5. Adaptar el tema

`Styles.html` no depende de ningún framework. Para cambiar la apariencia entera,
redefine los tokens del bloque `:root`:

```css
:root{
  --marca:        #E5397F;   /* rosa principal */
  --marca-oscura: #B81F5F;
  --marca-clara:  #FF7FB1;
  --marca-tenue:  #FDE7F0;   /* fondos suaves y encabezados de tabla */
  --acento:       #6C5CE7;   /* lila */
  --amor:         #F0357E;   /* la pantalla de bienvenida */
  --fuente-titulo:'Poppins', sans-serif;
  --fuente-texto: 'Inter', sans-serif;
}
```

Las clases de estructura son `.topbar`, `.stepper`, `.tarjeta`, `.btn`,
`.galeria`, `.plantilla-card`, `.editor`, `.panel`, `.lienzo`, `.hoja`,
`.bloque`, `.modal`, `.toast`. Puedes cambiar su CSS sin tocar el JavaScript,
siempre que conserves los `id` que usa `JavaScript.html`.

Los colores del **documento generado** (fondo y texto de los encabezados de
tabla) son otra cosa: se ajustan desde el panel «Apariencia» del paso 4, y sus
valores por defecto están en `normalizarEstilo_()` de `Documento.gs`.

---

## 6. Probar la interfaz sin desplegar

`_demo/preview.html` es la app completa con un backend simulado
(`_demo/mock.html`): sirve para ajustar diseño y comportamiento sin gastar
llamadas a la IA ni desplegar.

Después de editar `Index.html`, `Styles.html` o `JavaScript.html`, regenera el
demo desde PowerShell, en la carpeta del proyecto:

```bash
powershell -NoProfile -Command "$b=$PWD.Path; $e=New-Object System.Text.UTF8Encoding($false); $i=[IO.File]::ReadAllText(\"$b\Index.html\"); $s=[IO.File]::ReadAllText(\"$b\Styles.html\"); $j=[IO.File]::ReadAllText(\"$b\JavaScript.html\"); $m=[IO.File]::ReadAllText(\"$b\_demo\mock.html\"); $o=$i.Replace(\"<?!= include('Styles'); ?>\",$s).Replace(\"<?!= include('JavaScript'); ?>\",$m+$j).Replace(\"<?= appName ?>\",'PlaneacionesLUPITA&lt;3'); [IO.File]::WriteAllText(\"$b\_demo\preview.html\",$o,$e)"
```

Ábrelo con el servidor de desarrollo (`file://` no ejecuta los scripts):

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File _demo\servidor.ps1
```

y entra a <http://localhost:8765/preview.html>.

---

## 7. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| «Primero guarda la plantilla» | Las planeaciones viven dentro de una plantilla; guárdala en el paso «Membrete». |
| «No hay API key configurada» | La IA es opcional; cárgala en ⚙ Configuración si la quieres. |
| «Error 429 del proveedor de IA» | Límite de cuota. El script reintenta 3 veces; espera un minuto o cambia de modelo. |
| «La IA devolvió JSON inválido» | Modelo poco capaz o respuesta truncada. Baja *Actividades por fase* o usa un modelo mayor. |
| Las celdas combinadas salen separadas | Falta el servicio avanzado **Google Docs API** (paso 2.3). |
| «Drive no pudo exportar el documento» | Abre el Doc y descárgalo desde ahí; suele ser un permiso aún no autorizado. |
| La imagen no se sube | Máximo 3 MB por logotipo; usa PNG o JPG comprimido. |
| La tabla se sale de la hoja | Cambia a **Vertical** solo si caben las 4 columnas, o reduce el tamaño base. |
| Se agota el tiempo de ejecución | Apps Script corta a los 6 min. Genera menos actividades por fase. |

---

## 8. Límites conocidos

- Apps Script corta cualquier ejecución a los 6 minutos.
- `UrlFetchApp` tiene cuota diaria por cuenta; cada generación con IA consume 1 llamada
  y cada descarga, otra.
- Los logotipos se guardan en Drive y se leen en base64 para la vista previa:
  imágenes muy grandes hacen lenta la carga de la plantilla.
- Al duplicar una plantilla, la copia **comparte los archivos de imagen** con la
  original: si borras esos archivos de Drive, ambas se quedan sin logotipos.
- La descarga directa admite archivos de hasta 9 MB; por encima hay que bajarlos
  desde Drive.
