# Planeaciones Comunitarias

Plataforma web sobre Google Apps Script que genera planeaciones didácticas con la
metodología de **Proyectos Comunitarios** (NEM: 3 fases, 11 momentos), reparte los
tiempos entre las sesiones disponibles, permite maquetar la tabla con *drag & drop*
y escribe el resultado en un **Google Doc** dentro del Drive del docente.

---

## 1. Archivos del proyecto

| Archivo | Qué contiene |
|---|---|
| `appsscript.json` | Manifiesto: zona horaria, scopes, servicio avanzado de Docs, config del Web App |
| `Code.gs` | `doGet`, `include`, configuración (proveedor/modelo/API key), utilidades comunes |
| `IA.gs` | Prompts, normalización de la respuesta y adaptador Gemini / OpenAI / Anthropic |
| `Tiempos.gs` | Reparto de minutos entre actividades y empaquetado en sesiones |
| `Almacen.gs` | Persistencia en Drive: proyectos (JSON), plantillas y carpetas |
| `Documento.gs` | Construcción del Google Doc, estilos, fusión de celdas y exportación a PDF |
| `Index.html` | Estructura del frontend (4 pasos + modales) |
| `Styles.html` | Estilos. **Todo el tema vive en los tokens de `:root`** |
| `JavaScript.html` | Wizard, drag & drop, editor de rejilla, vista previa y llamadas al servidor |
| `_demo/` | Banco de pruebas local con backend simulado. **No se sube a Apps Script** |

---

## 2. Instalación paso a paso

### 2.1 Crear el proyecto

1. Entra a <https://script.google.com> → **Nuevo proyecto**.
2. Ponle nombre: `Planeaciones Comunitarias`.
3. Menú ⚙ **Configuración del proyecto** → activa
   *«Mostrar el archivo de manifiesto appsscript.json en el editor»*.

### 2.2 Copiar los archivos

En el editor, crea cada archivo con **exactamente** estos nombres (sin la extensión
`.gs`/`.html`, que el editor añade solo):

- Scripts (`Archivo ▸ Secuencia de comandos`): `Code`, `IA`, `Tiempos`, `Almacen`, `Documento`
- HTML (`Archivo ▸ HTML`): `Index`, `Styles`, `JavaScript`

Pega el contenido de cada archivo de esta carpeta en el que le corresponde y
sustituye el `appsscript.json` por el de aquí.

