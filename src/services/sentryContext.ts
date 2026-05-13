import * as Sentry from '@sentry/react-native';

// Helpers para enriquecer los eventos de Sentry con contexto del estado
// actual de la app: a qué personaje y servidor estaba conectado, qué modo
// de UI, qué flags relevantes (blind, self-voicing, lector de pantalla,
// música, gestos…) y cuánto rato lleva la sesión. Sin esto, los crash
// reports solo traen el UUID anónimo del device y es imposible decidir
// si un crash tipo "FGS timeout" corresponde a un usuario que llevaba 6
// horas conectado o a uno que abrió la app hace 2 minutos.
//
// Las APIs `setUser/setTag/setContext/addBreadcrumb` son globales del SDK
// — una vez aplicadas, viajan con cualquier evento futuro hasta que se
// vuelvan a cambiar. No hace falta wirearlo a cada pantalla; lo importante
// es mantenerlo actualizado en los puntos donde el estado cambia.

let sessionStartMs: number | null = null;

export interface ConnectionInfo {
  character: string | null;     // server.username — null si no hay autologin
  server: string;               // server.name
  host: string;                 // server.host (útil para correlacionar MUDs)
}

/**
 * Marca el inicio de una sesión conectada. Establece user.username,
 * tags identificativos y un breadcrumb. Llamar desde `onConnect` del
 * TelnetService — incluso si el autologin aún no ha terminado, ya hay
 * suficiente info para empezar a correlacionar crashes.
 */
export function recordConnect(info: ConnectionInfo): void {
  sessionStartMs = Date.now();
  if (info.character) {
    Sentry.setUser({ username: info.character });
    Sentry.setTag('character', info.character);
  } else {
    Sentry.setUser(null);
  }
  Sentry.setTag('server', info.server);
  Sentry.setTag('host', info.host);
  Sentry.setTag('connected', 'true');
  Sentry.setContext('session', {
    startedAt: new Date(sessionStartMs).toISOString(),
    server: info.server,
    host: info.host,
    character: info.character,
  });
  Sentry.addBreadcrumb({
    category: 'connection',
    level: 'info',
    message: `Conectado a ${info.server}${info.character ? ` como ${info.character}` : ''}`,
  });
}

/**
 * Cierra la sesión a efectos de telemetría. Calcula duración, añade
 * breadcrumb con el dato, guarda un "lastSession" en contexto por si el
 * crash llega DESPUÉS del disconnect (raro pero posible: foreground
 * service muriendo poco después del close), y limpia user/tag de
 * personaje para no atribuir crashes futuros al personaje anterior.
 */
export function recordDisconnect(): void {
  const startMs = sessionStartMs;
  sessionStartMs = null;
  const durationSec = startMs ? Math.floor((Date.now() - startMs) / 1000) : 0;
  Sentry.addBreadcrumb({
    category: 'connection',
    level: 'info',
    message: `Desconectado tras ${formatDuration(durationSec)}`,
    data: { durationSec },
  });
  Sentry.setContext('lastSession', {
    durationSec,
    durationHuman: formatDuration(durationSec),
    startedAt: startMs ? new Date(startMs).toISOString() : null,
    endedAt: new Date().toISOString(),
  });
  Sentry.setContext('session', null);
  Sentry.setUser(null);
  // Sentry no documenta unset de tag — pasando undefined o null el SDK
  // lo elimina. Hacemos los tres por consistencia.
  Sentry.setTag('character', undefined as any);
  Sentry.setTag('connected', 'false');
}

/**
 * Sincroniza el contexto de modo de UI. Llamar cuando cualquiera de los
 * tres cambia. uiMode y selfVoicing son configurables; screenReaderOn lo
 * detecta el SDK de AccessibilityInfo en runtime.
 *
 * Especialmente útil para correlacionar crashes específicos del rework
 * de modo blind (ej: si vemos que todos los crashes del nuevo
 * voiceDictation vienen con selfVoicing=on, foco directo).
 */
export function setUiModeContext(opts: {
  uiMode: 'blind' | 'completo';
  selfVoicing: boolean;
  screenReaderOn: boolean;
}): void {
  Sentry.setTag('uiMode', opts.uiMode);
  Sentry.setTag('selfVoicing', opts.selfVoicing ? 'on' : 'off');
  Sentry.setTag('screenReader', opts.screenReaderOn ? 'on' : 'off');
}

/**
 * Snapshot de flags relevantes para reproducir el estado del usuario al
 * crashear. No son tags porque no queremos filtrar por ellos en el
 * dashboard; van como contexto adicional visible en el detail del evento.
 */
export function setFlagsContext(flags: {
  ambient?: boolean;
  sounds?: boolean;
  gestures?: boolean;
  backgroundConnection?: boolean;
  keepAwake?: boolean;
  triggersEnabled?: boolean;
  logsEnabled?: boolean;
}): void {
  Sentry.setContext('flags', flags);
}

/**
 * Breadcrumb genérico para eventos relevantes que conviene tener en el
 * timeline al crashear. Ejemplos: cambio de pantalla, walking iniciado,
 * trigger ejecutado. Usar con cabeza — Sentry trunca el historial a los
 * últimos 100 breadcrumbs, así que no spamear cada keystroke.
 */
export function breadcrumb(category: string, message: string, data?: Record<string, any>): void {
  Sentry.addBreadcrumb({
    category,
    level: 'info',
    message,
    data,
  });
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s ? `${m}m${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h${mm}m` : `${h}h`;
}
