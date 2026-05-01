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

Para nombres concretos de componentes, layout de `src/`, estructura del MapService, etc., explora el código directamente — los archivos están bien nombrados y los tipos en `src/types/index.ts` cubren los modelos.

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

## Build, release, troubleshooting

Guía completa en **`BUILD.md`** (no se carga automáticamente — léela cuando trabajes en el flujo de build, signing o versionado).

Cheat sheet:
- Debug con Metro: `reset-dev.ps1` → `npm start` → `npm run android`. Puerto SIEMPRE 8081.
- Release APK: `cd android && ./gradlew.bat assembleRelease`.
- Logcat filtrado: `adb logcat | Select-String "TorchZhyla|SOUND|BM|BLIND|Telnet"`.

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
- Buttons are per-server in BOTH modes (normal y blind), persistidos bajo la clave `buttonLayout_{serverId}`. La diferencia entre modos es solo la **plantilla por defecto** (`createDefaultLayout()` vs `createBlindModeLayout()`) que se usa como base cuando un server no tiene aún layout guardado y el set de campos relevantes (modo blind usa `blindPanel`, modo completo usa `completoPanel`). La frase "global in blind mode" que aparecía aquí antes era inexacta: existe `loadLayout`/`saveLayout` (sin server.id) en `layoutStorage.ts` pero está **sin usar** — es leftover de una era previa donde había un layout único global.
- Colors come from button definition, not terminal rendering

## Blind Mode & Accessibility

`uiMode === 'blind'` es interfaz solo de voz para screen readers (TalkBack/VoiceOver). Feedback vía `speechQueueService.enqueue()` (cola FIFO sobre `AccessibilityInfo.announceForAccessibility`) + audio cues. Nada se muestra visualmente.

**Reglas no derivables del código:**
- **Canales**: SIEMPRE se escriben al terminal (para review posterior) pero NUNCA se anuncian.
- **Gestos complejos NO funcionan con TalkBack** (OS los consume para navegar). El único patrón accesible para acción secundaria de botón es `accessibilityActions` (`activate` + `secondary`) — TalkBack lo presenta como menú swipe up/down. NO añadir gestos como segunda acción.
- **Speech queue**: TalkBack no encola; atropella. Por eso TODO `announceForAccessibility` pasa por `speechQueueService` con timer estimado por longitud (ver `speechCharDurationMs` en Settings).

**Archivos:** `src/config/blindModeFilters.json` (filtros), `src/services/blindModeService.ts` (process), `src/storage/layoutStorage.ts:createBlindModeLayout()` (grid blind global).

## Patrones comunes

Los patrones recurrentes (cargar layout, mandar comandos, render de líneas, etc.) son derivables del código existente — abre el archivo relevante (`src/screens/TerminalScreen.tsx` para state del terminal, `src/storage/*` para persistencia) y sigue las convenciones.

## Sistema de logs para soporte (implementado)

Captura opcional de la actividad del terminal a un archivo único `${Paths.document}/logs/log.txt` (sandbox privado), exportable como HTML para compartir con soporte o subir a deathlogs.com.

**Reglas operativas no derivables del código:**
- Off por defecto. Al desactivar el toggle se **borra el archivo inmediatamente** (privacidad).
- `server-key` = slug del **nombre** del `ServerProfile` (no del host). Si el usuario renombra un personaje, los logs nuevos van con tag distinto al histórico.
- Sanitización: SOLO la contraseña del auto-login se omite. Username, host y nicks de otros jugadores SÍ se loguean.
- Cap default `maxLogLines = 20.000`. Bajar el cap trunca el archivo sin confirmación.

**Archivos:** `src/services/logService.ts` (singleton, buffer + flush 5s/100 líneas), `src/utils/logHtmlGenerator.ts` (HTML + filtros embebidos), integración en `telnetService.ts`/`TerminalScreen.tsx`/`SettingsScreen.tsx`.

**Generador HTML — caso especial:** si el filtro de servidor activo tiene `host` que contiene `reinosdeleyenda.es`, el botón "deathlogs" enlaza a `https://deathlogs.com/list_log.php?m_id=10`; si no, a la home genérica.

## Sistema de Triggers

Doctrina, modelo de datos y plan por fases en **`TRIGGERS.md`** (no se carga automáticamente — léela cuando crees triggers, toques `triggerEngine`, o trabajes en variables/prompt parsing).

Idea general: motor declarativo que intercepta líneas del MUD y aplica acciones (gag/color/replace/play_sound/send/notify/floating/set_var). Los triggers se agrupan en **plantillas** que se asignan a personajes. Variables system (parseadas del prompt canónico) y user (memoria persistente) referenciables como `${nombre}` en patterns y templates.

## Sistema de Ambientación

Doctrina del reproductor de fondo en **`AMBIENT.md`** (no se carga automáticamente — léela cuando toques `ambientPlayer`, `roomCategorizer` o la pantalla "Mis ambientes").

Idea general: loop de música que cambia con el **tipo de sala** (17 categorías, clasificadas por keywords sobre el nombre). Sin wavs bundleados — el usuario los aporta. Crossfade 1.5s entre categorías.

## Temas Pendientes

- **Self-voicing en blind mode** (rework: 2026-05-01). Primera iteración completa (Fases 0-7 de SELFVOICING.md): `react-native-tts` integrado, `speechQueueService` con dos backends (TalkBack / TTS propio), botones blind con doble-tap-para-activar via `selfVoicingPress` util, gestos del PanResponder habilitados en blind+selfVoicing reusando `GestureConfig` existente, `importantForAccessibility="no-hide-descendants"` en root para esconder de TalkBack, banner de aviso si TalkBack sigue activo, ducking automático del TTS sobre música ambiente. Setting `useSelfVoicing` (default OFF). **Pendiente Fase 8**: test en móvil real con usuario blind objetivo — latencia de gestos, claridad TTS, recuperación de errores, validación del modelo doble-tap. Doctrina y simplificaciones tomadas en **`SELFVOICING.md`**.

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
