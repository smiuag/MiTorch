# SELFVOICING.md

Doctrina, resultados de investigación y plan de implementación del rework del modo blind hacia un modelo **self-voicing** (TTS propio + gestos sin TalkBack interceptando). CLAUDE.md la referencia pero NO la carga — léela cuando se retome el tema o se acometa el rework.

Estado: **PRIMERA ITERACIÓN COMPLETA, PENDIENTE TEST EN MÓVIL REAL** (2026-05-01). Validación empírica de spikes completada (2026-05-01). La asunción crítica de "esconder pantalla de TalkBack libera gestos" está **invalidada** — se necesita el rework completo. No hay vías intermedias viables.

Validación con usuario blind objetivo (2026-05-01):
- ✅ El usuario blind objetivo (NO el desarrollador) acepta desactivar TalkBack durante el uso de la app.
- ✅ Necesita poder elegir motor TTS — descarta `expo-speech` (no expone selección de motor), backend definitivo es **`react-native-tts`**.

## Estado de implementación

| Fase | Estado | Notas |
|------|--------|-------|
| 0 — Preparación | ✅ Hecho | `react-native-tts@4.1.1`, `<queries>` TTS_SERVICE en manifest, 6 settings nuevos en `settingsStorage` (`useSelfVoicing`, `tts{Engine,Voice,Rate,Pitch,Volume}`). |
| 1 — Speech swap | ✅ Hecho | `speechQueueService` reescrito: dos backends (talkback / tts), prioridades (high/normal/low), `applyConfig`, `preview`. Sección "Voz (modo blind)" en SettingsScreen con selectores motor/voz, sliders rate/pitch, volumen, "Probar voz". |
| 2 — TerminalScreen | ✅ Hecho con simplificación | **Reuso de `GestureConfig` existente** (decidido con usuario): no se diseña panel de sectores radiales nuevo, los gestos del modo completo (tap/doubletap/swipes/twofingers/pinch) se reusan como panel — el área del terminal ES el panel. `selfVoicingActive` → `importantForAccessibility="no-hide-descendants"` en root, doble-tap-para-activar via `selfVoicingPress` util en botones (Send, Settings, Silent, Ambient, Channels, Reconnect, Login retry, Scroll-to-bottom), gestos del PanResponder activos en blind+selfVoicing, `scrollEnabled=false` para FlatList en self-voicing (gestos > scroll histórico). ButtonGrid actualizado: 1-finger drag = secondary, doble-tap = primary, long-press = edit. Long-press en terminal → editor de gestos NO implementado (acceso vía Ajustes > Configurar gestos). |
| 3 — BlindChannelModal | ✅ Hecho | `selfVoicingActive` prop, doble-tap en canales/cerrar/enviar/reorder/guardar/cancelar, hide del root. |
| 2 — ButtonEditModal | ✅ Hecho 2026-05-01 (BlindNav) | Modal envuelto con `BlindGestureContainer` + welcome anunciando contexto (fila/columna). Cada bloque navegable como `SelfVoicingRow`: Etiqueta + Comando(s) (TextInputs cuyo onActivate hace `inputRef.focus()` para abrir teclado), Tipo Comando/Aviso (radio), 7 colores de fondo, checkbox "Añadir texto al input", acciones Borrar/Mover/Cancelar/Guardar. `SelfVoicingTextInput` extendido con `svInputRef` callback ref y `announceTyping` integrado en `onChangeText` para lectura char-a-char en modo blind. Render bifurcado por `selfVoicingActive`: rama `SelfVoicingRow` para self-voicing, rama `SelfVoicingTouchable` legacy para TalkBack/táctil normal. ScrollView con `scrollEnabled={false}` en blind. |
| 4 — SettingsScreen | ✅ Hecho (tercer rework 2026-05-01: modelo BlindNav audiogame-style) | **Modelo de gestos globales sin apuntar**: el dedo del usuario ciego total nunca tiene que apuntar a un control concreto. Toda la pantalla captura gestos vía `BlindGestureContainer` (nuevo) que despacha al singleton `blindNav` (`BlindNavController` en `selfVoicingPress.ts`). Mapeo: tap (sin movimiento) = activar item con foco; long-press (>600ms) = repetir el anuncio; swipe vertical >50px = next (dy>0) / prev (dy<0); swipe horizontal >50px = adjustInc (dx>0) / adjustDec (dx<0). Vibración corta en cada cambio de foco (20ms), media en activación (40ms). `SelfVoicingRow` simplificado: ya no es TouchableOpacity — solo View que mide rect y registra `onActivate`/`onAdjust` en `buttonRegistry.setActions`. `blockChildren` ya no es prop (siempre se bloquea pointerEvents). Rows con valor numérico (Velocidad TTS, Tono TTS, Volumen ambient/effects/TTS) reciben `onAdjust(dir)` que aplica el step. `BlindGestureContainer.enter(welcomeMessage)` anuncia bienvenida con instrucciones de gestos al montar y enfoca primer item tras 500ms (deja tiempo a SelfVoicingRow medirse). ScrollView con `scrollEnabled={false}` en blind (la navegación auto-scrollea). `useEffect` con polling 100ms detecta cambios de `blindNav.getCurrentKey()` y dispara auto-scroll si el item activo está fuera del viewport (margin 40px); `remeasureBus.emit()` post-scroll a 150ms y 400ms. Modelo viejo (drag-explore + tap directo + doble-tap + swipe horizontal-only) abandonado para Settings — el `SelfVoicingTouchable`/`SelfVoicingSwitch` quedan exportados para uso eventual (por ej. Terminal blind). Aplicado: solo SettingsScreen (Fase 1). Pendiente: EditButtonModal, BlindChannelModal (Fase 2), ServerListScreen (Fase 3), Triggers/Ambients/Sounds/Backup (Fase 4). TerminalScreen NO usa este modelo — mantiene gestos rápidos de combate. |
| 5 — NickAutocomplete | ✅ Hecho | Chips con doble-tap-para-activar. |
| 6 — Audio polish | ✅ Mínimo (ducking) | `Tts.setDucking(true)` automático cuando self-voicing inicializa. **No implementados**: earcons, pause/repeat por gesto, verbosidad de puntuación. Decisión: no implementar antes de feedback de usuario blind real — el ducking es la mejora con mayor impacto. |
| 7 — Onboarding | ✅ Mínimo (banner) | Detección runtime de TalkBack via `AccessibilityInfo` + banner naranja en TerminalScreen blind cuando `selfVoicingActive && screenReaderOn`. **No implementado**: wizard 4-paso de primera vez. Decisión: el banner cubre el caso peligroso (TalkBack-on-conflict); el wizard es educativo y se itera con feedback. |
| 8 — Testing | ⏳ Pendiente | TS compila + Android `assembleDebug` exitoso. Falta validación en móvil real con usuario blind: latencia de gestos, claridad TTS, ducking, comportamiento al rotar pantalla. |

