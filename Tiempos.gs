/**
 * ============================================================================
 *  Tiempos.gs · Distribución automática del tiempo entre las actividades
 *  seleccionadas y empaquetado en sesiones reales de clase.
 * ============================================================================
 */

/**
 * Reparte el tiempo disponible entre las actividades seleccionadas y las
 * acomoda en sesiones consecutivas.
 *
 * @param {Object} proyecto  Propuesta normalizada (con momentos y actividades).
 * @param {Object} opciones  {sesiones, minutosPorSesion, granularidad, modo}
 *        modo: 'proporcional'  -> respeta el peso relativo sugerido por la IA
 *              'equitativo'    -> reparte el tiempo por igual
 *              'manual'        -> respeta duracionAsignada tal como viene
 * @return {{ok:boolean, data:Object}}
 */
function distribuirTiempos(proyecto, opciones) {
  return envolver_(function () {
    return calcularDistribucion_(proyecto, opciones);
  });
}

function calcularDistribucion_(proyecto, opciones) {
  opciones = opciones || {};
  var sesiones = Number(opciones.sesiones || (proyecto.insumos || {}).sesiones || 0);
  var minutosPorSesion = Number(opciones.minutosPorSesion || (proyecto.insumos || {}).minutosPorSesion || 0);
  var granularidad = Number(opciones.granularidad || 5);
  var modo = opciones.modo || 'proporcional';

  if (!sesiones || !minutosPorSesion) {
    throw new Error('Faltan las sesiones o los minutos por sesión para calcular los tiempos.');
  }

  var seleccionadas = actividadesSeleccionadas_(proyecto);
  if (!seleccionadas.length) {
    throw new Error('No hay actividades seleccionadas. Elige al menos una antes de continuar.');
  }

  var totalDisponible = sesiones * minutosPorSesion;

  if (modo !== 'manual') {
    asignarMinutos_(seleccionadas, totalDisponible, granularidad, modo, minutosPorSesion);
  }

  var agenda = empaquetarEnSesiones_(seleccionadas, sesiones, minutosPorSesion);
  var totalAsignado = seleccionadas.reduce(function (s, a) { return s + a.duracionAsignada; }, 0);

  return {
    totalDisponible: totalDisponible,
    totalAsignado: totalAsignado,
    diferencia: totalDisponible - totalAsignado,
    sesionesPlanificadas: sesiones,
    minutosPorSesion: minutosPorSesion,
    sesionesUsadas: agenda.sesiones.length,
    desborde: agenda.desborde,
    actividades: seleccionadas.map(function (a) {
      return {
        id: a.id,
        fase: a.fase,
        momento: a.momento,
        titulo: a.titulo,
        duracionSugerida: a.duracionSugerida,
        duracionAsignada: a.duracionAsignada,
        sesionInicio: a.sesionInicio,
        sesionFin: a.sesionFin
      };
    }),
    sesiones: agenda.sesiones,
    porFase: resumenPorFase_(seleccionadas),
    porMomento: resumenPorMomento_(seleccionadas)
  };
}

/** Devuelve, en orden metodológico, las actividades marcadas por el docente. */
function actividadesSeleccionadas_(proyecto) {
  var lista = [];
  (proyecto.momentos || []).forEach(function (m) {
    (m.actividades || []).forEach(function (a) {
      if (a.seleccionada !== false) {
        a.fase = a.fase || m.fase;
        a.momento = a.momento || m.momento;
        lista.push(a);
      }
    });
  });
  return lista;
}

/**
 * Escala las duraciones para que sumen exactamente el tiempo disponible,
 * redondeando a múltiplos de `granularidad` y corrigiendo el residuo.
 */
function asignarMinutos_(actividades, totalDisponible, granularidad, modo, minutosPorSesion) {
  var n = actividades.length;
  var minimo = granularidad;
  var maximo = Math.max(minutosPorSesion * 2, granularidad * 2);

  // El tiempo disponible debe alcanzar al menos el mínimo por actividad.
  if (totalDisponible < n * minimo) {
    throw new Error('El tiempo disponible (' + totalDisponible + ' min) no alcanza para ' + n +
      ' actividades. Reduce actividades o aumenta las sesiones.');
  }

  var pesos;
  if (modo === 'equitativo') {
    pesos = actividades.map(function () { return 1; });
  } else {
    pesos = actividades.map(function (a) { return Math.max(Number(a.duracionSugerida) || 1, 1); });
  }
  var sumaPesos = pesos.reduce(function (s, p) { return s + p; }, 0);

  var asignados = actividades.map(function (a, i) {
    var crudo = totalDisponible * (pesos[i] / sumaPesos);
    var redondeado = Math.round(crudo / granularidad) * granularidad;
    return Math.min(Math.max(redondeado, minimo), maximo);
  });

  // Corrección del residuo: se reparte de a un paso sobre las actividades
  // más largas (si sobra) o más cortas (si falta), respetando los topes.
  var residuo = totalDisponible - asignados.reduce(function (s, v) { return s + v; }, 0);
  var guardia = 0;
  while (residuo !== 0 && guardia < 5000) {
    guardia++;
    var paso = residuo > 0 ? granularidad : -granularidad;
    var indice = elegirIndiceAjuste_(asignados, paso, minimo, maximo);
    if (indice === -1) break;
    asignados[indice] += paso;
    residuo -= paso;
  }

  actividades.forEach(function (a, i) {
    a.duracionAsignada = asignados[i];
  });
}

