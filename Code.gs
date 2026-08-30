/**
 * ============================================================================
 *  PlaneacionesLUPITA<3  ·  Code.gs
 *  Punto de entrada del Web App + configuración global + utilidades comunes.
 *
 *  Archivos del proyecto:
 *    Code.gs        -> doGet, include, configuración, catálogos, utilidades
 *    IA.gs          -> generación OPCIONAL del proyecto y sus fases (tablas 3 y 4)
 *    Tiempos.gs     -> reparto de sesiones entre las fases del proyecto
 *    Almacen.gs     -> persistencia en Drive (planeaciones, plantillas, imágenes)
 *    Documento.gs   -> construcción del Google Doc por bloques
 *    Index.html     -> estructura del frontend
 *    Styles.html    -> estilos (tokens CSS intercambiables)
 *    JavaScript.html-> wizard, editor arrastrable, vista previa
 * ============================================================================
 */

var APP = {
  nombre: 'PlaneacionesLUPITA<3',
  version: '2.0.0',
  carpetaRaiz: 'Planeaciones Secundaria',
  subcarpetaProyectos: '01 Planeaciones (JSON)',
  subcarpetaDocumentos: '02 Documentos generados'
};

/** Claves usadas en ScriptProperties / UserProperties. */
var K = {
  PROVEEDOR: 'IA_PROVEEDOR',   // gemini | openai | anthropic
  MODELO:    'IA_MODELO',
  API_KEY:   'IA_API_KEY',
  CARPETA:   'DRIVE_CARPETA_ID',
  PLANTILLA: 'PLANTILLA_ACTIVA'   // id del archivo de plantilla institucional
};

/* --------------------------------------------------------------- Catálogos
 * Listas fijas del formato oficial. El frontend las pide una sola vez.
 */

var EJES_ARTICULADORES = [
  'Inclusión',
  'Interculturalidad crítica',
  'Igualdad de género',
  'Pensamiento crítico',
  'Vida saludable',
  'Artes y experiencias estéticas',
  'Apropiación de las culturas a través de la lectura y escritura'
];

var CAMPOS_FORMATIVOS = [
  'Saberes y pensamiento científico',
  'Lenguajes',
  'Ética, Naturaleza y Sociedades',
  'De lo humano y lo comunitario'
];

/** Nombres sugeridos para las fases; el docente puede cambiarlos. */
var FASES_SUGERIDAS = [
  { fase: 'Fase 1. Introducción al tema y a la forma de trabajo.',
    construir: 'Selección / identificación / negociación del tema' },
  { fase: 'Fase 2. Exploración y construcción del conocimiento.',
    construir: 'Diseño de la investigación · Desarrollo y exploración' },
  { fase: 'Fase 3. Representación y experimentación.',
    construir: 'Representación' },
  { fase: 'Fase 4. Demostración de lo aprendido.',
    construir: 'Actividades' },
  { fase: 'Fase 5. Metacognición.',
    construir: 'Metacognición' },
  { fase: 'Fase 6. Difusión y cierre.',
    construir: 'Difusión de resultados' },
  { fase: 'Fase 7. Seguimiento.',
    construir: 'Seguimiento y mejora' }
];

/** Firmas que trae por defecto el formato del CREN. */
var FIRMAS_POR_DEFECTO = [
  { rol: 'ELABORÓ DOCENTE EN FORMACIÓN',
    detalle: 'LIC. EN ENSEÑANZA Y APRENDIZAJE DE LA QUÍMICA EN EDUCACIÓN SECUNDARIA',
    nombre: 'C. GUADALUPE LUGO TINOCO' },
  { rol: 'REVISÓ',
    detalle: 'COORDINADORA DEL CURSO ESTRATEGIAS DE TRABAJO DOCENTE Y SABERES PEDAGÓGICOS',
    nombre: '' },
  { rol: 'REVISÓ',
    detalle: 'TITULAR DE LA DISCIPLINA',
    nombre: '' }
];

function obtenerCatalogos() {
  return {
    ejes: EJES_ARTICULADORES,
    campos: CAMPOS_FORMATIVOS,
    fasesSugeridas: FASES_SUGERIDAS,
    firmasPorDefecto: FIRMAS_POR_DEFECTO,
    cicloSugerido: cicloEscolarSugerido_()
  };
}

