/**
 * ============================================================================
 *  IA.gs · Adaptador multi-proveedor y generación de insumos didácticos.
 *  Proveedores soportados: Gemini, OpenAI, Anthropic.
 * ============================================================================
 */

/**
 * Estructura oficial de la metodología de Proyectos Comunitarios (NEM):
 * 3 fases · 11 momentos. Se usa como andamiaje fijo del prompt.
 */
var FASES_PROYECTO_COMUNITARIO = [
  { fase: 'Planeación',   momentos: ['Identificación', 'Recuperación', 'Planificación'] },
  { fase: 'Acción',       momentos: ['Acercamiento', 'Comprensión y producción', 'Reconocimiento', 'Concreción'] },
  { fase: 'Intervención', momentos: ['Integración', 'Difusión', 'Consideraciones', 'Avances'] }
];

function obtenerFasesMetodologia() {
  return FASES_PROYECTO_COMUNITARIO;
}

/* ------------------------------------------------------- API para cliente */

/**
 * Fase 1 del flujo: genera explicación del tema + banco de actividades.
 * @param {Object} insumos {tema, nivel, grado, campoFormativo, caracteristicasGrupo,
 *                          recursos, contextoComunitario, sesiones, minutosPorSesion,
 *                          semanas, actividadesPorMomento}
 * @return {{ok:boolean, data:Object}}
 */
function generarInsumos(insumos) {
  return envolver_(function () {
    validarInsumos_(insumos);
    var salida = llamarIA_(promptSistema_(), promptInsumos_(insumos), 8000);
    var json = extraerJson_(salida);
    return normalizarPropuesta_(json, insumos);
  });
}

/** Regenera únicamente las actividades de un momento concreto. */
function regenerarMomento(insumos, nombreFase, nombreMomento, actividadesActuales) {
  return envolver_(function () {
    validarInsumos_(insumos);
    var prompt = promptRegenerarMomento_(insumos, nombreFase, nombreMomento, actividadesActuales);
    var json = extraerJson_(llamarIA_(promptSistema_(), prompt, 3000));
    var lista = json.actividades || [];
    return lista.map(function (a, i) {
      return normalizarActividad_(a, nombreFase, nombreMomento, i, insumos);
    });
  });
}

/** Redacta o mejora un texto suelto (descripciones, criterios, etc.). */
function asistirTexto(instruccion, textoBase, contexto) {
  return envolver_(function () {
    var prompt = 'Contexto de la planeación:\n' + JSON.stringify(contexto || {}) +
      '\n\nTexto actual:\n"""' + (textoBase || '(vacío)') + '"""' +
      '\n\nInstrucción del docente: ' + instruccion +
      '\n\nDevuelve ÚNICAMENTE el texto reescrito, sin comillas ni explicaciones, en español de México.';
    return llamarIA_(promptSistema_(), prompt, 1200, /* esperaJson= */ false);
  });
}

/** Prueba de conectividad desde el panel de configuración. */
function probarConexionIA() {
  return envolver_(function () {
    var r = llamarIA_('Responde en una sola línea.', 'Di exactamente: CONEXION_OK', 50, false);
    return { respuesta: String(r).trim() };
  });
}

/* ------------------------------------------------------------- Validación */

function validarInsumos_(i) {
  if (!i || !limpiarTexto_(i.tema)) throw new Error('Indica el tema principal del proyecto.');
  if (!limpiarTexto_(i.nivel)) throw new Error('Selecciona el nivel educativo.');
  var sesiones = Number(i.sesiones || 0);
  var minutos = Number(i.minutosPorSesion || 0);
  if (!sesiones || sesiones < 1) throw new Error('Indica cuántas sesiones tienes disponibles.');
  if (!minutos || minutos < 10) throw new Error('Indica la duración de cada sesión (mínimo 10 minutos).');
  if (sesiones > 120) throw new Error('El número de sesiones parece excesivo (máximo 120).');
}

/* ---------------------------------------------------------------- Prompts */

