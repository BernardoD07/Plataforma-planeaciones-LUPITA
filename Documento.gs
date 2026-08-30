/**
 * ============================================================================
 *  Documento.gs · Construcción del Google Doc a partir del maquetado que el
 *  docente armó en el editor drag & drop.
 *
 *  El cliente envía la rejilla YA RESUELTA (los placeholders y los bloques
 *  arrastrados se convierten en párrafos antes de enviarse), de modo que el
 *  documento reproduce exactamente lo que se ve en la vista previa.
 * ============================================================================
 */

/**
 * @param {Object} payload
 *   {
 *     titulo: 'Planeación ...',
 *     docId: 'id existente a sobrescribir (opcional)',
 *     orientacion: 'vertical' | 'horizontal',
 *     estilo: {fuente, tamano, colorPrimario, colorBorde, anchoBorde,
 *              fondoEncabezado, colorEncabezado, mostrarTitulo, mostrarPie},
 *     meta: [{etiqueta:'Docente', valor:'...'}],
 *     grid: {
 *       columnas: 4,
 *       anchos: [25,25,25,25],           // porcentajes, opcional
 *       filas: [{ celdas: [{
 *          colspan:1, rowspan:1, oculta:false, tipo:'encabezado'|'normal',
 *          estilo:{fondo, color, negrita, alineacion, tamano},
 *          parrafos:[{tipo:'titulo'|'texto'|'vineta'|'clave', texto:'', etiqueta:''}]
 *       }]}]
 *     },
 *     anexos: [{titulo:'', parrafos:[...]}]
 *   }
 * @return {{ok:boolean, data:{docId, url, nombre}}}
 */
