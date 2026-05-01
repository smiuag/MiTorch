# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TorchZhyla** (paquete `com.smiaug.torchzhyla`, repo `smiuag/MiTorch`) is a React Native Telnet/MUD client application built with Expo. It's a terminal emulator for connecting to MUD (Multi-User Dungeon) and other Telnet-based services, with support for ANSI color codes, GMCP (Generic MUD Communication Protocol), customizable button grids, maps, and blind mode accessibility.

## Architecture

### High-Level Structure

The application uses React Navigation for screen management with three main screens:
- **ServerListScreen**: Browse and connect to saved servers
- **TerminalScreen**: Main terminal interface with all features (macros, channels, map, vitals)
- **SettingsScreen**: Application configuration and user preferences

### Data Flow

1. **Connection Layer** (`src/services/telnetService.ts`):
   - Manages TCP/Telnet protocol via `react-native-tcp-socket`
   - Handles Telnet negotiation (ECHO, SGA, TTYPE, NAWS, GMCP)
   - Parses incoming bytes and emits text/GMCP events

2. **Parsing Layer** (`src/utils/ansiParser.ts`):
   - Converts incoming Telnet text with ANSI escape codes into `AnsiSpan[]` arrays
   - Tracks color (fg/bg), formatting (bold/italic/underline) per character

3. **Display Layer** (`src/components/AnsiText.tsx`):
   - Renders `AnsiSpan[]` arrays as styled React Native text
   - Applies ANSI color codes to individual text segments

4. **State Management** (in `TerminalScreen.tsx`):
   - Line buffer (`MudLine[]`): Terminal output, max 2000 lines for performance
   - Button layout: Grid of customizable buttons (normal and blind mode)
   - Map: Current room tracking, room search, locate/irsala commands
   - Blind mode: 2-panel layout with switchable panels

### Key Components

**Terminal Components:**
- `AnsiText`: Renders ANSI-formatted text
- `ButtonGrid`: Grid of customizable command buttons (portrait & landscape modes)
- `ButtonEditModal`: Create/edit button in grid
- `VitalBars`: HP and energy visualization
- `MiniMap`: Visual map display with current room
- `RoomSearchResults`: Search results panel for room navigation

**Blind Mode Components:**
- `BlindChannelModal`: Channel messages for blind mode users

### Storage Persistence

Uses React Native AsyncStorage for all user data:
- Servers (`src/storage/serverStorage.ts`) - server configs (host, port, etc.)
- Button layout (`src/storage/layoutStorage.ts`) - `LayoutButton` grids for normal and blind modes
- Channel aliases (`src/storage/channelStorage.ts`) - channel name mappings (blind mode)
- Settings (`src/storage/settingsStorage.ts`) - UI preferences (theme, font size, etc.)

### Map System

`MapService` loads and indexes a JSON map (`src/assets/map-reinos.json`) for:
- Current room lookup via GMCP data
- Room search by name
- Nearby room discovery
- Room coordinates for pathfinding

## Development Commands

```bash
# Start development server (choose platform interactively)
npm start

# Run on Android device/emulator (debug, with Metro)
npm run android

# Generate release AAB for Play Store (sin Metro, optimizado)
cd android && ./gradlew.bat bundleRelease && cd ..
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

iOS no es target del proyecto (no existe carpeta `ios/`). El target web se descartó (no hay `react-dom`/`react-native-web`).

## ⚠️ Workflow nativo: bare, NO managed

Este proyecto trabaja en **bare workflow**: la carpeta `android/` está **commiteada en git** y se edita a mano (permisos en `AndroidManifest.xml`, R8/ProGuard en `build.gradle`, signing config, módulo nativo `torchzhyla-foreground`, etc.).

**NUNCA ejecutar:**
- ❌ `npx expo prebuild` — regeneraría `android/` desde cero pisando todas las customizaciones manuales.
- ❌ `npx expo eject` — deprecated y equivalente al anterior.

**Sí está OK:**
- ✅ `npm run android` (= `expo run:android`) — reutiliza `android/` existente, no regenera.
- ✅ Editar archivos dentro de `android/` directamente con cualquier editor.
- ✅ `cd android && ./gradlew.bat bundleRelease` — build directo, sin pasar por Expo CLI.

**Qué se ignora dentro de `android/`** (ver `android/.gitignore`):
- `build/`, `.gradle/`, `.idea/`, `local.properties` — outputs e IDE.
- `gradle.properties` — contiene contraseñas del keystore en claro.
- `*.jks`, `*.keystore`, `*.p12`, `*.pfx` — keystores reales (nuestro `my-release-key.jks` aquí).
- **Excepción:** `app/debug.keystore` SÍ se commitea (es la clave pública estándar de Android, sin secreto, necesaria para que el debug build funcione tras un clone fresco).

**Si alguien clona el repo en otra máquina y necesita poder hacer release builds:**
1. Necesita `android/gradle.properties` aparte (con las credenciales reales del keystore).
2. Necesita `android/app/my-release-key.jks` aparte.
Ambos se distribuyen fuera del repo (gestor de contraseñas, USB encriptado, etc.).

## Build Guide

### Outputs

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `android/app/build/outputs/apk/release/app-release.apk`
- Release AAB (Play): `android/app/build/outputs/bundle/release/app-release.aab`

### Flujos

**Desarrollo (debug, con Metro):**
```powershell
# Terminal 1
. .\reset-dev.ps1
npm start
# Terminal 2
npm run android
```
Siempre puerto 8081. Si parece ocupado → `reset-dev.ps1` (mata Node/Java, resetea ADB, hace `adb reverse tcp:8081 tcp:8081`). NO cambiar a 8082/8083.

**Release APK (sin Metro, optimizado):**
```powershell
cd android && ./gradlew.bat assembleRelease && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

**Release AAB (Play Store):** `cd android && ./gradlew.bat bundleRelease && cd ..`

### Troubleshooting

| Problema | Solución |
|---|---|
| "Port 8081 is being used" | `reset-dev.ps1` |
| Build freezes | `./gradlew.bat --stop` (Gradle daemon stuck) |
| App no carga JS | Metro no corriendo → `npm start` |
| "INSTALL_FAILED_USER_RESTRICTED" | Aceptar permiso de instalación en el device |

Logcat: `adb logcat | Select-String "TorchZhyla|SOUND|BM|BLIND|Telnet"`. Reset datos app: `adb shell pm clear com.smiaug.torchzhyla`.

### Firma de Release

- Keystore: `android/app/my-release-key.jks` (NO commitear, está en `.gitignore`).
- Credenciales en `android/gradle.properties` (vars `MYAPP_RELEASE_*`, también gitignored).
- Aplicado en `android/app/build.gradle` → `signingConfigs.release`.
- **Nunca regenerar el keystore** — si la firma cambia, Play rechaza updates para usuarios actuales. Backup del `.jks` + passwords fuera del repo (gestor de contraseñas).

### Versionado (semver estricto desde 1.0.0, decidido 2026-04-25)

- `versionName` semver: PATCH = bugfix, MINOR = feature compatible, MAJOR = breaking/UX grande.
- `versionCode`: `+1` por cada release publicada en Play. Solo sube, nunca baja.
- **Sincronizar siempre** `android/app/build.gradle` (versionCode + versionName) y `app.json` (`expo.version`). Si divergen, manda `build.gradle`.
- **NO bumpear automáticamente.** Solo cuando el usuario diga "vamos a publicar" / "release". Si hay duda de PATCH/MINOR/MAJOR → **preguntar**.
- Última publicada en Play: _(ninguna — 1.0.0 será la primera)_

## Important Implementation Notes

### ANSI Color Parsing

The `ansiParser` handles escape sequences like `\x1b[31m` (red). It's critical for rendering MUD output correctly. The parser outputs `AnsiSpan[]` which are then rendered by `AnsiText`. Watch for:
- Color codes often include `` byte sequences
- Bold/italic/underline modifiers
- Reset sequences `\x1b[0m`

If you see raw escape codes in terminal output instead of colors, the issue is usually in parsing or rendering, not in the Telnet layer.

### Telnet Protocol Handling

The `TelnetService` implements core Telnet negotiation. Key points:
- `IAC` (Interpret As Command) is byte 255
- GMCP is Telnet option 201, used for structured game data
- The service tracks negotiated options to avoid redundant negotiation

### Performance Considerations

- Line buffer is capped at 2000 lines to prevent memory issues
- FlatList virtualization is critical for rendering large logs
- Channel messages use a similar pattern

### Button Layout System

Button grids are customizable layouts with two modes:
- **Normal mode**: Default grid layout for regular gameplay
- **Blind mode**: Two separate panels (Panel 1 and Panel 2) that can be toggled with a switch button
- **Landscape mode**: Grid is transformed (rows → columns) for horizontal orientation
- `LayoutButton` interface: `{ id, col, row, label, command, color, textColor, secondaryCommand?, blindPanel? }`
- Buttons are per-server in normal mode, global in blind mode
- Colors come from button definition, not terminal rendering

## Blind Mode & Accessibility

`uiMode === 'blind'` es interfaz solo de voz para screen readers (TalkBack/VoiceOver). Feedback vía `speechQueueService.enqueue()` (cola FIFO sobre `AccessibilityInfo.announceForAccessibility`) + audio cues. Nada se muestra visualmente.

**Reglas no derivables del código:**
- **Canales**: SIEMPRE se escriben al terminal (para review posterior) pero NUNCA se anuncian.
- **Gestos complejos NO funcionan con TalkBack** (OS los consume para navegar). El único patrón accesible para acción secundaria de botón es `accessibilityActions` (`activate` + `secondary`) — TalkBack lo presenta como menú swipe up/down. NO añadir gestos como segunda acción.
- **Speech queue**: TalkBack no encola; atropella. Por eso TODO `announceForAccessibility` pasa por `speechQueueService` con timer estimado por longitud (ver `speechCharDurationMs` en Settings).

**Archivos:** `src/config/blindModeFilters.json` (filtros), `src/services/blindModeService.ts` (process), `src/storage/layoutStorage.ts:createBlindModeLayout()` (grid blind global).

## Key Files to Know

- `App.tsx`: Navigation setup
- `src/screens/TerminalScreen.tsx`: Main terminal logic (~1700+ lines)
- `src/screens/ServerListScreen.tsx`: Server connection management
- `src/screens/SettingsScreen.tsx`: Settings and preferences
- `src/services/telnetService.ts`: TCP/Telnet protocol
- `src/utils/ansiParser.ts`: ANSI escape sequence parsing
- `src/types/index.ts`: Core TypeScript interfaces
- `src/assets/map-reinos.json`: Static map data with colors
- `src/components/ButtonGrid.tsx`: Renders customizable button layouts
- `src/components/ButtonEditModal.tsx`: Create/edit buttons
- `src/components/MiniMap.tsx`: Visual map display
- `src/components/RoomSearchResults.tsx`: Room search panel (irsala)
- `src/storage/layoutStorage.ts`: Button grid persistence (normal + blind mode)

## Common Patterns

### Loading Button Layout

