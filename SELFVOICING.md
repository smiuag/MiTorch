# SELFVOICING.md

Doctrina y diseño abierto para el rework del modo blind hacia un modelo **self-voicing** (TTS propio + gestos sin lector OS de por medio). CLAUDE.md la referencia pero NO la carga — léela cuando retomes el tema "Acceso rápido a comandos en blind mode" o se decida acometer el rework.

Estado: **EN DISCUSIÓN** (planteado 2026-05-01). Sin código escrito, sin compromiso de implementación. Pendiente de validación con usuario blind objetivo antes de cerrar diseño.

---

## Problema raíz

En modo blind (`uiMode === 'blind'`) el usuario blind necesita poder lanzar **8-12 comandos en menos de 1 segundo** sin pasar por menús ni `doble-tap-explorar`. Casos típicos en MUD: huir, atacar, beber poción, mirar sala, último canal, etc.

Lo que tenemos hoy no llega:
- **Botones pequeños con `accessibilityActions`** (activate + secondary tipo swipe up/down): TalkBack presenta un menú al hacer swipe → lento, no sirve para combate o emergencias.
- **Gestos complejos en la View**: TalkBack los consume para su propio explore-by-touch. No los recibimos.
- **Speech queue** (`speechQueueService`): mitigación parcial del problema de que TalkBack atropella anuncios consecutivos, pero no resuelve el problema de input.

El cuello de botella es **el lector del OS**: TalkBack está siempre "por encima" de la app, intercepta gestos y serializa anuncios. Mientras juguemos dentro de su modelo, hay un techo de UX.

---

## Brainstorm dentro del modelo OS (opciones contempladas)

Antes de plantear el rework completo, las opciones que intentan vivir con TalkBack:

- **Zona doble-tap-hold + drag direccional** (candidato técnico dentro del modelo OS). Una `View` grande tipo "Zona de gestos rápidos" enfocada por TalkBack como un único elemento. El usuario hace doble-tap manteniendo el segundo dedo (gesto estándar de Android para drag/slider) — TalkBack cede el touch a la app durante todo el gesto. Detectamos `dx/dy` del PanResponder al soltar y disparamos el comando configurado para esa dirección (8 sectores: 4 cardinales + 4 diagonales). Coste estimado: ~3-4 h prototipo + settings de 8 slots.
- **Volume Up/Down a nivel `KeyEvent`** (TalkBack no los consume): 2 atajos extra "duros".
- **Botón "voz"** (`@react-native-voice/voice`): para comandos no comunes tipo "dar llave a Pepe". 1-3 s por comando.
- **Shake** (acelerómetro): 1-2 atajos extremos tipo "huir".
- **Descartadas**: `accessibilityRole="adjustable"` (solo up/down), servicio de accesibilidad propio (permisos elevados, frágil, Android-only), instruir al usuario a desactivar explore-by-touch (afecta todo el OS).

Limitación de fondo: **todo lo anterior añade atajos puntuales encima de un modelo que sigue limitado por el lector OS**. No rompe el techo, solo lo empuja un poco.

---

## Alternativa arquitectónica: self-voicing

