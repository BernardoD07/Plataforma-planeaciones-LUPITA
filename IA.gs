/**
 * ============================================================================
 *  IA.gs · Generación OPCIONAL del proyecto (tabla 3) y de sus fases (tabla 4).
 *
 *  La IA nunca es obligatoria: la plataforma funciona completa escribiendo a
 *  mano. Estas funciones solo se invocan si el docente activa el interruptor
 *  "Redactar con IA" y existe una API key configurada.
 *
 *  Todo lo que la IA produce cae en tablas 3 y 4; las tablas 1 y 2 siempre las
 *  captura la persona, porque son datos administrativos y curriculares.
 * ============================================================================
 */

/* --------------------------------------------------------- Punto de entrada */

/**
 * Genera nombre del proyecto, problemática, propósito, producto final y el
 * contenido de cada fase, a partir de lo capturado en las tablas 1 y 2.
 *
 * @param {Object} datos      Tabla 1 (escuela, grado, sesiones, disciplina…).
 * @param {Object} contenido  Tabla 2 (contenido, temas, PDA, ejes, metodología…).
 * @param {Object=} opciones  {numFases, actividadesPorFase, enfoque}
 * @return {{ok:boolean, data:Object}}
 */
function generarProyecto(datos, contenido, opciones) {
  return envolver_(function () {
    validarEntradas_(datos, contenido);
    opciones = opciones || {};

    var numFases = Math.min(Math.max(Number(opciones.numFases) || 5, 1), 10);
    var porFase = Math.min(Math.max(Number(opciones.actividadesPorFase) || 5, 2), 12);

    var texto = llamarIA_(
      promptSistema_(),
      promptProyecto_(datos, contenido, numFases, porFase, opciones.enfoque),
      8000, true
    );

    return normalizarPropuesta_(extraerJson_(texto), datos, contenido, numFases);
  });
}

/**
 * Vuelve a redactar una sola fase sin tocar el resto de la planeación.
 * @param {number} indice  Posición de la fase (base 0).
 */
function regenerarFase(datos, contenido, proyecto, fases, indice) {
  return envolver_(function () {
    validarEntradas_(datos, contenido);
    var actual = (fases || [])[indice];
    if (!actual) throw new Error('No se encontró la fase que quieres regenerar.');

    var texto = llamarIA_(
      promptSistema_(),
      promptFase_(datos, contenido, proyecto, fases, indice),
      4000, true
    );

    var json = extraerJson_(texto);
    var fuente = json.fase || json;
    return normalizarFase_(fuente, indice, datos);
  });
}

/**
 * Ayuda puntual para un campo suelto (tablas 1, 2 o el de observaciones).
 * Devuelve texto plano, sin JSON, para pegarlo directo en el campo.
 */
function asistirCampo(campo, textoBase, contexto) {
  return envolver_(function () {
    var sistema = 'Eres docente de educación secundaria en México y conoces el Plan de Estudio 2022 ' +
      'de la Nueva Escuela Mexicana. Respondes SIEMPRE en español, en texto plano, sin markdown, ' +
      'sin viñetas con asteriscos y sin comentarios sobre tu propia respuesta.';

    var usuario = 'Redacta o mejora el campo "' + limpiarTexto_(campo) + '" de una planeación didáctica.\n\n' +
      'Contexto de la planeación:\n' + JSON.stringify(contexto || {}, null, 1) + '\n\n' +
      'Texto actual (puede venir vacío):\n' + (limpiarTexto_(textoBase) || '(vacío)') + '\n\n' +
      'Devuelve únicamente el texto final del campo. Si son varios elementos, uno por línea.';

    return { texto: limpiarTexto_(llamarIA_(sistema, usuario, 1200, false)) };
  });
}

function probarConexionIA() {
  return envolver_(function () {
    var r = llamarIA_(
      'Responde exactamente con la palabra CONEXION_OK y nada más.',
      'Prueba de conexión.', 32, false
    );
    return { respuesta: limpiarTexto_(r) };
  });
}

/* ----------------------------------------------------------- Validaciones */

function validarEntradas_(datos, contenido) {
  datos = datos || {};
  contenido = contenido || {};
  if (!limpiarTexto_(contenido.contenido) && !limpiarTexto_(contenido.temas)) {
    throw new Error('Para usar la IA necesitas capturar al menos el Contenido o los Temas (tabla 2).');
  }
  if (!limpiarTexto_(datos.disciplina) && !limpiarTexto_(datos.campoFormativo)) {
    throw new Error('Captura la Disciplina o el Campo formativo antes de generar con IA.');
  }
}

/* --------------------------------------------------------------- Prompts */

