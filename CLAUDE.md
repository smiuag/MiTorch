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

### 📍 APK Output Locations

```
📁 android/app/build/outputs/apk/
├── debug/
│   └── app-debug.apk          ← Para testing en desarrollo
└── release/
    └── app-release.apk        ← Para distribución (Google Play, testing final)
```

### ✅ Flujo Correcto de Compilación

#### 1️⃣ Debug APK (Para desarrollo/testing)

```powershell
# Terminal 1 - Metro
. .\reset-dev.ps1
npm start

# Terminal 2 - Build & Deploy
npm run android

# Ubicación: android/app/build/outputs/apk/debug/app-debug.apk
# Características:
# - Incluye Metro/bundler dinámico
# - Fast reload enabled
# - Debugging tools
# - Más lento pero mejor para desarrollo
```

**Cuándo usar:**
- Testing durante desarrollo
- Cambios rápidos en TypeScript/React
- Depuración con logs
- Probar features nuevas

**Tiempo:** ~5-10 minutos (con Metro corriendo)

#### 2️⃣ Release APK (Para distribución)

```powershell
# Opción A: Build directo (recomendado)
cd android
./gradlew.bat assembleRelease
cd ..

# Ubicación: android/app/build/outputs/apk/release/app-release.apk

# Características:
# - Totalmente independiente
# - Optimizado (minified, shrunk)
# - NO necesita Metro
# - Más rápido y ligero
# - Listo para Google Play
```

**Cuándo usar:**
- Versión final para usuarios
- Testing sin Metro
- Distribución en Google Play
- Performance testing

**Tiempo:** ~1 minuto (Gradle incremental)

### 🎯 Flujos Completamente Documentados

#### Escenario 1: Desarrollo rápido
```powershell
# Inicio
. .\reset-dev.ps1

# Terminal 1
npm start

# Terminal 2
npm run android

# Después: cambios automáticos → Metro recarga (2-5 segundos)
```

**Ventajas:** Ciclo rápido, debugging completo
**Tiempo total:** 15-20 min (inicial) + cambios en segundos

#### Escenario 2: Testing de release
```powershell
# Compilar APK de release
cd android
./gradlew.bat assembleRelease
cd ..

# Instalar sin Metro
adb install -r android/app/build/outputs/apk/release/app-release.apk

# Abrir app
adb shell am start -n com.smiaug.torchzhyla/.MainActivity

# NO necesitas Metro corriendo
```

**Ventajas:** Representa el producto final real
**Tiempo total:** 2-3 minutos

#### Escenario 3: Distribución (Google Play)
```powershell
# Generar bundle (formato Google Play)
cd android
./gradlew.bat bundleRelease
cd ..

# Ubicación: android/app/build/outputs/bundle/release/app-release.aab

# Subir a Google Play Console
# - Firmware compatible: Android 6+ (API 24)
# - Arquitecturas: arm64-v8a, armeabi-v7a, x86, x86_64
# - Permiso: INTERNET (para Telnet)
```

**Ventajas:** Formato optimizado por Google, reduce tamaño
**Tiempo total:** 2-3 minutos

### 🚨 Problemas Comunes y Soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| "Port 8081 is being used" | Metro anterior no cerró | `reset-dev.ps1` |
| "Unable to resolve module" | Assets no en paths correctos | Ver `blindModeService.ts` require() |
| Build freezes | Gradle daemon stuck | `./gradlew.bat --stop` |
| App doesn't load JS | Metro no está corriendo | `npm start` en Terminal 1 |
| Sound not playing | Paths incorrectos en require | Verificar `soundModules` object |
| "INSTALL_FAILED_USER_RESTRICTED" | User confirmó cancel en device | Aceptar permisos en device |

### 📋 Checklist Pre-Release

Antes de compilar release:

- [ ] Todos los commits pusheados
- [ ] `git status` limpio
- [ ] Metro NO corriendo
- [ ] Todos los procesos Node muertos: `Get-Process node -ErrorAction SilentlyContinue`
- [ ] ADB funcionando: `adb devices`
- [ ] Port 8081 libre: `netstat -ano | Select-String "8081"`

```powershell
# Script de verificación
. .\reset-dev.ps1
git status
adb devices
Write-Host "✅ Listo para compilar" -ForegroundColor Green
```

### 🔍 Debugging en Release

#### Logcat en tiempo real
```powershell
adb logcat | Select-String "TorchZhyla|SOUND|BM|BLIND|Telnet"

# Ejemplos de logs esperados:
# [SOUND] Intentando reproducir: "bloqueos/bloqueo-termina.wav"
# [BLIND_PROCESS] Procesando con blind mode
# [CHECK] Procesando bloqueo
```

#### Datos persistentes
```powershell
# Ver archivos almacenados
adb shell "run-as com.smiaug.torchzhyla cat /data/data/com.smiaug.torchzhyla/files/*"

# Limpiar datos (reset app)
adb shell pm clear com.smiaug.torchzhyla
```

### 📊 Métricas de Build

**Debug APK:**
- Tiempo: 5-15 minutos (con Metro)
- Tamaño: ~150-200 MB (incluye Metro)
- Velocidad en device: Normal

**Release APK:**
- Tiempo: 1-2 minutos
- Tamaño: ~40-60 MB (optimizado)
- Velocidad en device: ⚡ Más rápido

**Release AAB (Google Play):**
- Tiempo: 2-3 minutos
- Tamaño: Dinámico por device (~30-50 MB)
- Velocidad: Máxima

### 🎓 Arquitectura del Build

```
TypeScript/React Native
    ↓
Metro Bundler (debug) / Minifier (release)
    ↓
JavaScript Bundle
    ↓
Gradle (Android)
    ↓
Kotlin Compilation + NDK (C++)
    ↓
DEX Processing
    ↓
Package + Sign (release)
    ↓
APK / AAB
```

**Puntos críticos:**
- Metro = solo debug
- Gradle = siempre
- ADB = instalación/debugging

### 📱 Device Requirements

**Mínimo:**
- Android 6.0 (API 24)
- 50 MB espacio
- Internet (Telnet)

**Recomendado:**
- Android 10+ (API 29+)
- 100+ MB espacio
- Wi-Fi o 4G

### 🔐 Firma de APK (Release)

**Estado actual:**
- ✅ Keystore propio: `android/app/my-release-key.jks`
- ✅ Configurado en `android/gradle.properties` (vars `MYAPP_RELEASE_*`)
- ✅ Aplicado en `android/app/build.gradle` → `signingConfigs.release`
- ⚠️ `gradle.properties` contiene contraseñas en claro — está en `.gitignore`, NO commitear

**Recordatorios:**
- Nunca regenerar el keystore: si cambia la firma, Play rechaza la actualización para los usuarios actuales.
- Hacer backup del `.jks` y de las passwords fuera del repo (gestor de contraseñas).

### 🔢 Versionado (estricto a partir de la 1.0.0)

**Política decidida 2026-04-25:** se reseteó el versionado al subir por primera vez al Play Store. Versiones previas (`3.x.x`) eran informales y solo vivieron en GitHub releases / APKs enviadas a testers.

**Estado de partida:**
- `versionCode = 1`
- `versionName = "1.0.0"`
- Sincronizado en `android/app/build.gradle` y `app.json`.

**Reglas:**
- **Semver estricto** en `versionName`: `MAJOR.MINOR.PATCH`.
  - PATCH (`1.0.X`): bugfix sin cambios de API ni features visibles.
  - MINOR (`1.X.0`): nueva feature compatible hacia atrás.
  - MAJOR (`X.0.0`): breaking change visible para el usuario o cambio grande de UX.
- **`versionCode`**: simplemente `+1` en cada release publicada en Play. No se intenta codificar el semver dentro (la convención antigua `M*10000+m*100+p` queda descartada).
- **Sincronizar siempre los dos archivos**: `android/app/build.gradle` (`versionCode` + `versionName`) y `app.json` (`expo.version` = `versionName`). Si están desincronizados manda `build.gradle` (el build de Gradle no lee `app.json`).
- **`versionCode` solo sube, NUNCA baja**. Una vez publicado en Play un `versionCode`, ese número está quemado.

**Cuándo bumpear (regla para Claude):**
- NO bumpear automáticamente al hacer cambios. Los commits van sin tocar la versión.
- Bumpear SOLO cuando el usuario diga explícitamente "vamos a publicar" / "subir a Play" / "release".
- **Si hay duda de si un cambio es PATCH/MINOR/MAJOR, PREGUNTAR al usuario.** Mejor preguntar que decidir mal — un MAJOR mal puesto es ruido para el usuario, un PATCH mal puesto oculta una feature.

**Última publicada en Play:** _(ninguna todavía — la 1.0.0 será la primera)_

### ✨ Conclusiones

**Nunca confundir:**
- Debug = desarrollo local
- Release = producto final

**Nunca mezclar:**
- PowerShell en Windows
- Cambiar puertos
- Matar Metro a mitad de cambios

**Siempre:**
- Usar `reset-dev.ps1`
- Esperar logs reales
- Verificar `adb devices` antes de build
- Testear release APK antes de subir

**Resultado:** Compilaciones consistentes, predecibles y rápidas. 🚀

## Testing on Physical Device (Android with USB Cable)

When testing changes on a physical Android device connected via USB cable:

1. **Reset the environment** (Terminal 1, PowerShell):
   ```powershell
   . .\reset-dev.ps1
   ```
   This kills stale Node/Java processes, resets ADB, and sets `adb reverse tcp:8081 tcp:8081`.

2. **Start Metro bundler on port 8081** (Terminal 2):
   ```powershell
   npm start
   ```
   Wait until you see "Starting Metro Bundler" and "Logs for your project will appear below" with no port errors. Leave this terminal running.

3. **Build and deploy the app** (Terminal 3):
   ```powershell
   npm run android
   ```
   This compiles, installs the APK, opens the app, and Metro picks up the connection automatically.

**Important**: Always use port 8081. If 8081 appears to be in use, run `reset-dev.ps1` first — do not switch to 8082/8083.

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

### Blind Mode Overview

Blind mode (`uiMode === 'blind'`) provides a voice-only interface for screen reader users (TalkBack, VoiceOver). All feedback is via `AccessibilityInfo.announceForAccessibility()` and audio cues—nothing is displayed visually.

**Core features:**
- **Filter system** (`blindModeFilters.json`): Captures and silences server prompt data (stats, exits, enemies)
- **Silent mode**: Toggle between "read everything" and "read nothing" (no visible UI, only voice)
- **Channels**: Always written to terminal (for later review) but NEVER announced
- **Stat queries**: Voice-only commands via accessibility actions (e.g., "consultar vida" → announces "Vida 100 de 100")

