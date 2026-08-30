/**
 * ============================================================================
 *  Almacen.gs · Persistencia en Google Drive.
 *
 *  Cada PLANTILLA (el membrete de una unidad escolar) es una carpeta con sus
 *  propias planeaciones dentro, para que el historial quede agrupado:
 *
 *    Planeaciones Secundaria/
 *      ├── 01 Planeaciones (JSON)/
 *      │     ├── Química · Sec. 128 [ab12cd]/   <- planeaciones de esa plantilla
 *      │     └── Plantilla prueba [ef34gh]/
 *      ├── 02 Documentos generados/  <- Google Docs de salida
 *      ├── 03 Plantillas/            <- el membrete y las firmas (JSON)
 *      └── 04 Imágenes/              <- logotipos de las plantillas
 * ============================================================================
 */

var SUBCARPETA_PLANTILLAS = '03 Plantillas';
var SUBCARPETA_IMAGENES   = '04 Imágenes';

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
function carpetaImagenes_()   { return buscarOCrearCarpeta_(carpetaRaiz_(), SUBCARPETA_IMAGENES); }

/** Devuelve el enlace a la carpeta raíz para mostrarlo en la interfaz. */
function obtenerCarpetaDrive() {
  return envolver_(function () {
    var c = carpetaRaiz_();
    return { id: c.getId(), nombre: c.getName(), url: c.getUrl() };
  });
}

/* ---------------------------------------------------------- Planeaciones */

/**
 * Carpeta donde viven las planeaciones de una plantilla. Si la plantilla aún no
 * tiene carpeta, se crea; si le cambiaron el nombre, se renombra.
 *
 * @param {{id:string, nombre:string, carpetaId:string}} plantilla
 * @return {Folder}
 */