```typescript
useEffect(() => {
  (async () => {
    const layout = await loadLayout(); // from storage module
    setButtonLayout(layout);
  })();
}, []);
```

### Sending Commands

Through `telnetRef.current.send(commandText)` after connection established.

### Rendering Terminal Lines

Lines flow through: `incoming text` → `parseAnsi()` → `MudLine[]` → `FlatList` → `AnsiText` component.

### Map Navigation

- **locate**: Parses room name and exits, searches map, shows results in `RoomSearchResults`
- **irsala**: Shows `RoomSearchResults` panel for user to choose destination, then navigates via `MapService.navigateToRoom()`

### Storing Settings

Call the `save*` function from the storage module (e.g., `saveLayout(layout)`). These are async.

## Sistema de logs para soporte (implementado)

Captura opcional de la actividad del terminal a un archivo único `${Paths.document}/logs/log.txt` (sandbox privado), exportable como HTML para compartir con soporte o subir a deathlogs.com.

**Reglas operativas no derivables del código:**
- Off por defecto. Al desactivar el toggle se **borra el archivo inmediatamente** (privacidad).
- `server-key` = slug del **nombre** del `ServerProfile` (no del host). Si el usuario renombra un personaje, los logs nuevos van con tag distinto al histórico.
- Sanitización: SOLO la contraseña del auto-login se omite. Username, host y nicks de otros jugadores SÍ se loguean.
- Cap default `maxLogLines = 20.000`. Bajar el cap trunca el archivo sin confirmación.

**Archivos:** `src/services/logService.ts` (singleton, buffer + flush 5s/100 líneas), `src/utils/logHtmlGenerator.ts` (HTML + filtros embebidos), integración en `telnetService.ts`/`TerminalScreen.tsx`/`SettingsScreen.tsx`.

**Generador HTML — caso especial:** si el filtro de servidor activo tiene `host` que contiene `reinosdeleyenda.es`, el botón "deathlogs" enlaza a `https://deathlogs.com/list_log.php?m_id=10`; si no, a la home genérica.

## Sistema de Triggers (plan aprobado 2026-04-27)

Sistema declarativo de reglas que interceptan líneas entrantes del MUD y permiten silenciarlas (gag), modificarlas (replace, color), o disparar efectos (sonido, comando, notificación). Los triggers se organizan en **plantillas** (grupos) que se asignan a uno o varios servidores y se reutilizan entre ellos.

### Estado actual

**Implementado:** motor (`src/services/triggerEngine.ts`) + storage (`src/storage/triggerStorage.ts`) + 7 acciones (`gag`, `color`, `replace`, `play_sound`, `send`, `notify`, `floating`, `set_var`) + editor visual de patrones en cajas (`TriggerPatternBuilder`) con modo experto regex como escape hatch + editor de campos de acción (`TriggerActionTextBuilder`) + variables del sistema (Fase 3) + variables de usuario (Fase 5) + export/import ZIP per-pack y backup global (con sonidos incluidos) + reordenación con flechas ▲/▼ + auto-asignación a personajes nuevos.

**Pantallas:** `TriggersScreen` (lista), `TriggerEditorScreen` (contenido + asignación). Entrada: Settings → "Triggers".

**Sin plantillas seeded en código** (limpieza 2026-05-01): la APK ya no embebe `createSoundsPack`/`createCombatePack` ni los wavs `assets/sounds/`. El único origen de plantillas y sonidos es importar/exportar — el `torchzhyla-defaults.zip` (fuera de `aljhtar-store/`) trae Sonidos del MUD, Combate completo, Comunicaciones y Movimiento. Usuarios que tengan los packs seeded vivos en su disk los conservan, pero las refs `builtin:*` quedan mudas (el editor las muestra como `builtin:combate/critico.wav` raw); camino de recuperación: importar el ZIP.

**Reglas no derivables del código:**
- **Sonido kill-switch global**: el toggle "Usar sonidos" se gatea en `!silentModeEnabledRef.current` — `play_sound` respeta esto independientemente de qué pack lo dispare.
- **Notificaciones**: la acción `notify` solo dispara si el toggle global "Usar notificaciones" está ON Y la app NO está en primer plano. Si la app está activa, el usuario ya está mirando — la notificación sería ruido.
- **Order matters dentro del pack** — first-match-wins (en blocking) o acumula (en `blocking: false`). Triggers específicos primero, catchalls al final.
- **Tipo `[número]` en cajas = `(\d+)`** — solo dígitos enteros, RdL no usa decimales ni miles. Si surge otro MUD se evaluarán tipos `[número decimal]` o `[número con miles]` aparte; NO generalizar.
- **Lua/scripting descartado para v1.** Cubrir ~90% con declarativo es suficiente. Si aparece necesidad real de lógica condicional compleja, se evaluará `fengari`.

**Pendiente accesibilidad (~1h, alto impacto):** defaultear a modo experto cuando `uiMode === 'blind'` (cajas son visuales, regex en texto plano es navegable con TalkBack) y añadir resumen narrado del patrón debajo del editor.

**Notas de compat:** `play_sound.file` solo se reproduce con prefijo `custom:{uuid}.{ext}`. Refs sin ese prefijo (legacy `builtin:*` o paths bare) caen a silent no-op en runtime y se renderizan raw en el editor para que el usuario las identifique y reasigne. Sonidos custom se cargan on-demand sin caché para no inflar memoria.

### Decisiones de diseño aprobadas

- **Plantillas como grupos de triggers**: una plantilla contiene N triggers y se asigna entera a 1 o varios servidores. Para variaciones por servidor: duplicar la plantilla, modificar, asignar a otros. NO se asignan triggers individuales a servidores.
- **Primera regla gana** (no cascada): los triggers se evalúan en orden y la primera que matchea ejecuta TODAS sus acciones y para. Si quieres color + sonido + notify para el mismo evento, los pones como tres acciones del mismo trigger. Razón: predecibilidad, sobre todo cuando un server tiene varias plantillas asignadas que pueden solapar.
- **Tipos como UX, no constraints**: cuando el usuario crea un trigger elige un "tipo" (gag / color / sonido / notify / comando / replace / combo) que prefilla campos por defecto, pero después puede añadirle cualquier acción. El tipo es solo metadata para el wizard y el icono de la lista.
- **Variables curadas, no user-defined**: el sistema mantiene una lista cerrada de variables (vida, energía, etc.) que se actualizan automáticamente parseando el prompt del MUD. El usuario NO puede crear variables ni modificarlas; solo definir triggers que reaccionan cuando cambian. La lista exacta y el formato de prompt se cierran al empezar Fase 3.

### Modelo de datos

```typescript
type TriggerType = 'gag' | 'color' | 'sound' | 'notify' | 'command' | 'replace' | 'combo' | 'variable';

interface Trigger {
  id: string;
  name: string;
  type: TriggerType;             // solo UX; el motor mira `actions[]` y `source`
  enabled: boolean;
  source: TriggerSource;         // qué dispara la evaluación
  actions: TriggerAction[];      // qué hace cuando dispara
}

type TriggerSource =
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'variable'; name: string; condition: VariableCondition };  // Fase 3

type TriggerAction =
  | { type: 'gag' }
  | { type: 'replace'; with: string }                            // soporta $1, $2, $old, $new
  | { type: 'color'; fg?: string; bg?: string; bold?: boolean }
  | { type: 'play_sound'; file: string }                         // 'custom:{uuid}.wav'
  | { type: 'send'; command: string }
  | { type: 'notify'; message: string };

type VariableCondition =
  | { event: 'appears' }
  | { event: 'changes' }
  | { event: 'equals'; value: number | string }
  | { event: 'crosses_below'; value: number }                    // edge-triggered
  | { event: 'crosses_above'; value: number };                   // edge-triggered

interface TriggerPack {
  id: string;
  name: string;
  triggers: Trigger[];
  assignedServerIds: string[];
}
```

### Pipeline

```
Telnet → ansiParser → AnsiSpan[] → [TriggerEngine.process()] → MudLine → render
                                          ↓
                              gag → descartar línea (stop)
                              replace → mutar texto (stop)
                              color → mutar spans (stop)
                              play_sound / send / notify → side-effects (stop)
```

`triggerEngine.process(text, spans)` evalúa los triggers cargados (concatenados de todas las plantillas asignadas al server activo). Primera regex que matchea ejecuta sus acciones y devuelve. Si la acción incluye `gag`, devuelve `null` y la línea se descarta. Si no, devuelve la línea posiblemente mutada + lista de side-effects que el llamante (`TerminalScreen`) ejecuta.

### Plan por fases

Fases 1, 2, 4 y 5: implementadas. Detalle vive en git history y en el código. Lo único que sobrevive aquí: doctrina + variables + prompt canónico (Fase 3).

#### Fase 3 — Variables del sistema (HECHO 2026-04-28)

Triggers que reaccionan al estado del juego parseado del prompt del MUD. Implementación: `promptParser.ts`, `playerStatsService.ts` (con `prevValues` para edge-detection), `triggerEngine.evaluateVariableTriggers` (first-match-wins **por variable**, no global).

##### Variables expuestas al usuario

Nombres en castellano en la UI; mapeo a campos internos en inglés (en `playerStatsService`).

Numéricas (default `0`):
- `vida` → `playerHP`, `vida_max` → `playerMaxHP`, `vida_pct` (derivada)
- `energia` → `playerEnergy`, `energia_max` → `playerMaxEnergy`, `energia_pct` (derivada)
- `xp` → `playerXP`, `imagenes` → `playerImages`, `pieles` → `playerSkins`
- `inercia` → `playerInertia`, `astucia` → `playerAstuteness`
- `jugadores_sala` → `roomPlayers`, `carga` → `carry`
- `acciones_movimiento` → `actionsMovement`, `acciones_principales` → `actionsPrimary`, `acciones_secundarias` → `actionsSecondary`, `acciones_menores` → `actionsMinor`

Texto (default `""`):
- `salidas` → `roomExits`
- `enemigos` → `roomEnemies` (los que tú puedes matar)
- `aliados` → `roomAllies`
- `combatientes` → `roomCombatants` (los que pelean contigo)

Derivadas (no almacenadas, computan al consultar):
- `vida_pct`, `energia_pct`
- `en_combate` = `roomCombatants !== ""`
- `personaje` = `playerName` (rellenado desde `ServerProfile.username` al cambiar de server)

##### Prompt canónico TorchZhyla

```
prompt $lPv:$v\$V Pe:$g\$G Xp:$x Carga:$c$lSL:$s$lPL:$a$lNM:$k$lLD:$K$lJgd:$j$lImagenes:$e$lPieles:$p$lInercia:$n$lAstucia:$t$lAcc:$AM\$AP\$AS\$AZ$l
```

`prompt` y `promptcombate` son **idénticos**. Estado de combate se deriva de `en_combate`. Botón "Aplicar prompt TorchZhyla" en edición del server (manual, one-shot, requiere conexión abierta, confirmación previa). NO hay auto-aplicar al conectar — respeto a usuarios sin triggers.