> Si usas [`clasp`](https://github.com/google/clasp), basta con `clasp create` y
> `clasp push` desde esta carpeta. Añade `_demo/` y `README.md` a `.claspignore`.

### 2.3 Activar el servicio avanzado de Google Docs

Necesario **solo** para que las celdas combinadas se fusionen de verdad en el
documento. Sin él, la planeación se genera igual, pero las celdas combinadas
aparecen como celdas vacías contiguas.

1. En el panel izquierdo, **Servicios** → ＋.
2. Elige **Google Docs API**, deja el identificador `Docs`, versión `v1` → **Añadir**.

Si copiaste el `appsscript.json` de esta carpeta, el servicio ya viene declarado.

### 2.4 Obtener una API key de IA

| Proveedor | Dónde se obtiene | Modelo sugerido |
|---|---|---|
| Google Gemini | <https://aistudio.google.com/apikey> | `gemini-2.0-flash` |
| OpenAI | <https://platform.openai.com/api-keys> | `gpt-4o` |
| Anthropic | <https://console.anthropic.com/settings/keys> | `claude-sonnet-4-5` |

Gemini es la opción más simple: la cuenta de Google ya está a la mano y su capa
gratuita alcanza para el uso normal de una escuela.

### 2.5 Desplegar como aplicación web

1. **Implementar ▸ Nueva implementación** → tipo **Aplicación web**.
2. Configura:
   - *Ejecutar como*: **Usuario que accede** — así cada docente guarda en **su
     propio Drive**. Cámbialo a *Yo* solo si quieres que todo se concentre en una
     sola cuenta.
   - *Quién tiene acceso*: **Cualquier usuario con cuenta de Google** (o
     *Solo yo* mientras pruebas).
3. **Implementar** → **Autorizar acceso** → elige tu cuenta.
4. Aparecerá *«Google no ha verificado esta aplicación»*: **Configuración avanzada
   ▸ Ir a Planeaciones Comunitarias (no seguro)**. Es normal en scripts propios sin
   verificación de marca.
5. Copia la **URL de la aplicación web** y ábrela.

### 2.6 Cargar la API key desde la interfaz

En la app: botón **⚙ Configuración** → elige proveedor y modelo, pega la clave →
**Guardar** → **Probar conexión** (debe responder `CONEXION_OK`).

La clave se guarda en las *Script Properties*, no en el navegador ni en el
documento generado. Para eliminarla, escribe `BORRAR` en el campo y guarda.

> **Importante con «Ejecutar como: Usuario que accede»**: la API key es una sola,
> compartida por todos los usuarios del despliegue, y solo la puede escribir quien
> tenga acceso de edición al script. Si vas a repartir la app a muchos docentes,
> considera facturar el consumo de esa clave a la escuela.

### 2.7 Permisos que se solicitarán

| Scope | Para qué |
|---|---|
| `documents` | Crear y escribir el Google Doc de la planeación |
| `drive` | Crear las carpetas, guardar los JSON y mover los documentos |
| `script.external_request` | Llamar a la API de IA |
| `userinfo.email` | Mostrar quién está usando la app |

---

## 3. Cómo se usa

**Paso 1 · Insumos.** Tema/problemática, nivel, grado, características del grupo,
recursos reales, contexto comunitario, número de sesiones y minutos por sesión.
La IA devuelve la explicación del tema y 1–3 actividades por cada uno de los 11
momentos.

**Paso 2 · Actividades y tiempos.** Cada actividad es una tarjeta con casilla de
selección. Al marcar o desmarcar, los tiempos se recalculan solos y se reparten
entre las sesiones. Tres modos: *proporcional*, *equitativo* y *manual*. El botón
**Otras ideas** regenera un momento concreto sin repetir lo ya propuesto.

**Paso 3 · Diseñador de plantilla.** La columna izquierda son los bloques de datos
(explicación, momentos, actividades, tiempos, evaluación, recursos, datos
institucionales). Se arrastran a las celdas de la tabla. También puedes:

- escribir texto libre en cualquier celda;
- usar marcadores tipo `{{explicacion_resumen}}` dentro del texto — el nombre exacto
  aparece en el *tooltip* de cada bloque;
- añadir/quitar filas y columnas, combinar celdas horizontal o verticalmente,
  marcar celdas como encabezado y cambiar fondo, color, alineación y tamaño;
- partir de un **diseño base** (clásica por momentos, por sesiones, por fases o ficha
  compacta) y modificarlo;
- guardar el maquetado con **💾 Guardar maquetado** para reutilizarlo en otras
  planeaciones.

**Paso 4 · Documento.** Vista previa fiel y botón **Generar en Google Docs**. Opciones:
actualizar el documento anterior en lugar de crear otro, exportar también a PDF y
añadir anexos (evaluación, recursos y agenda de sesiones).

### Estructura creada en Drive

```
Planeaciones Comunitarias/
├── 01 Proyectos (JSON)/      estado completo y reutilizable de cada planeación
├── 02 Documentos generados/  los Google Docs y PDF de salida
└── 03 Plantillas/            maquetados guardados del editor
```

Nada se borra de forma definitiva: «Papelera» envía el archivo a la papelera de Drive.

---

## 4. Adaptar una plantilla web externa

`Styles.html` no depende de ningún framework. Para aplicar el tema de una plantilla
comprada (Coso u otra), redefine los tokens del bloque `:root`:

```css
:root{
  --marca:        #E5397F;   /* color principal */
  --marca-oscura: #B81F5F;
  --marca-clara:  #FF7FB1;
  --marca-tenue:  #FDE7F0;   /* fondos suaves y encabezados */
  --acento:       #6C5CE7;
  --acento-tenue: #EFECFF;
  --fuente-titulo:'Poppins', sans-serif;
  --fuente-texto: 'Inter', sans-serif;
}
```

Con eso cambia toda la interfaz. Si quieres ir más lejos:

- **Sustituir componentes**: las clases de estructura son `.topbar`, `.stepper`,
  `.tarjeta`, `.btn`, `.editor`, `.paleta`, `.tablero`, `.props`, `.modal`, `.toast`.
  Puedes cambiar su CSS sin tocar el JavaScript, siempre que conserves los `id`
  usados por `JavaScript.html`.
- **Bootstrap o Tailwind**: añade el `<link>`/`<script>` del CDN en el `<head>` de
  `Index.html` y neutraliza los estilos que sobren. Recuerda que Apps Script sirve
  la página dentro de un iframe con CSP: usa CDNs con HTTPS.
- **Fuentes**: ya se cargan Poppins e Inter desde Google Fonts en `Index.html`.

---

## 5. Probar la interfaz sin desplegar

`_demo/preview.html` es la app completa con un backend simulado (`_demo/mock.html`):
sirve para ajustar diseño y comportamiento sin gastar llamadas a la IA ni desplegar.
Ábrelo directamente en el navegador.

Después de editar `Index.html`, `Styles.html` o `JavaScript.html`, regenera el demo
desde PowerShell, en la carpeta del proyecto:

```bash
powershell -Command "$b=$PWD.Path; $e=New-Object System.Text.UTF8Encoding($false); $i=[IO.File]::ReadAllText(\"$b\Index.html\"); $s=[IO.File]::ReadAllText(\"$b\Styles.html\"); $j=[IO.File]::ReadAllText(\"$b\JavaScript.html\"); $m=[IO.File]::ReadAllText(\"$b\_demo\mock.html\"); $o=$i.Replace(\"<?!= include('Styles'); ?>\",$s).Replace(\"<?!= include('JavaScript'); ?>\",$m+$j).Replace(\"<?= appName ?>\",'Demo'); [IO.File]::WriteAllText(\"$b\_demo\preview.html\",$o,$e)"
```

---

## 6. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| «No hay API key configurada» | Cárgala en ⚙ Configuración. Solo quien edita el script puede escribirla. |
| «Error 429 del proveedor de IA» | Límite de cuota. El script reintenta 3 veces; espera un minuto o cambia de modelo. |
| «La IA devolvió JSON inválido» | Modelo poco capaz o respuesta truncada. Baja *Actividades por momento* a 1 o usa un modelo mayor. |
| Gemini «no devolvió contenido» | Filtros de seguridad. Reformula el tema evitando términos sensibles. |
| Las celdas combinadas salen separadas en el Doc | Falta el servicio avanzado **Google Docs API** (paso 2.3). |
| Se agota el tiempo de ejecución | Apps Script corta a los 6 min. Genera menos actividades por momento. |
| La tabla se sale de la hoja | Cambia a orientación **Horizontal** en *Estilo del documento* o reduce columnas. |

---

## 7. Límites conocidos

- Apps Script corta cualquier ejecución a los 6 minutos; los prompts están
  dimensionados muy por debajo de ese límite.
- `UrlFetchApp` tiene una cuota diaria por cuenta (20 000 llamadas en cuentas de
  Workspace, 20 000 en gratuitas); cada planeación consume 1 llamada.
- Las duraciones se redondean a múltiplos de 5 minutos.
- El documento se genera con `DocumentApp`; las fusiones de celdas requieren el
  servicio avanzado de Docs y se aplican después de escribir la tabla.