function elegirIndiceAjuste_(asignados, paso, minimo, maximo) {
  var mejor = -1;
  for (var i = 0; i < asignados.length; i++) {
    var nuevo = asignados[i] + paso;
    if (nuevo < minimo || nuevo > maximo) continue;
    if (mejor === -1) { mejor = i; continue; }
    // Al sumar tiempo se favorece a la más corta; al restarlo, a la más larga.
    if (paso > 0 ? asignados[i] < asignados[mejor] : asignados[i] > asignados[mejor]) mejor = i;
  }
  return mejor;
}

/**
 * Acomoda las actividades en sesiones consecutivas. Una actividad puede
 * abarcar más de una sesión; si la que sigue no cabe en el hueco restante y
 * ese hueco es pequeño, la sesión se cierra y la actividad empieza en la siguiente.
 */
function empaquetarEnSesiones_(actividades, sesionesPlanificadas, minutosPorSesion) {
  var sesiones = [];
  var actual = nuevaSesion_(1);
  var usado = 0;

  function cerrar() {
    if (actual.bloques.length) sesiones.push(actual);
    actual = nuevaSesion_(sesiones.length + 1);
    usado = 0;
  }

  actividades.forEach(function (a) {
    var restante = a.duracionAsignada;
    a.sesionInicio = actual.numero;

    while (restante > 0) {
      var hueco = minutosPorSesion - usado;

      // Hueco inservible: cerrar sesión y continuar en la siguiente.
      if (hueco < Math.min(5, restante)) {
        cerrar();
        if (!actual.bloques.length && a.sesionInicio !== actual.numero && restante === a.duracionAsignada) {
          a.sesionInicio = actual.numero;
        }
        continue;
      }

      var trozo = Math.min(hueco, restante);
      actual.bloques.push({
        actividadId: a.id,
        fase: a.fase,
        momento: a.momento,
        titulo: a.titulo,
        minutos: trozo,
        inicioMin: usado,
        finMin: usado + trozo,
        continuacion: trozo < a.duracionAsignada && restante < a.duracionAsignada
      });
      usado += trozo;
      restante -= trozo;
      actual.minutosUsados = usado;

      if (usado >= minutosPorSesion) cerrar();
    }

    a.sesionFin = actual.bloques.length ? actual.numero : Math.max(sesiones.length, a.sesionInicio);
  });

  if (actual.bloques.length) sesiones.push(actual);

  sesiones.forEach(function (s) {
    s.minutosUsados = s.bloques.reduce(function (t, b) { return t + b.minutos; }, 0);
    s.minutosLibres = Math.max(minutosPorSesion - s.minutosUsados, 0);
  });

  return {
    sesiones: sesiones,
    desborde: Math.max(sesiones.length - sesionesPlanificadas, 0)
  };
}

function nuevaSesion_(numero) {
  return { numero: numero, bloques: [], minutosUsados: 0, minutosLibres: 0 };
}

function resumenPorFase_(actividades) {
  return agrupar_(actividades, function (a) { return a.fase; });
}

function resumenPorMomento_(actividades) {
  return agrupar_(actividades, function (a) { return a.fase + ' · ' + a.momento; });
}

function agrupar_(actividades, claveFn) {
  var mapa = {};
  var orden = [];
  actividades.forEach(function (a) {
    var k = claveFn(a);
    if (!mapa[k]) { mapa[k] = { nombre: k, minutos: 0, actividades: 0 }; orden.push(k); }
    mapa[k].minutos += a.duracionAsignada;
    mapa[k].actividades++;
  });
  var total = actividades.reduce(function (s, a) { return s + a.duracionAsignada; }, 0) || 1;
  return orden.map(function (k) {
    mapa[k].porcentaje = Math.round((mapa[k].minutos / total) * 100);
    return mapa[k];
  });
}

/** Convierte minutos a un formato legible: 95 -> "1 h 35 min". */
function formatoDuracion_(minutos) {
  minutos = Math.round(Number(minutos) || 0);
  if (minutos < 60) return minutos + ' min';
  var h = Math.floor(minutos / 60);
  var m = minutos % 60;
  return h + ' h' + (m ? ' ' + m + ' min' : '');
}