Patrón conocido — lo usan casi todos los audio games comerciales (A Hero's Call, The Vale, Manamon, AudioGame Hub). La app trae su propio TTS y desactiva la accesibilidad para que el lector del OS no intercepte nada.

### Cómo funciona técnicamente

1. **TTS propio**: usar `expo-speech` (ya disponible) o `react-native-tts` (más control). Adiós `AccessibilityInfo.announceForAccessibility`.
2. **Ocultar la UI al lector**: `importantForAccessibility="no-hide-descendants"` en el root del modo blind. TalkBack ya no ve nada, no consume gestos, no hay explore-by-touch.
3. **Gestos nativos sin interferencia**: PanResponder, multi-touch, swipes direccionales, doble-tap-hold + drag, lo que sea. Sin que el OS los robe.
4. **Discovery propio**: como TalkBack ya no lee los botones, lo implementamos nosotros (tap-down → speak label, tap-up rápido → ejecutar — patrón "touch to explore" propio).
5. **Convivencia con TalkBack**: el usuario lo deja activado en el OS; al entrar a TorchZhyla el modo blind "absorbe" la accesibilidad y la devuelve al salir. No hace falta apagar TalkBack manualmente.

---

## Aclaración crítica: TalkBack ES un TTS

Cambia toda la conversación: **TalkBack no tiene "voz propia"**. Es un orquestador que coge texto, decide qué leer y cuándo, y se lo pasa al motor TTS del sistema (Google TTS por defecto, pero el usuario puede instalar Vocalizer, Eloquence, Acapela…). La voz que se oye en TalkBack y la que oiríamos en nuestra app **serían exactamente la misma**, porque usaríamos el mismo motor.

Cuando los usuarios blind dicen "TTS malo, TalkBack bien", lo que casi siempre comparan es:
- TalkBack con su motor TTS bien configurado (rate alto, voz que les gusta, volúmenes ajustados).
- vs. apps que usan el TTS del sistema sin dejar elegir motor/voz, sin control de velocidad, etc.

La calidad de voz no es el problema. El problema es el **control**.

---

## Settings necesarios para paridad real con TalkBack

### Críticos (must-have, ~9 settings)

1. **Selección de motor TTS** — el usuario blind ya tiene su motor instalado y configurado en el sistema; tiene que poder usar ese mismo motor en nuestra app.
2. **Selección de voz dentro del motor** — cada motor expone varias voces.
3. **Velocidad** — el ajuste más importante. Usuarios blind avanzados van a 2x-3x.
4. **Pitch (tono)**.
5. **Volumen independiente del speech** (separado de música/efectos).
6. **Audio ducking** — bajar la música ambiente automáticamente mientras habla. TalkBack lo hace; sin esto, la ambientación tapa la voz.
7. **Modos de interrupción** — encolar vs. atropellar, configurable por tipo de evento (sala = atropellar, canal = encolar).
8. **Repetir último anuncio** (gesto/botón).
9. **Pausa/reanudar** (gesto/botón).

### Importantes (mejora notable, ~3 settings)

10. **Verbosidad de puntuación** — leer comas/puntos o no. En MUD con descripciones largas importa.
11. **Formato de números** — "150" → "ciento cincuenta" vs "uno cinco cero". HP/MP cambian mucho según preferencia.
12. **Earcons** — ya tenemos audio cues en ambientación, lo extendemos a eventos de interfaz (focus, activate, error).

### Nice to have (probablemente no necesario en MUD)

- Vibración por tipo de evento.
- Modo deletreo (raro en MUD salvo nombres propios).
- Multi-idioma / detección automática de idioma.

**Total**: ~12 ajustes en pantalla de configuración. Estándar en cualquier app self-voicing y los usuarios blind los esperan.

---

## Coste técnico

`expo-speech` cubre **voz, rate, pitch** out of the box (3 de los 9 críticos). Para el resto:

- **Selección de motor**: `expo-speech` no lo expone. Cambiar a `react-native-tts` (que sí) o escribir un módulo nativo pequeño envolviendo `TextToSpeech.getEngines()` (~50 líneas Java/Kotlin).
- **Audio ducking**: nativo, `AudioManager.requestAudioFocus(AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)`. ~30 líneas en el módulo `torchzhyla-foreground` que ya tenemos.
- **Verbosidad de puntuación**: pre-procesado del texto antes de pasarlo al TTS. Trivial.
- **Modos de interrupción**: `speechQueueService` casi lo soporta — añadir niveles de prioridad por evento.
- **Pausa/repetir**: ampliar API de `speechQueueService` + bindings de gesto.
- **Touch-to-explore propio**: cada botón del modo blind reescrito como `Pressable` con onPressIn = speak label, onPressOut rápido = activate, long-press = secondary action.

### Estimaciones

- **MVP funcional** (~3-4 días): swap del backend de speech, hide accessibility en modo blind, touch-to-explore básico en el grid de botones, una zona de gestos rápidos direccional.
- **Pulido** (~3-4 días más): anuncios de canales/vitals/sala, manejo de modales (settings, mapa), interrupción de speech con prioridades, edge cases (notificaciones del sistema, llamadas entrantes), navegación entre pantallas.
- **Settings UI + testing con varios motores**: ~2 días.
- **Total realista**: ~1.5-2 semanas para versión sólida y publicable.

---

## Tradeoffs

### Pro

- Resuelve **todos** los problemas de blind mode de golpe — gestos rápidos, cola que atropella, `accessibilityActions` lentos. Control total.
- Permite cualquier patrón de input: sectores direccionales, multi-touch, gestos custom, lo que diseñemos.
- Misma voz que TalkBack (mismo motor TTS), por lo que el usuario no nota degradación de calidad.

### Contra

- Somos responsables al 100% de la accesibilidad dentro de la app. Si nuestro TTS falla, el usuario está ciego. Hay que probarlo muy bien.
- Refactor no trivial — `speechQueueService`, todos los componentes del modo blind, settings nuevos, diseñar discovery desde cero.
- El usuario tiene que configurar nuestra app aparte de TalkBack (motor, rate, voz). Mitigable: detectar el motor por defecto del sistema y usarlo, pedirle ajustar rate/voz una sola vez al activar el modo.

---

## Validación pendiente antes de comprometer

Antes de comprometerse al rework, validar con usuario blind objetivo:

1. **Qué motor TTS usa en TalkBack** y si está dispuesto a configurar nuestra app aparte.
2. **A qué velocidad va** habitualmente.
3. Si la respuesta es "uso Vocalizer a 2.5x y no quiero configurar nada dos veces" → entonces lo crítico es **importar settings de TalkBack al arrancar**. Android NO expone los settings de TalkBack directamente, pero podemos:
   - Detectar el motor por defecto del sistema (`TextToSpeech.getDefaultEngine()`) y usar el mismo.
   - Pedir ajustar rate/voz una sola vez en un wizard inicial al activar self-voicing.
4. **Spike técnico de 1-2 h** para validar que `importantForAccessibility="no-hide-descendants"` realmente libera los gestos en Android (asunción crítica del rework).

---

## Decisiones abiertas (sin cerrar)

- ¿Self-voicing es opt-in (toggle en settings) u opt-out (modo blind = self-voicing automático)?
- Si opt-in: ¿el usuario puede mezclar self-voicing + accessibilityActions, o es excluyente?
- ¿Qué hacer en pantallas no-blind (ServerListScreen, SettingsScreen)? ¿Mantener TalkBack ahí y solo absorber en TerminalScreen, o absorber en toda la app?
- ¿Touch-to-explore propio reproduce el comportamiento exacto de TalkBack (tap = focus + speak, doble-tap = activate) o usamos un patrón más rápido (tap = speak, tap rápido = activate sin focus intermedio)?
- ¿La zona de gestos direccionales de la opción anterior se integra dentro del modo self-voicing como input principal, o sigue siendo opcional?
