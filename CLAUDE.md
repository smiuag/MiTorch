# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BlowTorch** is a React Native Telnet/MUD client application built with Expo. It's a terminal emulator for connecting to MUD (Multi-User Dungeon) and other Telnet-based services, with support for ANSI color codes, GMCP (Generic MUD Communication Protocol), customizable button grids, maps, and blind mode accessibility.

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

# Run on Android device/emulator
npm run android

# Run on iOS device/simulator
npm run ios

# Run web version
npm run web
```

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
adb logcat | Select-String "BlowTorch|SOUND|BM|BLIND|Telnet"

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
- ✅ Usando keystore de debug
- ✅ Aceptado por Play Store
- ⚠️ Cuando sea, usar keystore propio

**Cambiar a keystore propio:**
```bash
# Generar keystore (una sola vez)
keytool -genkey -v -keystore my-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias

# Configurar en gradle.properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_STORE_PASSWORD=xxxxx
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_KEY_PASSWORD=xxxxx
```

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

When testing changes on a physical Android device connected via USB cable, follow the standard dev workflow documented in `DEV_WORKFLOW.md`:

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

**Important**: Always use port 8081. If 8081 appears to be in use, run `reset-dev.ps1` first — do not switch to 8082/8083. See `DEV_WORKFLOW.md` for the full rationale and troubleshooting.

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

**How it works in BlowTorch:**
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

## Refactor Status - Unified UI (refactor/unified-ui branch)

### Estado del Refactor

**Rama actual:** `refactor/unified-ui`  
**Estado:** Testing pendiente

### Componentes Nuevos Creados

#### 1. Tipos Extendidos (`src/types/index.ts`)
- `OrientationLayout`: Layout para una orientación
- `FloatingButton`: Botón flotante
- `UnifiedLayoutConfig`: Configuración para ambas orientaciones

#### 2. Storage (`src/storage/orientationLayoutStorage.ts`)
- `loadOrientationLayout()`: Carga layout por orientación
- `saveOrientationLayout()`: Guarda layout por orientación
- Persistencia en AsyncStorage

#### 3. Componentes Principales

**UnifiedTerminalLayout.tsx**
- **Props**: Recibe todo lo necesario (lines, channels, messages, etc.)
- **Responsabilidades**:
  - Orquesta los layouts vertical y horizontal (60/40 split)
  - Maneja el teclado nativo con Animated.View
  - Carga botones flotantes por orientación
  - Ref a TerminalSection para auto-scroll terminal

**TerminalSection.tsx (forwardRef)**
- **Props**: lines, fontSize, map, height
- **Responsabilidades**:
  - Renderiza FlatList con líneas del MUD
  - Auto-scroll cuando new lines llegan
  - Botón "Volver al final"
  - Renderiza MiniMap si está visible
- **Handle**: `scrollToBottom()` para auto-scroll desde chat

**ChatSection.tsx**
- **Props**: channels, messages, aliases, input, altura
- **Responsabilidades**:
  - ChannelTabs (con canal "Todos")
  - Mensajes filtered por canal
  - VitalBars integradas
  - Input con auto-prefijo de alias
  - Scroll independiente

**FloatingButtonsOverlay.tsx**
- **Props**: buttons[], orientation, onSendCommand
- **Responsabilidades**:
  - Grid de botones (diferente por orientación)
  - Se superpone sobre TerminalSection
  - Sin afectar scroll/interacción del terminal

### Cambios en Componentes Existentes

**VitalBars.tsx**
- Nuevo prop: `orientation?: 'horizontal' | 'vertical'`
- (Preparado para vertical, pero todavía renderiza horizontal)

### Commits Realizados
1. FASE 1-2: Tipos, storage, split screen básico
2. FASE 4: Terminal con auto-scroll
3. FASE 5: Botones flotantes por orientación

### Lo que Falta

#### Testing (FASE 6-8)
1. Build de la app
2. Probar en emulador Android
3. Verificar:
   - Split 60/40 en ambas orientaciones
   - Scroll independiente terminal/chat
   - Auto-scroll terminal
   - Teclado desplaza interfaz
   - Botones flotantes funcionan
   - Canal "Todos" muestra todos los mensajes

#### Integración Final
1. Reemplazar render de TerminalScreen para usar UnifiedTerminalLayout
2. Eliminar código antiguo (FloatingLayout, FKeyBar, etc.) cuando esté listo
3. Merge a main cuando esté 100% funcional

### Cómo Testear

#### Setup
```bash
npm start -- --port 8081
npm run android  # En otra terminal
```

#### Puntos de Prueba
- [ ] Vertical: Terminal 60% arriba, Chat 40% abajo
- [ ] Horizontal: Terminal 60% izquierda, Chat 40% derecha
- [ ] Chat tabs incluye "Todos" como primera pestaña
- [ ] Escribir en input prefija con alias de canal
- [ ] Teclado nativo aparece/desaparece
- [ ] Terminal scrolleable independiente
- [ ] Chat scrolleable independiente
- [ ] Botones flotantes aparecen sobre terminal
- [ ] Botones tienen diferente config por orientación (cuando se configure)

### Notas Técnicas
- UnifiedTerminalLayout NO toca TelnetService, mapService, etc.
- Todos los handlers (onSendCommand, onSelectChannel, etc.) son pasados desde arriba
- El componente es totalmente controlado desde arriba (controlled component)
- Listo para integrarse en TerminalScreen.tsx cuando se confirme funcionamiento

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

## Temas Pendientes

- **El teclado se cierra al enviar**: cuando el usuario escribe en el input del terminal y pulsa enviar, el teclado nativo se oculta. Debería mantenerse abierto para enviar varios mensajes seguidos sin tener que reabrirlo.

## Desarrollos por ahora no necesarios

Tareas analizadas y descartadas conscientemente: hay diseño hecho, pero no se implementan porque el coste/beneficio actual no compensa. Si en algún momento aparece el síntoma que las justificaría, retomar desde aquí.

### Mover el estado del terminal a contexto / singleton

**Problema que resolvería:** cuando Android destruye la `Activity` por presión de memoria o Doze agresivo (Xiaomi/Huawei sobre todo) aunque el proceso siga vivo, React remonta `TerminalScreen` desde cero y todos los `useState` arrancan vacíos. Resultado visible para el usuario: vuelve del bloqueo y "se ha perdido todo" (líneas, vitals, sala actual…), aunque el socket TCP siga activo en otro hilo.

**Por qué no se hace ahora:** bloquear el móvil de forma normal solo pausa la `Activity`, no la destruye. Con el `PARTIAL_WAKE_LOCK` + foreground service nativo (módulo `modules/blowtorch-foreground/`) que mantiene el proceso vivo y la CPU despierta, el caso normal está cubierto sin necesidad de tocar el estado: el componente sigue montado, los `useState` intactos. El refactor solo aporta valor en escenarios extremos (móviles con poca RAM, bloqueos muy largos en fabricantes agresivos).

**Síntoma para retomar:** el usuario reporta que al volver del bloqueo el terminal está en blanco, los vitals a 0, el mapa sin sala actual… aunque la conexión sigue marcada como activa.

**Implementación esperada:**
- Crear `TerminalStateContext` (en `App.tsx`) o un servicio singleton (estilo `TelnetService`) que conserve `lines`, `hp`/`hpMax`, `energy`/`energyMax`, `currentRoom`, `nearbyRooms`, mensajes de canales y aliases.
- Reemplazar los `useState` correspondientes en `src/screens/TerminalScreen.tsx` (~1700 líneas, mucho estado entrelazado) por consumo del contexto.
- Decidir explícitamente qué se preserva: estado de juego sí, modales abiertos no, scroll position quizá.
- Cuidado con el rerender: un único contexto re-renderiza todos los consumidores en cada cambio. Con líneas llegando constantemente del MUD esto puede tirar performance — habría que partir en varios contextos (lines / vitals / map) o usar selectors (p. ej. `use-context-selector`).

**Coste estimado:** alto. `TerminalScreen.tsx` es el archivo más grande del proyecto y mucho de su estado se cruza entre handlers de gestos, blind mode y triggers de sonido/notificación.