### Multiple Actions per Button (Accessibility Actions) — IMPLEMENTED

**Problem:** Complex gestures (double-tap + swipe) don't work with TalkBack—the OS consumes them for navigation.

**Solution:** Use `accessibilityActions` (already implemented in `ButtonGrid.tsx`).

**How it works in TorchZhyla:**
- Each button in blind mode checks if it has a `secondaryCommand` (e.g., VID button: primary="consultar vida", secondary="consultar energia")
- If it does, `accessibilityActions` array is populated with two actions: `activate` and `secondary`
- TalkBack displays these in a context menu (user swipes up/down to select)
- `onAccessibilityAction` handler routes to the correct command

**Example button layout:**
```typescript
// layoutStorage.ts - blind mode buttons with secondary commands
{ id: genId(), col: 3, row: 0, label: 'VID', command: 'consultar vida', 
  secondaryCommand: 'consultar energia' },
{ id: genId(), col: 4, row: 0, label: 'SAL', command: 'consultar salidas', 
  secondaryCommand: 'xp' },
```

**Code in ButtonGrid.tsx:**
- Registers actions only when `uiMode === 'blind'` and button has `secondaryCommand`
- `onAccessibilityAction` handles both 'activate' (primary) and 'secondary' (alt) action names
- `accessibilityHint` describes both actions for discovery

**Guidelines:**
- ✅ All secondary commands use `accessibilityActions` (no gestures)
- ✅ User discovers via standard TalkBack menu (swipe up/down)
- ✅ Works with and without screen readers
- ❌ Do NOT add more gestures—this is the only accessible pattern

### Blind Mode Files

- `src/config/blindModeFilters.json`: Filter rules for capturing and silencing data
- `src/services/blindModeService.ts`: Filter processing, state capture, audio playback
- `src/storage/layoutStorage.ts`: `createBlindModeLayout()` defines blind-mode button grid

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

## Sistema de logs para soporte

Sistema opcional (off por defecto) para capturar la actividad del terminal y exportarla como HTML, pensado para que el usuario comparta fragmentos con soporte o los suba a sitios como deathlogs.com.

### Diseño

**Almacenamiento (archivo único, compartido entre servidores):**
- Ruta: `${Paths.document}/logs/log.txt`.
- Directorio privado del sandbox de la app — invisible desde exploradores de archivos, sin permisos.
- Cada línea: `[ISO timestamp] [server-key] contenido` (ANSI crudo preservado).
- `server-key` derivado del **nombre** del `ServerProfile` (slug: lowercase, espacios a guiones, sin caracteres especiales). Cada entrada de la lista de servidores tiene su propio tag.
- Comandos del usuario se prefijan con `>` tras el tag de servidor.
- Marcadores de conexión/desconexión: líneas `[ISO] [server-key] === Conectado a HOST:PORT ===` / `=== Desconectado ===`.

**Buffer y flush:**
- Buffer en memoria (array de strings) gestionado por `LogService` (singleton tipo `TelnetService`).
- Flush a disco cada **5 s** o cada **100 líneas**, lo primero. Minimiza I/O.
- Un `LogService` único sobrevive al ciclo de vida del `TerminalScreen` y a las reconexiones (vive mientras viva el proceso JS, que con foreground service es persistente).

**Cap de tamaño (configurable por el usuario):**
- Ajuste `maxLogLines` en Settings: 5.000 / 10.000 / 20.000 / 50.000 / 100.000 líneas.
- Default: 20.000 (~3-4 MB).
- Al superar el cap: truncar las líneas más antiguas (desde la cabecera del archivo) sin avisar.
- Si el usuario baja el cap y había más líneas guardadas: truncar al nuevo tope inmediatamente (sin confirmación).

**Sanitización:**
- Solo la contraseña: cuando el auto-login mande `server.password`, la línea correspondiente NO se escribe al log.
- No se sanitiza username, host, ni nicks de otros jugadores.

**Toggle ON/OFF:**
- Off por defecto — la mayoría de usuarios no necesitan logs.
- Al activar: empieza a escribir desde cero (no recupera nada anterior).
- Al desactivar: **borrar el archivo de log inmediatamente** (privacidad y limpieza).

**Borrado manual:**
- Botón "Borrar todos los logs" en Settings (solo visible si toggle ON).