function carpetaDePlantilla_(plantilla) {
  var raiz = carpetaProyectos_();
  if (!plantilla || !plantilla.id) return raiz;

  var nombre = (limpiarTexto_(plantilla.nombre) || 'Plantilla')
    .replace(/[\\/:*?"<>|]/g, '-').substring(0, 80) + ' [' + plantilla.id + ']';

  if (plantilla.carpetaId) {
    try {
      var existente = DriveApp.getFolderById(plantilla.carpetaId);
      if (!existente.isTrashed()) {
        if (existente.getName() !== nombre) existente.setName(nombre);
        return existente;
      }
    } catch (err) {
      // La carpeta ya no existe: se recrea abajo.
    }
  }

  var carpeta = buscarOCrearCarpeta_(raiz, nombre);
  plantilla.carpetaId = carpeta.getId();
  return carpeta;
}

/**
 * Guarda (o actualiza) el estado completo de una planeación, dentro de la
 * carpeta de su plantilla.
 *
 * @param {Object} estado {id, archivoId, docId, plantilla, datos, contenido,
 *                         proyecto, fases, observaciones, usarIA, bloques}
 */
function guardarPlaneacion(estado) {
  return envolver_(function () {
    if (!estado) throw new Error('No hay ninguna planeación que guardar.');

    estado.id = estado.id || idCorto_();
    estado.actualizado = fechaLegible_(new Date());
    estado.version = APP.version;

    var carpeta = carpetaDePlantilla_(estado.plantilla);
    var nombre = nombreArchivo_(estado);
    var json = JSON.stringify(estado);

    if (estado.archivoId) {
      try {
        var existente = DriveApp.getFileById(estado.archivoId);
        existente.setContent(json);
        existente.setName(nombre);
        // Si cambió de plantilla, la planeación se muda de carpeta.
        if (existente.getParents().next().getId() !== carpeta.getId()) {
          moverA_(existente, carpeta);
        }
        return { archivoId: existente.getId(), nombre: nombre, url: existente.getUrl(),
                 carpetaId: carpeta.getId() };
      } catch (err) {
        // El archivo ya no existe: se crea uno nuevo abajo.
      }
    }

    var nuevo = carpeta.createFile(nombre, json, MimeType.PLAIN_TEXT);
    return { archivoId: nuevo.getId(), nombre: nombre, url: nuevo.getUrl(),
             carpetaId: carpeta.getId() };
  });
}

/**
 * Planeaciones de una plantilla. Sin `carpetaId` devuelve las que estén
 * sueltas en la raíz (planeaciones antiguas, sin plantilla asociada).
 */
function listarPlaneaciones(carpetaId) {
  return envolver_(function () {
    var carpeta;
    try {
      carpeta = carpetaId ? DriveApp.getFolderById(carpetaId) : carpetaProyectos_();
    } catch (err) {
      return [];   // La carpeta fue borrada: la plantilla aún no tiene historial.
    }

    var archivos = carpeta.getFiles();
    var lista = [];

    while (archivos.hasNext()) {
      var a = archivos.next();
      if (a.isTrashed()) continue;

      var resumen = { archivoId: a.getId(), nombre: a.getName(), url: a.getUrl(),
                      actualizado: fechaLegible_(a.getLastUpdated()) };
      try {
        var e = JSON.parse(a.getBlob().getDataAsString());
        resumen.escuela = (e.datos || {}).escuela || '';
        resumen.gradoGrupo = (e.datos || {}).gradoGrupo || '';
        resumen.disciplina = (e.datos || {}).disciplina || '';
        resumen.periodo = (e.datos || {}).periodo || '';
        resumen.proyecto = (e.proyecto || {}).nombre || '';
        resumen.fases = (e.fases || []).length;
        resumen.docId = e.docId || '';
      } catch (err) {
        resumen.error = 'El archivo no es una planeación válida.';
      }
      lista.push(resumen);
    }

    lista.sort(function (a, b) { return a.actualizado < b.actualizado ? 1 : -1; });
    return lista;
  });
}

/** Cuántas planeaciones tiene una plantilla, para pintarlo en su tarjeta. */
function contarPlaneaciones_(carpetaId) {
  if (!carpetaId) return 0;
  try {
    var archivos = DriveApp.getFolderById(carpetaId).getFiles();
    var n = 0;
    while (archivos.hasNext()) { if (!archivos.next().isTrashed()) n++; }
    return n;
  } catch (err) {
    return 0;
  }
}

function cargarPlaneacion(archivoId) {
  return envolver_(function () {
    var estado = JSON.parse(DriveApp.getFileById(archivoId).getBlob().getDataAsString());
    estado.archivoId = archivoId;
    return estado;
  });
}

function eliminarPlaneacion(archivoId) {
  return envolver_(function () {
    DriveApp.getFileById(archivoId).setTrashed(true);
    return { eliminado: true };
  });
}

function duplicarPlaneacion(archivoId) {
  return envolver_(function () {
    var estado = JSON.parse(DriveApp.getFileById(archivoId).getBlob().getDataAsString());
    estado.id = idCorto_();
    estado.archivoId = null;
    estado.docId = null;   // la copia genera su propio documento
    var proyecto = estado.proyecto || (estado.proyecto = {});
    proyecto.nombre = (proyecto.nombre || 'Planeación') + ' (copia)';

    var carpeta = carpetaDePlantilla_(estado.plantilla);
    var nombre = nombreArchivo_(estado);
    var nuevo = carpeta.createFile(nombre, JSON.stringify(estado), MimeType.PLAIN_TEXT);
    estado.archivoId = nuevo.getId();
    return estado;
  });
}

function nombreArchivo_(estado) {
  var d = estado.datos || {};
  var partes = [
    limpiarTexto_(d.gradoGrupo),
    limpiarTexto_(d.disciplina),
    limpiarTexto_((estado.proyecto || {}).nombre) || limpiarTexto_((estado.contenido || {}).temas)
  ].filter(function (t) { return t; });

  var base = partes.join(' · ').substring(0, 90) || 'Planeación';
  return base.replace(/[\\/:*?"<>|]/g, '-') + ' [' + estado.id + '].json';
}

/* ------------------------------------------- Plantillas institucionales
 * Guardan solo el encabezado (logos, textos, ciclo) y el bloque de firmas,
 * para reutilizarlos entre unidades escolares distintas.
 */

function guardarPlantilla(plantilla) {
  return envolver_(function () {
    if (!plantilla || !limpiarTexto_(plantilla.nombre)) {
      throw new Error('Ponle un nombre a la plantilla antes de guardarla.');
    }

    plantilla.id = plantilla.id || idCorto_();
    plantilla.actualizado = fechaLegible_(new Date());

    // Crea (o renombra) la carpeta donde vivirán sus planeaciones.
    carpetaDePlantilla_(plantilla);

    var nombreArchivo = limpiarTexto_(plantilla.nombre)
      .replace(/[\\/:*?"<>|]/g, '-').substring(0, 80) + ' [' + plantilla.id + '].json';
    var json = JSON.stringify(plantilla);

    if (plantilla.archivoId) {
      try {
        var existente = DriveApp.getFileById(plantilla.archivoId);
        existente.setContent(json);
        existente.setName(nombreArchivo);
        marcarPlantillaActiva_(existente.getId());
        return { archivoId: existente.getId(), nombre: plantilla.nombre,
                 id: plantilla.id, carpetaId: plantilla.carpetaId };
      } catch (err) {
        // Se recrea abajo.
      }
    }

    var nuevo = carpetaPlantillas_().createFile(nombreArchivo, json, MimeType.PLAIN_TEXT);
    marcarPlantillaActiva_(nuevo.getId());
    return { archivoId: nuevo.getId(), nombre: plantilla.nombre,
             id: plantilla.id, carpetaId: plantilla.carpetaId };
  });
}

function listarPlantillas() {
  return envolver_(function () {
    var archivos = carpetaPlantillas_().getFiles();
    var activa = PropertiesService.getUserProperties().getProperty(K.PLANTILLA) || '';
    var lista = [];

    while (archivos.hasNext()) {
      var a = archivos.next();
      if (a.isTrashed()) continue;
      var item = { archivoId: a.getId(), nombre: a.getName(),
                   actualizado: fechaLegible_(a.getLastUpdated()),
                   activa: a.getId() === activa };
      try {
        var p = JSON.parse(a.getBlob().getDataAsString());
        item.id = p.id || '';
        item.nombre = p.nombre || item.nombre;
        item.procedencia = p.procedencia || '';
        item.cct = p.cct || '';
        item.cicloEscolar = p.cicloEscolar || '';
        item.tituloPlan = p.tituloPlan || '';
        item.firmas = (p.firmas || []).length;
        item.logos = (p.imagenes || []).filter(function (i) { return i && i.driveId; }).length;
        item.carpetaId = p.carpetaId || '';
        item.planeaciones = contarPlaneaciones_(item.carpetaId);
      } catch (err) {
        item.error = 'Plantilla ilegible.';
      }
      lista.push(item);
    }

    lista.sort(function (a, b) { return a.actualizado < b.actualizado ? 1 : -1; });
    return lista;
  });
}

/**
 * Copia una plantilla con otro nombre y su propia carpeta vacía: sirve para
 * partir de una que ya existe y cambiarle lo que haga falta.
 * Las planeaciones de la original NO se copian.
 */
function duplicarPlantilla(archivoId, nombreNuevo) {
  return envolver_(function () {
    var p = JSON.parse(DriveApp.getFileById(archivoId).getBlob().getDataAsString());

    p.id = idCorto_();
    p.archivoId = null;
    p.carpetaId = null;
    p.nombre = limpiarTexto_(nombreNuevo) || (limpiarTexto_(p.nombre) || 'Plantilla') + ' (copia)';

    var res = guardarPlantilla(p);
    if (!res.ok) throw new Error(res.error);

    p.archivoId = res.data.archivoId;
    // Las imágenes se comparten con la original: mismo id de Drive.
    (p.imagenes || []).forEach(function (img) {
      if (img && img.driveId && !img.dataUrl) img.dataUrl = leerImagenComoDataUrl_(img.driveId);
    });
    return p;
  });
}

function cargarPlantilla(archivoId) {
  return envolver_(function () {
    var p = JSON.parse(DriveApp.getFileById(archivoId).getBlob().getDataAsString());
    p.archivoId = archivoId;
    marcarPlantillaActiva_(archivoId);

    // Las imágenes viajan como id de Drive: se rehidratan para la vista previa.
    (p.imagenes || []).forEach(function (img) {
      if (img && img.driveId && !img.dataUrl) {
        img.dataUrl = leerImagenComoDataUrl_(img.driveId);
      }
    });
    return p;
  });
}

/**
 * Manda a la papelera la plantilla Y la carpeta con sus planeaciones. Todo es
 * recuperable desde la papelera de Drive.
 */
function eliminarPlantilla(archivoId) {
  return envolver_(function () {
    var archivo = DriveApp.getFileById(archivoId);
    var planeaciones = 0;

    try {
      var p = JSON.parse(archivo.getBlob().getDataAsString());
      if (p.carpetaId) {
        planeaciones = contarPlaneaciones_(p.carpetaId);
        DriveApp.getFolderById(p.carpetaId).setTrashed(true);
      }
    } catch (err) {
      // Sin carpeta que borrar.
    }

    archivo.setTrashed(true);
    var up = PropertiesService.getUserProperties();
    if (up.getProperty(K.PLANTILLA) === archivoId) up.deleteProperty(K.PLANTILLA);
    return { eliminado: true, planeaciones: planeaciones };
  });
}

/** Última plantilla usada por este docente, para precargarla al abrir la app. */
function obtenerPlantillaActiva() {
  return envolver_(function () {
    var id = PropertiesService.getUserProperties().getProperty(K.PLANTILLA);
    if (!id) return null;
    try {
      var p = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString());
      p.archivoId = id;
      (p.imagenes || []).forEach(function (img) {
        if (img && img.driveId && !img.dataUrl) img.dataUrl = leerImagenComoDataUrl_(img.driveId);
      });
      return p;
    } catch (err) {
      PropertiesService.getUserProperties().deleteProperty(K.PLANTILLA);
      return null;
    }
  });
}

function marcarPlantillaActiva_(archivoId) {
  PropertiesService.getUserProperties().setProperty(K.PLANTILLA, archivoId);
}

/* -------------------------------------------------------------- Imágenes */

var LIMITE_IMAGEN_BYTES = 3 * 1024 * 1024;

/**
 * Sube un logotipo de la plantilla. El cliente envía la imagen en base64;
 * aquí se guarda como archivo de Drive y solo se conserva el id en el JSON.
 *
 * @param {string} ranura  'secretaria' | 'procedencia' | 'ensenanza'
 * @param {string} dataUrl 'data:image/png;base64,...'
 */
function subirImagen(ranura, nombre, dataUrl) {
  return envolver_(function () {
    var blob = dataUrlABlob_(dataUrl, nombre || ranura);
    if (blob.getBytes().length > LIMITE_IMAGEN_BYTES) {
      throw new Error('La imagen pesa más de 3 MB. Redúcela antes de subirla.');
    }

    var archivo = carpetaImagenes_().createFile(blob);
    archivo.setName('[' + ranura + '] ' + (nombre || archivo.getName()));

    return {
      ranura: ranura,
      driveId: archivo.getId(),
      nombre: archivo.getName(),
      tipo: blob.getContentType()
    };
  });
}

function eliminarImagen(driveId) {
  return envolver_(function () {
    DriveApp.getFileById(driveId).setTrashed(true);
    return { eliminado: true };
  });
}

/** data:image/png;base64,XXXX -> Blob */
function dataUrlABlob_(dataUrl, nombre) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || '').replace(/\s/g, ''));
  if (!m) throw new Error('El formato de la imagen no es válido.');
  return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nombre || 'imagen');
}

function leerImagenComoDataUrl_(driveId) {
  try {
    var blob = DriveApp.getFileById(driveId).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' +
      Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    console.warn('No se pudo leer la imagen ' + driveId + ': ' + err.message);
    return '';
  }
}