`Imagenes:` SIN tilde en el canónico (optimización post-Fase 3 para quitar `stripAccents` del hot path). Si un personaje tiene aplicado el canónico viejo con tilde, deja de capturar `imagenes` hasta reaplicar.

##### Eventos de triggers de variable

| UI label | Internal | Significado |
|---|---|---|
| aparece | `appears` | Pasa de `0`/`""` a un valor real |
| cambia | `changes` | Cualquier cambio de valor |
| igual a | `equals` | Igual a X (case-sensitive) |
| baja de | `crosses_below` | Estaba ≥N, ahora <N (edge-triggered) |
| sube de | `crosses_above` | Estaba ≤N, ahora >N (edge-triggered) |

Templates de acciones soportan `$old` / `$new` (no `$1` — esos son solo para regex triggers).

##### Doctrina "canónico o nada"

El prompt parser asume el formato canónico para fast-path: dispatch directo por leading token, regex por campo sin lookahead/alternación, primera línea (`Pv:X/Y Pe:X/Y Xp:N Carga:N`) en una sola regex de 6 capturas. Si el usuario tiene un prompt custom, las capturas best-effort siguen siendo posibles para los campos que coincidan con el formato esperado, pero el flujo está optimizado para el canónico.

Otras reglas operativas:
- Detección de "esto es prompt" anclada a `^` con tokens conocidos. Mensaje en canal con `Pv:50/100` en medio NO se gaguea.
- Triggers de regex NO se evalúan sobre líneas de prompt (son metadata, no contenido del juego). Sí se gaguean siempre (terminal limpio).
- Si NO hay triggers de variable activos, el parser solo hace `isPromptLine` (regex.test) para gaguear; NO ejecuta `parsePromptUpdates` ni evaluación.

##### Lección de optimización (2026-04-29)

Tras un día puliendo el `promptParser` por un retraso percibido de 3-4 s en bursts, el cuello real estaba en otro lado: cada `onData` del TCP llegaba con UNA línea (no batch como asumía `addMultipleLines`), cada línea disparaba un `setLines` y un re-render síncrono del FlatList de 80-130 ms. Para 30 líneas eran 3 s de UI lag — no el parser. Fix: `scheduleLinesFlush()` con `requestAnimationFrame` que coalesce múltiples llamadas en un único render por frame.

**Lección**: antes de optimizar un sub-sistema sospechoso, **medir** con `performance.now()`. El "batch" del productor (TCP) puede no ser real — el coalescing tiene que venir del consumidor (RAF/microtask/timer).

#### Fase 5 — Variables de usuario (HECHO 2026-04-29)

Variables de "memoria" que el usuario crea desde "Mis variables" (Settings → Mis variables) y referencia en triggers como `${nombre}`. Cierra la brecha "triggers reactivos sin estado" → "con estado persistente entre disparos".

**Reglas operativas no derivables del código:**
- **Sintaxis con llaves siempre** (`${nombre}`) para distinguir de `$1`/`$old`/`$new`. Variable no declarada o sin valor → expande a `""` (fail-quiet).
- **Persistencia two-layer**: declaraciones persisten en AsyncStorage por server (`aljhtar_user_vars_{serverId}`); valores son memoria-only. Restart de app: declaraciones sobreviven, valores se vacían.
- **Solo se crean desde "Mis variables"** — el editor de triggers tiene picker pero NO crea inline. Razón: una iteración previa con auto-creación perezosa fue confusa y poco descubrible.
- **Bootstrap automático**: al cargar un server o al importar un pack, se recolectan refs de user-vars y se auto-declaran las que falten. Cubre packs migrados de modelos antiguos y packs importados.
- **Reservados**: nombres de `VARIABLE_SPECS` (vida, energia, etc.). Bloqueado al crear.
- **Loop protection**: cascadas user-var → user-var con depth-cap 3 (después se corta y `console.warn`).

**Pantalla "Mis variables"**: lista con valor actual + "Usada en N triggers" expansible que navega al editor del trigger via `autoOpenTriggerId`. Botón "Resetear" vacía solo VALORES, no declaraciones. Borrado individual deja refs colgando (expand a `""`).

**No bundleado**: ningún pack seeded usa `set_var` por ahora.

**Limitaciones deliberadas (fuera de scope v1):** aritmética en templates (`${count} + 1`), if-then-else, loops/timers (excepto `delay` planificado en Fase 6.4).

#### Fase 6 — Expansión hacia suite blind (planificada 2026-04-29)

Conjunto de extensiones del motor que abren la puerta a un pack tipo "Suite Blind RdL" (estilo Rhomdur) cubriendo ~85% de su funcionalidad sin meter scripting Lua. Se pueden abordar de forma independiente — cada sub-fase es un cambio acotado. Orden sugerido por coste/beneficio (más barato y útil primero).

**Doctrina general**:
- Todo es opt-in. Nada cambia el comportamiento por defecto de packs existentes.
- Filosofía "asistencia, no automatización": estas features mejoran feedback acústico/visual y reducen fricción de input, pero NO añaden auto-actions tipo auto-attack o auto-heal. La línea ToS de los MUDs se respeta — el usuario sigue tomando todas las decisiones. Ver "Validación pre-comando" más abajo: solo bloquea casos donde el cliente SABE que el comando va a fallar; no clasifica ni decide acciones.
- Compatibilidad: los packs sin uso de estas features siguen funcionando idéntico.

##### 6.1 — Múltiples paneles en blind mode (~3-4h)

**Hoy**: blind mode tiene 2 paneles fijos (`Panel 1` / `Panel 2`) y un botón switch que alterna. `LayoutButton.blindPanel` es `1 | 2`.

**Cambio**: paneles ilimitados con nombre. El switch cicla `1 → 2 → ... → N → 1`.

Reemplaza el concepto de `ModoJ` (Combate / XP / Idle) de los scripts blind: en vez de un modo global invisible que cambia el comportamiento de cada tecla, tienes paneles distintos con botones-comando concretos por modo. Ventajas:
- Estado visible (TalkBack anuncia "Modo Combate" al cambiar).
- Cero lógica condicional en los comandos.
- Más botones disponibles en total (paneles ilimitados, hoy tope = 2).
- Fácil de descubrir.

**Implementación**:
- `LayoutButton.blindPanel`: pasar de `1 | 2` a `number` (entero positivo). Compatible hacia atrás — los 1/2 actuales siguen funcionando.
- Nuevo storage: `aljhtar_blind_panels` (clave global, igual que el resto del layout blind) con array `{ id: number; name: string }[]`. Default `[{id:1, name:'Panel 1'}, {id:2, name:'Panel 2'}]`.
- `BlindModePanelSwitch` botón actualiza para ciclar y para anunciar el nombre del panel destino con `AccessibilityInfo.announceForAccessibility(panel.name)`.
- Settings → "Layout blind": pantalla nueva con lista de paneles, botones "+ Añadir panel", "✏ Renombrar", "✕ Borrar" (con warning si tiene botones), reordenar con flechas ▲/▼.
- `ButtonEditModal` añade dropdown "Panel" con la lista actualizada.

**Decisiones pendientes**:
- Per-server vs global: hoy los botones blind son globales (todos los servers comparten layout). Los paneles podrían también ser globales o per-server. Recomendación: mantener global para coherencia. Si un usuario MUD-hops a otro juego, edita los nombres y comandos.
- Default: ¿1 panel o 2? Mantener 2 para no sorprender a usuarios actuales.

**Limitación**: solo cubre el caso "modo de botones" del `ModoJ` del CMUD. Los modos de output (`ModoE`, `ModoS`, `ModoMono`, `ModoAmbientacion`) no se modelan con paneles — son toggles globales aparte (varios ya existen).

##### 6.2 — Expansión de `${var}` en comandos de botones (~30 min)

> **2026-04-29:** ampliado a "tipos de botón + variables" (Comando / Aviso con dropdown). Plan ejecutable detallado en el bloque "Plan en preparación — Tipos de botón + variables (sub-fase 6.2)" abajo. La descripción que sigue se mantiene como referencia del scope original mínimo.

**Hoy**: los botones del `ButtonGrid` mandan `button.command` literal vía `telnetRef.current.send(...)`.

**Cambio**: pasar el comando por un `expandUserVars()` antes del send. Resuelve solo `${name}` desde `userVariablesService.get(name)` (no `$1`, no `$old/$new` — esos solo aplican en contexto de trigger).

**Implementación**:
- Nueva función `expandUserVars(template: string): string` en `src/utils/expandUserVars.ts` (o reutilizar la del engine si extraemos).
- `TerminalScreen` ButtonGrid handler envuelve `send(button.command)` → `send(expandUserVars(button.command))`. Mismo para `secondaryCommand` en blind.
- UI: el `ButtonEditModal` ya acepta cualquier string; el campo `command` puede contener `${nombre}` y se documenta en hint.

**Caso de uso**:
- Botón "Volver" con comando `${direccion_opuesta}`. Un trigger captura cada movimiento exitoso y mantiene `direccion_opuesta` actualizada. El botón reproduce la opuesta.
- Botón "Atacar objetivo" con `atacar ${objetivo}`.
- Botón "Curar a líder" con `curar ${grupo_lider}`.

**Validación pre-comando opcional** (~15 min adicional, toggle en Settings):
- Si `validateBeforeSend` está activo: tras expandir, si el resultado contiene una secuencia tipo `verbo $vacío` (variable resolvió a "") → no mandar, reproducir sonido de error.
- Si el comando es una sola dirección (`n`, `s`, `e`, `o`, `ne`, etc.) y no está en `${salidas}` → no mandar, reproducir sonido de error.
- Mantener el toggle por separado del feature básico de expansión. Empezar con expansión sola; añadir validación si se demanda.

##### 6.3 — Pan estéreo en `play_sound` (~1-1.5h)

**Hoy**: la acción `play_sound` reproduce centrado.

**Cambio**: campo opcional `pan: number` (rango -1 a +1, donde -1 es izquierda total, +1 derecha total, 0 centro). En blind mode el paneo direccional es esencial — los scripts blind lo usan masivamente para indicar de dónde viene un ataque, dónde está un aliado/enemigo, etc.

**Implementación**:
- Tipo: `{ type: 'play_sound'; file: string; pan?: number }`.
- `SoundContext.playSound` acepta segundo argumento `pan?: number`. Tras `sound.playAsync()`, si pan != 0, llamar `sound.setStatusAsync({ panValue: pan })` (expo-av API). Verificar que la versión actual de expo-av soporta panning — si no, usar sondeo nativo.
- Engine `applyAction` para `play_sound` pasa el pan al `playSoundRef.current`.
- UI en `TriggerEditModal`: dropdown bajo "Reproducir sonido" con opciones predefinidas (`Centro`, `Izquierda suave`, `Izquierda fuerte`, `Derecha suave`, `Derecha fuerte`) que mapean a -1, -0.5, 0, +0.5, +1. O slider numérico para usuarios avanzados.

**Caso de uso**:
- Trigger "alguien llega del este" → play_sound con pan +0.7. Suena a la derecha.
- Trigger "vida del enemigo al 30%" → pan -0.5 (los enemigos a la izquierda por convención del sistema blind).

