/**
 * ============================================================================
 *  Tiempos.gs · Reparto de sesiones entre las fases del proyecto.
 *
 *  La tabla 1 fija cuántas sesiones hay en total y cuánto dura cada una; la
 *  tabla 4 dice cuántas se van en cada fase. Aquí se cuadra esa aritmética,
 *  tanto cuando la propone la IA como cuando el docente pulsa "Balancear".
 * ============================================================================
 */

/**
 * Ajusta las sesiones por fase para que sumen exactamente el total, respetando
 * la proporción que ya traen. Muta y devuelve el mismo arreglo.
 *
 * @param {Array<{sesiones:number}>} fases
 * @param {number} total Sesiones disponibles según la tabla 1.
 */
function repartirSesiones_(fases, total) {
  if (!fases || !fases.length) return fases || [];
  total = Math.max(Number(total) || 0, 0);
  if (!total) return fases;

  var suma = fases.reduce(function (s, f) { return s + (Number(f.sesiones) || 0); }, 0);

  // Sin proporción previa: reparto parejo y el resto a las primeras fases.
  if (suma <= 0) {
    var base = Math.floor(total / fases.length);
    var resto = total - base * fases.length;
    fases.forEach(function (f, i) { f.sesiones = base + (i < resto ? 1 : 0); });
    return fases;
  }

  var acumulado = 0;
  fases.forEach(function (f, i) {
    if (i === fases.length - 1) {
      // La última absorbe el redondeo para que el total cuadre exacto.
      f.sesiones = Math.max(total - acumulado, 0);
    } else {
      f.sesiones = Math.max(Math.round((Number(f.sesiones) || 0) * total / suma), 1);
      acumulado += f.sesiones;
    }
  });
  return fases;
}

/**
 * Versión llamable desde el cliente: reparte y devuelve además el resumen que
 * se pinta en los indicadores del paso de fases.
 *
 * @param {Array} fases
 * @param {number} totalSesiones
 * @param {(number|string)} minutosPorSesion
 */
function balancearSesiones(fases, totalSesiones, minutosPorSesion) {
  return envolver_(function () {
    var copia = (fases || []).map(function (f) {
      return { sesiones: Number(f.sesiones) || 0 };
    });
    repartirSesiones_(copia, totalSesiones);

    var resultado = (fases || []).map(function (f, i) {
      f.sesiones = copia[i].sesiones;
      return f;
    });

    return {
      fases: resultado,
      resumen: resumenDeSesiones_(resultado, totalSesiones, minutosPorSesion)
    };
  });
}

/**
 * Indicadores para la interfaz: cuántas sesiones se repartieron, cuántas
 * quedan libres y a cuántos minutos y horas equivale todo.
 */
function resumenDeSesiones_(fases, totalSesiones, minutosPorSesion) {
  var asignadas = (fases || []).reduce(function (s, f) {
    return s + (Number(f.sesiones) || 0);
  }, 0);

  var total = Math.max(Number(totalSesiones) || 0, 0);
  var minutos = minutosNumero_(minutosPorSesion);

  return {
    asignadas: asignadas,
    disponibles: total,
    diferencia: total - asignadas,
    cuadra: total === 0 || total === asignadas,
    minutosPorSesion: minutos,
    minutosTotales: asignadas * minutos,
    tiempoLegible: formatoDuracion_(asignadas * minutos)
  };
}

/** Acepta 50, "50", "50 minutos" o "1 hora". */
function minutosNumero_(valor) {
  if (valor === null || valor === undefined) return 0;
  var texto = String(valor).toLowerCase();
  var numero = parseFloat(texto.replace(',', '.'));
  if (isNaN(numero)) return 0;
  if (texto.indexOf('hora') !== -1) return Math.round(numero * 60);
  return Math.round(numero);
}

function formatoDuracion_(minutos) {
  minutos = Math.max(Number(minutos) || 0, 0);
  if (minutos < 60) return minutos + ' min';
  var horas = Math.floor(minutos / 60);
  var resto = minutos % 60;
  return resto ? horas + ' h ' + resto + ' min' : horas + ' h';
}
