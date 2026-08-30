/**
 * ============================================================================
 *  Almacen.gs · Persistencia en Google Drive.
 *  Estructura creada en el Drive de cada docente:
 *
 *    Planeaciones Comunitarias/
 *      ├── 01 Proyectos (JSON)/      <- estado completo, reutilizable
 *      ├── 02 Documentos generados/  <- Google Docs de salida
 *      └── 03 Plantillas/            <- maquetados guardados del editor
 * ============================================================================
 */

var SUBCARPETA_PLANTILLAS = '03 Plantillas';

/* ------------------------------------------------------------- Carpetas */

function carpetaRaiz_() {
  var up = PropertiesService.getUserProperties();
  var id = up.getProperty(K.CARPETA);

  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) {
      // La carpeta fue borrada o ya no es accesible: se recrea abajo.
    }
  }

  var carpeta = buscarOCrearCarpeta_(DriveApp.getRootFolder(), APP.carpetaRaiz);
  up.setProperty(K.CARPETA, carpeta.getId());
  return carpeta;
}

function buscarOCrearCarpeta_(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function carpetaProyectos_()  { return buscarOCrearCarpeta_(carpetaRaiz_(), APP.subcarpetaProyectos); }
function carpetaDocumentos_() { return buscarOCrearCarpeta_(carpetaRaiz_(), APP.subcarpetaDocumentos); }
function carpetaPlantillas_() { return buscarOCrearCarpeta_(carpetaRaiz_(), SUBCARPETA_PLANTILLAS); }

/** Devuelve el enlace a la carpeta raíz para mostrarlo en la interfaz. */
function obtenerCarpetaDrive() {
  return envolver_(function () {
    var c = carpetaRaiz_();
    return { id: c.getId(), nombre: c.getName(), url: c.getUrl() };
  });
}

/* ------------------------------------------------------------ Proyectos */

/**
 * Guarda (o actualiza) el estado completo de una planeación.
 * @param {Object} estado {id, proyecto, distribucion, plantilla, meta, archivoId}
 */
function guardarProyecto(estado) {
  return envolver_(function () {
    if (!estado || !estado.proyecto) throw new Error('No hay ningún proyecto que guardar.');

    estado.id = estado.id || estado.proyecto.id || idCorto_();
    estado.actualizado = new Date().toISOString();
    estado.creado = estado.creado || estado.actualizado;
    estado.appVersion = APP.version;

    var nombre = nombreArchivo_(estado) + '.json';
    var contenido = JSON.stringify(estado, null, 2);
    var carpeta = carpetaProyectos_();
    var archivo = null;

    if (estado.archivoId) {
      try {
        archivo = DriveApp.getFileById(estado.archivoId);
        if (archivo.isTrashed()) archivo = null;
      } catch (err) {
        archivo = null;
      }
    }

    if (archivo) {
      archivo.setContent(contenido);
      if (archivo.getName() !== nombre) archivo.setName(nombre);
    } else {
      archivo = carpeta.createFile(nombre, contenido, MimeType.PLAIN_TEXT);
    }

    return {
      archivoId: archivo.getId(),
      nombre: archivo.getName(),
      url: archivo.getUrl(),
      actualizado: estado.actualizado
    };
  });
}

function listarProyectos() {
  return envolver_(function () {
    var it = carpetaProyectos_().getFilesByType(MimeType.PLAIN_TEXT);
    var lista = [];

    while (it.hasNext()) {
      var f = it.next();
      if (f.getName().slice(-5).toLowerCase() !== '.json') continue;

      var resumen = {
        archivoId: f.getId(),
        nombre: f.getName().replace(/\.json$/i, ''),
        actualizado: f.getLastUpdated().toISOString(),
        url: f.getUrl(),
        titulo: '',
        nivel: '',
        docId: ''
      };

      // Metadatos ligeros para las tarjetas de la biblioteca.
      try {
        var datos = JSON.parse(f.getBlob().getDataAsString());
        resumen.titulo = (datos.proyecto && datos.proyecto.tituloProyecto) || resumen.nombre;
        resumen.nivel = (datos.proyecto && datos.proyecto.insumos && datos.proyecto.insumos.nivel) || '';
        resumen.docId = datos.docId || '';
        resumen.docUrl = datos.docUrl || '';
      } catch (err) {
        resumen.titulo = resumen.nombre;
      }

      lista.push(resumen);
    }

    lista.sort(function (a, b) { return b.actualizado.localeCompare(a.actualizado); });
    return lista;
  });
}

function cargarProyecto(archivoId) {
  return envolver_(function () {
    var f = DriveApp.getFileById(archivoId);
    var estado = JSON.parse(f.getBlob().getDataAsString());
    estado.archivoId = f.getId();
    return estado;
  });
}

function eliminarProyecto(archivoId) {
  return envolver_(function () {
    // Se envía a la papelera, nunca se borra de forma definitiva.
    DriveApp.getFileById(archivoId).setTrashed(true);
    return { archivoId: archivoId, enPapelera: true };
  });
}

function duplicarProyecto(archivoId) {
  return envolver_(function () {
    var original = DriveApp.getFileById(archivoId);
    var estado = JSON.parse(original.getBlob().getDataAsString());

    estado.id = idCorto_();
    estado.archivoId = null;
    estado.docId = '';
    estado.docUrl = '';
    estado.creado = new Date().toISOString();
    if (estado.proyecto) {
      estado.proyecto.tituloProyecto = (estado.proyecto.tituloProyecto || 'Proyecto') + ' (copia)';
    }

    var copia = carpetaProyectos_().createFile(
      nombreArchivo_(estado) + '.json',
      JSON.stringify(estado, null, 2),
      MimeType.PLAIN_TEXT
    );
    return { archivoId: copia.getId(), nombre: copia.getName(), url: copia.getUrl() };
  });
}

function nombreArchivo_(estado) {
  var titulo = (estado.proyecto && estado.proyecto.tituloProyecto) || 'Planeación';
  var limpio = String(titulo).replace(/[\\/:*?"<>|]/g, '-').substring(0, 80).trim();
  return limpio + ' — ' + estado.id;
}

/* ------------------------------------------------------------ Plantillas
 * Solo se guarda el maquetado (rejilla + estilos), sin contenido del proyecto,
 * para poder reutilizar el formato institucional en otras planeaciones.
 */

function guardarPlantilla(nombre, plantilla) {
  return envolver_(function () {
    if (!limpiarTexto_(nombre)) throw new Error('Ponle un nombre a la plantilla.');

    var payload = {
      nombre: limpiarTexto_(nombre),
      guardado: new Date().toISOString(),
      appVersion: APP.version,
      plantilla: plantilla
    };

    var carpeta = carpetaPlantillas_();
    var archivoNombre = limpiarTexto_(nombre).replace(/[\\/:*?"<>|]/g, '-') + '.json';
    var it = carpeta.getFilesByName(archivoNombre);
    var contenido = JSON.stringify(payload, null, 2);

    var archivo = it.hasNext() ? it.next() : null;
    if (archivo) archivo.setContent(contenido);
    else archivo = carpeta.createFile(archivoNombre, contenido, MimeType.PLAIN_TEXT);

    return { archivoId: archivo.getId(), nombre: payload.nombre };
  });
}

function listarPlantillas() {
  return envolver_(function () {
    var it = carpetaPlantillas_().getFilesByType(MimeType.PLAIN_TEXT);
    var lista = [];
    while (it.hasNext()) {
      var f = it.next();
      if (f.getName().slice(-5).toLowerCase() !== '.json') continue;
      lista.push({
        archivoId: f.getId(),
        nombre: f.getName().replace(/\.json$/i, ''),
        actualizado: f.getLastUpdated().toISOString()
      });
    }
    lista.sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    return lista;
  });
}

function cargarPlantilla(archivoId) {
  return envolver_(function () {
    var f = DriveApp.getFileById(archivoId);
    return JSON.parse(f.getBlob().getDataAsString());
  });
}

function eliminarPlantilla(archivoId) {
  return envolver_(function () {
    DriveApp.getFileById(archivoId).setTrashed(true);
    return { archivoId: archivoId, enPapelera: true };
  });
}