**Limitación de RN/expo-av**: si la versión actual no soporta paneo, requiere upgrade de la librería. Verificar antes de empezar.

##### 6.4 — Acción `delay` (timer programado) (~1-1.5h)

**Hoy**: las acciones se ejecutan inmediatamente al disparar el trigger.

**Cambio**: nueva acción `delay` que pospone otra acción N segundos. Modela los **bloqueos temporizados** del sistema blind (ej.: tras `saltoheroico`, alarma a los 25s con sonido "se libera el bloqueo"; tras `esgrimir`, 55s; etc.).

**Implementación**:
- Tipo: `{ type: 'delay'; seconds: number; then: TriggerAction[] }`. La acción anidada es lo que se ejecuta al expirar el temporizador.
- Engine: nuevo Map `pendingTimers: Map<symbol, NodeJS.Timeout>` (o ref). Al disparar `delay`, `setTimeout(() => applyActions(action.then), seconds * 1000)`. Guardar el timer para poder cancelar en `clear()` o cambio de server.
- UI en `TriggerEditModal`: nueva acción "Esperar y luego..." con campo numérico de segundos + sub-editor para una acción anidada.
- Limitar la profundidad: solo un nivel de anidación (no permitir `delay` dentro de `delay` para evitar abuso). Los packs que necesiten más complejidad usan otro trigger.

**Cleanup**:
- Al desconectar / cambiar server / cargar nuevos triggers: cancelar todos los timers pendientes.
- Considerar persistencia: ¿sobreviven los timers a una recarga de Metro? No — se pierden (memoria-only). Aceptable.

**Caso de uso típico**:
- Trigger detecta que ejecutas `saltoheroico` → acción `delay 25s` con sub-acción `floating "saltoheroico se libera"` + sonido.
- Trigger detecta que se cumplió un buff → `delay 60s` para avisar de re-aplicar.

##### 6.5 — Modo experto de sonidos / gag selectivo (~2-3h)

**Hoy**: los triggers tienen `enabled: true/false` global, sin condicionalidad por modo del usuario.

**Cambio**: añadir setting global `expertModeEnabled: boolean` (toggle en Settings) y campo opcional `activeMode?: 'all' | 'expert' | 'normal'` por trigger (default `'all'`). El motor evalúa solo triggers cuyo `activeMode` matchee el modo actual.

**Implementación**:
- `Trigger.activeMode?: 'all' | 'expert' | 'normal'` — opcional, default `'all'`.
- `triggerEngine.setActiveTriggers` filtra al compilar: descarta los que no aplican al modo activo. Cambiar el toggle dispara `setActiveTriggers` again.
- Settings añade toggle "Modo experto: anunciar solo lo esencial".
- UI en `TriggerEditModal`: dropdown "Activo en: Siempre / Solo modo experto / Solo modo normal".

**Caso de uso**:
- Triggers de combate verboso (kills, esquivas, paradas) marcados "Solo modo normal". En experto se gaguean — el usuario asume que sabe lo que está pasando.
- Triggers de eventos críticos (muerte propia, vida baja) marcados "Siempre".
- Triggers experimentales del usuario marcados "Solo modo experto" — los activa cuando quiere ver verbose.

**Decisión cerrada**: campo único `activeMode` con tres valores en vez de dos campos booleanos. Más simple para el wizard.

**Coste**: el filtro en `setActiveTriggers` es trivial. La UI suma una línea en el editor. El "drama" es propagar el toggle global y forzar reload — usar el patrón de `settingsModalVisible` en TerminalScreen useEffect.

##### Lo que TODAVÍA NO cubre Fase 6

Para llegar al 100% del sistema blind necesitaríamos features que se han descartado conscientemente o son de alcance grande:

- **Gag global de líneas no esenciales (whitelist en lugar de blacklist)**: el `ModoE` de Rhomdur gaguea TODO excepto los anuncios que el script verbaliza. TorchZhyla solo permite blacklist (gag explícito por trigger). Modelar whitelist requiere otro paradigma — un toggle "silenciar todo lo no marcado" + flag `silentDefault: true` por línea. Significativo refactor del pipeline. NO Fase 6.
- **Sonidos en bucle con stop dinámico** (`#PlayLoop` + stop al cambiar estado): la alerta de vida al 30% que suena hasta recuperarte. Hoy `play_sound` es one-shot. Requiere acción `play_loop` + tracking de handles + acción `stop_sound`. Mid effort. Considerar para Fase 7 si surge.
- **Math en `set_var`**: contadores tipo `set_var muertes = ${muertes} + 1` no se evalúan — quedan como string literal. Necesita evaluador básico de expresiones. Out of scope sin un mini-DSL.
- **Listas dinámicas de strings** (NickX, RemitentesLista): user vars son strings simples. Para tener arrays hace falta tipo nuevo + acciones `push_to_list` / `clear_list` / `is_in_list`. Out of scope.
- **Macros condicionales en `command`** (botón con if/else según modo o estado): requeriría DSL en el campo command. Los paneles de Fase 6.1 cubren el 80% del caso de uso.
- **Auto-walks / paths**: secuencias temporizadas hardcoded por destino. Descartado por filosofía (cliente de accesibilidad, no de macroing).
- **Sonidos de ambientación dinámicos por sala/momento del día**: requiere mapper sala → sonido + concepto de momento. Fuera de scope.
- **Funciones reusables tipo correctores** (`FuncCorrectorPlayers`): cada trigger se escribe independiente. Sin sistema de funciones globales por filosofía declarativa.
- **Aliases redefinidos** (los `n`/`s`/`e` redefinidos durante un walk): no hay concepto de alias dinámico.

Si en el futuro se reactiva la pregunta "¿meter Lua/scripting?" estos serían los argumentos a favor. Por ahora la respuesta sigue siendo no.

##### Plan de ataque sugerido

Por orden de coste/beneficio. Cada sub-fase es independiente — se puede hacer la 6.2 sin la 6.1, etc.

1. **6.2 (`${var}` en botones)** — ~30 min. Más barata, desbloquea el caso "volver" inmediatamente. Tirar primero como prueba de concepto del frente "comandos de botones más inteligentes".
2. **6.1 (múltiples paneles)** — ~3-4h. Cambia el modelo mental del blind mode hacia algo más limpio. Bueno para hacer antes de meter más complejidad en triggers.
3. **6.3 (pan estéreo)** — ~1-1.5h. Verificar primero si expo-av actual lo soporta. Si sí, gana mucha UX en blind.
4. **6.4 (delay)** — ~1-1.5h. Habilita los bloqueos temporizados que son comunes en RdL.
5. **6.5 (modo experto)** — ~2-3h. La más subjetiva — depende de si en uso real surge la necesidad.

Total Fase 6 completa: ~8-12h de trabajo. Dependiendo de qué se aborde, el pack de "Suite Blind" puede tener diferentes niveles de cobertura.

#### Plan en preparación — Tipos de botón + variables (sub-fase 6.2)

Decidido 2026-04-29 abordar **antes** del resto de Fase 6 y **antes** del plan "Combate básico Panel 2" (que depende de esto). Sustituye al scope original de la sub-fase 6.2 (que era solo expansión `${var}` en `command`) y descarta la convención `>>` para acciones locales en favor de un dropdown explícito en el editor del botón.

**Decisiones cerradas (2026-04-29):**
- Dos tipos de botón: `'command'` (default — manda al MUD como hoy) y `'floating'` (muestra mensaje flotante local; `pushFloating` ya hace `announceForAccessibility` si TalkBack está activo). Sin `'set_var'` por ahora — se añade si surge caso real (modo combate, marcar objetivo).
- Dropdown "Tipo: Comando / Aviso" en `ButtonEditModal`, encima del campo principal. El label del input cambia ("Comando" ↔ "Mensaje") según el tipo.
- Reutilizar el campo `command` existente como **payload** — guarda el comando si `kind === 'command'` o el texto del aviso si `kind === 'floating'`. Sin campos `message`/`payload` nuevos (opción A del 2026-04-29).
- Soporte de `${variable}` en el payload de **ambos** tipos. Resuelve contra:
  - System vars (`VARIABLE_SPECS` en `src/utils/variableMap.ts` — `vida`, `vida_max`, `vida_pct`, `energia`, `energia_max`, `energia_pct`, `xp`, `salidas`, `enemigos`, `aliados`, `combatientes`, `en_combate`, etc.).
  - User vars (`userVariablesService.get(name)`).
  - Variable no encontrada / sin valor → `""`. Sin sintaxis de default — el usuario escribe el fallback en el texto si lo quiere.
- Migración trivial: botones existentes sin `kind` se asumen `'command'` en runtime. NO se reescribe el storage al migrar.
- Eliminamos del seed default de `createBlindModeLayout`: **Daño** (`ultimo daño`) y **Enemigo** (`enemigos`). Los layouts ya guardados de los usuarios NO se tocan — si quieren se los borran a mano desde el editor.
- Migramos en el seed default a `kind: 'floating'`:
  - **VID** → `command: 'Vida: ${vida}/${vida_max}'`
  - **GPS** → relabel a **ENE**, `command: 'Energía: ${energia}/${energia_max}'` (el label "GPS" no representa el contenido)
  - **XP** → `command: 'XP: ${xp}'`
  - **Salidas** → `command: 'Salidas: ${salidas}'`
- Borramos los 6 intercepts hardcoded en `sendCommand` (`TerminalScreen.tsx:1155-1201`): `consultar vida`, `consultar energia`, `consultar salidas`, `xp`, `ultimo daño`, `enemigos`. Los 4 botones que sobreviven (VID/ENE/XP/Salidas) ya no necesitan intercepción especial — son entradas normales del layout.

**Implementación:**

1. **`src/utils/expandVars.ts` (NUEVO)** — `expandVars(template: string): string`. Para cada `${name}`:
   - Si `name ∈ VARIABLE_SPECS`: resuelve contra `playerStatsService.getCurrentVariables()` (con derivadas `vida_pct`, `energia_pct`, `en_combate` computadas con la lógica de `variableMap.ts`).
   - Si no: lee `userVariablesService.get(name)`.
   - No encontrado → `""`.
   - Plantear extraer y reusar desde `triggerEngine.expandTemplate` (que hoy hace lo mismo para user vars + capturas + `$old`/`$new`); por ahora código separado, refactor diferido si vuelve a duplicarse.

2. **`src/storage/layoutStorage.ts`**:
   - `LayoutButton` añade `kind?: 'command' | 'floating'` (opcional, default implícito `'command'`).
   - `createBlindModeLayout()`: aplica los cambios de seed listados arriba (VID/ENE/XP/Salidas como floating, eliminar Daño y Enemigo).
   - `migrateLayout`: NO toca `kind` — undefined se interpreta en runtime como `'command'`.

3. **`src/components/ButtonGrid.tsx`**:
   - Nuevo prop `onShowFloating?: (text: string) => void`.
   - En el `onPress`: si `button.kind === 'floating'` → `onShowFloating?.(button.command)` y return. Si no → flujo actual (`onAddTextButton` o `onSendCommand`).
   - Mismo dispatch para `accessibilityActions` cuando aplique (botones blind con secondary).
   - `accessibilityLabel`/`accessibilityHint` mencionan que es aviso para `kind === 'floating'`.