function promptSistema_() {
  return [
    'Eres un asesor técnico pedagógico mexicano, experto en la Nueva Escuela Mexicana (NEM),',
    'en los Programas Sintéticos 2022 y, de manera específica, en la metodología de',
    'APRENDIZAJE BASADO EN PROYECTOS COMUNITARIOS.',
    '',
    'Reglas irrenunciables:',
    '1. TODA actividad que propongas debe pertenecer a la metodología de Proyectos Comunitarios:',
    '   parte de una problemática real y sentida de la comunidad, involucra a agentes externos',
    '   (familias, vecinos, autoridades, oficios locales), produce evidencias tangibles y culmina',
    '   en una intervención o servicio que devuelve algo a la comunidad.',
    '   Nunca propongas actividades genéricas de libro de texto ni de otras metodologías (ABP',
    '   escolar clásico, STEAM, indagación) salvo que queden subordinadas al proyecto comunitario.',
    '2. Respeta las 3 fases y 11 momentos oficiales: Planeación (Identificación, Recuperación,',
    '   Planificación); Acción (Acercamiento, Comprensión y producción, Reconocimiento, Concreción);',
    '   Intervención (Integración, Difusión, Consideraciones, Avances).',
    '3. Ajusta el lenguaje, la complejidad cognitiva y la autonomía exigida al nivel y grado indicados.',
    '4. Usa EXCLUSIVAMENTE los recursos que el docente declara disponibles. Si algo no está,',
    '   propón una alternativa con materiales de bajo costo o del entorno.',
    '5. Considera las características del grupo (número de alumnos, diversidad, barreras para el',
    '   aprendizaje) y propón adecuaciones concretas, no genéricas.',
    '6. Escribe en español de México, con verbos en infinitivo para los títulos de actividad y',
    '   redacción clara para el docente. Nada de relleno ni de frases motivacionales.',
    '7. Responde SIEMPRE con un único objeto JSON válido. Sin texto antes ni después,',
    '   sin cercos de código, sin comentarios.'
  ].join('\n');
}