/** Ciclo escolar en curso: agosto marca el cambio de año lectivo. */
function cicloEscolarSugerido_() {
  var hoy = new Date();
  var anio = hoy.getFullYear();
  var inicio = (hoy.getMonth() >= 7) ? anio : anio - 1;
  return inicio + '-' + (inicio + 1);
}

/* ---------------------------------------------------------------- Web App */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.nombre;
  t.appVersion = APP.version;
  return t.evaluate()
    .setTitle(APP.nombre)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, shrink-to-fit=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Permite <?!= include('Styles') ?> dentro de Index.html */
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

/* ------------------------------------------------------------ Preferencias
 * La API key vive en ScriptProperties (compartida por el despliegue).
 * La plantilla activa y la carpeta viven en UserProperties (por docente).
 */

function obtenerConfiguracion() {
  var sp = PropertiesService.getScriptProperties();
  var apiKey = sp.getProperty(K.API_KEY) || '';

  return {
    proveedor: sp.getProperty(K.PROVEEDOR) || 'gemini',
    modelo: sp.getProperty(K.MODELO) || modeloPorDefecto_(sp.getProperty(K.PROVEEDOR) || 'gemini'),
    tieneApiKey: !!apiKey,
    apiKeyMascara: apiKey ? apiKey.slice(0, 4) + '••••••••' + apiKey.slice(-4) : '',
    usuario: obtenerCorreoUsuario_(),
    version: APP.version
  };
}

/**
 * Guarda la configuración de IA. Solo el propietario del script debería usarla.
 * @param {{proveedor:string, modelo:string, apiKey:string}} cfg
 */
function guardarConfiguracion(cfg) {
  var sp = PropertiesService.getScriptProperties();
  if (cfg.proveedor) sp.setProperty(K.PROVEEDOR, cfg.proveedor);
  if (cfg.modelo) sp.setProperty(K.MODELO, cfg.modelo);
  // Cadena vacía = "no cambiar"; la palabra BORRAR elimina la llave.
  if (cfg.apiKey === 'BORRAR') sp.deleteProperty(K.API_KEY);
  else if (cfg.apiKey) sp.setProperty(K.API_KEY, cfg.apiKey.trim());
  return obtenerConfiguracion();
}

function modeloPorDefecto_(proveedor) {
  switch (proveedor) {
    case 'openai':    return 'gpt-4o';
    case 'anthropic': return 'claude-sonnet-4-5';
    default:          return 'gemini-2.0-flash';
  }
}

function obtenerCorreoUsuario_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (err) { return ''; }
}

/* ------------------------------------------------------------- Utilidades */

/** Extrae el primer objeto JSON válido de una respuesta de IA. */
function extraerJson_(texto) {
  if (!texto) throw new Error('La IA devolvió una respuesta vacía.');
  var limpio = String(texto).trim();

  // Quita cercos de código con acentos graves.
  limpio = limpio.replace(/^`{3}(?:json)?\s*/i, '').replace(/`{3}\s*$/, '').trim();

  try { return JSON.parse(limpio); } catch (err) { /* seguimos intentando */ }

  // Rescate: recorta desde la primera { hasta la última }.
  var inicio = limpio.indexOf('{');
  var fin = limpio.lastIndexOf('}');
  if (inicio === -1 || fin === -1 || fin <= inicio) {
    throw new Error('No fue posible interpretar la respuesta de la IA como JSON.');
  }
  var recorte = limpio.substring(inicio, fin + 1);
  try {
    return JSON.parse(recorte);
  } catch (err2) {
    throw new Error('La IA devolvió JSON inválido: ' + err2.message);
  }
}

/** Sanea texto que se escribirá en el documento. */
function limpiarTexto_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\r\n/g, '\n').trim();
}

function idCorto_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function fechaLegible_(fecha) {
  return Utilities.formatDate(fecha || new Date(), APP_TZ_(), 'dd/MM/yyyy HH:mm');
}

function APP_TZ_() {
  try { return Session.getScriptTimeZone(); } catch (e) { return 'America/Mexico_City'; }
}

/** Envuelve una llamada del cliente y devuelve siempre {ok, data|error}. */
function envolver_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    console.error(err.stack || err);
    return { ok: false, error: (err && err.message) ? err.message : String(err) };
  }
}