function promptSistema_() {
  return [
    'Eres docente de educación SECUNDARIA en México y dominas el Plan de Estudio 2022 de la',
    'Nueva Escuela Mexicana: campos formativos, ejes articuladores, procesos de desarrollo de',
    'aprendizaje (PDA) y metodologías por proyectos (comunitario, STEAM, ABP, aprendizaje',
    'servicio).',
    '',
    'Escribes planeaciones reales, aplicables en un aula con recursos limitados, con',
    'actividades concretas que un adolescente de 12 a 15 años pueda hacer.',
    '',
    'Reglas duras:',
    '- Respondes SIEMPRE en español de México y SIEMPRE en JSON válido, sin texto alrededor.',
    '- Nada de markdown, asteriscos, numeración manual ni emojis dentro de los valores.',
    '- Cada actividad se redacta en tercera persona y empieza con un verbo',
    '  ("Realizan una lluvia de ideas sobre...", "El docente explica...").',
    '- Los recursos son materiales reales y baratos, uno por elemento del arreglo.',
    '- No inventes datos administrativos (escuela, CCT, docente, fechas): esos ya los tiene',
    '  el formato.'
  ].join('\n');
}

function promptProyecto_(datos, contenido, numFases, porFase, enfoque) {
  var ejes = (contenido.ejes || []).join(', ') || 'los que mejor se articulen con el contenido';
  var sesiones = Number(datos.sesiones) || 0;

  var partes = [
    'Diseña un PROYECTO didáctico para educación secundaria con estos insumos.',
    '',
    '## Datos del grupo',
    '- Nivel escolar: ' + (limpiarTexto_(datos.nivel) || 'Secundaria'),
    '- Grado y grupo: ' + (limpiarTexto_(datos.gradoGrupo) || 'sin especificar'),
    '- Campo formativo: ' + (limpiarTexto_(datos.campoFormativo) || 'Saberes y pensamiento científico'),
    '- Disciplina: ' + (limpiarTexto_(datos.disciplina) || 'sin especificar'),
    '- Semanas: ' + (limpiarTexto_(datos.semanas) || 'sin especificar'),
    '- Sesiones totales disponibles: ' + (sesiones || 'sin especificar'),
    '- Tiempo por sesión: ' + (limpiarTexto_(datos.tiempoSesion) || 'sin especificar'),
    '- Periodo: ' + (limpiarTexto_(datos.periodo) || 'sin especificar'),
    '',
    '## Contenido curricular (tabla 2)',
    '- Contenido: ' + limpiarTexto_(contenido.contenido),
    '- Temas: ' + limpiarTexto_(contenido.temas),
    '- Procesos de desarrollo de aprendizaje: ' + limpiarTexto_(contenido.pda),
    '- Ejes articuladores a atender: ' + ejes,
    '- Campos formativos con que se vincula: ' + limpiarTexto_(contenido.camposVinculados),
    '- Metodología: ' + (limpiarTexto_(contenido.metodologia) || 'elige la más pertinente'),
    '- Técnicas: ' + limpiarTexto_(contenido.tecnicas),
    '- Evaluación formativa: ' + limpiarTexto_(contenido.evaluacionFormativa),
    '- Evaluación sumativa: ' + limpiarTexto_(contenido.evaluacionSumativa)
  ];

  if (limpiarTexto_(enfoque)) {
    partes.push('', '## Indicación adicional del docente', limpiarTexto_(enfoque));
  }

  partes.push(
    '',
    '## Lo que debes producir',
    'Un proyecto con ' + numFases + ' fases y aproximadamente ' + porFase + ' actividades por fase.',
    sesiones
      ? 'Reparte las ' + sesiones + ' sesiones entre las fases; la suma debe dar exactamente ' + sesiones + '.'
      : 'Estima un número razonable de sesiones por fase.',
    '',
    '## Formato de salida (JSON estricto)',
    '{',
    '  "proyecto": {',
    '    "nombre": "título breve y atractivo del proyecto",',
    '    "problematica": "problemática o tema de interés de los alumnos, en 1 o 2 frases",',
    '    "proposito": "propósito del proyecto, redactado con verbo en infinitivo",',
    '    "productoFinal": "producto final esperado, concreto y tangible"',
    '  },',
    '  "fases": [',
    '    {',
    '      "fase": "Fase 1. Nombre de la fase",',
    '      "construir": "encabezado de la columna de actividades para esta fase",',
    '      "actividades": ["actividad 1", "actividad 2"],',
    '      "recursos": ["material 1", "material 2"],',
    '      "sesiones": 6',
    '    }',
    '  ]',
    '}',
    '',
    'El campo "construir" es el título de la columna donde se describe el trabajo de la fase',
    '(por ejemplo "Selección del tema", "Diseño de la investigación", "Representación",',
    '"Demostración de lo aprendido", "Metacognición"). Cámbialo según lo que toque hacer.',
    'Devuelve solo el JSON.'
  );

  return partes.join('\n');
}

