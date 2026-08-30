/**
 * ============================================================================
 *  Documento.gs · Construcción del Google Doc a partir de los BLOQUES que el
 *  docente ordenó en el editor arrastrable.
 *
 *  El cliente manda el documento ya resuelto (mismo modelo que pinta la vista
 *  previa), de modo que lo que se ve en pantalla es lo que se escribe en Docs.
 *
 *  Tipos de bloque admitidos:
 *    {tipo:'logos',   alto, imagenes:[{driveId, ancho}]}
 *    {tipo:'texto',   lineas:[{texto, negrita, tamano, alineacion, color}]}
 *    {tipo:'tabla',   columnas, anchos:[%], filas:[{celdas:[...]}]}
 *    {tipo:'firmas',  columnas, items:[{rol, detalle, nombre}]}
 *    {tipo:'espacio', alto}
 *
 *  Celda: {texto|parrafos, colspan, rowspan, oculta, encabezado, vinetas,
 *          alineacion, fondo, color, negrita, tamano}
 * ============================================================================
 */

/**
 * @param {Object} payload {titulo, docId, orientacion, papel, estilo, bloques}
 * @return {{ok:boolean, data:{docId, url, nombre}}}
 */
function generarDocumento(payload) {
  return envolver_(function () {
    if (!payload || !payload.bloques || !payload.bloques.length) {
      throw new Error('La planeación está vacía: no hay nada que escribir.');
    }

    var estilo = normalizarEstilo_(payload.estilo);
    var nombre = limpiarTexto_(payload.titulo) || 'Planeación didáctica';
    var doc = abrirODuplicarDoc_(payload.docId, nombre);
    var body = doc.getBody();

    body.clear();
    configurarPagina_(body, payload.orientacion, payload.papel);

    // Se anota el orden de cada tabla para poder fusionar celdas al final.
    var tablas = [];
    payload.bloques.forEach(function (bloque) {
      var tabla = escribirBloque_(body, bloque, estilo);
      if (tabla) tablas.push({ tabla: tabla, bloque: bloque });
    });

    limpiarParrafoInicial_(body);

    if (estilo.mostrarPie !== false) escribirPie_(doc, estilo);

    var pendientes = tablas.map(function (t) {
      return { indice: indiceDeTabla_(body, t.tabla), bloque: t.bloque };
    });

    doc.saveAndClose();

    var fusiones = aplicarFusiones_(doc.getId(), pendientes);

    var archivo = DriveApp.getFileById(doc.getId());
    moverA_(archivo, carpetaDocumentos_());

    return {
      docId: doc.getId(),
      url: doc.getUrl(),
      nombre: archivo.getName(),
      celdasFusionadas: fusiones,
      avisoFusion: fusiones === null
        ? 'Las celdas combinadas quedaron como celdas contiguas: activa el servicio avanzado "Google Docs API" para combinarlas de verdad.'
        : ''
    };
  });
}

/** Genera una copia en PDF del documento, junto al original. */
function exportarPDF(docId) {
  return envolver_(function () {
    var archivo = DriveApp.getFileById(docId);
    var pdf = archivo.getAs(MimeType.PDF);
    pdf.setName(archivo.getName() + '.pdf');
    var nuevo = carpetaDocumentos_().createFile(pdf);
    return { archivoId: nuevo.getId(), url: nuevo.getUrl(), nombre: nuevo.getName() };
  });
}

var MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Devuelve el documento en base64 para que el navegador lo descargue sin pasar
 * por el visor de Drive. formato: 'pdf' | 'docx'.
 *
 * Se usa el endpoint de exportación de Drive: DriveApp.getAs() solo garantiza
 * la conversión a PDF, no a Word.
 */
function descargarDocumento(docId, formato) {
  return envolver_(function () {
    var esWord = (formato === 'docx');
    var mime = esWord ? MIME_DOCX : MimeType.PDF;

    var res = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(docId) +
      '/export?mimeType=' + encodeURIComponent(mime),
      {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });

    if (res.getResponseCode() !== 200) {
      throw new Error('Drive no pudo exportar el documento (' + res.getResponseCode() +
        '). Ábrelo en Google Docs y descárgalo desde ahí.');
    }

    var bytes = res.getBlob().getBytes();
    if (bytes.length > 9 * 1024 * 1024) {
      throw new Error('El archivo pesa demasiado para descargarlo aquí. Ábrelo en Drive y descárgalo desde ahí.');
    }

    return {
      nombre: DriveApp.getFileById(docId).getName() + (esWord ? '.docx' : '.pdf'),
      tipo: mime,
      base64: Utilities.base64Encode(bytes)
    };
  });
}