function promptInsumos_(i) {
  var porMomento = Number(i.actividadesPorMomento || 2);
  var totalMin = Number(i.sesiones) * Number(i.minutosPorSesion);

  return [
    'Genera los insumos completos para una planeación didáctica por Proyectos Comunitarios.',
    '',
    '## Datos del contexto',
    '- Tema o problemática detonadora: ' + limpiarTexto_(i.tema),
    '- Nivel educativo: ' + limpiarTexto_(i.nivel),
    '- Grado / fase: ' + (limpiarTexto_(i.grado) || 'no especificado'),
    '- Campo(s) formativo(s) prioritario(s): ' + (limpiarTexto_(i.campoFormativo) || 'los que mejor articulen el tema'),
    '- Características del grupo y del salón: ' + (limpiarTexto_(i.caracteristicasGrupo) || 'grupo estándar'),
    '- Recursos realmente disponibles: ' + (limpiarTexto_(i.recursos) || 'materiales básicos de papelería'),
    '- Contexto comunitario: ' + (limpiarTexto_(i.contextoComunitario) || 'no especificado, infiérelo con prudencia'),
    '- Tiempo total: ' + i.sesiones + ' sesiones de ' + i.minutosPorSesion + ' minutos (' + totalMin + ' minutos en total)' +
      (i.semanas ? ', distribuidas en ' + i.semanas + ' semanas.' : '.'),
    '',
    '## Qué debes producir',
    '1. Una explicación disciplinar del tema para el docente (no para el alumno): qué es, por qué',
    '   importa en esta comunidad, conceptos clave y errores frecuentes.',
    '2. Exactamente ' + porMomento + ' actividades por cada uno de los 11 momentos.',
    '   Cada actividad debe indicar una duración sugerida en minutos, coherente con sesiones de ' +
      i.minutosPorSesion + ' minutos.',
    '3. Evaluación formativa con instrumentos concretos y criterios observables.',
    '4. Lista consolidada de recursos y de adecuaciones para la diversidad del grupo.',
    '',
    '## Formato de salida (JSON estricto)',
    '{',
    '  "titulo_proyecto": "nombre atractivo y situado del proyecto",',
    '  "problematica": "la problemática comunitaria en una oración",',
    '  "producto_final": "el producto o servicio que se entrega a la comunidad",',
    '  "explicacion": {',
    '    "resumen": "párrafo de 80-120 palabras",',
    '    "relevancia_comunitaria": "párrafo de 60-90 palabras",',
    '    "conceptos_clave": [{"titulo":"...","texto":"2-3 oraciones"}],',
    '    "errores_frecuentes": ["..."]',
    '  },',
    '  "campos_formativos": ["..."],',
    '  "ejes_articuladores": ["..."],',
    '  "contenidos": ["contenido del programa sintético"],',
    '  "pda": ["proceso de desarrollo de aprendizaje redactado como en el programa"],',
    '  "momentos": [',
    '    {',
    '      "fase": "Planeación",',
    '      "momento": "Identificación",',
    '      "proposito": "para qué sirve este momento en ESTE proyecto",',
    '      "actividades": [',
    '        {',
    '          "titulo": "verbo en infinitivo + objeto",',
    '          "descripcion": "3-5 oraciones con la secuencia concreta de lo que hace el grupo",',
    '          "consigna_alumno": "lo que el docente dice literalmente al grupo",',
    '          "organizacion": "individual | binas | equipos | grupal | comunidad",',
    '          "recursos": ["..."],',
    '          "evidencia": "producto observable de esta actividad",',
    '          "participacion_comunitaria": "quién de la comunidad participa y cómo, o la palabra ninguna",',
    '          "duracion_min": 30',
    '        }',
    '      ]',
    '    }',
    '  ],',
    '  "evaluacion": {',
    '    "enfoque": "1-2 oraciones",',
    '    "instrumentos": [{"nombre":"...","momento_de_uso":"...","descripcion":"..."}],',
    '    "criterios": ["criterio observable"],',
    '    "indicadores_logro": ["indicador redactado en tercera persona"]',
    '  },',
    '  "recursos_consolidados": ["..."],',
    '  "adecuaciones": [{"situacion":"...","ajuste":"..."}],',
    '  "vinculacion_familias": "cómo se involucra a las familias"',
    '}',
    '',
    'Incluye los 11 momentos, en el orden indicado, sin omitir ninguno.'
  ].join('\n');
}

function promptRegenerarMomento_(i, fase, momento, actuales) {
  var yaPropuestas = (actuales || []).map(function (a) {
    return '- ' + (a && a.titulo ? a.titulo : a);
  }).join('\n') || '- (ninguna)';

  return [
    'Para el proyecto comunitario sobre "' + limpiarTexto_(i.tema) + '" (' + limpiarTexto_(i.nivel) +
      (i.grado ? ', ' + i.grado : '') + '),',
    'genera 3 actividades NUEVAS y distintas para la fase "' + fase + '", momento "' + momento + '".',
    '',
    'Recursos disponibles: ' + (limpiarTexto_(i.recursos) || 'básicos'),
    'Características del grupo: ' + (limpiarTexto_(i.caracteristicasGrupo) || 'grupo estándar'),
    'Duración de cada sesión: ' + i.minutosPorSesion + ' minutos.',
    '',
    'Estas actividades YA fueron propuestas, no las repitas ni las parafrasees:',
    yaPropuestas,
    '',
    'Responde solo con:',
    '{"actividades":[{"titulo":"...","descripcion":"...","consigna_alumno":"...",',
    '"organizacion":"...","recursos":["..."],"evidencia":"...",',
    '"participacion_comunitaria":"...","duracion_min":30}]}'
  ].join('\n');
}

/* --------------------------------------------------------- Normalización */