function promptFase_(datos, contenido, proyecto, fases, indice) {
  var actual = fases[indice] || {};
  var otras = fases
    .filter(function (f, i) { return i !== indice; })
    .map(function (f, i) {
      return '- ' + limpiarTexto_(f.fase) + ': ' + (f.actividades || []).slice(0, 4).join(' / ');
    })
    .join('\n');

  return [
    'Vuelve a redactar UNA SOLA fase de un proyecto de secundaria, con actividades distintas',
    'a las que ya tiene y sin repetir lo que hacen las demás fases.',
    '',
    '## Proyecto',
    '- Nombre: ' + limpiarTexto_((proyecto || {}).nombre),
    '- Problemática: ' + limpiarTexto_((proyecto || {}).problematica),
    '- Propósito: ' + limpiarTexto_((proyecto || {}).proposito),
    '- Producto final: ' + limpiarTexto_((proyecto || {}).productoFinal),
    '- Contenido: ' + limpiarTexto_(contenido.contenido),
    '- Disciplina: ' + limpiarTexto_(datos.disciplina),
    '- Grado y grupo: ' + limpiarTexto_(datos.gradoGrupo),
    '',
    '## Fase a rehacer',
    '- Nombre: ' + limpiarTexto_(actual.fase),
    '- Encabezado de columna: ' + limpiarTexto_(actual.construir),
    '- Sesiones asignadas: ' + (actual.sesiones || 'las que estimes'),
    '- Actividades actuales (NO las repitas):',
    (actual.actividades || []).map(function (a) { return '  · ' + a; }).join('\n') || '  (ninguna)',
    '',
    '## Las demás fases (evita duplicarlas)',
    otras || '(no hay otras fases)',
    '',
    '## Formato de salida (JSON estricto)',
    '{ "fase": { "fase": "...", "construir": "...", "actividades": ["..."],',
    '            "recursos": ["..."], "sesiones": 4 } }',
    'Devuelve solo el JSON.'
  ].join('\n');
}

/* ---------------------------------------------------------- Normalización */

function normalizarPropuesta_(json, datos, contenido, numFases) {
  var p = json.proyecto || json || {};
  var fasesIA = json.fases || json.fase || [];
  if (!Array.isArray(fasesIA)) fasesIA = [fasesIA];

  var fases = fasesIA.slice(0, numFases).map(function (f, i) {
    return normalizarFase_(f, i, datos);
  });

  // Si la IA devolvió menos fases de las pedidas, se completan con el andamiaje.
  while (fases.length < numFases) {
    fases.push(normalizarFase_({}, fases.length, datos));
  }

  var totalSesiones = Number(datos.sesiones) || 0;
  if (totalSesiones > 0) fases = repartirSesiones_(fases, totalSesiones);

  return {
    proyecto: {
      nombre: limpiarTexto_(p.nombre) || 'Proyecto de ' + (limpiarTexto_(datos.disciplina) || 'la asignatura'),
      problematica: limpiarTexto_(p.problematica),
      proposito: limpiarTexto_(p.proposito),
      productoFinal: limpiarTexto_(p.productoFinal)
    },
    fases: fases,
    generadoEn: fechaLegible_(new Date())
  };
}

function normalizarFase_(f, indice, datos) {
  f = f || {};
  var sugerida = FASES_SUGERIDAS[indice] || {
    fase: 'Fase ' + (indice + 1) + '.',
    construir: 'Actividades'
  };

  return {
    numero: indice + 1,
    fase: limpiarTexto_(f.fase) || sugerida.fase,
    construir: limpiarTexto_(f.construir) || sugerida.construir,
    actividades: aLista_(f.actividades),
    recursos: aLista_(f.recursos),
    sesiones: Number(f.sesiones) || 0
  };
}

/** Acepta arreglo, texto con saltos de línea o texto con viñetas. */
function aLista_(valor) {
  if (!valor) return [];
  var lista = Array.isArray(valor) ? valor : String(valor).split('\n');
  return lista
    .map(function (t) { return limpiarTexto_(t).replace(/^[-·•*\d.)\s]+/, '').trim(); })
    .filter(function (t) { return t.length > 0; });
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
    throw new Error('No hay API key configurada. La IA es opcional: puedes escribir la ' +
      'planeación a mano, o abrir Configuración y guardar una clave.');
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
    detalle = ultimo ? ultimo.getContentText().substring(0, 300) : 'sin respuesta';
  }
  throw new Error('Error ' + (ultimo ? ultimo.getResponseCode() : '?') +
    ' del proveedor de IA: ' + detalle);
}