4. **`src/screens/TerminalScreen.tsx`**:
   - Nueva callback `handleShowFloating(text: string)`: `pushFloating(expandVars(text), 'info', 2000)`.
   - Pasarla a los dos `<ButtonGrid>` (líneas 1965 y 2283).
   - En `sendCommand` (línea 1081): tras manejar `__SWITCH_PANEL__` y antes de los intercepts (`irsala`, `locate`, etc.), expandir `command = expandVars(command)`. Permite que `irsala ${objetivo}` y similares funcionen.
   - Borrar los 6 bloques de intercept en líneas 1155-1201. NOTA: si el usuario teclea `xp` por consola, debe llegar al MUD (era solo el botón XP el que lo interceptaba — ahora el botón muestra floating sin pasar por sendCommand).

5. **`src/components/ButtonEditModal.tsx`**:
   - Estado nuevo `kind: 'command' | 'floating'` inicializado desde `button.kind ?? 'command'`.
   - Dropdown / segmented "Tipo: Comando / Aviso" en la cabecera del formulario.
   - Label del input principal cambia: `"Comando"` si `command`, `"Mensaje"` si `floating`.
   - Hint debajo: `"Puedes usar variables como \${vida}, \${energia}, \${xp}, \${salidas}..."` (no exhaustivo).
   - `handleSave` incluye `kind` en el `LayoutButton` que persiste.
   - En modo `'floating'`: ocultar `addText` y campos secundarios (`alternativeCommands`) — no aplican.

**Casos de prueba mentales:**
- Botón legacy sin `kind` `{ command: 'norte' }` → ejecuta como comando, manda "norte". ✅
- Botón nuevo `{ kind: 'command', command: 'atacar ${objetivo}' }` con user var `objetivo='goblin'` → manda "atacar goblin". ✅
- Botón nuevo `{ kind: 'floating', command: 'Vida: ${vida}/${vida_max}' }` con HP 100/100 → muestra "Vida: 100/100" + announceForAccessibility. ✅
- Variable no declarada `{ kind: 'floating', command: 'Test ${nope}' }` → muestra "Test ". ✅
- Comando interceptado mantiene comportamiento: `irsala ${ultimo_destino}` → expande primero, luego entra en el intercept de irsala. ✅
- Usuario sin prompt canónico aplicado: `${vida}` expande a "0", el botón VID muestra "Vida: 0/0". Comportamiento idéntico al actual.

**Coste estimado:** 1.5-2 h.

**Componentes que se desbloquean tras esto:**
- "Combate básico Panel 2" (ver plan abajo) — depende de tener tipos de botón y `${var}` en `command` para sus botones de combate.
- `set_var` como tercer tipo — añadible incrementalmente con un valor más en el dropdown si surge caso real.

#### Plan en preparación — Combate básico Panel 2 (blind mode)

Decidido 2026-04-29 abordar **antes que el resto de Fase 6**: rellenar el Panel 2 del blind mode con un set mínimo viable de botones de combate genérico (sin habilidades de clase). Mantiene el Panel 1 actual (direcciones) intacto.

Este plan se rellena con preguntas/respuestas durante la fase de diseño antes de implementar. Al final servirá como spec ejecutable.

**Componentes del entregable**:
- Sub-fase **6.2 implementada** vía el plan independiente "Tipos de botón + variables" (ver bloque dedicado arriba) — incluye expansión de `${var}` y dropdown Comando/Aviso. La convención `>>` queda **descartada** en favor del dropdown explícito.
- Trigger pack seeded "Combate genérico" con captura de heridas y último remitente.
- User vars auto-declaradas: `objetivo`, `heridas`, `ultimo_remitente` (nombres a confirmar).
- Botones predefinidos en el Panel 2 del layout blind (`createBlindModeLayout` en `layoutStorage.ts`).

**Preguntas y decisiones cerradas (se rellena conforme avanzamos)**:

_Pendiente de empezar el cuestionario._

**Implementación final (a escribir cuando se ataque)**:

_Por escribir tras cerrar las preguntas._

### Doctrinas de la sesión 2026-04-30

