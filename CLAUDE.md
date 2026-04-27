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

PENDIENTE (Fase 2): subir sonidos custom desde el móvil para usar en `play_sound`. Self-contained, ~medio día.

PENDIENTE (Fase 3): variables del sistema. Bloqueada por dos decisiones que dependen del usuario — lista exacta de variables a trackear y formato del prompt del MUD a parsear (ver "Decisiones pendientes" más abajo).

PENDIENTE (Fase 4): export/import de plantillas, drag-reorder, packs predefinidos.

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

#### Fase 3 — Variables del sistema

**Entregable:** triggers que reaccionan a cambios en estado del juego (vida, energía, espejos, etc.).

- Lista cerrada de variables, definida al empezar la fase (PENDIENTE — ver "Decisiones pendientes" abajo).
- Formato concreto del prompt del MUD que parseamos para poblarlas (también pendiente).
- Servicio `src/services/variableTracker.ts` (o integrado en `triggerEngine`) con regexes para extraer valores de cada línea entrante.
- Sin acción `set_var`. El usuario NO modifica variables.
- Sin counters de usuario.
- Tipo de trigger `variable` con `source: { kind: 'variable', name, condition }` y las condiciones `appears`, `changes`, `equals`, `crosses_below`, `crosses_above` (edge-triggered).
- En las acciones, soporte para `$old` y `$new` (valor anterior y actual de la variable).
- Si una variable cambia varias veces en una sola línea: evaluar el trigger una sola vez con el valor final.
- UI: nuevo tipo en el wizard "Alarma de variable" con dropdown de variable + condición + acciones.
- Documentación en Settings: el formato de prompt requerido + botón "Copiar comando" que copia al portapapeles el comando para configurar el prompt en el MUD.

**Coste:** 1-2 días.

#### Fase 4 — Polish (opcional)

**Export / import de plantillas.** Dos modalidades:

- **Compartir una plantilla concreta** (botón en cada plantilla): JSON al portapapeles con cabecera `{ "format": "torchzhyla-trigger-pack", "version": 1, ... }`. NO incluye `id` ni `assignedServerIds` (en el import se generan ids nuevos y las asignaciones quedan vacías para que el usuario las haga).
- **Backup de todas mis plantillas** (botón en Settings): JSON con cabecera `{ "format": "torchzhyla-trigger-backup", "version": 1, ... }` y array de plantillas. Para cambio de móvil o backup personal.
- **Botón único "Importar JSON"** que detecta el `format` por la cabecera y aplica una u otra ruta. En colisión de nombre con una plantilla existente, preguntar: sustituir / duplicar con sufijo / saltar.

**Sonidos personalizados en imports/exports.** El JSON solo lleva la referencia (`custom:{uuid}.wav`), no el archivo. Si al importar el sonido no existe en el destino, marcar como "missing" y avisar al usuario en un resumen al final del import. El trigger sigue existiendo pero la acción `play_sound` correspondiente queda desactivada hasta que el usuario reasigne. NO empaquetamos sonidos en base64 ni en zip en v1 — si surge demanda real, se evalúa después.

**Otros pulidos:**
- Pack pre-hecho "Reinos de Leyenda básico" bundleado en `src/assets/triggerPacks/`.
- Drag-to-reorder en la lista de triggers (cambia orden de evaluación; importante para "primera regla gana").
- Drag-to-reorder de plantillas asignadas a un server (cuando hay varias) si surge la necesidad. Por defecto: orden alfabético por nombre de plantilla.

**Coste:** medio día (export/import) + medio día (resto) = ~1 día.

### Decisiones pendientes

- **Lista exacta de variables** a trackear (Fase 3). Candidatos discutidos: `vida`, `vida_max`, `vida_pct`, `energia`, `energia_max`, `energia_pct`, `xp`, `oro`, `nivel`, `espejos`, `pieles`, `sala_nombre`, `sala_id`, `enemigos`. El usuario lo cerrará al llegar a Fase 3.
- **Formato concreto del prompt** del MUD para parsear las variables. A definir junto con la lista anterior.
- **Orden entre plantillas** cuando un server tiene varias asignadas. Default propuesto: alfabético por nombre de plantilla. Drag-reorder se difiere a Fase 4 si hace falta.

## Temas Pendientes

- **Revisar botones de modo blind de consultar vida, energía...**
- **Backup completo de la app** — exportar/importar TODA la configuración del usuario (servers, layouts de botones, plantillas de triggers, settings, sonidos personalizados) en un único archivo, para cambio de móvil o backup defensivo. Es un feature distinto del export/import de triggers (Fase 4 del sistema de triggers, que es solo para plantillas). Requiere decidir formato (zip con manifest JSON + carpetas de assets, probablemente), versionado del schema, política de merge vs reemplazo en el import, y qué pasa con archivos custom (sonidos) si el zip los trae.

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