function normalizarPropuesta_(json, insumos) {
  var momentosIA = Array.isArray(json.momentos) ? json.momentos : [];
  var indice = {};
  momentosIA.forEach(function (m) {
    indice[clave_(m.fase, m.momento)] = m;
  });

  var momentos = [];
  FASES_PROYECTO_COMUNITARIO.forEach(function (f) {
    f.momentos.forEach(function (nombreMomento) {
      var origen = indice[clave_(f.fase, nombreMomento)] || {};
      var acts = Array.isArray(origen.actividades) ? origen.actividades : [];
      momentos.push({
        fase: f.fase,
        momento: nombreMomento,
        proposito: limpiarTexto_(origen.proposito),
        actividades: acts.map(function (a, k) {
          return normalizarActividad_(a, f.fase, nombreMomento, k, insumos);
        })
      });
    });
  });

  var exp = json.explicacion || {};
  var ev = json.evaluacion || {};

  return {
    id: idCorto_(),
    creado: new Date().toISOString(),
    insumos: insumos,
    tituloProyecto: limpiarTexto_(json.titulo_proyecto) || limpiarTexto_(insumos.tema),
    problematica: limpiarTexto_(json.problematica),
    productoFinal: limpiarTexto_(json.producto_final),
    explicacion: {
      resumen: limpiarTexto_(exp.resumen),
      relevanciaComunitaria: limpiarTexto_(exp.relevancia_comunitaria),
      conceptosClave: (exp.conceptos_clave || []).map(function (c) {
        return { titulo: limpiarTexto_(c.titulo), texto: limpiarTexto_(c.texto) };
      }),
      erroresFrecuentes: (exp.errores_frecuentes || []).map(limpiarTexto_)
    },
    camposFormativos: (json.campos_formativos || []).map(limpiarTexto_),
    ejesArticuladores: (json.ejes_articuladores || []).map(limpiarTexto_),
    contenidos: (json.contenidos || []).map(limpiarTexto_),
    pda: (json.pda || []).map(limpiarTexto_),
    momentos: momentos,
    evaluacion: {
      enfoque: limpiarTexto_(ev.enfoque),
      instrumentos: (ev.instrumentos || []).map(function (x) {
        return {
          nombre: limpiarTexto_(x.nombre),
          momentoDeUso: limpiarTexto_(x.momento_de_uso),
          descripcion: limpiarTexto_(x.descripcion)
        };
      }),
      criterios: (ev.criterios || []).map(limpiarTexto_),
      indicadoresLogro: (ev.indicadores_logro || []).map(limpiarTexto_)
    },
    recursosConsolidados: (json.recursos_consolidados || []).map(limpiarTexto_),
    adecuaciones: (json.adecuaciones || []).map(function (a) {
      return { situacion: limpiarTexto_(a.situacion), ajuste: limpiarTexto_(a.ajuste) };
    }),
    vinculacionFamilias: limpiarTexto_(json.vinculacion_familias)
  };
}

function normalizarActividad_(a, fase, momento, indice, insumos) {
  a = a || {};
  var dur = Number(a.duracion_min || a.duracion || 0);
  if (!dur || dur < 5) dur = Math.min(Number(insumos.minutosPorSesion || 50), 50);
  return {
    id: 'act_' + idCorto_(),
    fase: fase,
    momento: momento,
    titulo: limpiarTexto_(a.titulo) || (momento + ' · actividad ' + (indice + 1)),
    descripcion: limpiarTexto_(a.descripcion),
    consignaAlumno: limpiarTexto_(a.consigna_alumno),
    organizacion: limpiarTexto_(a.organizacion) || 'equipos',
    recursos: (a.recursos || []).map(limpiarTexto_),
    evidencia: limpiarTexto_(a.evidencia),
    participacionComunitaria: limpiarTexto_(a.participacion_comunitaria),
    duracionSugerida: Math.round(dur),
    duracionAsignada: Math.round(dur),
    seleccionada: true
  };
}