/* -------------------------------------------------------------- Página */

function abrirODuplicarDoc_(docId, nombre) {
  if (docId) {
    try {
      var existente = DocumentApp.openById(docId);
      existente.setName(nombre);
      return existente;
    } catch (err) {
      // El documento fue borrado: se crea uno nuevo.
    }
  }
  return DocumentApp.create(nombre);
}

function configurarPagina_(body, orientacion, papel) {
  // A4: 595 x 842 pt. Carta: 612 x 792 pt.
  var esCarta = (papel === 'carta');
  var corto = esCarta ? 612 : 595;
  var largo = esCarta ? 792 : 842;

  if (orientacion === 'vertical') {
    body.setPageWidth(corto);
    body.setPageHeight(largo);
  } else {
    body.setPageWidth(largo);
    body.setPageHeight(corto);
  }
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(36).setMarginRight(36);
}

function normalizarEstilo_(e) {
  e = e || {};
  return {
    fuente: e.fuente || 'Arial',
    tamano: Number(e.tamano) || 9,
    colorPrimario: e.colorPrimario || '#E5397F',
    colorTexto: e.colorTexto || '#1F2430',
    colorBorde: e.colorBorde || '#5B6472',
    anchoBorde: Number(e.anchoBorde) >= 0 ? Number(e.anchoBorde) : 1,
    fondoEncabezado: e.fondoEncabezado || '#FDE7F0',
    colorEncabezado: e.colorEncabezado || '#8A1F4C',
    mostrarPie: e.mostrarPie !== false
  };
}

/**
 * Google Docs siempre arranca el cuerpo con un párrafo vacío. Si el primer
 * bloque es una tabla, ese párrafo queda arriba del encabezado institucional.
 */
function limpiarParrafoInicial_(body) {
  if (body.getNumChildren() < 2) return;
  var primero = body.getChild(0);
  if (primero.getType() !== DocumentApp.ElementType.PARAGRAPH) return;
  if (limpiarTexto_(primero.asParagraph().getText())) return;
  if (primero.asParagraph().getNumChildren() > 0) return; // lleva una imagen dentro
  body.removeChild(primero);
}

/* ------------------------------------------------------------- Bloques */

/** Escribe un bloque y devuelve la tabla creada, o null si no fue tabla. */
function escribirBloque_(body, bloque, estilo) {
  if (!bloque || bloque.oculto) return null;

  switch (bloque.tipo) {
    case 'logos':   return escribirLogos_(body, bloque, estilo);
    case 'texto':   escribirTexto_(body, bloque, estilo); return null;
    case 'tabla':   return escribirTabla_(body, bloque, estilo);
    case 'firmas':  return escribirFirmas_(body, bloque, estilo);
    case 'espacio': escribirEspacio_(body, bloque, estilo); return null;
    default:        return null;
  }
}

/** Fila de logotipos: tabla sin bordes de 1 x n. */
function escribirLogos_(body, bloque, estilo) {
  var imagenes = (bloque.imagenes || []).filter(function (i) { return i && i.driveId; });
  if (!imagenes.length) return null;

  var alto = Math.min(Math.max(Number(bloque.alto) || 56, 20), 140);
  var tabla = body.appendTable();
  var fila = tabla.appendTableRow();

  imagenes.forEach(function (img) {
    var celda = fila.appendTableCell();
    celda.setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(2).setPaddingRight(2);
    var parrafo = celda.getChild(0).asParagraph();
    parrafo.setSpacingBefore(0).setSpacingAfter(0);
    parrafo.setAlignment(alineacion_(img.alineacion || 'centro'));

    try {
      var blob = DriveApp.getFileById(img.driveId).getBlob();
      var inserted = parrafo.appendInlineImage(blob);
      var razon = inserted.getWidth() / (inserted.getHeight() || 1);
      inserted.setHeight(alto);
      inserted.setWidth(Math.round(alto * razon));
    } catch (err) {
      console.warn('No se pudo insertar la imagen ' + img.driveId + ': ' + err.message);
    }
  });

  tabla.setBorderWidth(0);
  return tabla;
}