function generarDocumento(payload) {
  return envolver_(function () {
    if (!payload || !payload.grid || !payload.grid.filas || !payload.grid.filas.length) {
      throw new Error('La plantilla está vacía. Agrega al menos una fila con contenido.');
    }

    var estilo = normalizarEstilo_(payload.estilo);
    var nombre = limpiarTexto_(payload.titulo) || 'Planeación didáctica';
    var doc = abrirODuplicarDoc_(payload.docId, nombre);
    var body = doc.getBody();

    body.clear();
    configurarPagina_(body, payload.orientacion);

    if (estilo.mostrarTitulo !== false) {
      escribirTitulo_(body, nombre, estilo);
    }
    if (payload.meta && payload.meta.length) {
      escribirTablaMeta_(body, payload.meta, estilo);
    }

    var tablaPrincipal = escribirRejilla_(body, payload.grid, estilo);

    if (payload.anexos && payload.anexos.length) {
      escribirAnexos_(body, payload.anexos, estilo);
    }
    if (estilo.mostrarPie !== false) {
      escribirPie_(doc, estilo);
    }

    var indiceTabla = indiceDeTabla_(body, tablaPrincipal);
    doc.saveAndClose();

    // Las fusiones reales solo son posibles con el servicio avanzado de Docs.
    var fusiones = aplicarFusiones_(doc.getId(), payload.grid, indiceTabla);

    var archivo = DriveApp.getFileById(doc.getId());
    moverA_(archivo, carpetaDocumentos_());

    return {
      docId: doc.getId(),
      url: doc.getUrl(),
      nombre: archivo.getName(),
      celdasFusionadas: fusiones,
      avisoFusion: fusiones === null
        ? 'Las celdas combinadas se dibujaron como celdas vacías: activa el servicio avanzado "Google Docs API" para combinarlas de verdad.'
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

function configurarPagina_(body, orientacion) {
  // Carta: 612 x 792 puntos.
  var corto = 612, largo = 792;
  if (orientacion === 'horizontal') {
    body.setPageWidth(largo);
    body.setPageHeight(corto);
  } else {
    body.setPageWidth(corto);
    body.setPageHeight(largo);
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
    colorBorde: e.colorBorde || '#C8CDD8',
    anchoBorde: Number(e.anchoBorde) >= 0 ? Number(e.anchoBorde) : 1,
    fondoEncabezado: e.fondoEncabezado || '#FDE7F0',
    colorEncabezado: e.colorEncabezado || '#8A1F4C',
    mostrarTitulo: e.mostrarTitulo !== false,
    mostrarPie: e.mostrarPie !== false
  };
}

/* ------------------------------------------------------------ Secciones */

function escribirTitulo_(body, titulo, estilo) {
  var p = body.appendParagraph(titulo.toUpperCase());
  p.setHeading(DocumentApp.ParagraphHeading.TITLE)
   .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
   .setSpacingAfter(6);
  p.editAsText()
   .setFontFamily(estilo.fuente)
   .setFontSize(estilo.tamano + 6)
   .setBold(true)
   .setForegroundColor(estilo.colorPrimario);
}

/** Ficha de datos institucionales en dos columnas etiqueta/valor. */
function escribirTablaMeta_(body, meta, estilo) {
  var columnas = 4; // dos pares etiqueta-valor por fila
  var filas = [];
  var fila = [];

  meta.forEach(function (m) {
    fila.push(limpiarTexto_(m.etiqueta), limpiarTexto_(m.valor));
    if (fila.length === columnas) { filas.push(fila); fila = []; }
  });
  while (fila.length && fila.length < columnas) fila.push('');
  if (fila.length) filas.push(fila);
  if (!filas.length) return null;

  var tabla = body.appendTable(filas);
  aplicarBordes_(tabla, estilo);

  for (var r = 0; r < tabla.getNumRows(); r++) {
    var f = tabla.getRow(r);
    for (var c = 0; c < f.getNumCells(); c++) {
      var celda = f.getCell(c);
      var esEtiqueta = (c % 2 === 0);
      celda.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(5).setPaddingRight(5);
      if (esEtiqueta) celda.setBackgroundColor(estilo.fondoEncabezado);

      var p = celda.getChild(0).asParagraph();
      p.setSpacingBefore(0).setSpacingAfter(0);
      p.editAsText()
       .setFontFamily(estilo.fuente)
       .setFontSize(estilo.tamano - 1)
       .setBold(esEtiqueta)
       .setForegroundColor(esEtiqueta ? estilo.colorEncabezado : estilo.colorTexto);
    }
  }

  body.appendParagraph('').setSpacingAfter(4);
  return tabla;
}

/** Dibuja la rejilla del editor como tabla del documento. */
function escribirRejilla_(body, grid, estilo) {
  var columnas = Number(grid.columnas) || maximoColumnas_(grid);
  var tabla = body.appendTable();

  grid.filas.forEach(function (filaDef) {
    var filaDoc = tabla.appendTableRow();
    var celdas = filaDef.celdas || [];

    for (var c = 0; c < columnas; c++) {
      var def = celdas[c] || {};
      var celdaDoc = filaDoc.appendTableCell();
      pintarCelda_(celdaDoc, def, estilo);
    }
  });

  aplicarBordes_(tabla, estilo);
  aplicarAnchos_(tabla, grid, columnas);
  return tabla;
}

function pintarCelda_(celda, def, estilo) {
  var ce = def.estilo || {};
  var esEncabezado = def.tipo === 'encabezado';

  celda.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(5).setPaddingRight(5);
  celda.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);

  var fondo = ce.fondo || (esEncabezado ? estilo.fondoEncabezado : null);
  if (fondo) celda.setBackgroundColor(fondo);

  var parrafos = (def.parrafos || []).filter(function (p) {
    return limpiarTexto_(p.texto) || limpiarTexto_(p.etiqueta);
  });

  // Toda celda de Docs nace con un párrafo vacío: se reutiliza para el primero.
  if (!parrafos.length) {
    estilarParrafo_(celda.getChild(0).asParagraph(), '', def, estilo, esEncabezado, null);
    return;
  }

  parrafos.forEach(function (p, i) {
    var texto = componerTexto_(p);
    var parrafo = (i === 0)
      ? celda.getChild(0).asParagraph().setText(texto)
      : (p.tipo === 'vineta'
          ? celda.appendListItem(texto).setGlyphType(DocumentApp.GlyphType.BULLET)
          : celda.appendParagraph(texto));
    estilarParrafo_(parrafo, texto, def, estilo, esEncabezado, p);
  });
}

function componerTexto_(p) {
  var etiqueta = limpiarTexto_(p.etiqueta);
  var texto = limpiarTexto_(p.texto);
  if (etiqueta && texto) return etiqueta + ': ' + texto;
  return etiqueta || texto;
}

function estilarParrafo_(parrafo, texto, def, estilo, esEncabezado, p) {
  var ce = def.estilo || {};
  var tipo = p ? p.tipo : 'texto';

  parrafo.setSpacingBefore(0).setSpacingAfter(tipo === 'titulo' ? 2 : 1);
  parrafo.setLineSpacing(1.05);
  parrafo.setAlignment(alineacion_(ce.alineacion || (esEncabezado ? 'centro' : 'izquierda')));

  var negrita = !!ce.negrita || esEncabezado || tipo === 'titulo';
  var color = ce.color || (esEncabezado ? estilo.colorEncabezado : estilo.colorTexto);
  var tamano = Number(ce.tamano) || estilo.tamano;

  var t = parrafo.editAsText();
  if (!texto) {
    // Sin texto no hay rango que estilar; se fija el atributo del párrafo.
    parrafo.setAttributes({});
    return;
  }
  t.setFontFamily(estilo.fuente)
   .setFontSize(tipo === 'titulo' ? tamano + 1 : tamano)
   .setBold(negrita)
   .setForegroundColor(color);

  // La etiqueta de un par clave/valor va en negritas aunque el resto no lo esté.
  if (p && p.etiqueta && p.texto) {
    var corte = limpiarTexto_(p.etiqueta).length + 1;
    if (corte < texto.length) t.setBold(0, corte - 1, true);
  }
}

function alineacion_(valor) {
  switch (valor) {
    case 'centro':    return DocumentApp.HorizontalAlignment.CENTER;
    case 'derecha':   return DocumentApp.HorizontalAlignment.RIGHT;
    case 'justificado': return DocumentApp.HorizontalAlignment.JUSTIFY;
    default:          return DocumentApp.HorizontalAlignment.LEFT;
  }
}

function aplicarBordes_(tabla, estilo) {
  if (estilo.anchoBorde > 0) {
    tabla.setBorderWidth(estilo.anchoBorde);
    tabla.setBorderColor(estilo.colorBorde);
  } else {
    tabla.setBorderWidth(0);
  }
}

function aplicarAnchos_(tabla, grid, columnas) {
  var anchos = grid.anchos;
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

function maximoColumnas_(grid) {
  return (grid.filas || []).reduce(function (max, f) {
    return Math.max(max, (f.celdas || []).length);
  }, 1);
}

function escribirAnexos_(body, anexos, estilo) {
  anexos.forEach(function (anexo) {
    var h = body.appendParagraph(limpiarTexto_(anexo.titulo));
    h.setSpacingBefore(10).setSpacingAfter(3);
    h.editAsText()
     .setFontFamily(estilo.fuente)
     .setFontSize(estilo.tamano + 2)
     .setBold(true)
     .setForegroundColor(estilo.colorPrimario);

    (anexo.parrafos || []).forEach(function (p) {
      var texto = componerTexto_(p);
      if (!texto) return;
      var parrafo = (p.tipo === 'vineta')
        ? body.appendListItem(texto).setGlyphType(DocumentApp.GlyphType.BULLET)
        : body.appendParagraph(texto);
      parrafo.setSpacingBefore(0).setSpacingAfter(2);
      parrafo.editAsText()
        .setFontFamily(estilo.fuente)
        .setFontSize(estilo.tamano)
        .setForegroundColor(estilo.colorTexto);
    });
  });
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
 * Docs. Devuelve el número de fusiones aplicadas, o null si el servicio
 * avanzado no está habilitado.
 */
function aplicarFusiones_(docId, grid, indiceTabla) {
  var requests = [];
  (grid.filas || []).forEach(function (fila, r) {
    (fila.celdas || []).forEach(function (celda, c) {
      var cs = Number(celda.colspan) || 1;
      var rs = Number(celda.rowspan) || 1;
      if (celda.oculta || (cs <= 1 && rs <= 1)) return;
      requests.push({ fila: r, col: c, rowSpan: rs, columnSpan: cs });
    });
  });
  if (!requests.length) return 0;

  if (typeof Docs === 'undefined') return null;

  try {
    var doc = Docs.Documents.get(docId);
    var inicioTabla = localizarInicioTabla_(doc, indiceTabla);
    if (inicioTabla === null) return null;

    // De abajo hacia arriba y de derecha a izquierda: así los índices de las
    // fusiones pendientes no se ven afectados por las ya aplicadas.
    requests.sort(function (a, b) {
      return (b.fila - a.fila) || (b.col - a.col);
    });

    var batch = requests.map(function (r) {
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
    return batch.length;
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