/** Normaliza fase+momento para emparejar lo que devuelve la IA con el andamiaje. */
function clave_(fase, momento) {
  var texto = limpiarTexto_(fase) + '||' + limpiarTexto_(momento);
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* --------------------------------------------- Adaptador de proveedores IA */

/**
 * Llama al proveedor configurado y devuelve el texto plano de la respuesta.
 * @param {string} sistema      Instrucción de sistema.
 * @param {string} usuario      Mensaje del usuario.
 * @param {number} maxTokens    Límite de salida.
 * @param {boolean=} esperaJson Fuerza modo JSON donde el proveedor lo soporta.
 */
function llamarIA_(sistema, usuario, maxTokens, esperaJson) {
  var sp = PropertiesService.getScriptProperties();
  var proveedor = sp.getProperty(K.PROVEEDOR) || 'gemini';
  var modelo = sp.getProperty(K.MODELO) || modeloPorDefecto_(proveedor);
  var apiKey = sp.getProperty(K.API_KEY);

  if (!apiKey) {
    throw new Error('No hay API key configurada. Ábrela en el panel de Configuración y guárdala.');
  }
  if (esperaJson === undefined) esperaJson = true;

  switch (proveedor) {
    case 'openai':    return llamarOpenAI_(apiKey, modelo, sistema, usuario, maxTokens, esperaJson);
    case 'anthropic': return llamarAnthropic_(apiKey, modelo, sistema, usuario, maxTokens);
    default:          return llamarGemini_(apiKey, modelo, sistema, usuario, maxTokens, esperaJson);
  }
}

function llamarGemini_(apiKey, modelo, sistema, usuario, maxTokens, esperaJson) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(modelo) + ':generateContent';

  var cuerpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: [{ text: usuario }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: maxTokens || 8000
    }
  };
  if (esperaJson) cuerpo.generationConfig.responseMimeType = 'application/json';

  var res = fetchConReintentos_(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true
  });

  var json = JSON.parse(res.getContentText());
  if (json.error) throw new Error('Gemini: ' + json.error.message);

  var cand = (json.candidates || [])[0];
  if (!cand || !cand.content) {
    throw new Error('Gemini no devolvió contenido. Revisa si el prompt fue bloqueado por filtros de seguridad.');
  }
  if (cand.finishReason === 'MAX_TOKENS') {
    console.warn('Gemini truncó la respuesta por MAX_TOKENS.');
  }
  return (cand.content.parts || []).map(function (p) { return p.text || ''; }).join('');
}

function llamarOpenAI_(apiKey, modelo, sistema, usuario, maxTokens, esperaJson) {
  var cuerpo = {
    model: modelo,
    messages: [
      { role: 'system', content: sistema },
      { role: 'user', content: usuario }
    ],
    temperature: 0.8,
    max_tokens: maxTokens || 8000
  };
  if (esperaJson) cuerpo.response_format = { type: 'json_object' };

  var res = fetchConReintentos_('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true
  });

  var json = JSON.parse(res.getContentText());
  if (json.error) throw new Error('OpenAI: ' + json.error.message);
  return json.choices[0].message.content;
}

function llamarAnthropic_(apiKey, modelo, sistema, usuario, maxTokens) {
  var res = fetchConReintentos_('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model: modelo,
      max_tokens: maxTokens || 8000,
      temperature: 0.8,
      system: sistema,
      messages: [{ role: 'user', content: usuario }]
    }),
    muteHttpExceptions: true
  });

  var json = JSON.parse(res.getContentText());
  if (json.error) throw new Error('Anthropic: ' + json.error.message);
  return (json.content || []).map(function (b) { return b.text || ''; }).join('');
}

/** UrlFetch con reintentos exponenciales para 429 y 5xx. */
function fetchConReintentos_(url, opciones, intentos) {
  intentos = intentos || 3;
  var ultimo = null;

  for (var n = 0; n < intentos; n++) {
    var res = UrlFetchApp.fetch(url, opciones);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return res;
    ultimo = res;
    if (code === 429 || code >= 500) {
      Utilities.sleep(Math.pow(2, n) * 1500);
      continue;
    }
    break;
  }

  var detalle;
  try {
    var e = JSON.parse(ultimo.getContentText());
    detalle = (e.error && (e.error.message || e.error.type)) || ultimo.getContentText().substring(0, 300);
  } catch (err) {
    detalle = ultimo.getContentText().substring(0, 300);
  }
  throw new Error('Error ' + ultimo.getResponseCode() + ' del proveedor de IA: ' + detalle);
}