/** Líneas sueltas de texto: el encabezado institucional y el "PLAN DE TRABAJO". */
function escribirTexto_(body, bloque, estilo) {
  (bloque.lineas || []).forEach(function (linea) {
    var texto = limpiarTexto_(linea.texto);
    if (!texto && !linea.forzar) return;

    var p = body.appendParagraph(texto);
    p.setAlignment(alineacion_(linea.alineacion || 'centro'));
    p.setSpacingBefore(Number(linea.espacioAntes) || 0);
    p.setSpacingAfter(Number(linea.espacioDespues) || 2);
    p.setLineSpacing(Number(linea.interlineado) || 1.05);

    if (!texto) return;
    p.editAsText()
      .setFontFamily(linea.fuente || estilo.fuente)
      .setFontSize(Number(linea.tamano) || estilo.tamano + 1)
      .setBold(linea.negrita !== false)
      .setForegroundColor(linea.color || estilo.colorTexto);
  });
}

function escribirEspacio_(body, bloque, estilo) {
  var p = body.appendParagraph('');
  p.setSpacingBefore(0).setSpacingAfter(Number(bloque.alto) || 6);
}

/** Cualquiera de las cuatro tablas del formato. */
function escribirTabla_(body, bloque, estilo) {
  var filas = bloque.filas || [];
  if (!filas.length) return null;

  var columnas = Number(bloque.columnas) || maximoColumnas_(filas);
  var tabla = body.appendTable();

  filas.forEach(function (filaDef) {
    var filaDoc = tabla.appendTableRow();
    var celdas = filaDef.celdas || [];
    for (var c = 0; c < columnas; c++) {
      pintarCelda_(filaDoc.appendTableCell(), celdas[c] || {}, estilo);
    }
  });

  aplicarBordes_(tabla, bloque, estilo);
  aplicarAnchos_(tabla, bloque.anchos, columnas);
  return tabla;
}

function pintarCelda_(celda, def, estilo) {
  var esEncabezado = !!def.encabezado;

  celda.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(5).setPaddingRight(5);
  celda.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);

  var fondo = def.fondo || (esEncabezado ? estilo.fondoEncabezado : null);
  if (fondo) celda.setBackgroundColor(fondo);

  var parrafos = normalizarParrafosCelda_(def);

  // Toda celda de Docs nace con un párrafo vacío: se reutiliza para el primero.
  if (!parrafos.length) {
    estilarParrafo_(celda.getChild(0).asParagraph(), '', def, estilo, esEncabezado);
    return;
  }

  // Con viñetas TODAS las líneas son elementos de lista, incluida la primera:
  // el párrafo vacío con el que nace la celda se elimina al final.
  if (def.vinetas && parrafos.length > 1) {
    parrafos.forEach(function (texto) {
      var item = celda.appendListItem(texto).setGlyphType(DocumentApp.GlyphType.BULLET);
      // La sangría por defecto (36 pt) se come una columna estrecha.
      item.setIndentStart(12).setIndentFirstLine(2);
      estilarParrafo_(item, texto, def, estilo, esEncabezado);
    });
    var vacio = celda.getChild(0);
    if (vacio.getType() === DocumentApp.ElementType.PARAGRAPH &&
        !vacio.asParagraph().getText()) {
      celda.removeChild(vacio);
    }
    return;
  }

  parrafos.forEach(function (texto, i) {
    var parrafo = (i === 0)
      ? celda.getChild(0).asParagraph().setText(texto)
      : celda.appendParagraph(texto);
    estilarParrafo_(parrafo, texto, def, estilo, esEncabezado);
  });
}

/** Una celda acepta texto con saltos de línea o un arreglo de párrafos. */
function normalizarParrafosCelda_(def) {
  var fuente = def.parrafos;
  if (!fuente) fuente = limpiarTexto_(def.texto).split('\n');
  if (!Array.isArray(fuente)) fuente = [fuente];

  return fuente
    .map(function (p) { return limpiarTexto_(typeof p === 'string' ? p : (p && p.texto)); })
    .filter(function (t) { return t.length > 0; });
}

