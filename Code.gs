/**
 * ============================================================================
 *  PLANEACIONES COMUNITARIAS  ·  Code.gs
 *  Punto de entrada del Web App + configuración global + utilidades comunes.
 *
 *  Archivos del proyecto:
 *    Code.gs        -> doGet, include, configuración, utilidades
 *    IA.gs          -> adaptador multi-proveedor (Gemini / OpenAI / Anthropic)
 *    Tiempos.gs     -> distribución automática de tiempos por sesión
 *    Almacen.gs     -> persistencia en Google Drive (JSON de proyectos)
 *    Documento.gs   -> construcción del Google Doc a partir de la plantilla
 *    Index.html     -> estructura del frontend
 *    Styles.html    -> estilos (tokens CSS intercambiables)
 *    JavaScript.html-> lógica de cliente (wizard, drag & drop, editor)
 * ============================================================================
 */

var APP = {
  nombre: 'Planeaciones Comunitarias',
  version: '1.0.0',
  carpetaRaiz: 'Planeaciones Comunitarias',
  subcarpetaProyectos: '01 Proyectos (JSON)',
  subcarpetaDocumentos: '02 Documentos generados'
};

/** Claves usadas en ScriptProperties / UserProperties. */
var K = {
  PROVEEDOR: 'IA_PROVEEDOR',   // gemini | openai | anthropic
  MODELO:    'IA_MODELO',
  API_KEY:   'IA_API_KEY',
  CARPETA:   'DRIVE_CARPETA_ID'
};

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
 * Los datos institucionales del docente viven en UserProperties (por usuario).
 */

function obtenerConfiguracion() {
  var sp = PropertiesService.getScriptProperties();
  var up = PropertiesService.getUserProperties();
  var apiKey = sp.getProperty(K.API_KEY) || '';
  var perfil = up.getProperty('PERFIL_DOCENTE');

  return {
    proveedor: sp.getProperty(K.PROVEEDOR) || 'gemini',
    modelo: sp.getProperty(K.MODELO) || modeloPorDefecto_(sp.getProperty(K.PROVEEDOR) || 'gemini'),
    tieneApiKey: !!apiKey,
    apiKeyMascara: apiKey ? apiKey.slice(0, 4) + '••••••••' + apiKey.slice(-4) : '',
    perfil: perfil ? JSON.parse(perfil) : null,
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

/** Datos institucionales del docente, persistidos por usuario. */
function guardarPerfilDocente(perfil) {
  PropertiesService.getUserProperties()
    .setProperty('PERFIL_DOCENTE', JSON.stringify(perfil || {}));
  return { ok: true };
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

  // Quita cercos de código ```json ... ```
  limpio = limpio.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  try { return JSON.parse(limpio); } catch (err) { /* seguimos intentando */ }

  // Rescate: recorta desde la primera { hasta la última } balanceada.
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
  return Utilities.formatDate(fecha || new Date(), APP_TZ_(), "dd/MM/yyyy HH:mm");
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