**Export:**
- Botón "Exportar log" en Settings (solo visible si toggle ON y hay archivo de log).
- Modal al pulsar: "¿Qué rango quieres exportar? [Últimas 24h] [Últimos 7 días] [Todo]".
- Genera HTML en `${Paths.cache}/torchzhyla-log-export.html` (cache, porque es desechable una vez compartido).
- Abre el HTML en el navegador via `Linking.openURL(contentUri)` donde `contentUri = await getContentUriAsync(fileUri)` de `expo-file-system/legacy`.
- Si `Linking.openURL` falla (algunos dispositivos no resuelven content:// a text/html), fallback: añadir `expo-sharing` en el futuro.

**Generador HTML:**
- Parser reutiliza la lógica de `src/utils/ansiParser.ts` para convertir ANSI → `<span style="color: #xxx">`.
- Cada línea como `<div data-ts="ISO" data-server="server-key">`.
- Cabecera con filtros JavaScript embebidos:
  - Dropdown "Servidor" poblado dinámicamente con los `data-server` encontrados.
  - Inputs "Desde"/"Hasta" (datetime-local).
  - Buscador de texto en vivo.
  - Botón "Copiar visibles" que selecciona solo `<div>` no ocultos y copia HTML con formato al portapapeles.
  - Atajos: "Últimos 30 min", "Última hora", "Hoy".
- Enlace a **deathlogs.com**:
  - Si hay un servidor filtrado y su `host` (lookup del `ServerProfile`) contiene `reinosdeleyenda.es` → `https://deathlogs.com/list_log.php?m_id=10`.
  - Si no → `https://deathlogs.com/`.

### Archivos involucrados

- `src/services/logService.ts` (NUEVO): singleton con buffer, flush, trim, export, sanitización.
- `src/utils/logHtmlGenerator.ts` (NUEVO): genera el HTML con filtros embebidos.
- `src/services/telnetService.ts`: llama `logService.appendIncoming(serverKey, text)` en `onData`.
- `src/screens/TerminalScreen.tsx`: llama `logService.appendCommand(serverKey, cmd)` antes de enviar comandos. Avisa a `logService.setCurrentServer` al conectar.
- `src/screens/SettingsScreen.tsx`: UI del toggle, selector de tamaño, botones borrar/exportar, confirmación de export.
- `src/storage/settingsStorage.ts`: persistencia de `logsEnabled` y `maxLogLines`.
- `src/types/index.ts`: extensión de `AppSettings`.

## Sistema de Triggers (plan aprobado 2026-04-27)

Sistema declarativo de reglas que interceptan líneas entrantes del MUD y permiten silenciarlas (gag), modificarlas (replace, color), o disparar efectos (sonido, comando, notificación). Los triggers se organizan en **plantillas** (grupos) que se asignan a uno o varios servidores y se reutilizan entre ellos.

### Estado actual

HECHO: motor (`src/services/triggerEngine.ts`) + storage de plantillas globales (`src/storage/triggerStorage.ts`) con seed de plantilla por defecto "Avisos básicos" + integración en pipeline de líneas (`TerminalScreen.processingAndAddLine`).

HECHO: 7 acciones disponibles — `gag`, `color`, `replace`, `play_sound` (built-in), `send`, `notify`, `floating`. La acción `floating` se añadió como nuevo tipo durante la implementación; no estaba en el plan original de Fase 1.

HECHO: editor visual de patrones en cajas (`TriggerPatternBuilder`) con anclas tap-toggle al inicio/fin, picker de tipo en `+`, edición inline de cajas de texto, auto-color y auto-label de capturas. Además modo experto regex como escape hatch (toggle en el header del editor).

HECHO: editor visual de campos de texto de acciones (`TriggerActionTextBuilder`) con chips de captura reusables, mismos colores que en el patrón.

HECHO: pantallas `TriggersScreen` (lista de plantillas) y `TriggerEditorScreen` (contenido de una plantilla + asignación a servers). Entrada desde Settings → "Triggers" → "Abrir".

HECHO: sistema de mensajes flotantes (`FloatingMessagesContext` + `FloatingMessages` overlay en TerminalScreen). Los mensajes se anuncian SIEMPRE vía `AccessibilityInfo.announceForAccessibility` para usuarios de TalkBack. Los antiguos `locateFeedback` y `statFeedback` (overlay individual de "Localizado", "Vida: X/Y", etc.) se migraron a este sistema.

HECHO: refactor de notificaciones — eliminado el sistema hardcoded (BONK, mensaje privado, bloqueo terminado en `notificationPatterns.json`) en favor de triggers configurables. Ahora `fireNotification` solo dispara si el toggle global "Usar notificaciones" está ON Y la app no está en primer plano.

DESCARTADO: sistema previo de "modos de coincidencia" (contiene texto / empieza por / termina con / línea exacta / regex avanzada) — fue una iteración intermedia entre regex pura y cajas. Reemplazado por las cajas porque el usuario lo encontró más intuitivo.

DESCARTADO: notificaciones hardcoded del sistema viejo. Razón: redundante con los triggers user-defined.

HECHO (Fase 2): subir sonidos custom desde el móvil para usar en `play_sound`. Implementado con `expo-document-picker` y copia a `${Paths.document}/sounds/{uuid}.{ext}` en `src/storage/customSoundsStorage.ts`. La acción `play_sound` admite tres formatos en `file`: bare path (compat hacia atrás → builtin), `builtin:eventos/xp.wav`, y `custom:{uuid}.{ext}`. Selector con pestañas Built-in / Mis sonidos en `TriggerEditModal` con preview ▶ por entrada y botón de subir en la pestaña custom. Pantalla `MySoundsScreen` (Settings → Mis sonidos) gestiona la lista con preview, renombrar y borrar (avisa qué triggers quedarán huérfanos al borrar un sonido en uso). Sonidos custom se cargan on-demand sin caché para no inflar memoria con uploads ilimitados; los built-in siguen precargados como antes.

HECHO (post-Fase 2): migración de los sonidos auto-detectados a la infraestructura de triggers. Plantilla seeded "Sonidos del MUD" con id estable `pack_seeded_sounds` (`src/storage/triggerStorage.ts:createSoundsPack`) — 24 triggers en cajas (cero modo experto). Sembrada con un `SOUNDS_SEEDED_KEY` separado del seed key del pack original, por lo que usuarios existentes la reciben en la próxima ejecución sin perder sus packs propios. Decisiones cerradas: (1) toggle global "Usar sonidos" se mantiene como kill-switch — el side-effect `play_sound` se gatea en `!silentModeEnabledRef.current` (que está enlazado al setting); (2) auto-enable en blind mode se replica con `enableSoundsPackForBlindMode()` que se llama desde `SettingsScreen.updateSetting` cuando `uiMode → 'blind'` — encuentra el pack por id estable, fuerza `enabled=true` en todos sus triggers y añade todos los servidores guardados a `assignedServerIds`; (3) preview ya cayó como parte de Fase 2 (▶ en el picker). Cambio técnico hecho: `triggerEngine.process()` ahora corre ANTES del early-return de blind mode en `TerminalScreen.processingAndAddLine`, y los side-effects (sound/send/notify/floating) se disparan incondicionalmente — solo `gag` corta todo. Eliminados: `src/config/soundPatterns.json`, `src/services/soundService.ts`, `src/services/soundConfigService.ts`, `SoundContext.detectSound`, `SoundContext.patterns`, `AppSettings.enabledSounds`, `rebuildSounds()`. Settings UI ya no tiene el modal de sonidos individuales — apunta al usuario a Triggers → "Sonidos del MUD". `AVAILABLE_SOUNDS` se mantiene en `settingsStorage.ts` como única fuente de verdad para el picker built-in del editor de triggers. Notas conocidas: si una plantilla del usuario tenía `play_sound` con bare path (formato pre-Fase 2), sigue funcionando (el `playSound` lo trata como builtin); las nuevas guardan con prefijo `builtin:`.

HECHO (2026-04-29): plantilla seeded **"Combate completo"** con id estable `pack_seeded_combate` (`src/storage/triggerStorage.ts:createCombatePack`) — 84 triggers en modo experto (regex raw) traducidos del addon CMUD `blind/Combate.set` de Rhomdur. Sembrada con `COMBATE_SEEDED_KEY` separado para que usuarios existentes la reciban en próxima ejecución sin tocar sus packs. Decisiones cerradas con el usuario: (1) **abreviar sonidos al máximo** — los ~50 sonidos distintos del addon original (uno por tipo de daño, uno por ciudad, etc.) se colapsan a 9 categorías reusables: `golpe-lanzas`/`golpe-recibes` (catchall por lado, marcador `[#]`/`[*]`), `muerte-propia`/`muerte-otro`, `hemorragia`/`cicatrizar`, `incapacitado` (stun + dormir + miedo huir), `alerta` (genérico de eventos importantes — ataques a 13 ciudades distintas todas mapeadas al mismo, peleas iniciar/parar, persecución, miedo resistir, etc.) y el `critico` ya existente del pack "Sonidos del MUD". (2) **Conservar todos los textos** — incluso colapsando a sonidos comunes, cada `#GTrigger` del Combate.set se preserva como entrada explícita en la plantilla, para que el usuario vea/edite/desactive triggers individuales. (3) **Variantes `*4`** del CMUD (random de 4 wav) descartadas — la engine no soporta random; usamos siempre la variante 1. (4) **Lógica `FuncComprobarSujeto`** (aliado vs enemigo) descartada — un solo sonido por evento, sin distinguir. (5) **Auto-enable en blind mode** vía `enableCombatePackForBlindMode()` (helper paralelo a `enableSoundsPackForBlindMode`, comparten implementación interna `enablePackForBlindMode(packId)`). Llamado desde `SettingsScreen.updateSetting` junto con el helper de Sonidos cuando `uiMode → 'blind'`. (6) **Order matters** dentro del pack — first-match-wins: triggers específicos primero (muerte/heridas/armadura/proteger/ciudades/etc.), luego el trigger de crítico anclado a `^(?:\] |> )?[*#] .*críticamente`, luego los catchalls `^(?:\] |> )?[*#] ` con prefijo de prompt opcional. Así "Propinas el golpe mortal" suena como muerte-otro y no como golpe-lanzas, y un kill crítico suena como crítico y no como golpe genérico. Archivos tocados: `src/storage/triggerStorage.ts` (helper `buildRawSoundTrigger` + `createCombatePack` + `enableCombatePackForBlindMode`), `src/storage/settingsStorage.ts` (8 entradas nuevas en `AVAILABLE_SOUNDS`), `src/contexts/SoundContext.tsx` (8 `require()` en `soundModules`), `assets/sounds/combate/` (8 wav nuevos copiados de `C:/proyectos/Claude/VipZhyla/Scripts/sounds/RL/Combate/`), `src/screens/SettingsScreen.tsx` (segunda llamada al cambiar a blind).

DECIDIDO: el tipo `[número]` de las cajas se queda como `(\d+)` — solo dígitos, sin decimales ni separador de miles. Razón: en RdL todos los números del MUD son enteros (vida, energía, oro, XP, nivel). Si surge un MUD que use decimales o comas, se evaluará entonces añadir tipos nuevos `[número decimal]` o `[número con miles]` en lugar de generalizar `[número]` (que perdería predictibilidad).

HECHO (Fase 3): variables del sistema. Implementado el 2026-04-28 siguiendo el plan cerrado en esa misma fecha. Detalle:
- `src/services/promptParser.ts` — singleton con regex por campo, anclado a tokens conocidos (`Pv:`, `Pe:`, `Xp:`, `Carga:`, `SL:`, `PL:`, `NM:`, `LD:`, `Jgd:`, `Imagenes:`, `Pieles:`, `Inercia:`, `Astucia:`, `Acc:`). Normaliza acentos antes del match. `parse(line)` devuelve `{ isPrompt, updates }`. Exporta `CANONICAL_PROMPT`.
- `src/utils/variableMap.ts` — `VARIABLE_SPECS` con nombres en castellano, mapping a campos internos en inglés, y derivadas (`vida_pct`, `energia_pct`, `en_combate`). `getVariableDependencies()` devuelve los campos de los que depende una variable derivada.
- `src/services/playerStatsService.ts` — campos nuevos (`roomPlayers`, `actionsMovement/Primary/Secondary/Minor`, `carry`), `prevValues`, método `setSnapshot(updates): (keyof PlayerVariables)[]` que captura `prevValues` antes del merge y devuelve las claves cambiadas.
- `src/services/triggerEngine.ts` — `evaluateVariableTriggers(changedKeys, prev, current)` con first-match-wins **por variable** (no global, porque un solo prompt actualiza varias vars a la vez). `applyVariableAction` excluye `gag`/`replace`/`color` (no aplican a líneas ya gageadas). `expandVariableTemplate` soporta `$old` / `$new`. `checkVariableCondition` implementa los 5 eventos: `appears`, `changes`, `equals`, `crosses_below` y `crosses_above` (estos últimos edge-triggered, requieren cambio de tipo número).
- `src/screens/TerminalScreen.tsx` — pipeline integrado: `promptParser.parse()` corre antes que blind mode y antes que regex triggers. Si `isPrompt`, actualiza vars, evalúa triggers de variable, dispara side-effects y gaguea la línea en TODOS los modos.
- `src/screens/ServerListScreen.tsx` — botón "Aplicar prompt TorchZhyla" con confirmación previa. Solo activo si la conexión a ese server está abierta. Envía `prompt {CANONICAL_PROMPT}` y `promptcombate {CANONICAL_PROMPT}`. NO hay auto-aplicar al conectar (respeto a usuarios que no usan triggers).
- `src/components/TriggerEditModal.tsx` — wizard "Alarma de variable": toggle `regex` ↔ `variable` en el header del editor, dropdown de variable (de `VARIABLE_SPECS`), dropdown de evento (`VARIABLE_EVENTS`), input de valor cuando el evento lo requiere, lista de acciones limitada a `play_sound`/`send`/`notify`/`floating`. Validación que bloquea guardar si el valor falta o no es numérico cuando toca.
- Limpieza en blind mode: eliminadas `loadPromptFilters`, `isPromptLine` y `convertPromptPatternToRegexArray` de `blindModeService.ts`. Quitados los groups `prompt_stats` y `sala_entidades` de `blindModeFilters.json` — los reemplaza `promptParser` corriendo siempre.

PENDIENTE (Fase 4): packs predefinidos.

HECHO (adelantado de Fase 4): reordenación de triggers dentro de una plantilla. `TriggerEditorScreen` muestra dos flechas ▲/▼ a la izquierda de cada fila; `handleMoveTrigger(trigger, 'up'|'down')` swappea con el vecino en `pack.triggers[]` y persiste. Las flechas se deshabilitan en los extremos. El orden importa porque el motor evalúa de arriba abajo y aplica first-match-wins (regex absoluto, variables por nombre de variable). NO se hizo drag-and-drop real — flechas son suficientes en móvil y mucho más accesibles para TalkBack.

HECHO (adelantado de Fase 4): export/import de plantillas **con sonidos incluidos**. Decisión revisada respecto al plan original (que era JSON-only sin sonidos): el usuario pidió empaquetar también los `.wav`/`.mp3` referenciados, así que cambiamos a ZIP. Implementación:
- Dependencia nueva: `jszip` (puro JS, sin módulo nativo).
- `src/services/triggerPackExport.ts` — `exportPackToZip(pack)` genera un ZIP en `${Paths.cache}` con `pack.json` (cabecera `{ format: 'torchzhyla-trigger-pack', version: 1 }`, nombre, triggers, `soundsManifest`) + `sounds/{uuid}.{ext}` por cada sonido custom referenciado. `importPackFromZip(uri)` lo lee, valida cabecera, instala cada sonido bajo un **uuid nuevo** (vía `addCustomSoundFromBytes` en `customSoundsStorage`), reescribe los `play_sound.file = "custom:..."` con los uuids nuevos, y devuelve un `TriggerPack` con id+triggerIds frescos y `assignedServerIds: []`.
- Nuevo helper `addCustomSoundFromBytes(bytes, name, ext)` en `customSoundsStorage.ts` para escribir audio crudo (no copia desde URI). Usado solo por el importador.
- `TriggersScreen` añade botón **"Importar"** en el header (abre `expo-document-picker` y deja al usuario elegir el ZIP) y botón **"Compartir"** ↗ por fila (genera ZIP, abre `expo-sharing`). En colisión de nombre al importar: alerta con opciones Sustituir / Duplicar (`"X (importada)"`) / Cancelar.
- Sonidos faltantes en el ZIP: el manifest los reporta y la importación deja la acción `play_sound` apuntando al uuid huérfano (que el picker renderiza como "(falta) ..."). El usuario reasigna manualmente.
- `assignedServerIds` siempre se vacía en el import — el usuario elige a qué servidores asignar, igual que con plantillas seeded.
- Versionado: la cabecera `version` permite rechazar packs futuros con un error claro si la app es más vieja.

DESCARTADO en favor de A: opción B "JSON con base64 inline" (sin deps pero ~33% overhead, archivos enormes, JSON ilegible si lo abres con un editor).

HECHO: backup global de TODAS las plantillas en un solo ZIP (`format: 'torchzhyla-trigger-backup'`, version 1). Implementación en `src/services/triggerPackExport.ts`:
- `exportAllPacksToZip(packs)` — genera `torchzhyla-triggers-{YYYY-MM-DD}.zip` en `${Paths.cache}` con `backup.json` (cabecera + lista de packs sin ids/asignaciones + `soundsManifest` consolidado y deduplicado por uuid) y `sounds/{uuid}.{ext}`. Útil sobre todo para cambio de móvil.
- `importBackupFromZip(zipUri)` — instala los sonidos una sola vez bajo uuids nuevos (compartidos entre todos los packs que los referencian), regenera ids de pack y de trigger, reescribe `play_sound` refs y devuelve `{ packs, importedSoundCount, missingSoundCount }` con `assignedServerIds: []` siempre (los ids de servidor son locales y no sobreviven al cambio de móvil — el usuario reasigna desde el editor).
- `importFromZip(zipUri)` — wrapper que detecta el formato (`backup.json` vs `pack.json`) y delega. La pantalla `TriggersScreen` lo usa siempre, evitando duplicar el sniff del archivo.

UI en `TriggersScreen`:
- Botón nuevo **"Exportar todo"** en el header junto a "Importar". Comparten estilo (`headerBtn`).
- "Importar" ahora despacha sobre `result.kind`:
  - `'pack'` → flujo per-pack existente (Cancelar / Sustituir / Duplicar para colisión por nombre).
  - `'backup'` → flujo nuevo: si hay colisiones, alerta única con **3 botones** Cancelar / Saltar / Sustituir (límite real de `Alert.alert` en Android es 3). "Saltar" importa solo las que no colisionan; "Sustituir" reemplaza las colisiones manteniendo intactas las plantillas que no aparecen en el backup. **Merge, no wipe** — los packs existentes que no están en el backup se conservan siempre. Si el usuario quiere un restore exacto, debe borrar primero su lista.
- Mensaje de éxito en backup recuerda que las asignaciones a servidores quedan vacías.

DESCARTADO: 4º botón "Duplicar todas" en el flujo de backup. Razón: `Alert.alert` en Android limita a 3 botones. Para duplicar un pack concreto el usuario puede usar el export per-pack y la opción Duplicar de ese flujo.

DESCARTADO: serializar `assignedServerIds` en el backup. Los ids son locales y no se pueden remappear sin export de servidores también. Mantener consistencia con el export per-pack y dejar que el usuario reasigne es lo más predecible.

PENDIENTE (mejoras de accesibilidad): defaultear a modo experto cuando `uiMode === 'blind'` (las cajas son inherentemente visuales y mucho menos navegables con TalkBack que un campo de regex de texto plano), y añadir un resumen narrado del patrón debajo del editor. ~1 hora, alto impacto para invidentes.

PENDIENTE: más triggers de prueba en la plantilla por defecto. El usuario los irá pidiendo conforme vea cosas que quiera silenciar/avisar en el MUD.

Se descartó explícitamente Lua / scripting dinámico para v1. La motivación: cubrir el ~90% de los casos reales (filtros, alarmas, recoloreo, sonidos por keyword) sin meter un runtime de scripting con sus dolores de bucles infinitos, sandbox, y errores de usuario. Si en uso real aparecen patrones que requieran lógica condicional compleja o máquinas de estado, se evaluará entonces añadir `fengari` reusando el motor de matching declarativo.

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
  | { type: 'play_sound'; file: string }                         // 'builtin:x.wav' | 'custom:{uuid}.wav'
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

#### Fase 1 — Motor base + plantillas globales (MVP)

**Entregable:** triggers con regex y las 6 acciones básicas, organizados en plantillas asignables a servidores, configurables desde Settings.

**Archivos nuevos:**
- `src/services/triggerEngine.ts` — singleton con `setActiveTriggers(triggers)` y `process(text, spans): ProcessResult`.
- `src/storage/triggerStorage.ts` — CRUD de `TriggerPack[]` en AsyncStorage.
- `src/screens/TriggersScreen.tsx` — lista de plantillas, accesible desde Settings. CRUD + duplicar + asignar servers.
- `src/screens/TriggerEditorScreen.tsx` (o modal) — edición del contenido de una plantilla: lista de triggers internos.
- `src/components/TriggerEditModal.tsx` — formulario de un trigger: nombre, regex con compilación en vivo, lista de acciones, "probar contra esta línea".
- `src/types/index.ts` — añadir tipos de arriba.

**Archivos tocados:**
- `src/screens/TerminalScreen.tsx` — al conectar, cargar triggers de plantillas asignadas y llamar `triggerEngine.setActiveTriggers`. En el handler de líneas entrantes, invocar `triggerEngine.process()` antes de meter la `MudLine` al buffer.
- `src/screens/SettingsScreen.tsx` — botón "Triggers" que navega a `TriggersScreen`.
- `App.tsx` — registrar las nuevas rutas.

**Acciones soportadas:** `gag`, `replace`, `color`, `play_sound` (solo built-in), `send`, `notify`.

**Fuera de fase 1:** variables, sonidos personalizados, drag-reorder.

**Coste:** 2-3 días.

#### Fase 2 — Sonidos personalizados

**Entregable:** el usuario sube `.wav`/`.mp3` desde el móvil y los usa en `play_sound`.

- `expo-document-picker` para seleccionar archivo.
- Copia a `${Paths.document}/sounds/{uuid}.{ext}`.
- En `play_sound`, `file` admite `builtin:nombre.wav` y `custom:{uuid}.wav`.
- Selector en `TriggerEditModal` con pestañas Built-in / Personalizados.
- Pantalla "Mis sonidos" en Settings: lista, preview, borrar (avisa si está en uso).

**Coste:** medio día.

#### Fase 3 — Variables del sistema (plan cerrado 2026-04-28, IMPLEMENTADO 2026-04-28)

**Entregable:** triggers que reaccionan a cambios en estado del juego (vida, energía, imágenes, jugadores en sala, etc.) capturados parseando el prompt del MUD. ✅ Hecho — ver "HECHO (Fase 3)" arriba para el detalle de archivos. La sección que sigue se mantiene como referencia del diseño y de las decisiones cerradas durante la implementación.

##### Variables expuestas al usuario

Nombres en castellano en la UI del wizard, mapeados a los nombres internos en inglés ya existentes en `playerStatsService` (no se renombra el storage para no tocar `VitalBars`, blind mode, etc.).

Numéricas (default `0`):
- `vida` ($v) → `playerHP`
- `vida_max` ($V) → `playerMaxHP`
- `vida_pct` (derivada) → `playerHP / playerMaxHP * 100`
- `energia` ($g) → `playerEnergy`
- `energia_max` ($G) → `playerMaxEnergy`
- `energia_pct` (derivada)
- `xp` ($x) → `playerXP`
- `imagenes` ($e) → `playerImages`
- `pieles` ($p) → `playerSkins`
- `inercia` ($n) → `playerInertia`
- `astucia` ($t) → `playerAstuteness`
- `jugadores_sala` ($j) → `roomPlayers` (NUEVO)
- `acciones_movimiento` ($AM) → `actionsMovement` (NUEVO)
- `acciones_principales` ($AP) → `actionsPrimary` (NUEVO)
- `acciones_secundarias` ($AS) → `actionsSecondary` (NUEVO)
- `acciones_menores` ($AZ) → `actionsMinor` (NUEVO)
- `carga` ($c) → `carry` (NUEVO)

Texto (default `""`):
- `salidas` ($s) → `roomExits`
- `enemigos` ($k — los que tú puedes matar) → `roomEnemies`
- `aliados` ($K) → `roomAllies`
- `combatientes` ($a — los que pelean contigo) → `roomCombatants`

Derivada booleana:
- `en_combate` = `roomCombatants !== ""`

Las derivadas (`vida_pct`, `energia_pct`, `en_combate`) se computan al consultar, no se almacenan.

##### Prompt canónico TorchZhyla

```
prompt $lPv:$v\$V Pe:$g\$G Xp:$x Carga:$c$lSL:$s$lPL:$a$lNM:$k$lLD:$K$lJgd:$j$lImagenes:$e$lPieles:$p$lInercia:$n$lAstucia:$t$lAcc:$AM\$AP\$AS\$AZ$l
```

`prompt` y `promptcombate` son **idénticos** (un solo formato, una sola regex set). El estado de combate se deriva de `en_combate`. `$k` en NM (los que tú puedes matar), no `$b`.

##### UX "Aplicar prompt"

Botón en la pantalla de edición del servidor, junto a host/port/auto-login. **Solo manual, one-shot.** NO hay toggle de auto-aplicar al conectar — hay usuarios que no usan triggers y no queremos modificarles el prompt en el MUD a sus espaldas. El usuario que sí los use lo aplica una vez por personaje (el MUD persiste el prompt server-side por PJ, así que normalmente solo hace falta una vez).

Comportamiento:
- Solo activo si la conexión a ese server está abierta.
- Confirmación previa: "Esto sobrescribirá tu prompt actual en el MUD para este personaje. ¿Continuar?"
- Envía `prompt {canonico}` y `promptcombate {canonico}` al MUD.
- Toast (o announcement en blind) al terminar.

##### Captura best-effort

El parser corre **siempre** (en blind y en normal — sale del scope de `blindModeService`). Tiene una regex por campo, no por prompt completo. Si el usuario aplicó el prompt canónico → captura todas las variables. Si tiene el suyo propio → captura solo los campos que coincidan con el formato esperado; el resto queda en valor por defecto.

##### Detección de "esto es una línea del prompt"

Una línea cuenta como prompt si **empieza** (anclada con `^`) por uno de estos tokens:
`Pv:`, `Pe:`, `Xp:`, `Carga:`, `SL:`, `PL:`, `NM:`, `LD:`, `Jgd:`, `Imagenes:`, `Pieles:`, `Inercia:`, `Astucia:`, `Acc:`.

El anclado a `^` evita falsos positivos: si alguien escribe en un canal `"tengo Pv:50/100, ayuda"`, esa línea NO se gaguea (no empieza con el token).

Una sola línea puede contener varios campos juntos (ej. `Pv:100/100 Pe:50/50 Xp:0 Carga:25`); se aplican todas las regex que matcheen.

Si una línea es del prompt:
- Se gaguea (no se muestra en terminal — ni en blind ni en normal).
- Se actualizan las variables que matchean.
- Se evalúan los triggers de variable.
- **No** se evalúan triggers de regex sobre ella (el prompt es metadata, no contenido del juego).

Si la línea no es del prompt: se evalúan triggers de regex normalmente, después blind mode si aplica, después se renderiza.

##### Pipeline final

```
Telnet → ansiParser → AnsiSpan[] →
  promptParser.parse(line) →
    isPrompt → playerStatsService.setSnapshot(updates) → variableTriggers.eval(changedKeys) → return (gagged)
    else → triggerEngine.process(regex) → blindModeService (si blind) → render
```

##### Eventos de triggers de variable

UI label en castellano, internal en inglés:

| UI label | Internal | Significado |
|---|---|---|
| aparece | `appears` | Pasa de `0`/`""` a un valor real |
| cambia | `changes` | Cualquier cambio de valor |
| igual a | `equals` | Valor exactamente igual a X (numérico o texto, case-sensitive) |
| baja de | `crosses_below` | Estaba ≥N, ahora <N (edge-triggered, dispara una vez en la transición) |
| sube de | `crosses_above` | Estaba ≤N, ahora >N (edge-triggered, dispara una vez en la transición) |

Edge detection requiere guardar `prevValues` paralelo al estado actual en `playerStatsService`.

##### Captura de cambios línea por línea

Por cada línea del prompt, evaluamos triggers de variable con el valor actualizado. Si llegan N líneas seguidas, se evalúa después de cada una con el valor parcial. Si surge un caso real donde un trigger combina dos variables que llegan en líneas distintas y dispara desfasado, se optimiza a "batch al final del prompt" detectando el cierre por timeout. Por ahora simple.

##### Variables en templates de acciones

Soporte de `$old` y `$new` en `replace`/`send`/`notify`/`floating` (también en el `title` de `notify`). Los `$1`, `$2`, ... siguen disponibles para triggers de regex pero **no aplican** a triggers de variable.

Ejemplos:
- `notify` con `message: "Vida: $new (era $old)"`
- `floating` con `message: "Quedan $new imágenes"`, `level: 'warning'`

##### Tipos / interfaces

```typescript
type TriggerSource =
  | { kind: 'regex'; pattern: string; flags?: string; blocks?: PatternBlock[] }
  | { kind: 'variable'; name: string; condition: VariableCondition };

type VariableCondition =
  | { event: 'appears' }
  | { event: 'changes' }
  | { event: 'equals'; value: number | string }
  | { event: 'crosses_below'; value: number }   // edge-triggered
  | { event: 'crosses_above'; value: number };  // edge-triggered
```

##### Archivos

Nuevos:
- `src/services/promptParser.ts` — singleton con regex por campo. `parse(line): { isPrompt, updates }`. Reemplaza `loadPromptFilters` + `isPromptLine` + `convertPromptPatternToRegexArray` actuales de `blindModeService`.
- `src/services/variableTriggerEvaluator.ts` (o método dentro de `triggerEngine`) — evalúa triggers `kind: 'variable'` cuando `playerStatsService.setSnapshot()` reporta cambios. Maneja edges con `prevValues`.
- `src/utils/variableMap.ts` — mapping `nombreEspañol ↔ llaveInterna` + funciones de derivadas (`vida_pct`, `energia_pct`, `en_combate`).

Modificados:
- `src/services/playerStatsService.ts` — nuevos campos (`roomPlayers`, `actionsMovement/Primary/Secondary/Minor`, `carry`), `prevValues`, método `setSnapshot(updates): string[]` que devuelve las claves cambiadas.
- `src/screens/TerminalScreen.tsx` — pipeline: `promptParser.parse(line)` corre antes que `blindModeService` y antes que `triggerEngine`. Si `isPrompt`, actualiza vars, evalúa triggers de variable, gaguea.
- `src/services/blindModeService.ts` — quitar `loadPromptFilters` + `isPromptLine` + `convertPromptPatternToRegexArray`. Quitar groups `prompt_stats` y `sala_entidades` del set activo (ya los hace `promptParser`).
- `src/config/blindModeFilters.json` — quitar groups `prompt_stats` y `sala_entidades`.
- `src/screens/ServerEditScreen.tsx` (o donde se edite el server) — botón "Aplicar prompt TorchZhyla" con confirmación.
- `src/components/TriggerEditModal.tsx` — wizard "Alarma de variable": dropdown variable + dropdown evento + input valor (si `equals`/`crosses_*`) + lista de acciones.
- `src/types/index.ts` — `TriggerSource` extendido con `kind: 'variable'`, tipo `VariableCondition`.

**Coste estimado:** 1-2 días.

##### Decisiones cerradas (referencia rápida durante la implementación)

- Variables internas en inglés (`playerHP` etc.). Mapeo a español solo en la capa de exposición a triggers.
- `prompt` y `promptcombate` idénticos. `en_combate` derivado de `roomCombatants !== ""`.
- Botón "Aplicar prompt" solo manual, one-shot. NO hay auto-aplicar al conectar (respeto a usuarios que no usan triggers).
- Detección del prompt: anclado a `^` con tokens conocidos. Una línea de chat con `Pv:50/100` en medio NO se gaguea.
- Captura best-effort: si el usuario tiene su propio prompt y los campos coinciden, se capturan; si no, default.
- Triggers de regex NO se evalúan sobre líneas del prompt (son metadata, no contenido del juego).
- Eventos `crosses_below`/`crosses_above` son edge-triggered: disparan UNA vez en la transición.
- `appears` = `0`/`""` → valor real. `changes` = cualquier cambio. `equals` = comparación exacta case-sensitive.
- Línea por línea, no batch. Si surge problema real, se optimiza después.
- Soporte `$old` / `$new` en templates de acciones.
- Quitamos del JSON de blind mode los groups `prompt_stats` y `sala_entidades` — los reemplaza `promptParser` corriendo siempre.

##### Optimizaciones de rendimiento del prompt parser (post-Fase 3)

Diagnóstico (2026-04-29): tras aplicar el prompt canónico se reportó retraso de 3-4 s en mensajes de variable (p.ej. floating de espejos al echar espejismo) y degradación general aun con pocos triggers de usuario. Causa: el prompt canónico es **multi-línea** (~11 líneas por prompt por los `$l`) y RdL lo manda en cada acción/animación; el coste por línea añadido por Fase 3 se amplifica. Además algo del trabajo corre ahora también en modo normal (antes solo en blind a través de `blindModeService`).

Optimizaciones identificadas, por orden de coste/beneficio:

1. **HECHO (2026-04-29)**: en `promptParser.parse`, sacar `normalized.toLowerCase()` y los `token.toLowerCase()` fuera del loop de detección de prompt. Antes: 28 lowercase ops por línea (14 iteraciones × 2). Ahora: 1 lowercase del haystack + tokens precomputados como constante de módulo.
2. **HECHO (2026-04-29)**: cuando la línea es prompt, en lugar de ejecutar las 14 regex de campo a ciegas, hacer `normalizedLower.includes(discriminator)` por patrón antes del `regex.exec` — descarta en string-scan O(n) las regex cuyo token ni siquiera aparece. Cada `FieldPattern` lleva ahora un `discriminator` precomputado en minúsculas (`'pv:'`, `'sl:'`, ...).
3. **HECHO (2026-04-29)**: quitar `stripAccents` del hot path. El único campo del prompt con tilde era `Imágenes` (`Astucia` ya iba sin acento). Solución pragmática: cambiar el `CANONICAL_PROMPT` para que envíe `Imagenes:` (sin tilde) y borrar `stripAccents` por completo. **Migración requerida**: cualquier personaje cuyo prompt server-side se aplicó con la versión vieja del canónico (`Imágenes:` con tilde) deja de capturar imágenes hasta que se vuelva a pulsar "Aplicar prompt TorchZhyla" desde la edición del server. Si un usuario tiene un prompt custom no canónico con tilde, también pierde la captura.
4. **HECHO (2026-04-29)**: reescritas las regex de campo de texto (`SL:`, `PL:`, `NM:`, `LD:`) a `^SL:\s*([^>]*)/` ancladas, sin lookahead, sin alternación. Antes eran `[^\n>]*?` lazy + lookahead con alternación de 13 tokens — backtracking polinómico en líneas largas. Ahora O(N) lineal. Hecho como parte del rewrite de #7/#8 — todas las regex de campo viven juntas como constantes a nivel de módulo.
5. **HECHO (2026-04-29)**: `blindModeService.processLine(text)` pasa a `processLine(text, stripped)` — el caller (TerminalScreen) le pasa el `stripped` que ya tiene calculado para el prompt parser y el trigger engine, así no se hace `stripAnsi` dos veces por línea no-prompt. Eliminado el método privado `stripAnsiCodes` y su `new RegExp(...)` en cada llamada (otra ganancia colateral: la regex ya no se compilaba sobre la marcha cada vez).
6. **HECHO (2026-04-29)**: split del parser en detección barata + extracción cara, gateado por presencia de triggers de variable. Ahora `promptParser` expone `isPromptLine(line): boolean` (un único `regex.test` con anchor + alternación, sin allocs) y `parsePromptUpdates(line): Partial<PlayerVariables>`. `triggerEngine.hasVariableTriggers()` devuelve true si hay alguno compilado. El pipeline en `TerminalScreen.processingAndAddLine` ahora hace: (a) `isPromptLine` — siempre — para gaguear la línea. (b) Solo si `hasVariableTriggers` es true, ejecuta `parsePromptUpdates` + `setSnapshot` + `evaluateVariableTriggers`. Resultado: usuarios sin triggers de variable (la mayoría — la plantilla seeded "Espejos y pieles" no se asigna a ningún server por defecto) pagan solo el `regex.test` por línea de prompt y NADA en el snapshot/evaluator. El gag sigue funcionando para que el canónico no ensucie el terminal aunque no haya triggers de variable. Doctrina implícita confirmada: "canónico o nada" — si el usuario tiene un prompt custom las capturas best-effort siguen siendo posibles, pero el flujo está optimizado para el canónico.

Optimizaciones nuevas tras adoptar la doctrina "canónico o nada" (prompt parser asume formato canónico):

7. **HECHO (2026-04-29)**: dispatch directo por leading token. `parsePromptUpdates` ahora hace `PROMPT_LEADER_RE.exec(line)` (un solo regex con capture del leader), busca en `PARSERS: Record<string, FieldParser>` y llama exactamente UNA función parser que ejecuta UNA regex. Antes: 14 `includes` + 1-4 `exec`. Ahora: 1 `exec` (leader) + 1 lookup + 1 `exec` (campo). Las funciones parser viven a nivel de módulo (`parseStatLine`, `parseExits`, `parseCombatants`, ...) y son tipadas, ya no hay `assign` callback opaco. `Pe`, `Xp` y `Carga` no están mapeadas en `PARSERS` — nunca son leader en el canónico (siempre vienen detrás de `Pv:` en la primera línea).
8. **HECHO (2026-04-29)**: combinada la primera línea (`Pv:X/Y Pe:X/Y Xp:N Carga:N`) en una sola regex `STAT_LINE_RE` con 6 capturas. Una `exec` actualiza `playerHP`, `playerMaxHP`, `playerEnergy`, `playerMaxEnergy`, `playerXP` y `carry` de un tirón. Antes eran 4 regex.exec separadas en esa línea (que es la más frecuente del prompt — RdL la repite en cada acción).
9. **HECHO (2026-04-29)**: eliminado el `toLowerCase()` del haystack en `parsePromptUpdates` como subproducto de #7. El dispatch ya elige el parser correcto, no hay loop de patrones ni filtro `includes(discriminator)` que necesite el lowercase. 1 alloc menos por línea de prompt.
10. **HECHO (2026-04-29)**: quitado el flag `/i` de todas las regex (leader y campos). Con canónico el MUD echo-back devuelve exactamente lo que enviamos (caso exacto). El leader se compara contra `Pv|SL|...` en exact-case, los parsers ejecutan `^Pv:...`/`^SL:...` también exact-case. Pequeño ahorro acumulativo y código más explícito sobre la doctrina canónica.
11. **HECHO (2026-04-29)**: borrados `parse(line)` y la interfaz `ParseResult` del `promptParser`. Nadie los usaba tras el split del #6. Reducción de superficie API; cero impacto en perf.
12. **HECHO (2026-04-29)**: coalescer `setLines` con `requestAnimationFrame` — el verdadero cuello de botella del burst. Tras instrumentar el pipeline con timers `performance.now()`, descubrimos que cada `onData` del TCP socket llega con UNA línea (el MUD las manda en paquetes separados, no como un único chunk multi-línea como asumía el código). El comentario "Single flush after the batch to avoid N re-renders" en `addMultipleLines` era engañoso: el "batch" tenía siempre 1 línea, así que cada línea disparaba un `setLines` que costaba **80-130 ms** de re-render síncrono del FlatList en un Xiaomi gama media. Para una ráfaga de 30 líneas (espejismo) eran 30 × 100 ms = 3 s de UI lag — no el parser, no los triggers. Fix: añadido `linesFlushScheduledRef` + helper `scheduleLinesFlush()` que envuelve `setLines` en un `requestAnimationFrame` y reentra como no-op si ya hay uno programado. Múltiples llamadas dentro del mismo frame (~16 ms) colapsan a un único render. Los dos sitios que llamaban `setLines([...linesRef.current])` (dentro de `processingAndAddLine` con `deferSetState=false` y al final de `addMultipleLines`) ahora llaman `scheduleLinesFlush()`. Mejora visible inmediata en burst.

Lecciones del descubrimiento del #12 (para no repetir el error de diagnóstico):
- Antes de optimizar un sub-sistema sospechoso, **medir**. Pasamos un día entero (#1 a #11) puliendo el `promptParser` cuando el cuello real era el render del FlatList. Las optimizaciones del parser siguen siendo válidas y aportan, pero el orden de magnitud del problema estaba en otro lado.
- El supuesto `addMultipleLines` parecía un coalescing pero no lo era — los TCP packets llegan línea a línea. Cualquier "batch" en el código necesita venir del lado del consumidor (RAF, microtask, timer), no del lado del productor.
- Instrumentar con `performance.now()` y dumpear logs por batch fue lo que reveló la verdad. Mantener un comentario o atajo para volver a instrumentar rápido si surge otro síntoma similar.

#### Fase 4 — Polish (opcional)

**Export / import de plantillas individuales.** ✅ HECHO (con sonidos en ZIP). Ver "HECHO (adelantado de Fase 4): export/import de plantillas **con sonidos incluidos**" arriba.

**Backup de todas las plantillas a la vez.** ✅ HECHO. Ver "HECHO: backup global de TODAS las plantillas en un solo ZIP" arriba para el detalle.

**Otros pulidos:**
- Pack pre-hecho "Reinos de Leyenda básico" bundleado en `src/assets/triggerPacks/`.
- Reordenación de plantillas asignadas a un server (cuando hay varias) si surge la necesidad. Por defecto: orden alfabético por nombre de plantilla.

(Reordenación de triggers dentro de una plantilla ya hecha — ver "HECHO (adelantado de Fase 4)" arriba.)

**Coste:** medio día (export/import) + medio día (resto) = ~1 día.

#### Fase 5 — Variables de usuario (HECHO 2026-04-29)

Variables de "memoria" que el usuario puede crear desde acciones de trigger y referenciar en otras acciones / triggers. Cierra la brecha "triggers reactivos sin estado" → "triggers con estado persistente entre disparos". Es el feature que diferencia un cliente de avisos de un cliente de automatización.

**Decisiones cerradas (2026-04-29):**
- Nombres libres con sintaxis `[a-z][a-z0-9_]*` (lowercase forzado al crear). NO slots fijos `x1-x20`.
- Alcance: por server. Cambiar de server resetea valores; las declaraciones se cargan de storage del nuevo server.
- Tipo: solo string. Las condiciones numéricas (`crosses_below`/`above`) hacen `Number()` perezoso y fallan silenciosamente si el valor no es numérico.
- Persistencia **two-layer**: las **declaraciones** SÍ persisten a AsyncStorage (key `aljhtar_user_vars_{serverId}`); los **valores** son memoria-only. Disconnect/reconnect al MISMO server preserva valores; restart de app conserva las declaraciones (pero los valores se vacían a `''`).
- Sintaxis en templates: `${nombre}` con llaves siempre — distingue de `$1`/`$2` (capturas regex) y `$old`/`$new` (variable trigger context). Compila a literal `${nombre}` en el regex y se expande live a `userVariablesService.get(name)` en tiempo de fire.
- Variable no declarada o sin valor → templates expanden a `""` (mismo fail-quiet que capturas inexistentes).
- **Las variables solo se crean desde la pantalla "Mis variables"** (con botón "+ Nueva"). No hay creación inline desde el editor de triggers — el editor solo deja seleccionar de un picker de declaradas vía `<VariablePicker>`. Esta decisión se tomó tras un primer iteración donde había auto-creación perezosa: feo y poco descubrible.
- **Bootstrap de packs**: al cargar un servidor (en `TerminalScreen.useEffect`), se recolectan todos los nombres de user-vars referenciados en sus packs asignados y se auto-declaran si faltan. Esto cubre packs creados antes del modelo explícito y packs importados.
- **Auto-declare en import de pack**: al importar un pack (per-pack o backup), se recolectan las refs de user-vars y se llaman a `userVariablesService.declareMany(names)`. Las que ya estaban declaradas se ignoran (mantienen su valor); las nuevas se añaden. El alert de "Importación completa" indica cuántas variables se declararon.
- Reservadas: nombres de `VARIABLE_SPECS` (vida, energia, imagenes, ...) — bloqueadas en el botón "+ Nueva" de Mis variables y al guardar el trigger.
- Loop protection: hard-cap de profundidad **3** en cascadas user-var → user-var. Si A setea x1 que dispara B que setea x2 que dispara C que setea x3 que disparaba algo... a la 4ª se corta y se loguea `console.warn`.

**Pantalla "Mis variables" (UserVariablesScreen):**
- Botón "+ Nueva" en el header. Modal pequeño con TextInput (validación + colisiones).
- Botón "Resetear" — ahora vacía solo VALORES, no las declaraciones.
- Cada variable: fila con nombre, valor actual, "Usada en N triggers" expansible.
- Al expandir: lista de filas con `pack name → trigger name (rol)` donde rol = `escribe` | `lee` | `vigila`. Tap en una fila navega a `TriggerEditor` con `autoOpenTriggerId` que abre el modal del trigger directamente.
- Botón ✕ por variable: confirma con cuenta de triggers que la usan; si la borras, las refs quedan colgando (expand a `""`, set_var ignora).

**Implementación:**

- `src/services/userVariablesService.ts` — singleton con `vars: Record<string, string>` + `activeServerId`. API: `setActiveServer`, `set` (devuelve `boolean changed`), `get`, `getAll`, `reset`, `setOnUpdateCallback` (subscriber único para la pantalla "Mis variables"). Helper exportado `isValidUserVarName`.
- `src/utils/variableMap.ts` — añadido `isPredefinedVariable(name): boolean`.
- `src/types/index.ts` — nueva acción `{ type: 'set_var'; varName: string; value: string; valueBlocks?: ActionTextBlock[] }`. Nuevo `ActionTextBlock` kind: `{ kind: 'user_var_ref'; varName: string }`.
- `src/services/triggerEngine.ts` — reescrito para particionar variable triggers en `compiledPromptVars` (en VARIABLE_SPECS) vs `compiledUserVars` (no). Añadido `evaluateUserVarTriggersInto` con depth guard. `applyAction`/`applyVariableAction` ahora son métodos (no funciones libres) para poder cascadear; aceptan `sideEffectsOut` que mutan en lugar de retornar. Función `expandTemplate` unifica los 3 placeholder families: `$1..$9`/`$&` (capturas), `$old`/`$new` (variable triggers), `${name}` (user vars). `checkVariableCondition` ahora hace `Number()` perezoso para `crosses_below/above` cuando el valor no es number-typed (soporta user vars con contenido numérico).
- `src/utils/triggerCompiler.ts` — `compileActionText` ahora compila bloques `user_var_ref` a `${varName}` literal.
- `src/components/TriggerActionTextBuilder.tsx` — botón nuevo "+ Variable" en la toolbar. Chips morados (con `${name}` o `?` si vacío) editables inline; valida nombre con `isValidUserVarName` y marca rojo si inválido.
- `src/components/TriggerEditModal.tsx`:
  - `ACTION_TYPES` y `VARIABLE_ACTION_TYPES` añaden "Guardar en variable".
  - Nuevo formulario para `set_var` con input de nombre (validado) + builder/textinput de valor.
  - Wizard "Alarma de variable": picker reescrito a 3 secciones — "Del sistema" (predefinidas), "Mías" (existentes en `userVariablesService.getAll()`) y "Crear nueva" con TextInput inline.
  - `variableError` y filtro de `numericOnly` ahora aceptan user vars (no spec).
  - `handleSave` valida que cualquier `set_var` tenga `varName` válido y no colisione con predefinidas.
  - `actionToCajas`/`compileActionWithBlocks`/`inferType` añaden caso para `set_var`.
- `src/screens/UserVariablesScreen.tsx` (NUEVO) — lista de `nombre = valor`, botón "Resetear todas". Live-updates vía `setOnUpdateCallback`. Accesible desde Settings → "Mis variables".
- `src/screens/SettingsScreen.tsx` — link añadido bajo "Mis sonidos".
- `App.tsx` — registrada la ruta `UserVariables`.
- `src/screens/TerminalScreen.tsx` — al cargar/cambiar server (`useEffect [server.id, ...]`) llama `userVariablesService.setActiveServer(server.id)`. Esto vacía el store cuando cambias de server.

**Casos de uso desbloqueados:**
- Capturar última dirección, último enemigo, último hechizo lanzado.
- Combos: trigger A captura nick del que abre cofre en `${ultimo_abridor}`, trigger B usa `dar llave a ${ultimo_abridor}`.
- Tracking: contador `${muertes}` que se incrementa con `set_var muertes = ${muertes}1`... bueno no, la suma string-to-number no la hacemos. Pero `set_var ultimo_objetivo = $1` sí.
- State machines simples: trigger A pone `${modo} = combate`, trigger B solo activa acciones cuando `equals "combate"`.

**Lo que NO desbloquea (deliberado):**
- Operaciones aritméticas en templates (`${count} + 1`). Fuera de scope, requiere parser de expresiones.
- Lógica condicional dentro de un trigger (`if-then-else`). Fuera de scope.
- Loops/temporizadores. Fuera de scope.

**Riesgos conocidos:**
- Si el usuario nombra una variable como otra que ya existe pero la usa diferente en otro pack → colisión. Documentar en futuras docs de usuario.
- Aún no hay UI para BORRAR una variable de usuario individual (solo "Resetear todas" desde la pantalla). Si surge el caso, añadir.

**No bundleado:** ningún pack seeded usa `set_var` por ahora — feature pura sin defaults ruidosos. El usuario explora cuando quiera.

**Nota de superposición**: la primera versión de "Expansión de variables en botones del terminal" se anotó aquí como pendiente independiente; ahora forma parte de **Fase 6 — Expansión hacia suite blind** (sub-fase 6.2). Ver bloque dedicado abajo.

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

### HECHO — Sesión 2026-04-30: Distribución por ZIP, ${personaje}, bloqueante, cola de lectura, captura canales, naming personaje, auto-asignación, pack Comunicaciones

Cambios mayúsculos cerrados en una sola sesión, todos productivos. Resumen rápido y luego detalle por bloque.

**Política de distribución de plantillas y sonidos** (regla nueva, aplica de aquí en adelante):

- La APK se distribuye **limpia de plantillas y sonidos por defecto** — ningún `play_sound` apuntando a `builtin:...` que dependa de un wav con derechos de terceros, ningún pack semilla con triggers de un addon ajeno.
- Las plantillas por defecto (Sonidos del MUD, Combate completo, Comunicaciones, …) viven en un **archivo ZIP separado** (`torchzhyla-defaults.zip` en la raíz del repo de TorchZhyla, fuera de `aljhtar-store/`) que el usuario importa con el botón "Importar" de Triggers. El ZIP usa el formato `torchzhyla-trigger-backup` que ya conoce `importBackupFromZip` (cada sonido referenciado por `custom:<uuid>.<ext>`, con el wav real en `sounds/<uuid>.<ext>`).
- Razón: derechos. Los wavs originales son de Rhomdur (addon CMUD blind/RL); no podemos redistribuirlos dentro de la APK. El ZIP lo distribuimos aparte (Drive, USB, share por chat) y el usuario decide si lo importa.
- **Deuda técnica reconocida**: la APK actual TODAVÍA contiene `createSoundsPack()` y `createCombatePack()` en `src/storage/triggerStorage.ts` (que seedan los packs "Sonidos del MUD" y "Combate completo" en primera ejecución) y los wavs `assets/sounds/{combate,eventos,hechizos,bloqueos}/`. Los usuarios actuales que ya tienen los packs seedados los conservan; nuevos paquetes deben ir solo al ZIP. Limpieza pendiente como tarea futura — no urgente porque no rompe nada y los wavs presentes ya están en uso por packs vivos. Cuando se haga, mantener compatibilidad: usuarios con `Comm.MensajeCanal` en sus packs personales que apunten a `builtin:combate/...` perderían sonido (tendrán que reasignar).

**Bloques de cambios:**

1. **Variable `${personaje}`** (sistema, nivel 2)
   - `PlayerVariables.playerName: string` añadido (default `''`). Se rellena desde `ServerProfile.username` en `TerminalScreen.useEffect [server.id, server.username]` vía `playerStatsService.setPlayerName(server.username ?? '')`.
   - Registrada como variable del sistema en `VARIABLE_SPECS` (nombre `personaje`, kind `string`, mapped a `playerName`).
   - **Expansión en templates** (`expandVars`): ya funciona porque pasa por `playerStatsService.getPlayerVariables()` para todas las VARIABLE_SPECS. Botones, action text de `floating`/`notify`/`send`/`replace`/`set_var`.
   - **Expansión en patrones regex** (nuevo, "nivel 2"): `triggerEngine.setActiveTriggers` hace un pre-procesado del pattern antes de compilar. Si encuentra el literal `${personaje}` en el regex, lo sustituye por el nombre regex-escapado. Si el campo "Personaje" del perfil está vacío, sustituye por `(?!)` (jamás matchea). Esto desbloquea triggers tipo "menciónan tu nombre": pattern `\b\${personaje}\b` compila a `\bManolo\b` para Manolo y nunca dispara para personajes sin nick.
   - El recompile sucede al cambiar de server (que es cuando playerName puede cambiar) — el `useEffect` de TerminalScreen ya recarga triggers.

2. **Triggers no bloqueantes** (`Trigger.blocking?: boolean`, default `true`)
   - Nuevo campo opcional. Undefined ≡ true ≡ comportamiento previo (first-match-wins, cadena cortada).
   - Cuando `blocking === false`: el trigger matchea, dispara solo sus side-effects (`play_sound`, `send`, `notify`, `floating`, `set_var`) y **el bucle de evaluación CONTINÚA**. Las acciones de mutación (`gag`, `replace`, `color`) se ignoran en triggers no bloqueantes — permitir que varias compitan por mutar la misma línea lleva a estado de display indefinido.
   - El primer trigger bloqueante que matchee aplica TODAS sus acciones (incluyendo mutaciones) y rompe el bucle.
   - Side-effects se acumulan: con `[Bando]` matcheado por mención (no bloqueante) + Canal Bando (bloqueante), `TerminalScreen` recibe 2 entradas en `sideEffects` y dispara los 2 sonidos. Como `playSound` arranca cada wav en su propia instancia de `Audio.Sound`, los sonidos se **superponen** (no se encadenan en el tiempo).
   - UI: Switch nuevo "Bloqueante" en `TriggerEditModal` con default ON, hint explicando la cadena.
   - El bucle del motor reescrito en `triggerEngine.process` para acumular `sideEffects`/`mutatedSpans`/`gagged` a través de iteraciones, en lugar del retorno temprano por match.

3. **Cola de lectura para TalkBack** (`speechQueueService`)
   - Antes: cada `AccessibilityInfo.announceForAccessibility(text)` interrumpía el anterior — TalkBack no encola, atropella.
   - Ahora: singleton `src/services/speechQueueService.ts` con cola FIFO + timer estimado. `enqueue(text)` mete en cola; el primer mensaje suena, el siguiente espera `Math.max(800, len * charDurationMs)` ms y suena después. Cap 10 mensajes (los más antiguos se descartan en ráfagas). `clear()` al desconectarse el screen reader.
   - Setting nuevo `AppSettings.speechCharDurationMs` (default 20). Configurable en Settings → "Velocidad de lectura" con +/- (botones accesibles, no slider). Rango 5–150 ms/char, paso 5.
   - 8 sitios reemplazados (`TerminalScreen.tsx`, `blindModeService.ts`, `FloatingMessagesContext.tsx`). La única `announceForAccessibility` real que queda es la del propio servicio.
   - Floor 800 ms para que mensajes muy cortos como "Panel 2" se escuchen antes del siguiente. Si el screen reader está apagado, `enqueue` es no-op.

4. **Captura de canales por texto plano** (estado: implementado, pendiente verificar en uso real)
   - Problema: con la opción del MUD `consentir accesibilidad on`, RdL silencia los pushes de `Comm.MensajeCanal` y `Comm.Canales` por GMCP. El modal de canales queda vacío y no recibe la lista de canales activos.
   - Fallback en `TerminalScreen`: máquina de estados que se arma cuando el usuario teclea `canales`. Estados `idle → waiting_for_header → capturing → idle`. Detecta header `^Tus canales son:?$`, parsea cada línea siguiente con regex `^\s+(\S+)(?:\s+\[[^\]]+\])?[\s\.]+(On|Off)\s*$`, acumula los canales con `On`, finaliza con `setChannels(...)` cuando llega una línea no-canal. Timeout de 5 s para abortar si nunca llega el header.
   - Hooks: arm en `sendCommand` cuando `command.trim().toLowerCase() === 'canales'`. Procesa en `processingAndAddLine` justo después de `stripAnsi(text)`, sin gaguear (el usuario ve la respuesta normal en terminal).
   - **Sigue habiendo logs `[CH_CAP]` temporales en producción** — diagnóstico para detectar fallos de captura. Si el feature funciona estable, quitarlos.
   - **NO captura mensajes de canal** (los mensajes en tiempo real siguen llegando solo por GMCP). Solo recupera el listado estático para que el modal sepa qué pestañas mostrar.

5. **Auto-asignación de plantillas a personajes nuevos** (`autoAssignToNew?: boolean`)
   - Nuevo campo opcional en `TriggerPack`. Undefined ≡ true (default ON, packs nuevos auto-asignan).
   - Helpers nuevos en `triggerStorage.ts`: `autoAssignNewCharacterToPacks(serverId)`, `assignServerToPacks`, `assignAllCharactersToPacks`.
   - Hook al crear/duplicar personaje en `ServerListScreen.handleSave`/`handleDuplicate`: llama `autoAssignNewCharacterToPacks(newServerId)` que añade el id a `assignedServerIds` de cada pack con `autoAssignToNew !== false`.
   - Toggle en `TriggerEditorScreen` modal "Asignar a personajes" — Switch "Auto-asignar a nuevos personajes" con default ON. Solo afecta a futuros personajes; las asignaciones actuales no se tocan al cambiarlo.
   - Diálogo en import (`TriggersScreen`): tras importar 1 o varios packs, si hay personajes guardados, alert "Importación completa" combinado con pregunta "¿Asignar a tus N personajes?" (Sí/No). "Sí" llama `assignAllCharactersToPacks([packIds])` para los packs recién añadidos/sustituidos. "Saltado" no se asigna.
   - Migración: packs ya guardados sin el campo se interpretan como `autoAssignToNew=true`; sus `assignedServerIds` no se tocan hasta que el usuario edite el pack y guarde.

6. **Naming "personaje" en UI** (rename UI-only)
   - "Servidor" → "Personaje" en strings visibles del usuario:
     - `ServerListScreen`: "Servidores" → "Personajes" (header, botón añadir, vacío, hints, accessibility).
     - `TriggersScreen`: "X servidores asignados" → "X personajes asignados".
     - `TriggerEditorScreen`: "Servidores asignados" → "Personajes asignados".
     - `TriggerEditModal`: errores de variable triggers → "este personaje".
     - `SettingsScreen`: keep awake desc, descripciones de plantillas/variables.
     - `UserVariablesScreen`: "se borran al cambiar de servidor" → "personaje".
   - Mantenidos como técnicos:
     - "Host del servidor", "Puerto del servidor" (host/port son técnicos del TCP).
     - "Error de conexión al servidor", "Conectando al servidor" (mensajes de conectividad TCP).
     - Dropdown de logs HTML "Todos los servidores" (filtro técnico por server-key).
     - Identificadores en código: `ServerProfile`, `serverId`, `loadServers`, etc. (NO se renombran).
     - Logs `[server-key]` en `logService` (compat con backups previos).
   - CLAUDE.md sigue usando "server" en docs internas — solo es UI-facing.

7. **Pack "Comunicaciones"** (añadido al ZIP, NO al APK)
   - 39 triggers cubriendo telepatías, sala, gritar, canales (bando/interbando/ciudadanía/chat/gremio/familia/rol/varios/especiales/grupo/omiq/info/diplomacia/emoción), activación/desactivación de canales, mail, noticias, infiel.
   - 30 wavs nuevos (de `C:/proyectos/Claude/VipZhyla/Scripts/sounds/RL/Comunicaciones/`) empaquetados en `sounds/<uuid>.wav` dentro del ZIP.
   - Trigger "Mención por nombre" en posición 0 con pattern `\b\${personaje}\b` y `blocking: false`. Marcado como no bloqueante intencionalmente para que cuando el nick del jugador aparezca en cualquier canal se oiga `mencion.wav` ENCIMA del sonido del canal correspondiente.
   - Trigger "Canal Avatar" también `blocking: false` (más bien como prueba de fuego del feature; en práctica ningún otro trigger del pack matchea `[Avatar]` así que no hay efecto observable).
   - 4 triggers de telepatía entrante (`^(.+?) te dice/exclama/pregunta: ` y variante histórica) capturan al remitente en grupo `$1` y guardan en `set_var ultimo_remitente = $1` para botones tipo `t ${ultimo_remitente} ...`.
   - Pack tiene `autoAssignToNew: true` para que se asigne a personajes nuevos al crearse.
   - Generador del ZIP: scripts ad-hoc en `C:/Users/diego/AppData/Local/Temp/` usando `jszip` (misma lib que la app). El ZIP final queda en `C:/proyectos/Claude/TorchZhyla/torchzhyla-defaults.zip`.

**Schema final agregado** (`src/types/index.ts`):
```typescript
interface Trigger {
  // ... campos existentes ...
  blocking?: boolean;  // undefined ≡ true ≡ first-match-wins clásico
}
interface TriggerPack {
  // ... campos existentes ...
  autoAssignToNew?: boolean;  // undefined ≡ true ≡ aplica a personajes nuevos
}
interface PlayerVariables {
  playerName: string;  // del ServerProfile.username, usado por ${personaje}
  // ...
}
interface AppSettings {
  // ...
  speechCharDurationMs: number;  // default 20
}
```

**Archivos nuevos**:
- `src/services/speechQueueService.ts` — cola para TalkBack.
- `src/utils/expandVars.ts` — extracción del helper `${var}` para reutilizar fuera del engine.

**Archivos significativamente modificados**:
- `src/services/triggerEngine.ts` — pre-proceso de `${personaje}` + reescritura del bucle process para soportar `blocking`.
- `src/storage/triggerStorage.ts` — helpers `autoAssignNewCharacterToPacks` / `assignServerToPacks` / `assignAllCharactersToPacks`.
- `src/screens/ServerListScreen.tsx` — hook auto-asignación + naming personaje + autoAssignNew en duplicar.
- `src/screens/TriggersScreen.tsx` — diálogo "asignar a todos" en imports.
- `src/screens/TriggerEditorScreen.tsx` — toggle autoAssignToNew + rename a personajes.
- `src/screens/TerminalScreen.tsx` — channel capture state machine + setPlayerName + speechQueue + naming.
- `src/components/TriggerEditModal.tsx` — switch Bloqueante + naming.

**Distribución del ZIP**:
- Path canónico: `C:\proyectos\Claude\TorchZhyla\torchzhyla-defaults.zip` (raíz del repo de TorchZhyla, NO dentro de `aljhtar-store/`).
- Push al móvil para pruebas: `adb push <path> /sdcard/Download/torchzhyla-defaults.zip`.
- Importable con Triggers → Importar → seleccionar el archivo. Formato `torchzhyla-trigger-backup` v1.
- Cuando se modifica el contenido del ZIP, regenerarlo con un script Node ad-hoc usando `jszip`. PowerShell `Compress-Archive` NO sirve — escribe paths con `\` que rompen el importador (jszip valida `/`).

### Decisiones pendientes

- **Orden entre plantillas** cuando un server tiene varias asignadas. Default actual: alfabético por nombre de plantilla. Reordenación manual entre plantillas se difiere a Fase 4 si hace falta. (La reordenación **dentro** de una plantilla ya está implementada con flechas ▲/▼.)

(Las decisiones de Fase 3 — lista de variables, formato de prompt, semántica de eventos, UX de "Aplicar prompt" — se cerraron el 2026-04-28, ver sección "Fase 3" arriba.)

## Temas Pendientes

- **Revisar botones de modo blind de consultar vida, energía...**
- **Backup completo de la app** — exportar/importar TODA la configuración del usuario (servers, layouts de botones, plantillas de triggers, settings, sonidos personalizados) en un único archivo, para cambio de móvil o backup defensivo. Es un feature distinto del export/import de triggers (Fase 4 del sistema de triggers, que es solo para plantillas). Requiere decidir formato (zip con manifest JSON + carpetas de assets, probablemente), versionado del schema, política de merge vs reemplazo en el import, y qué pasa con archivos custom (sonidos) si el zip los trae.
- **Ambientación por zona del mapa** (~5 h con modo categoría regex incluido). Loop de música de fondo que cambia con la zona en la que está el personaje. Diseño cerrado:
  - **Datos**: el mapa (`src/assets/map-reinos.json`) tiene 28.816 salas en 1.517 zonas distintas (zona = prefijo antes de `:` en el nombre de la sala — `Bosque de Urlom:`, `Tundra:`, `Anduar:`, etc.). 49 zonas grandes (≥100 salas) cubren el 80% del tiempo de juego; el resto son edificios sueltos o áreas pequeñas.
  - **Estrategia "modo categoría"**: 6-8 categorías temáticas (`bosque`, `desierto`, `subterraneo`, `frio`, `ciudad`, `pantano`, `volcan`, `mar`) con reglas regex que matchean nombres de zona (`bosque|selva|arboleda` → `bosque`, `cueva|gruta|mina|galería|alcantarilla|cloaca|caverna` → `subterraneo`, etc.). Cubre ~80% del mapa con 8 wavs en lugar de 1.517. Override per-zona disponible para casos sueltos.
  - **Implementación**: `AmbientPlayer` service (singleton, una `Audio.Sound` global con `setIsLoopingAsync(true)` y crossfade manual a 200 ms vía `setVolumeAsync` escalonado). Hook al cambio de `currentRoom` en `MapService` con debounce 500 ms. Settings → "Ambientación": toggle global, slider de volumen (default 0.4), lista de zonas detectadas + lista de reglas regex, picker de sonido custom por entrada (reusa el de "Mis sonidos"). Persistencia en `aljhtar_ambient_mappings`. Stop al desconectar / perder localización.
  - **Wavs**: el usuario los aporta — Pixabay (licencia royalty-free sin atribución), OpenGameArt (CC0 / CC-BY) y Kevin MacLeod (CC-BY) tienen catálogos suficientes para 6-8 loops temáticos de calidad. ~15-20 MB total. **Cero copyrighted en el repo** — siguen el mismo flow opt-in que los wavs de combate via "Mis sonidos" o ZIP personal de defaults.
  - **Fuera de scope inicial**: reproducción en background con pantalla bloqueada (+1.5-2 h, requiere `staysActiveInBackground: true` y resolver conflicto con `interruptionModeAndroid: 1`), ducking automático del ambiente cuando suena un trigger (+1 h), gapless loop con crossfade interno al final del wav (+1 h, mejor solucionar dándole al usuario loops bien preparados).
  - **Decisión pospuesta**: si el ambient tiene que sonar dentro del MUD aunque la app esté en segundo plano. La filosofía actual de la app permite uso en background pero el ambient añade fricción (notificaciones que paran el audio, batería, etc.). Decidir cuando se aborde.

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