function estilarParrafo_(parrafo, texto, def, estilo, esEncabezado) {
  parrafo.setSpacingBefore(0).setSpacingAfter(1);
  parrafo.setLineSpacing(1.05);
  parrafo.setAlignment(alineacion_(def.alineacion || (esEncabezado ? 'centro' : 'izquierda')));

  if (!texto) return;

  parrafo.editAsText()
    .setFontFamily(estilo.fuente)
    .setFontSize(Number(def.tamano) || estilo.tamano)
    .setBold(def.negrita !== undefined ? !!def.negrita : esEncabezado)
    .setForegroundColor(def.color || (esEncabezado ? estilo.colorEncabezado : estilo.colorTexto));
}

/** Bloque de firmas: tabla sin bordes con rol, cargo, línea y nombre. */
function escribirFirmas_(body, bloque, estilo) {
  var items = (bloque.items || []).filter(function (f) {
    return f && (limpiarTexto_(f.rol) || limpiarTexto_(f.nombre) || limpiarTexto_(f.detalle));
  });
  if (!items.length) return null;

  var columnas = Math.min(Math.max(Number(bloque.columnas) || 3, 1), 4);
  var tabla = body.appendTable();

  for (var i = 0; i < items.length; i += columnas) {
    var fila = tabla.appendTableRow();
    for (var c = 0; c < columnas; c++) {
      var celda = fila.appendTableCell();
      celda.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(6).setPaddingRight(6);
      celda.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
      escribirFirma_(celda, items[i + c], estilo);
    }
  }

  tabla.setBorderWidth(0);
  return tabla;
}

function escribirFirma_(celda, firma, estilo) {
  var lineas = [];
  if (!firma) {
    celda.getChild(0).asParagraph().setText('');
    return;
  }

  lineas.push({ texto: limpiarTexto_(firma.rol).toUpperCase(), negrita: true, tamano: estilo.tamano });
  if (limpiarTexto_(firma.detalle)) {
    lineas.push({ texto: limpiarTexto_(firma.detalle).toUpperCase(), negrita: false, tamano: estilo.tamano - 1 });
  }
  lineas.push({ texto: '', negrita: false, tamano: estilo.tamano });   // espacio para firmar
  lineas.push({ texto: '____________________________________', negrita: false, tamano: estilo.tamano });
  lineas.push({ texto: limpiarTexto_(firma.nombre).toUpperCase(), negrita: true, tamano: estilo.tamano });

  lineas.forEach(function (l, i) {
    var p = (i === 0)
      ? celda.getChild(0).asParagraph().setText(l.texto)
      : celda.appendParagraph(l.texto);

    p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    p.setSpacingBefore(0).setSpacingAfter(1);
    p.setLineSpacing(1.05);
    if (!l.texto) return;
    p.editAsText()
      .setFontFamily(estilo.fuente)
      .setFontSize(l.tamano)
      .setBold(l.negrita)
      .setForegroundColor(estilo.colorTexto);
  });
}

/* ------------------------------------------------------------ Apariencia */

function alineacion_(valor) {
  switch (valor) {
    case 'centro':      return DocumentApp.HorizontalAlignment.CENTER;
    case 'derecha':     return DocumentApp.HorizontalAlignment.RIGHT;
    case 'justificado': return DocumentApp.HorizontalAlignment.JUSTIFY;
    default:            return DocumentApp.HorizontalAlignment.LEFT;
  }
}

function aplicarBordes_(tabla, bloque, estilo) {
  if (bloque.sinBordes) { tabla.setBorderWidth(0); return; }
  if (estilo.anchoBorde > 0) {
    tabla.setBorderWidth(estilo.anchoBorde);
    tabla.setBorderColor(estilo.colorBorde);
  } else {
    tabla.setBorderWidth(0);
  }
}