**Política de distribución de plantillas y sonidos**:
- La APK se distribuye **limpia de plantillas y sonidos por defecto** — ningún `play_sound` con derechos de terceros, ningún pack seeded de un addon ajeno.
- Plantillas por defecto (Sonidos del MUD, Combate completo, Comunicaciones, Movimiento) van en `torchzhyla-defaults.zip` (raíz del repo TorchZhyla, fuera de `aljhtar-store/`), formato `torchzhyla-config-backup`. El usuario lo importa con Configuración → Importar.
- Razón: los wavs originales son de Rhomdur (addon CMUD blind/RL). No los redistribuimos en la APK.
- **Limpieza ejecutada 2026-05-01**: borrados `createSoundsPack`/`createCombatePack`, `enableSoundsPackForBlindMode`/`enableCombatePackForBlindMode`/`enablePackForBlindMode`, const `AVAILABLE_SOUNDS`, las 30 entradas builtin del cache de `SoundContext`, `assets/sounds/`, sección `sounds` de `blindModeFilters.json`, pestaña Built-in del sound picker. Usuarios con packs seeded vivos del APK anterior los conservan en disk pero las refs `builtin:*` quedan mudas — camino: importar el ZIP. AsyncStorage keys huérfanas `aljhtar_trigger_packs_sounds_seeded`/`...combate_seeded` quedan inocuas en disk de esos usuarios; no se ejecuta migración para borrarlas.
- Generar el ZIP con script Node + `jszip` (misma lib que la app). PowerShell `Compress-Archive` NO sirve — escribe paths con `\` que rompen el importador (jszip valida `/`).
- Push al móvil: `adb push C:\proyectos\Claude\TorchZhyla\torchzhyla-defaults.zip /sdcard/Download/`.

**`${personaje}` en regex (sustitución de nivel 2)**: `triggerEngine.setActiveTriggers` pre-procesa el pattern antes de compilar. Si encuentra `${personaje}` literal, lo sustituye por el nombre regex-escapado. Si no hay nick → sustituye por `(?!)` (nunca matchea). Recompile al cambiar de server. Desbloquea triggers tipo "menciónan tu nombre".

**Triggers `blocking: false`**: undefined ≡ true ≡ first-match-wins clásico (cadena cortada). Cuando `blocking === false`, el trigger dispara solo side-effects (`play_sound`/`send`/`notify`/`floating`/`set_var`) y el bucle CONTINÚA evaluando. Las mutaciones (`gag`/`replace`/`color`) se ignoran silenciosamente en no-bloqueantes (varias compitiendo por mutar lleva a display indefinido). Side-effects se acumulan; sonidos se superponen porque `playSound` crea instancias separadas de `Audio.Sound`.

**Cola de lectura para TalkBack** (`speechQueueService`): cada `AccessibilityInfo.announceForAccessibility` interrumpe al anterior — TalkBack no encola, atropella. Por eso TODO mensaje hablado pasa por la cola FIFO con timer `Math.max(800, len * charDurationMs)` ms. Cap 10 mensajes; `enqueue` es no-op si no hay screen reader. Setting `speechCharDurationMs` (default 20, rango 5-150) en "Velocidad de lectura".

**Captura de canales por texto plano**: con `consentir accesibilidad on` el MUD silencia pushes GMCP `Comm.Canales`. Fallback: state machine en `TerminalScreen` que se arma cuando el usuario teclea `canales`, detecta header `^Tus canales son:?$`, parsea líneas siguientes y rellena el modal de canales. Timeout 5s. NO captura mensajes en tiempo real (eso sigue siendo solo GMCP). Sigue habiendo logs `[CH_CAP]` temporales en producción — quitar cuando esté estable.

**Auto-asignación a personajes nuevos** (`TriggerPack.autoAssignToNew?: boolean`, undefined ≡ true): al crear o duplicar personaje, los packs con este flag añaden el nuevo serverId a `assignedServerIds`. Toggle en TriggerEditor "Auto-asignar a nuevos personajes" (default ON). En import: alert ofrece "¿Asignar a tus N personajes?" Sí/No.

**Naming "personaje" en UI**: rename UI-only de "Servidor" → "Personaje" (header de ServerListScreen, asignación en Triggers, etc.). Mantenidos como técnicos: "Host/Puerto del servidor", "Conectando al servidor", filtros de logs HTML, identificadores en código (`ServerProfile`, `serverId`, `loadServers`), tags `[server-key]` en `logService` (compat con backups). CLAUDE.md sigue usando "server" en docs internas.

**Schema final añadido (`src/types/index.ts`):**
```typescript
interface Trigger { blocking?: boolean; /* undefined ≡ true */ }
interface TriggerPack { autoAssignToNew?: boolean; /* undefined ≡ true */ }
interface PlayerVariables { playerName: string; /* desde ServerProfile.username */ }
interface AppSettings { speechCharDurationMs: number; /* default 20 */ }
```

### Plan en preparación — Pack "Movimiento" + pan estéreo + ${var} en regex (Plan D)

Decidido 2026-04-30 ir al nivel D directo (con pan estéreo y distinción aliado/enemigo). Por fases para poder probar incrementalmente. Origen: `blind/Movimiento_otros.set` y `blind/Movimiento_propio.set` de Rhomdur.

**Decisión sobre la implementación del pan**: usar la librería **`react-native-sound`** (subopción "c" / híbrida) para los `play_sound` con `pan`, manteniendo `expo-av` para todo lo demás. Razones: (1) `react-native-sound` tiene `setPan(-1..1)` que funciona en Android e iOS sin código nativo extra, (2) coste para futuro port a iOS = 0h específicos de la feature, (3) menos invasivo que reescribir toda la capa de audio. **Riesgo conocido**: `react-native-sound` es mantenida por la comunidad y va lenta; si en el futuro se rompe, alternativas son `react-native-nitro-sound` o módulo nativo custom (~3-5h por plataforma).

**Coste de adaptar a iOS** (la feature, no el port de app):
- Con `react-native-sound`: **~0h**. La lib ya soporta iOS.
- El port completo de TorchZhyla a iOS es deuda separada (~1-2 semanas) — `ios/` folder, equivalente Swift de `modules/torchzhyla-foreground/`, signing, App Store, etc.

#### Fase D-1 — Ampliar sustitución de `${var}` en regex (HECHO 2026-04-30)

`triggerEngine.setActiveTriggers` ahora sustituye en patrones regex CUALQUIER `${name}` (system var o user var) en lugar de solo `${personaje}`. Sintaxis dual decidida tras descubrir el problema del `|` en listas pipe-separated:

- **`${name}`** → valor regex-escapado (escape de `\\^$.*+?()[]{}|`). Útil para nombres atómicos como `${personaje}`. Compatible con el comportamiento previo del único caso ya soportado.
- **`${name:raw}`** → valor inyectado tal cual, sin escapar. Para cuando la user var contiene una alternancia ya construida (`Bandido|Espía|Jorge`) que el motor regex debe interpretar como tal. El usuario asume la responsabilidad de no romper el regex.
- Valor vacío / undefined / 0 / false → sustituido por `(?!)` (assertion inerte que nunca matchea). Permite triggers tipo "enemigo llega" que se quedan inertes mientras el usuario no haya tecleado `nick x ...`.

**Resolución de nombres**: primero busca en `VARIABLE_SPECS` (system vars: `personaje`, `vida`, `enemigos`, `salidas`, etc.). Si no es predefinida, busca en `userVariablesService`. Nombres desconocidos (typo) → undefined → `(?!)`.

**Auto-recompile**: el motor mantiene `patternUserVarRefs: Set<string>` con los nombres de user vars que aparecen en algún patrón. Cuando una acción `set_var` cambia el valor de una de esas vars, se marca `needsRecompile = true`. La recompilación se aplica al inicio del siguiente `process()` (no mid-loop, para no invalidar `compiled[]` mientras se itera). Coste: una recompilación de todos los patrones por cada cambio relevante. Aceptable porque las vars referenciadas en patrones cambian poco (típicamente una vez por sesión cuando el usuario teclea `nick x`).

**System vars NO se auto-recompilan**: los `${enemigos}`, `${aliados}` etc. del prompt cambian línea a línea pero son demasiado caros de re-evaluar en hot path. Se snapshootean al recompilar (cambio de personaje, edición de pack, etc.). En la práctica, los triggers de movimiento NO usan `${enemigos}` del prompt — ver sección D-2.

**Auto-declare en patrones**: `collectVarsReferencedByPacks` (utils/userVariablesUsage) ahora también escanea `t.source.pattern` buscando `${name}` y `${name:raw}` para auto-declarar user vars en bootstrap del server e import de packs. Mismo flujo que ya hacía con `set_var.varName` y bloques `user_var_ref` de acciones. `collectRolesForTrigger` también añade rol "reader" cuando la var aparece en el patrón.

**Hallazgo que cambió el diseño** (descubierto leyendo `blind/Nicks.set` y `blind/Funciones.set` de Rhomdur): en RdL la lista del prompt `$k` (variable `enemigos`) viene como `"10 szylases, (Novel) Lioren, Jorge"` — con contadores, prefijos de raza/visitante, plurales. Es **inutilizable directamente en regex**. Rhomdur tampoco la usa así: mantiene tres listas auxiliares (`@NickX`, `@PresentesE`, `@Peleas`) construidas con captura de comandos del MUD y limpieza de nicks. Por tanto el plan original de D-2 ("usar `${enemigos}` del prompt en patrones de movimiento") está descartado. Diseño nuevo en D-2: el pack incluye un trigger que captura la respuesta de `nick x ...` y mantiene una user var pipe-separated que los triggers de movimiento usan vía `${nick_x:raw}`.

#### Fase D-2 — Pack "Movimiento" base sin pan (HECHO 2026-04-30)

**Pack añadido a `torchzhyla-defaults.zip`**: 104 triggers + 94 wavs nuevos. ZIP ahora ~18 MB. Estructura final:

| Categoría | Triggers | Wavs |
|---|---|---|
| Captura `nick x` (5 plantillas del MUD) | 5 | 0 |
| Direccionales (entrada/salida × aliado/enemigo × 16 dirs) | 64 | 64 |
| Modificadores no-blocking (saltando, desplomándose) | 3 | 3 |
| Seguir / esquinazo | 10 | 4 |
| Árboles (caer, trepar, ramas) | 5 | 3 |
| Movimiento propio (sigues, dirección errónea, puertas) | 5 | 4 |
| Terreno (nieve, pantano) | 6 | 4 |
| Movimiento invisible (notas, aparece) | 4 | 0 (reusa Llega/Se va desconocido) |
| Movimiento entre árboles | 2 | 0 (reusa Arbol1) |
| **Total** | **104** | **94** |

Las 16 direcciones cubiertas: `norte, sur, este, oeste, noreste, noroeste, sudeste, sudoeste, arriba, abajo, dentro, fuera, hueco, grieta, cubil, algun`. El generador tiene un fallback para typos del addon original — `Llegada enemigos/Hueco.wav` no existe en source pero `ueco.wav` sí, se copia bajo el displayName correcto. Tabla `TYPO_FALLBACKS` extensible en el script si aparecen más.

**Patrones permisivos**: cada trigger direccional usa un regex tipo `^(SUJETO) llega.*?(?:desde|de)\s+(?:el |la |del |un |una |al )?DIRECCION\b.*\.$` (case-insensitive). Cubre las variantes "X llega desde el norte.", "X llega galopando desde el norte, dejando rastro.", "X llega de un cubil.", etc. con un solo trigger por dirección × tipo. Limitación conocida: "X llega de un cubil al norte." (entrada con escala intermedia) no matchea — el `.*?` no llega entre el artículo y la dirección.

**Sin pan estéreo todavía** — todos los `play_sound` salen centrados. El pan se añade en D-5 reaprovechando estos mismos triggers (solo cambia el JSON del pack, no el código).

**Distribución**: el ZIP regenerado vive en `C:/proyectos/Claude/TorchZhyla/torchzhyla-defaults.zip`. Para probarlo en el móvil: `adb push <zip> /sdcard/Download/`, luego en la app Triggers → Importar → seleccionar el archivo. Importará los 4 packs (Sonidos, Combate, Comunicaciones, Movimiento). Si "Movimiento" ya existía → reemplazo limpio (sus sonidos exclusivos se reasignan a UUIDs frescos).

**Setup que tiene que hacer el usuario tras importar el pack** (documentar en futura ayuda in-app):
1. Asignar el pack a sus personajes (auto-asignación on por defecto en futuros).
2. Teclear en el MUD: `nick x nombre1 nombre2 nombre3` con los nicks de los enemigos. La user var `nick_x` se rellena automáticamente vía los triggers de captura. Sin `nick x` todo suena como aliado.

**Generador**: el script `gen-movimiento-pack.mjs` está en `C:\Users\diego\AppData\Local\Temp\` — léelo para cualquier modificación. Re-ejecutarlo regenera el pack idempotentemente (elimina pack previo + sus sonidos exclusivos antes de re-añadir).

##### Plan original (referencia)

Lo que sigue es el diseño que se mantenía como referencia mientras se implementaba. Se conserva por contexto histórico y porque la sub-fase D-2 puede revisitarse si surgen falsos negativos en patrones.

Triggers cubriendo:
- Entradas: `* llega desde *`, `* llega de *`, variantes con `seguido de`, `galopando`, `nadando`, `saltando`, `desplomándose`, `levitando a escasos`, `surcando las aguas`, `dejando rastro`, `de la nada`, `de repente y sin saber cómo`. ~12 triggers.
- Salidas: `* se va hacia *`, `* se va en dirección * seguido de *`, `* sale galopando en su * en dirección *`, `* se va, deslizándose velozmente, en dirección *`, `* salta hacia *`, `Notas marcharse a alguien`, `Ves a * irse`. ~10 triggers.
- Seguir: `* comienza a seguirte`, `* te sigue`, `* te sigue de un salto`, `* te da esquinazo`, `* intenta seguirte pero le das esquinazo`, `* sigue a tu *`. ~6 triggers.
- Árboles: caer, trepar empezar/terminar, ver moverse las ramas. ~5 triggers.
- Movimiento propio: entrada en sala genérica `Sigues a * en dirección *`, dirección errónea, puerta cerrada, salida bloqueada, terreno (nieve, pantano, naturalizado). ~10 triggers.
- Personajes en otra sala: `* está allí`. 1 trigger.
- Notar movimientos invisibles: `Notas que alguien llega a tu posición`, `* aparece de la nada`. 2 triggers.

Total: ~45 triggers.

Wavs por dirección (`norte/sur/este/oeste/noreste/noroeste/sudeste/sudoeste/arriba/abajo/dentro/fuera`):
- Llegada aliado × 12 dir = 12 wavs
- Llegada enemigo × 12 = 12 wavs
- Salida aliado × 12 = 12 wavs
- Salida enemigo × 12 = 12 wavs
= **48 wavs direccionales**.

Wavs adicionales no direccionales: `Llega desconocido`, `Se va desconocido`, `Llega saltando`, `Se va saltando`, `Desplomandose*3`, `Naturalizado`, `Sigilando`, `Movimiento`, `Sigue aliado/enemigo {llega/se va/inicio}`, `Te sigue aliado/enemigo {/ inicio}`, `Trepa empezar/terminar`, `Movimiento ramas`, `Arbol*5`, `Direccion erronea`, `Puerta cerrada`, `Salida bloqueada`, `Nieve*5`, `Nieve bloquea`, `Pantano*3`, `Pantano Bloquea`, `Aliado alli`, `Enemigo alli`, `Enemigo`, `Objetivo aqui`, `Objetivo llega`, `Objetivo se va`, `No seguir`, `Das esquinazo`, `Sigues`. ~30 wavs.

Total: ~80 wavs nuevos en el ZIP.

**Distinción aliado/enemigo (rediseñada 2026-04-30 tras D-1)**: NO usamos `${enemigos}` del prompt — viene con plurales, contadores y prefijos que lo hacen inutilizable en regex. Replicamos la mecánica `@NickX` de Rhomdur:

1. **User var `nick_x`** (auto-declarada al importar el pack). Inicia vacía → `(?!)` en patrones → todo cae al catchall de aliado.
2. **5 triggers de captura** (cubren todas las plantillas que el MUD usa para confirmar cambios al slot `x`):
   - `^Nombre corto x quedando: (.+)\.$` (respuesta a `nick x A B C` o `dnick x C`)
   - `^Añadiendo nombre corto x como (.+)\.$` (respuesta a `anick x` / `nickear x`)
   - `^El nickname x equivale a (.+)\.$` (respuesta a query)
   - `^Nombre corto x cambiado de .+ a (.+)\.$` (rename)
   - `^Nombre corto x borrado\.$` → set_var nick_x = ""
   
   Los 4 primeros hacen `set_var nick_x = $1` con transformación `, → |` (pendiente de decidir cómo expresarla — opciones en D-2 design open). Resultado: `nick_x = "szylah|Lioren|Jorge"`.
3. **Triggers de movimiento ordenados**: específico-enemigo PRIMERO, catchall-aliado DESPUÉS. Ambos `blocking: true`. First-match-wins hace lo correcto.
   - `^(${nick_x:raw}) llega .+? desde (.+)\.` → llegada enemigo (suena wav enemigo).
   - `^(.+?) llega .+? desde (.+)\.` → llegada aliado/desconocido (suena wav aliado).
4. **Auto-recompile** (de D-1) hace que cuando el usuario teclea `nick x szylah Lioren` en el MUD, el set_var dispare la recompilación y la siguiente línea de movimiento ya use el regex actualizado.

**Convención que documentamos al usuario**: "Para que el cliente distinga enemigos en triggers de movimiento, teclea en el MUD `nick x nombre1 nombre2 ...`. La lista persiste server-side por personaje. Sin nick x configurado, todo el movimiento suena como aliado."

**No replicamos en primera pasada**: `@PresentesE` (auto-detect parseando "Aquí ves a: ..." que requiere un mini-corrector tipo `FuncCorrectorPlayers` para limpiar razas/paréntesis/plurales). Si en uso real falta, lo abordamos en D-6.

**Pendiente de cerrar en D-2** (preguntas para el siguiente arranque de D-2):
- Cómo expresar la transformación `, → |` en el value template del set_var. Opciones: (a) capturar con regex de N grupos opcionales y juntar con `|` literal en el value, (b) añadir un modificador de transformación tipo `${1:replace=', '|'}`, (c) acción nueva `set_var_transform`. Decisión cuando arranque D-2.

Sin pan en esta fase. La dirección se siente solo por el wav distinto (norte.wav vs este.wav vs oeste.wav).

#### Fase D-3 — Schema y motor para pan (HECHO 2026-04-30)

Cableado completo del valor `pan` desde `TriggerAction.play_sound` hasta `SoundContext.playSound(soundKey, pan)`. Todavía no audible — `expo-av` no expone stereo balance, así que la firma acepta el parámetro pero lo ignora hasta D-4.

Cambios:
- **`src/types/index.ts`** — `play_sound` añade `pan?: number`. Comentario documenta rango [-1, 1], default centro, compat hacia atrás.
- **`src/services/triggerEngine.ts`** — `TriggerSideEffect` para `play_sound` propaga `pan?`. Los dos lugares donde se hace push del side-effect (regex y variable triggers) lo incluyen.
- **`src/contexts/SoundContext.tsx`** — `playSound(soundKey, pan?)` acepta el parámetro y lo ignora con `_pan`. Comentario explícito sobre por qué (D-4 lo activa).
- **`src/screens/TerminalScreen.tsx`** — los dos consumidores de side-effects pasan `fx.pan` al `playSoundRef.current`.
- **`src/components/TriggerEditModal.tsx`** — `<PanPicker>` con 5 botones presets (◀◀ -1, ◀ -0.5, ● 0, ▶ +0.5, ▶▶ +1). Sin slider numérico — los presets cubren la convención CMUD del addon blind. El pan = 0 se persiste como `undefined` (no inflar el JSON con valores default).

Sin cambios funcionales en audio. Lo que sí se puede verificar tras esta fase:
- Crear/editar un trigger con pan ≠ 0, exportarlo y reimportarlo: el pan persiste.
- El motor recibe el pan en el side-effect (se puede inspeccionar con un `console.log` puntual).
- El UI muestra el botón seleccionado con el color de selección.

#### Fase D-4 — Integración `react-native-sound` para pan (HECHO 2026-04-30)

Pan estéreo audible para sonidos custom. Sonidos builtin con pan ≠ 0 caen a centrado + warning (limitación documentada).

**Cambios:**
- **`package.json`** — añadida dep `react-native-sound ^0.13.0`. Sin alias, sin overrides.
- **`src/contexts/SoundContext.tsx`** — `Sound.setCategory('Playback')` al cargar el módulo. `playSound(soundKey, pan)` ahora bifurca:
  - `pan === undefined || 0` (default) → ruta `expo-av` actual (cache de builtins + warmup, custom on-demand).
  - `pan ≠ 0` y key custom → carga vía `new Sound(path, '', cb)`, aplica `setPan(clamped)`, `play()`, libera con `release()`. Si la carga falla, fallback a `expo-av` centrado para que el usuario oiga ALGO.
  - `pan ≠ 0` y key builtin → ignora el pan + `console.warn`. Reescribir el cache de builtins en `react-native-sound` rompería el warmup; en la práctica el pack Movimiento usa sonidos custom así que no se nota.

**Reglas operativas:**
- **`react-native-sound` espera path SIN `file://`**. El código hace `uri.replace(/^file:\/\//, '')` antes de pasarlo al constructor.
- **Pan se clamp a [-1, 1]** en runtime aunque el wizard ya restrinja. Defensivo contra packs importados con valores fuera de rango.
- **Una `Sound` por play, liberada al terminar**. NO se cachea — los sonidos panned son one-shot, cachear acumularía instancias y la lib mantiene su propia caché interna.

**Linking**: autolinking de RN ≥ 0.60 lo recoge automáticamente al construir. **Requiere rebuild nativo** — el siguiente `npm run android` (o `cd android && ./gradlew.bat assembleDebug`) lleva el plugin nativo al APK. JS-only reload (Metro) NO es suficiente.

**Riesgo conocido**: `react-native-sound` es comunidad. Si en el futuro deja de mantenerse o rompe en una versión RN, alternativas: `react-native-nitro-sound` (más reciente, requiere Nitro Modules), `expo-audio` (la nueva lib de Expo — no soporta pan al 2026-04-30, hay que verificar), o módulo nativo custom (~3-5h por plataforma con AudioTrack/AVAudioPlayer).

#### ~~Fase D-4 — plan original (referencia)~~

- Añadir dep `react-native-sound`.
- Linking nativo en `android/` (autolinking de RN ≥ 0.60 lo hace, comprobar).
- Refactor de `SoundContext`:
  - Mantener `expo-av` para todo el flujo actual (cache, warmup, prepareSounds).
  - Añadir un segundo cache `panSoundCache` con `react-native-sound` para sonidos que se reproducen con pan ≠ 0.
  - `playSound(soundKey, pan)`:
    - Si `pan === 0` o undefined → ruta expo-av actual.
    - Si `pan != 0` → ruta react-native-sound: `new Sound(...)`, `setPan(pan)`, `play(...)`.
- Wavs ZIP: react-native-sound espera URIs de archivo en `${Paths.document}/sounds/<uuid>.wav`. La ruta funciona porque el sistema de import de packs ya copia los wavs ahí. Confirmar con un test.
- Compatibilidad: si la lib falla en el dispositivo (lib comunitaria, no expo-managed), fallback a expo-av sin pan + warning en consola.

Riesgos:
- `react-native-sound` puede tener fricciones con la versión de React Native. Verificar tras añadir.
- Memory: cada `Sound` instance carga el wav. Decidir si cachear o crear-y-liberar. Cachear si el wav se usa más de una vez (probable).

#### Fase D-5 — Pack "Movimiento" v2 con pan (HECHO 2026-04-30)

Generador `gen-movimiento-pack.mjs` extendido con tabla `DIR_PAN`:

| Dirección | Pan |
|---|---|
| este | +1.0 |
| oeste | -1.0 |
| noreste, sudeste | +0.5 |
| noroeste, sudoeste | -0.5 |
| norte, sur, arriba, abajo, dentro, fuera | 0 |
| hueco, grieta, cubil, algun | 0 (terrain-special, sin convención horizontal) |

Cada trigger direccional persiste `pan` solo cuando es ≠ 0 — pan = 0 se omite del JSON para mantenerlo limpio (default implícito). Verificado tras regenerar:
- `Llega aliado desde Este` → pan=+1 ✓
- `Llega aliado desde Oeste` → pan=-1 ✓
- `Llega enemigo desde Noreste` → pan=+0.5 ✓
- `Se va aliado hacia Sudoeste` → pan=-0.5 ✓
- `Llega aliado desde Hueco` → sin campo pan ✓

ZIP regenerado, mismas dimensiones (~18 MB).

#### Fase D-6 — Polish y prueba en uso real (HECHO parcial 2026-04-30)

**Hecho**: documentación de cada sub-fase actualizada con el estado HECHO + reglas operativas. La parte de "recompile-on-`${enemigos}`-change" del plan original quedó NO APLICABLE — el rediseño de D-2 cambió `${enemigos}` (system var del prompt) por `${nick_x:raw}` (user var poblada por trigger). Las user vars ya disparan auto-recompile al cambiar gracias a D-1, así que no hay caso límite que cubrir.

**Pendiente del usuario** (no se puede hacer sin device):
1. **Rebuild nativo**: la dep `react-native-sound` requiere reconstruir el APK. `cd android && ./gradlew.bat assembleDebug && adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. JS-only reload (Metro) no basta.
2. **Push del ZIP de defaults**: `adb push "C:\proyectos\Claude\TorchZhyla\torchzhyla-defaults.zip" /sdcard/Download/torchzhyla-defaults.zip`.
3. **Importar en la app**: Triggers → Importar → `torchzhyla-defaults.zip`. Reemplaza limpio si Movimiento ya existe.
4. **Configurar enemigos** en el MUD: `nick x nombre1 nombre2 ...`. Sin esto todo el movimiento suena como aliado (regex enemigo `(?!)` siempre falla).
5. **Test escenarios**:
   - Caminar y oir el sonido propio (`Sucesos/Sigues.wav`) en cada dirección.
   - Entrar/salir alguien marcado en `nick x` → wav de enemigo + pan según dirección.
   - Entrar/salir alguien NO marcado → wav de aliado + pan.
   - Verificar que `este` se oye claramente en oído derecho, `oeste` en izquierdo, diagonales suaves a 50%.
   - Probar `dnick x nombre` y `nick x borrado` para verificar que el trigger de borrado vacía la var (los siguientes movimientos pasan a sonar todos como aliados).
6. **Ajuste de volumen** (opcional): si los wavs panned suenan más bajos que los centrados (Android puede atenuar al aplicar pan), comparar y ajustar el volumen `setVolume(0.9)` en la rama `react-native-sound` de `SoundContext.playSound`.

**Total Plan D estimado**: ~2.5-3 días de trabajo efectivo, distribuibles en sesiones de 2-4h.

**Plan D — cierre 2026-04-30**: ejecutado en una sesión continua. Sub-fases D-1 a D-5 completadas. D-6 al 80% — falta el test en MUD real que solo puede hacer el usuario.

### Decisiones pendientes

- **Orden entre plantillas** cuando un server tiene varias asignadas. Default actual: alfabético por nombre de plantilla. Reordenación manual entre plantillas se difiere a Fase 4 si hace falta. (La reordenación **dentro** de una plantilla ya está implementada con flechas ▲/▼.)

(Las decisiones de Fase 3 — lista de variables, formato de prompt, semántica de eventos, UX de "Aplicar prompt" — se cerraron el 2026-04-28, ver sección "Fase 3" arriba.)

## Sistema de Ambientación (HECHO 2026-04-30)

Loop de música de fondo que cambia con el **tipo de room** (no por zona específica). 17 categorías hardcoded + `default` (subterraneo, bosque, ciudad, pantano, mar_costa, etc.). El `roomCategorizer` clasifica por keywords sobre el nombre normalizado de la sala. Cobertura medida ~94% sobre `map-reinos.json`; los defaults restantes son ciudades específicas que el usuario puede asignar al pool `default` desde la UI.

**Pipeline**: `MapService.currentRoomChanged` → `categorizeRoom(room.n)` → `AmbientPlayer.setCategory(category)` (debounced 500 ms) → crossfade 1.5 s entre el sound viejo y el nuevo. Si la categoría no tiene wavs asignados → silencio. Si tiene varios → random al entrar (no round-robin, no resume del anterior).

**Reglas operativas no derivables del código:**
- **Distribución sin wavs**: la APK no bundlea wavs de ambient. Los aporta el usuario importando ZIP o cargándolos manualmente desde "Mis ambientes".
- **Background**: AppState `'background'` → fade-out + pause; `'active'` → reanuda con la categoría actual del mapa. NO sigue sonando con pantalla bloqueada (decisión de fricción con notificaciones).
- **Stop al desconectar** (`telnetService.disconnect`) y al perder sala identificada (`currentRoom === null`).
- **Refs ausentes**: si una `custom:{uuid}.wav` ya no existe en disco → log + saltar a la siguiente del array. Si todas faltan → silencio + log. La UI muestra `(falta) <filename>` en los slots.
- **Kill-switch**: el toggle propio (`ambientEnabled` 🎵 en TerminalScreen) es independiente del `silentModeEnabled` global, pero ambos silencian.
- **`effectsVolume`** (slider en "Mis ambientes") afecta a TODOS los `play_sound` de triggers vía `SoundContext` en sus 3 rutas (custom centrado, custom panned con `react-native-sound`, builtin warmed). Default 0.7.
- **Loop gapless** depende del wav: deben venir cortados en zero-crossing con cola que continúa la cabeza, si no se oye click. Si un wav del usuario tiene click → es problema del wav, no del player.

**Settings**: `ambientEnabled` (bool, default true), `ambientVolume` (0..1, default 0.4), `effectsVolume` (0..1, default 0.7). Storage `aljhtar_ambient_mappings` con map por categoría → array de refs `custom:{uuid}.wav` (cap 4 por categoría, `MAX_SOUNDS_PER_CATEGORY` exportado para la UI).

**Archivos clave**: `src/services/roomCategorizer.ts`, `src/services/ambientPlayer.ts` (singleton), `src/storage/ambientStorage.ts`, `src/screens/MyAmbientsScreen.tsx`, `src/screens/ConfigBackupScreen.tsx`, toggle 🎵 en `TerminalScreen.tsx`.

**Import/export unificado**: el ZIP de "exportar plantillas de triggers" pasó a ser **"exportar configuración"** (formato `torchzhyla-config-backup` v2). Transporta packs + ambientMappings + sonidos referenciados. Importador acepta también el nombre legacy `torchzhyla-trigger-backup`. Merge de `ambientMappings` por categoría: las que vienen pisan, las que faltan se conservan. Pantalla `ConfigBackupScreen` accesible desde Settings (la versión granular con checkboxes está en Temas Pendientes).

## Temas Pendientes

- **Exportación completa de configuración** (extensión del formato `torchzhyla-config-backup` v2). Hoy el ZIP transporta packs + ambientMappings + sonidos referenciados, pero NO servidores, layouts, channel aliases, ni settings globales. Plan: pantalla de export con checkboxes granulares para cambio de móvil / backup defensivo.

  **UI de export propuesta**:
  - **Master "Todo"** arriba — marca/desmarca todas las casillas de golpe.
  - **Sección "Plantillas de triggers"**: un checkbox por pack (todos marcados por default). Cada pack al exportarse arrastra automáticamente sus user vars referenciadas + sus sonidos custom referenciados (no hay que pensar en eso).
  - **Checkbox "Ambiente"** (default ON). Incluye los `ambientMappings` completos + todos los sonidos asignados a alguna categoría.
  - **Checkbox "Servidores"** (default **OFF** — credenciales son específicas del personaje). Incluye TODOS los `ServerProfile` (host, port, username, password, autologin, blindMode, etc.).

  **Importador**: checkboxes paralelos mostrando lo que el ZIP realmente contiene, con la misma granularidad. Política de merge:
  - **Packs**: añadir con uuids frescos (sin merge por nombre — comportamiento actual).
  - **`ambientMappings`**: merge por categoría (las que vienen pisan, las que faltan se conservan).
  - **Servidores**: añadir como nuevos `ServerProfile` (sin merge — el usuario puede duplicar un personaje si reimporta).
  - **Sonidos custom**: uuid fresco vía `uuidMap` reescribiendo refs.

  **Faltantes a decidir antes de implementar** (preguntas para el siguiente arranque):
  - **Layouts de botones**: per-server en modo normal, global en blind. Opción A: cuando exportas un server arrastras su layout normal, y el layout blind global va como checkbox aparte. Opción B: checkbox unificado "Layouts" que se lleva todo (normal + blind). Decidir.
  - **Channel aliases**: per-server. Lo más natural es que viajen con el server al exportarlo (igual que el layout normal).
  - **Settings generales** (theme, fontSize, blind toggles, speechCharDurationMs, silentModeEnabled, ambientEnabled, ambientVolume, effectsVolume, etc.): checkbox "Settings de la app". Decidir si los volúmenes y kill-switches viajan o se respeta el estado del móvil destino.
  - **User variables sueltas** (declaradas pero NO referenciadas por ninguna plantilla incluida): edge case raro. Sugerencia: ignorar — si el usuario las quiere, las re-declara desde "Mis variables".
  - **Logs**: explícitamente fuera (son audit data del usuario, no configuración).

  **Estructura del backup.json tras la extensión**: añadir secciones opcionales `servers?`, `layouts?`, `channelAliases?`, `settings?`. Cada una se exporta solo si su checkbox está marcado. Importador trata cada campo como opcional y aplica solo si presente.

  **Coste estimado**: 4-6 h.
- **Acceso rápido a comandos en blind mode** (planteado 2026-05-01, en discusión). Problema: en MUD el usuario blind necesita 8-12 comandos accesibles en <1 s sin pasar por menús ni doble-tap-explorar. Botones pequeños con `accessibilityActions` son demasiado lentos. Opciones contempladas hasta ahora:
  - **Zona doble-tap-hold + drag direccional** (candidato técnico). Una `View` grande tipo "Zona de gestos rápidos" enfocada por TalkBack como un único elemento. El usuario hace doble-tap manteniendo el segundo dedo (gesto estándar de Android para drag/slider) — TalkBack cede el touch a la app durante todo el gesto. Detectamos `dx/dy` del PanResponder al soltar y disparamos el comando configurado para esa dirección (8 sectores: 4 cardinales + 4 diagonales). Ergonomía: rápido, sin precisión, 8-10 comandos por gesto. Limpio dentro del SDK accesible, sin permisos ni ajustes OS. Coste estimado: ~3-4 h para prototipo + settings de 8 slots.
  - **Volume Up/Down a nivel `KeyEvent`** (TalkBack no los consume): 2 atajos extra "duros".
  - **Botón "voz"** (`@react-native-voice/voice`): para comandos no comunes tipo "dar llave a Pepe". 1-3 s por comando.
  - **Shake** (acelerómetro): 1-2 atajos extremos tipo "huir".
  - Descartadas: `accessibilityRole="adjustable"` (solo up/down), servicio de accesibilidad propio (permisos elevados, frágil, Android-only), instruir al usuario a desactivar explore-by-touch (afecta todo el OS).
  
  Pendiente de seguir lluvia de ideas antes de cerrar diseño y dimensionar.

## Desarrollos por ahora no necesarios

Tareas analizadas y descartadas conscientemente: hay diseño hecho, pero no se implementan porque el coste/beneficio actual no compensa. Si en algún momento aparece el síntoma que las justificaría, retomar desde aquí.

### Mover el estado del terminal a contexto / singleton

**Problema que resolvería:** cuando Android destruye la `Activity` por presión de memoria o Doze agresivo (Xiaomi/Huawei sobre todo) aunque el proceso siga vivo, React remonta `TerminalScreen` desde cero y todos los `useState` arrancan vacíos. Resultado visible para el usuario: vuelve del bloqueo y "se ha perdido todo" (líneas, vitals, sala actual…), aunque el socket TCP siga activo en otro hilo.

**Por qué no se hace ahora:** bloquear el móvil de forma normal solo pausa la `Activity`, no la destruye. Con el `PARTIAL_WAKE_LOCK` + foreground service nativo (módulo `modules/torchzhyla-foreground/`) que mantiene el proceso vivo y la CPU despierta, el caso normal está cubierto sin necesidad de tocar el estado: el componente sigue montado, los `useState` intactos. El refactor solo aporta valor en escenarios extremos (móviles con poca RAM, bloqueos muy largos en fabricantes agresivos).

**Síntoma para retomar:** el usuario reporta que al volver del bloqueo el terminal está en blanco, los vitals a 0, el mapa sin sala actual… aunque la conexión sigue marcada como activa.

**Implementación esperada:**
- Crear `TerminalStateContext` (en `App.tsx`) o un servicio singleton (estilo `TelnetService`) que conserve `lines`, `hp`/`hpMax`, `energy`/`energyMax`, `currentRoom`, `nearbyRooms`, mensajes de canales y aliases.
- Reemplazar los `useState` correspondientes en `src/screens/TerminalScreen.tsx` (~1700 líneas, mucho estado entrelazado) por consumo del contexto.
- Decidir explícitamente qué se preserva: estado de juego sí, modales abiertos no, scroll position quizá.
- Cuidado con el rerender: un único contexto re-renderiza todos los consumidores en cada cambio. Con líneas llegando constantemente del MUD esto puede tirar performance — habría que partir en varios contextos (lines / vitals / map) o usar selectors (p. ej. `use-context-selector`).

**Coste estimado:** alto. `TerminalScreen.tsx` es el archivo más grande del proyecto y mucho de su estado se cruza entre handlers de gestos, blind mode y triggers de sonido/notificación.

### Auto-reconnect transparente del telnet

**Problema que resolvería:** cuando el socket TCP muere (avión, cambio WiFi→4G, sleep largo) los comandos enviados después se pierden silenciosamente y el usuario tiene que pulsar Conectar manualmente para volver al MUD.

**Por qué no se hace ahora:** se discutió y se decidió no implementarlo (2026-04-27). El crash que reportaba Sentry (`Error: Socket is closed`) ya está cubierto por el commit `dcc2f03` con try/catch en `writeToSocket` + flag `connected`. Lo que queda fuera de la app son los comandos perdidos durante el corte y la reconexión, que requieren interacción del usuario.

**Por qué descartamos los planes A/B/C que se propusieron:** todos requerían reenviar credenciales automáticamente al reconectar (no hay forma de decirle al MUD "soy yo" sin login porque Telnet/MUD no tiene sesiones server-side persistentes), y eso contradecía el requerimiento original de "no relanzar user/pass". El comportamiento de "se reconecta sin login y sigues jugando" que se ve en otros clientes es en realidad o (a) TCP que sobrevivió al corte sin que la app se enterara — esto YA funciona con el código actual — o (b) auto-login invisible que pasa en <500ms.

**Síntoma para retomar:** quejas de usuarios sobre tener que pulsar Conectar tras cortes breves, o métricas de Sentry/uso que muestren muchas reconexiones manuales. En ese caso, retomar la opción "Fase 2 con reconexión manual" descrita en el chat del 2026-04-27: banner persistente "Conexión perdida. Tap para reconectar", cola de comandos cap=20 que drena tras login confirmado, sin reintentos automáticos en background.