## Pendientes priorizadas (post-iteración 1)

1. ~~**Lectura mientras tecleas**~~ (typing announce). ✅ Hecho 2026-05-01. Sin setting — cuando `selfVoicingActive` está on, lee siempre (decisión del usuario: el teclado mudo no es opción aceptable en self-voicing). Util `src/utils/typingAnnounce.ts` con función pura `announceTyping(prev, curr)` invocada desde `onChangeText` del input de comando del Terminal (ambos bloques: portrait + landscape) y del input "Mensaje" de `BlindChannelModal`, gateada por `selfVoicingActive`. Cada char añadido se anuncia con prioridad `high` (atropella → tecleo rápido = solo oyes el último, igual que TalkBack); si lo añadido es UN separador (espacio/puntuación) se anuncia la palabra recién cerrada en lugar del nombre del separador (más útil que oír "espacio"); borrar anuncia "borrado"; paste se lee tal cual. Mapeo de signos a nombre ("punto", "coma"…). Limitaciones conocidas (vs TalkBack real): **no replicamos exploración del teclado con dedo arrastrando** (es funcionalidad del teclado nativo Android — Gboard/SwiftKey — que solo se activa con un AccessibilityService como TalkBack; ninguna API permite a la app pedirla); tampoco leemos sugerencias de autocompletado ni nombres de teclas modificadoras. Para esos casos el usuario blind activa TalkBack puntualmente con el atajo OS — el TTS propio se calla solo (fix #2).

2. ~~**Detectar lector externo y rendirse**~~. ✅ Hecho 2026-05-01 en `speechQueueService.ts`. `AccessibilityInfo.isScreenReaderEnabled()` cubre TalkBack + Voice Assistant Samsung + Jieshuo + BrailleBack + cualquier otro AccessibilityService con flag de lector. Cuando hay lector externo on Y backend es `tts`: `enqueue` dropea, `preview` cae a `announceForAccessibility`, y si se enciende un lector mid-utterance se llama `clear()` para cortar el TTS en curso. No se implementa "reanudar al desactivar lector" porque las líneas que dropeamos ya pasaron. No se añade setting de override "self-voicing aunque haya lector" — si aparece el caso, añadirlo entonces; el banner naranja en TerminalScreen ya alerta del conflicto.

3. ~~**Interrupción al enviar comando**~~ ✅ Hecho 2026-05-01. `speechQueue.clear()` al inicio de `sendCommand` en `TerminalScreen.tsx` — cualquier comando del usuario (input, grid, intercepts internos como locate/parar/panel switch) descarta cola pendiente + corta TTS en curso. La respuesta del MUD entra en cola limpia. Sin matiz de prioridad: el clear es total. Si en uso real aparece pérdida de anuncios críticos (tipo vital al 0%), añadir gate por prioridad `high` o setting opt-in "Comandos interrumpen lectura". En backend talkback el clear solo vacía cola interna (TalkBack no tiene API para cortar utterance en curso).

---

## Simplificaciones tomadas y por qué

1. **Reuso de `GestureConfig` existente**: el plan original proponía un panel de gestos nuevo (sectores radiales / multi-touch combos). El usuario propuso usar la configuración de atajos actual y dejar que él capture lo que quiera. Es menos sexy pero reduce 10 h del plan original y aprovecha modelo mental existente.
2. **No al wizard de onboarding**: cubre con banner + nueva sección "Voz" en Settings. El usuario blind objetivo tiene contexto del autor; un wizard genérico no aporta hasta que validemos con otros usuarios.
3. **No al rework completo de SettingsScreen**: solo se hide del árbol TalkBack en root. Los Switches/Sliders quedan operables vía tap directo. Trade-off aceptable porque el flujo común es entrar a Settings con TalkBack on, no en self-voicing.
4. **No al long-press → editor de gestos en terminal**: el usuario llega vía Ajustes > Configurar gestos. Un atajo extra valdría la pena con feedback de uso real.
5. **No a earcons/verbosidad/pause-repeat**: polish con feedback. Ducking sí porque resuelve el conflicto música+TTS sin configuración.

---

## Problema raíz

En modo blind (`uiMode === 'blind'`) el usuario blind necesita poder lanzar **8-12 comandos en menos de 1 segundo** sin pasar por menús ni `doble-tap-explorar`. Casos típicos en MUD: huir, atacar, beber poción, mirar sala, último canal, etc.

Lo que tenemos hoy no llega:

- **Botones pequeños con `accessibilityActions`** (activate + secondary tipo swipe up/down): TalkBack presenta un menú al hacer swipe → lento, no sirve para combate o emergencias.
- **Gestos complejos en la View**: TalkBack los consume para su propio explore-by-touch. No los recibimos.
- **Speech queue** (`speechQueueService`): mitigación parcial del problema de que TalkBack atropella anuncios consecutivos, pero no resuelve el problema de input.

El cuello de botella es **el lector del OS**: TalkBack está siempre "por encima" de la app, intercepta gestos y serializa anuncios. Mientras juguemos dentro de su modelo, hay un techo de UX.

---

## Spikes empíricos (todos hechos 2026-05-01)

Antes de comprometerse al rework completo se probaron 5 variantes para validar si existía una vía barata dentro del modelo OS. Resultados verificados en móvil real con TalkBack activo:

### Spike v1 — `importantForAccessibility="no-hide-descendants"` en sub-View

Hipótesis: si una sub-View dentro de TerminalScreen se marca como inaccesible, TalkBack no anunciará nada al pasar el dedo por encima y los swipes llegarán al PanResponder.

Resultado: **FALLA**. TalkBack no anuncia (correcto), pero los swipes siguen siendo interpretados como navegación de TalkBack ("siguiente elemento", "anterior elemento", scroll). El PanResponder no recibe nada.

Razón técnica: el explore-by-touch de TalkBack opera a nivel de WindowManager del OS, no por subárbol de Views. Mientras TalkBack esté on, la pantalla entera está bajo su gestión incluso si una región no tiene nodos accesibles.

### Spike v2 — `accessibilityRole="adjustable"` con doble-tap-hold + drag

Hipótesis: TalkBack delega touches al app cuando el usuario hace el gesto Android estándar de doble-tap-mantener-segundo-tap-y-arrastrar (el patrón que usa para sliders accesibles).

Resultado: **FUNCIONA pero limitado**. El PanResponder recibe el drag completo. Permite implementar 8 sectores direccionales. Limitaciones:

- Requiere que el usuario primero ponga el foco en el panel (tap simple = focus, luego doble-tap-hold + drag).
- ~500 ms total por gesto (300 ms hold + 200 ms drag).
- Solo se delega el doble-tap-hold + drag. El tap simple, swipe simple, multi-touch, gestos curvos siguen siendo de TalkBack.
- Combinable con `onPress` (= activate, doble-tap = +1 acción) y `accessibilityActions: [{name:'increment'}, {name:'decrement'}]` (= swipe arriba/abajo en role=adjustable, +2 acciones). Total: **11 acciones rápidas accesibles**.

### Spike v3 — Módulo nativo `GestureSurface` con `dispatchHoverEvent` override

Hipótesis: implementar un View nativo Android que sobrescriba `dispatchHoverEvent()` para "tragar" los hover events sintéticos que TalkBack inyecta en el árbol de Views durante explore-by-touch. Patrón inspirado por WebView y Google Maps.

Implementación: 2 archivos Kotlin (~80 líneas), expo-module config actualizado, `<GestureSurface>` exportado a JS.

Resultado: **FALLA**. Dos sub-variantes probadas:

- **v3a — `dispatchHoverEvent` retorna `true`**: TalkBack no anuncia (consume), pero el PanResponder tampoco recibe nada. Los touch events reales son absorbidos por el AccessibilityService a nivel del OS — bloquear los hover en la View no los hace llegar como touches.
- **v3b — síntesis hover→touch**: convertir cada hover MotionEvent en un MotionEvent de touch sintético y dispatcharlo internamente vía `dispatchTouchEvent`. Tampoco funciona — el panel no se enfoca con tap (porque consumimos el hover) y los touches sintéticos no propagan al PanResponder de React Native.

Razón técnica: el patrón de WebView/Maps no resuelve nuestro problema. Lo que hacen ellos es **renderizar contenido accesible custom** dentro de una sola View Android (HTML elements virtuales en WebView, POIs en Maps) usando `AccessibilityNodeProvider`. No eluden TalkBack — cooperan con él. Nuestro caso ("zona muerta para el lector dentro de pantalla accesible") no es un caso de uso soportado por la API.

### Spike v4 — Botón ACTIVAR + `setAccessibilityFocus` programático

Hipótesis: añadir un botón al panel que, al pulsarlo, mueva el foco de accesibilidad programáticamente al área de gestos (`AccessibilityInfo.setAccessibilityFocus(reactTag)`). El usuario evita el tap manual de "encontrar" el panel.

Resultado: **FUNCIONA pero es solo cosmético sobre v2**. Movemos el foco un paso antes, pero seguimos limitados al doble-tap-hold + drag como único gesto raw. El foco persiste en el panel mientras el usuario no toque otra cosa, así que se pueden encadenar gestos sin re-pulsar ACTIVAR.

Útil como mejora UX si se acepta la limitación del modelo TalkBack. No abre vías nuevas.

### Spike v5 — Toggle `importantForAccessibility="no-hide-descendants"` en root de TerminalScreen

Hipótesis (la más fuerte): si en lugar de aplicar el flag a una sub-View lo aplicamos al **root** de la pantalla — escondiendo TODO de TalkBack — entonces el explore-by-touch no tiene nada que explorar y debería ceder los touches al PanResponder. Esta era la asunción central de la línea 137 del primer borrador de este documento.

Implementación: estado `gestureCaptureActive` que aplica el flag al root del Container View. Botón ACTIVAR para entrar al modo, overlay rojo "MODO CAPTURA — toca aquí para salir" sobre el área del terminal para volver al modo normal.

Resultado: **FALLA, definitivo**. Cuando se activa el modo:

- Tap en el panel → no hace nada (PanResponder no recibe).
- Swipe en el panel → no hace nada.
- Tap en el overlay rojo de salida → no responde, el usuario queda atrapado.
- Solo el botón hardware "Atrás" del OS funciona para salir (no va por TalkBack).

Razón técnica: esto invalida la asunción crítica del rework. El TouchExplorer de TalkBack sigue activo a nivel de pantalla incluso cuando no encuentra ningún nodo accesible — sigue procesando touches y, sin nada que enfocar, simplemente los traga sin pasarlos a la app. **No existe forma desde dentro de la app de hacer que TalkBack deje de interceptar touches mientras está on.**

### Por qué AccessibilityService propio tampoco resuelve

Considerado como vía adicional. Android permite que cualquier app declare un AccessibilityService con permisos elevados. Pero el modelo es de **coexistencia, no sustitución**:

- Múltiples servicios pueden estar activos a la vez.
- Cada uno recibe eventos en paralelo.
- **Solo UNO puede tener la flag `TouchExplorationEnabled`** que controla la interceptación de touches.
- TalkBack la posee mientras esté activo. No hay API para arrebatársela.

Tu servicio recibiría los eventos POST-procesados (alguien anunció algo, foco cambió), no los touches raw. No abre vías nuevas para gestos.

### Tabla resumen de spikes

| Spike | Hipótesis | Coste | Resultado | Conclusión |
|---|---|---|---|---|
| v1 | sub-View hide | 5 min | Falla | Subárbol no afecta TouchExplorer global |
| v2 | role=adjustable + doble-tap-hold | 30 min | Funciona limitado | 11 acciones rápidas viables |
| v3a | hover dispatchHoverEvent=true | 1 h (nativo) | Falla | Touches absorbidos por OS-level service |
| v3b | hover→touch synthesis | 30 min (nativo) | Falla | Síntesis no propaga al PanResponder de RN |
| v4 | botón + setAccessibilityFocus | 15 min | Cosmético sobre v2 | Mejora UX, no abre vías |
| v5 | hide root entero (toggle) | 30 min | Falla | TouchExplorer sigue activo screen-wide |
| AccessibilityService | servicio propio | (no implementado) | Inviable | Arquitectura impide arrebatar input |

**Conclusión final empírica**: dentro del modelo TalkBack-on, el techo es de 11 acciones rápidas accesibles. Para superar ese techo, hay que salir del modelo TalkBack — es decir, self-voicing real con TalkBack desactivado durante el modo blind.

---

## Aclaración crítica: TalkBack ES un TTS

Cambia toda la conversación: **TalkBack no tiene "voz propia"**. Es un orquestador que coge texto, decide qué leer y cuándo, y se lo pasa al motor TTS del sistema (Google TTS por defecto, pero el usuario puede instalar Vocalizer, Eloquence, Acapela…). La voz que se oye en TalkBack y la que oiríamos en nuestra app **serían exactamente la misma**, porque usaríamos el mismo motor.

Cuando los usuarios blind dicen "TTS malo, TalkBack bien", lo que casi siempre comparan es:
- TalkBack con su motor TTS bien configurado (rate alto, voz que les gusta, volúmenes ajustados).
- vs. apps que usan el TTS del sistema sin dejar elegir motor/voz, sin control de velocidad, etc.

La calidad de voz no es el problema. El problema es el **control**.

---

## Diseño del rework

### Doctrina

El usuario en modo blind **desactiva TalkBack** (a través del atajo OS de accesibilidad — Volume Up + Down 3s, o lo que tenga configurado). La app TorchZhyla en modo blind funciona como **app self-voiced**:

- Usa su propio TTS (`expo-speech`, ya en el proyecto) con motor/voz/rate configurables que igualan los de TalkBack.
- Implementa touch-to-explore propio en cada control (tap = oír label, doble-tap = activar).
- El panel de gestos puede usar **cualquier patrón** porque TalkBack no está interceptando.
- Los anuncios (líneas del MUD, vitals, canales) van por la cola de speech existente, simplemente cambiando el backend de `AccessibilityInfo.announceForAccessibility` a `Speech.speak`.

ServerListScreen (entrada de la app) sigue siendo accesible para TalkBack — es donde el usuario elige modo blind antes de saber que necesita desactivarlo. Una vez dentro de TerminalScreen blind, self-voicing toma el control.

### Frontera de aplicación

- **Self-voicing on**: TerminalScreen (uiMode==='blind'), BlindChannelModal, SettingsScreen abierto desde Terminal blind, NickAutocomplete, gestos del panel.
- **TalkBack normal**: ServerListScreen, SettingsScreen abierto desde fuera del Terminal (cuando uiMode!=='blind'), MyAmbientsScreen, MySoundsScreen, TriggersScreen, ConfigBackupScreen (estos últimos cuatro son configuración, raro que un usuario blind los toque mientras juega — fuera de scope de la primera iteración).

### Detección y onboarding

Al activar modo blind por primera vez, mostrar wizard:

1. "TorchZhyla en modo blind funciona mejor sin TalkBack. ¿Lo desactivas con el atajo de accesibilidad?"
2. Configurar el TTS propio: detectar motor por defecto del sistema (`Speech.getAvailableVoicesAsync()`), usar el mismo. Pedir ajustar rate y voz una sola vez.
3. Detectar en runtime si TalkBack sigue activo (`AccessibilityInfo.isScreenReaderEnabled()`) y mostrar banner de aviso si está on.

---

## Plan de implementación (fases)

### Fase 0 — Preparación (~2 h)

- ~~`expo-speech`~~ NO se instala — el usuario blind objetivo necesita poder elegir motor TTS, lo cual `expo-speech` no expone. Vamos directos a `react-native-tts`.
- `npm install react-native-tts`. Verificar que el autolinking de Expo + React Native 0.81 lo recoge sin tocar `MainApplication.kt` ni `settings.gradle` a mano. Si el build de Android peta, añadir el package manualmente (es bare workflow, se permite editar `android/`).
- Posible añadido en `AndroidManifest.xml`: bloque `<queries><intent><action android:name="android.intent.action.TTS_SERVICE"/></intent></queries>` para que Android 11+ permita enumerar motores TTS instalados (necesario para `Tts.engines()`).
- Crear rama `feature/self-voicing` (ya existe, estamos en ella).
- Añadir un setting `useSelfVoicing: boolean` en `settingsStorage.ts` (default `false` mientras se desarrolla, pasa a `true` cuando esté listo).

### Fase 1 — Speech engine swap (~4 h)

Archivo principal: `src/services/speechQueueService.ts`.

- Mantener la API pública (`enqueue(text)`, `clear()`) — todo el resto de la app la usa.
- Detectar runtime: si `useSelfVoicing` está on **Y** estamos en blind mode, usar `Speech.speak`. Si no, fallback a `AccessibilityInfo.announceForAccessibility` (modo actual).
- Implementar throttling/serialización equivalente al actual (espaciado por longitud).
- Soporte de prioridad: high cancela cola y atropella, normal encola, low solo si cola vacía.
- Callback de "speech finished" via `Speech.speak({ onDone })` para serialización más precisa que el timer estimado actual.
- Settings nuevos en `settingsStorage`: `ttsEngine`, `ttsVoice`, `ttsRate`, `ttsPitch`, `ttsVolume` (separable de música/efectos).

Archivos secundarios:
- `src/storage/settingsStorage.ts`: añadir los 5 settings nuevos.
- `src/screens/SettingsScreen.tsx`: añadir sección "Voz (modo blind)" con sliders/dropdowns para los settings nuevos. Botón "Probar voz" que dice una frase corta.

Backend: `react-native-tts` (decidido en Fase 0). API base: `Tts.speak(text)`, `Tts.stop()`, `Tts.engines()`, `Tts.setDefaultEngine(name)`, `Tts.voices()`, `Tts.setDefaultVoice(id)`, `Tts.setDefaultRate(0..1)`, `Tts.setDefaultPitch(0.5..2)`. Eventos: `tts-start`, `tts-finish`, `tts-cancel`, `tts-progress` (este último útil para earcons mid-utterance).

### Fase 2 — TerminalScreen self-voicing (~2 días)

Archivo principal: `src/screens/TerminalScreen.tsx` (3010 líneas, 86 referencias a accesibilidad).

- Aplicar `importantForAccessibility="no-hide-descendants"` al root cuando `uiMode==='blind' && useSelfVoicing` (esto solo tiene efecto si TalkBack está on — si está off, es no-op).
- Cada `TouchableOpacity` / `Pressable` del modo blind: añadir `onPressIn` que dispara `speechQueue.enqueue(label)` con prioridad high (atropella). El `onPress` original sigue ejecutando la acción al doble-tap (o configurable: tap simple = activate si self-voicing, tap = focus + doble-tap = activate si TalkBack on).
- Botones afectados: Enviar, Ajustes, Música, silent toggle, panel switch (blind), canales, Login retry.
- Líneas del terminal: ya van por `blindModeService.announceMessage()` → `speechQueue.enqueue()`. Con la fase 1, automáticamente usan el TTS propio.
- Quitar el panel de gestos del spike (ya hecho). Reemplazar con el panel definitivo:
  - Sin TalkBack interceptando, el `PanResponder` recibe todo: 8 sectores, tap, doble-tap, long-press, multi-touch, swipes curvos.
  - Settings: mapeo de cada gesto a un comando, por personaje/servidor (similar a como están los `gestures` del modo completo, pero con más patrones disponibles).

Subtarea específica: revisar TODOS los `accessibilityLiveRegion`, `accessibilityActions`, `onAccessibilityAction` en el archivo y traducir a equivalente self-voicing (anuncio explícito vía speechQueue, callbacks propios en lugar de TalkBack).

### Fase 3 — BlindChannelModal (~6 h)

Archivo: `src/components/BlindChannelModal.tsx` (667 líneas, 18 refs).

- Misma estrategia que TerminalScreen: hide del modal, touch-to-explore en cada mensaje y botón.
- Diseño de navegación: ¿swipe vertical para mover entre mensajes? ¿tap para oír? ¿doble-tap para responder al canal?
- Mantener la lógica de aliasing de canales y mensajes existente.

### Fase 4 — SettingsScreen self-voicing (~1.5 días)

Archivo: `src/screens/SettingsScreen.tsx` (1611 líneas, 51 refs).

- Modo dual: detectar `uiMode` desde props/context. Si blind+selfVoicing: hide + touch-to-explore. Si completo o blind+TalkBack: comportamiento actual.
- Cada control (`Switch`, `Slider`, `TextInput`, dropdowns custom): `onPressIn`/`onValueChange` → speechQueue.
- Sliders presentan reto: el "drag" para cambiar valor entra en conflicto con explore-touch. Solución: con self-voicing on, slider responde al drag normal (sin TalkBack interfiriendo). Anuncia el valor cada vez que cambia significativamente.
- TextInput: cuando `useSelfVoicing` on, anunciar caracteres tecleados (con throttle).

### Fase 5 — NickAutocomplete + flotantes menores (~3 h)

- `src/components/NickAutocomplete.tsx`: 80 líneas. Aplicar self-voicing a los chips de sugerencia.
- `src/components/FloatingMessages.tsx`: visual, sin modificación necesaria.

### Fase 6 — Audio polish (~6 h)

- **Audio ducking**: cuando el TTS habla, bajar la música ambiente al 30%. Implementar en módulo nativo `torchzhyla-foreground` usando `AudioManager.requestAudioFocus(AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)`. ~30 líneas Kotlin.
- **Earcons**: sonidos cortos para feedback (focus en botón = "tic" suave, error = "buzz" descendente, activación = "beep"). Reusar el sistema de sounds existente.
- **Pause/repeat gesture**: gesto en el panel (e.g. dos dedos abajo) para pausar TTS, dos dedos arriba para repetir último anuncio.
- **Verbosity de puntuación**: setting que pre-procesa el texto antes de pasar al TTS.
- **Modos de interrupción**: ya implementables vía prioridades en speechQueue + Speech.stop() para alta prioridad.

### Fase 7 — Onboarding wizard (~6 h)

- Detectar primera vez que `uiMode==='blind' && useSelfVoicing===true` (flag `selfVoicingOnboarded` en settings).
- Modal/screen explicativo en 3-4 pasos:
  1. "TorchZhyla en modo blind funciona mejor sin TalkBack. Te enseñamos cómo desactivarlo."
  2. Detectar TalkBack on y dar instrucciones del atajo OS.
  3. Configurar voz: motor por defecto, slider de rate, botón "Probar".
  4. Tour rápido de gestos del panel.
- Banner persistente en TerminalScreen blind si TalkBack sigue activo: "TalkBack está on. Para mejor experiencia desactívalo con [atajo]."

### Fase 8 — Testing + iteración con usuario blind objetivo (~4 h)

- Probar en móvil con TalkBack off y TalkBack on (ambos casos).
- Probar con varios motores TTS instalados.
- Validar con el usuario blind objetivo: latencia de gestos, claridad de anuncios, navegación entre modales, recuperación de errores.

### Total estimado

| Fase | Horas |
|---|---|
| 0 - Preparación | 2 |
| 1 - Speech swap | 4 |
| 2 - TerminalScreen | 16 |
| 3 - BlindChannelModal | 6 |
| 4 - SettingsScreen | 12 |
| 5 - NickAutocomplete + flotantes | 3 |
| 6 - Audio polish | 6 |
| 7 - Onboarding | 6 |
| 8 - Testing | 4 |
| **Total** | **59 h** |

A 4-6 h productivas/día: **10-15 días de trabajo**. La estimación de 1.5-2 semanas del plan original se mantiene realista.

---

## Tradeoffs

### Pro

- Resuelve **todos** los problemas de blind mode de golpe — gestos rápidos, cola que atropella, `accessibilityActions` lentos. Control total.
- Permite cualquier patrón de input: sectores direccionales, multi-touch, gestos custom, lo que diseñemos.
- Misma voz que TalkBack (mismo motor TTS), por lo que el usuario no nota degradación de calidad.
- ServerListScreen y configuraciones poco usadas siguen accesibles con TalkBack — no hay regresión fuera de blind.

### Contra

- Somos responsables al 100% de la accesibilidad dentro de TerminalScreen blind. Si nuestro TTS falla, el usuario está ciego dentro del juego. Hay que probarlo muy bien.
- Refactor no trivial — `speechQueueService`, todos los componentes del modo blind, settings nuevos, diseñar discovery desde cero.
- El usuario tiene que **desactivar TalkBack a mano** cada vez que entra a jugar y reactivarlo al salir. Mitigable: el atajo OS lo hace en 1 segundo, y si tiene Smart Lock o atajos personalizados puede ser instantáneo. Pero es UX peor que "todo automático".
- Si TalkBack queda accidentalmente activado mientras se juega, la app está **doblada** (anuncios duplicados de los dos sistemas atropellándose). Detectar y mostrar banner.

---

## Decisiones cerradas

- **Self-voicing es opt-in vía setting** `useSelfVoicing` (no automático para `uiMode==='blind'`). Razón: durante el desarrollo necesitamos poder desactivarlo para comparar; en producción el wizard de onboarding lo activa por defecto en blind y deja al usuario quitarlo si quiere quedarse con TalkBack puro (modelo actual con sus limitaciones conocidas).
- **Frontera self-voicing**: TerminalScreen blind + sus modales directos (Settings desde Terminal, BlindChannelModal). Resto de la app sigue con TalkBack normal.
- **Backend TTS**: empezar con `expo-speech` (ya está). Migrar a `react-native-tts` si la falta de selección de motor es bloqueante.
- **Touch-to-explore propio**: tap = speak label, doble-tap = activate (igual que TalkBack pero sin él). Long-press sigue como editar (modo completo).
- **No al rework completo de Settings** en primera iteración: Settings funciona con TalkBack on, el usuario vuelve a Settings con TalkBack on cuando necesite cambiar algo. Solo Settings ABIERTO desde Terminal blind con `useSelfVoicing` requiere self-voicing — y ahí solo los controles esenciales (rate de TTS, mapeo de gestos). El resto se queda visible pero sin self-voicing si el usuario insiste en abrirlos sin TalkBack.

## Decisiones abiertas

- **¿Qué motor TTS recomendar?** Depende de qué tenga el usuario blind objetivo. Validar con él.
- **¿Anunciar cada línea del terminal o solo las anunciables del filtro?** Hoy el filtro decide. Mantener como está, pero quizá añadir setting "verbosidad" alta/media/baja para self-voicing.
- **¿Diseño exacto del panel de gestos?** Una vez sin restricción de TalkBack, abrir el espacio: ¿8 sectores radiales? ¿zonas táctiles separadas (esquinas + centro)? ¿multi-touch para combos? Probar con prototipos.
- **¿Cómo expresar "estoy en self-voicing" visualmente para tester con vista?** Banner discreto en algún lugar de Terminal blind para debugging — no para usuario final.

---

## Validación pendiente antes de comprometer al rework

Antes de empezar la Fase 1, validar dos cosas con el usuario blind objetivo:

1. **¿Está dispuesto a desactivar TalkBack al jugar?** Si la respuesta es "no, eso es un dealbreaker", todo este plan no aplica y el techo de 11 acciones rápidas (modelo TalkBack-on) es lo que hay.
2. **¿Qué motor TTS usa?** Saber si `expo-speech` con el motor por defecto del sistema (que probablemente sea el que él ya usa) le sirve, o si necesita poder elegir motor (entonces `react-native-tts`).

Spike técnico adicional NO necesario — los cinco spikes ya hechos cubren todas las hipótesis de "vía barata". El siguiente paso es comprometerse al plan o no.