function aplicarAnchos_(tabla, anchos, columnas) {
  if (!anchos || anchos.length !== columnas) return;

  // Ancho útil de la página descontando márgenes (36 pt por lado).
  var util = tabla.getParent().asBody().getPageWidth() - 72;
  var suma = anchos.reduce(function (s, v) { return s + (Number(v) || 0); }, 0) || 100;

  for (var c = 0; c < columnas; c++) {
    var pts = Math.round(util * ((Number(anchos[c]) || 0) / suma));
    if (pts > 20) {
      try { tabla.setColumnWidth(c, pts); } catch (err) { /* ancho fuera de rango */ }
    }
  }
}

function maximoColumnas_(filas) {
  return (filas || []).reduce(function (max, f) {
    return Math.max(max, (f.celdas || []).length);
  }, 1);
}

function escribirPie_(doc, estilo) {
  var pie = doc.getFooter() || doc.addFooter();
  pie.clear();
  var p = pie.appendParagraph('Generado con ' + APP.nombre + ' · ' + fechaLegible_(new Date()));
  p.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  p.editAsText().setFontFamily(estilo.fuente).setFontSize(7).setForegroundColor('#8C93A3');
}

function moverA_(archivo, carpeta) {
  try {
    archivo.moveTo(carpeta);
  } catch (err) {
    // Respaldo para dominios con la API antigua de Drive.
    carpeta.addFile(archivo);
    DriveApp.getRootFolder().removeFile(archivo);
  }
}

/* ------------------------------------------------- Fusión de celdas (API) */

/** Posición ordinal de la tabla dentro del cuerpo (0 = primera tabla). */
function indiceDeTabla_(body, tabla) {
  var posicion = body.getChildIndex(tabla);
  var n = 0;
  for (var i = 0; i < posicion; i++) {
    if (body.getChild(i).getType() === DocumentApp.ElementType.TABLE) n++;
  }
  return n;
}

/**
 * Combina las celdas marcadas con colspan/rowspan usando la API avanzada de
 * Docs. Devuelve el total de fusiones aplicadas, o null si el servicio
 * avanzado no está habilitado.
 *
 * @param {Array<{indice:number, bloque:Object}>} tablas
 */
function aplicarFusiones_(docId, tablas) {
  var trabajo = [];

  (tablas || []).forEach(function (t) {
    var fusiones = [];
    ((t.bloque && t.bloque.filas) || []).forEach(function (fila, r) {
      (fila.celdas || []).forEach(function (celda, c) {
        var cs = Number(celda.colspan) || 1;
        var rs = Number(celda.rowspan) || 1;
        if (celda.oculta || (cs <= 1 && rs <= 1)) return;
        fusiones.push({ fila: r, col: c, rowSpan: rs, columnSpan: cs });
      });
    });
    if (fusiones.length) trabajo.push({ indice: t.indice, fusiones: fusiones });
  });

  if (!trabajo.length) return 0;
  if (typeof Docs === 'undefined') return null;

  var total = 0;
  try {
    // De la última tabla a la primera: así los índices de las tablas anteriores
    // siguen siendo válidos aunque una fusión mueva el contenido posterior.
    trabajo.sort(function (a, b) { return b.indice - a.indice; });

    trabajo.forEach(function (t) {
      var doc = Docs.Documents.get(docId);
      var inicioTabla = localizarInicioTabla_(doc, t.indice);
      if (inicioTabla === null) return;

      // De abajo hacia arriba y de derecha a izquierda dentro de cada tabla.
      t.fusiones.sort(function (a, b) { return (b.fila - a.fila) || (b.col - a.col); });

      var batch = t.fusiones.map(function (r) {
        return {
          mergeTableCells: {
            tableRange: {
              tableCellLocation: {
                tableStartLocation: { index: inicioTabla },
                rowIndex: r.fila,
                columnIndex: r.col
              },
              rowSpan: r.rowSpan,
              columnSpan: r.columnSpan
            }
          }
        };
      });

      Docs.Documents.batchUpdate({ requests: batch }, docId);
      total += batch.length;
    });
    return total;
  } catch (err) {
    console.warn('No se pudieron combinar las celdas: ' + err.message);
    return null;
  }
}

function localizarInicioTabla_(doc, indiceTabla) {
  var contenido = (doc.body && doc.body.content) || [];
  var n = -1;
  for (var i = 0; i < contenido.length; i++) {
    if (contenido[i].table) {
      n++;
      if (n === indiceTabla) return contenido[i].startIndex;
    }
  }
  return null;
}
