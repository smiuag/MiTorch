# Preparación para subir al Play Store

Checklist de tareas pendientes antes de publicar una nueva versión en Google Play. Marcar con `[x]` cuando se completen. Las prioridades altas son las que más rentabilidad tienen o son bloqueantes.

## Código (limpieza)

- [x] **`console.log` de debug**: 24 `console.log` puros eliminados (mapService, telnetService, soundService, SoundContext, TerminalScreen). Se conservan 29 `console.warn`/`error` en handlers reales para enganchar a Sentry. Los del `logService.ts` (funcionalidad de usuario) intactos.
- [x] **Refactor `unified-ui`**: no es problema — los archivos no existen en `main`, la rama tampoco. Sección zombi del `CLAUDE.md` eliminada.
- [x] **Comentarios obsoletos**: 31 comentarios `// xxx logs removed …` eliminados (ansiParser, telnetService, TerminalScreen, blindModeService). De paso, `if`s vacíos que solo contenían esos comentarios también borrados. Cero TODOs/FIXMEs/HACKs reales en el repo.
- [x] **Dependencias no usadas**: depcheck pasado. Eliminadas `react-dom` y `react-native-web` (target web descartado), añadidas `expo-file-system` y `expo-modules-core` como deps explícitas. También eliminado el script `web` de `package.json`/`app.json` y ~60 líneas de código WebSocket muerto en `telnetService.ts` (campos, métodos y branches que solo aplicaban en web). TypeScript compila limpio.
- [x] **Imports tras `expo-clipboard`**: revisado. La dependencia sigue viva por la feature de copiar selección de líneas (`TerminalScreen.tsx:890`). Sin código muerto.

## Build / configuración Android (PRIORIDAD ALTA)

- [x] **Firma del APK release**: confirmado keystore propio (`android/app/my-release-key.jks`), configurado en `android/gradle.properties` y aplicado en `android/app/build.gradle:121`. `CLAUDE.md` actualizado.
- [x] **Bump de `versionCode` y `versionName`**: reset a `versionCode=1, versionName="1.0.0"` en `build.gradle` y `app.json`. Política de versionado documentada en `CLAUDE.md` § Versionado.
- [x] **R8 / ProGuard minify**: `minifyEnabled true` y default de `shrinkResources` cambiado a `'true'` en `android/app/build.gradle:118-126`. Añadida regla defensiva en `proguard-rules.pro` para el módulo custom `torchzhyla-foreground` (Expo lo registra por reflexión). Validación real del recorte de tamaño y de que nada se rompe → en Fase 3 con el AAB.
- [x] **`targetSdkVersion`**: API 35 (heredado del default de Expo en `ExpoRootProjectPlugin.kt`). Cumple Play (API 35 desde mediados de 2025).
- [x] **Permisos en `AndroidManifest.xml`**: bajados de 11 a 7. Quedan: `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `MODIFY_AUDIO_SETTINGS` (expo-av), `POST_NOTIFICATIONS`, `VIBRATE` (notification channel), `WAKE_LOCK`. Eliminados con `tools:node="remove"`: `RECORD_AUDIO` (la app no graba), `READ/WRITE_EXTERNAL_STORAGE` (solo se usa sandbox), `SYSTEM_ALERT_WINDOW` (sin overlays). `app.json` sincronizado.
- [x] **Generar AAB**: `app/build/outputs/bundle/release/app-release.aab`, **36 MB**. Build limpio sin debug button.
- [x] **Tamaño del bundle**: 36 MB el AAB (objetivo <40 MB ✅). Descarga real por device estimada en ~20-25 MB tras Play splits.

## Assets

- [x] **Iconos adaptativos**: 5 densidades (mdpi → xxxhdpi) con `ic_launcher.webp` + foreground + round, más `mipmap-anydpi-v26/ic_launcher.xml` para Android 8+.
- [x] **Splash screen**: 5 densidades de `splashscreen_logo.png` en `drawable-*`.
- [x] **Screenshots Play Console**: 5 capturas en `store-screenshots/` a 1280×2276 (9:16 vertical phone).
- [x] **Feature graphic**: `assets/feature-graphic.png` 1024×500 OK.

## Testing pre-release

- [x] **Probar el APK release**: instalado en device y abierto sin Metro. App arranca y navega correctamente. Sentry verificado dentro de este test.
- [ ] **Reinstalación sobre versión vieja** (sin `pm clear`): los datos guardados (servers, layouts, settings, channel aliases) deben sobrevivir a la actualización.
- [ ] **Smoke test del flujo principal**: conectar → `ojear` → `irsala <destino largo>` → bloquear móvil → desbloquear → confirmar que el irsala completó (gracias al fix de cola nativa que ya está commiteado).
- [ ] **Test de memoria**: dejar la app corriendo 30 min con un MUD activo y observar si la RAM crece sin parar (memory leak detection rápido). En Android Studio Profiler o `adb shell dumpsys meminfo com.smiaug.torchzhyla`.
- [ ] **Test en distintos tamaños de pantalla**: tablet, móvil pequeño, móvil grande. Especialmente el modo paisaje.
- [ ] **Test del modo blind con TalkBack** activado, si no se ha hecho recientemente.

## Cumplimiento Play (legal / privacy)

- [ ] **Privacy Policy URL** activa y accesible. Verificar que el enlace en Play Console responde 200.
- [ ] **Data Safety form** del Play Console actualizado: declarar qué datos recoges. En TorchZhyla, parece que no se recoge nada fuera del dispositivo (no analítica, no telemetría, los logs son locales — Sentry recoge stack traces de crashes sin PII). Declarar lo de Sentry y marcar el resto como "no data collected".
- [ ] **Account deletion flow**: si Play lo exige (depende de si la app gestiona cuentas). Las cuentas son del MUD, no de la app, así que probablemente no aplica. Revisar el form del Play Console por si pregunta.
- [ ] **Categoría y etiquetas** del Play Console correctas (Tools / Communication / Games — Role Playing son candidatas razonables).

## Opcional pero recomendado

- [x] **Crash reporting**: Sentry integrado y **verificado en device** (issue TORCHZHYLA-2 capturado, source maps OK — el stack trace muestra `SettingsScreen.tsx`, no minificado).
  - Org: `smiaug`, Project: `torchzhyla`, región: EU.
  - `App.tsx`: `Sentry.init` + `Sentry.wrap` + `captureConsoleIntegration` para enganchar los `console.warn`/`error`.
  - `metro.config.js` con `getSentryExpoConfig` (genera source maps).
  - `android/app/build.gradle` aplica `sentry.gradle` (sube source maps al build release).
  - `android/sentry.properties` con auth token (gitignored).
  - Reporta solo en builds release (`enabled: !__DEV__`).
- [x] **Source maps subidas**: confirmado en el test anterior (file/line resoluble en el dashboard de Sentry).
- [x] **`__DEV__` guard sistemático**: no aplica — borramos todos los `console.log` puros, no hubo que envolver nada. Sentry ya respeta `__DEV__` con `enabled: !__DEV__`.
- [ ] **Internal testing track en Play**: subir el AAB primero a internal testing, dejarlo unas horas, comprobar que se descarga e instala bien. Luego promover a producción.

## Workflow de build (importante, no olvidar)

- **Bare workflow**: la carpeta `android/` está en git y se edita a mano. Documentado en `CLAUDE.md` § "⚠️ Workflow nativo: bare, NO managed".
- NUNCA correr `expo prebuild` ni `expo eject`.
- Build comandos: `npm run android` (debug, con Metro) o `cd android && ./gradlew.bat bundleRelease` (release final, sin Metro).

## Notas / contexto

- El `CLAUDE.md` ya tiene una sección "Build Guide" con los comandos exactos. La parte de "Generar bundle" en `Escenario 3: Distribución` es la receta que toca para Play.
- El último release publicado está marcado en memoria como `30b1dbf` (2026-04-23). Para "novedades desde la última release", hacer `git log 30b1dbf..HEAD --oneline`. Bumpear ese marker tras publicar.
- Los pendientes anotados en `CLAUDE.md` (Lua/JSON triggers, botones blind de vida/energía, flush del log al pasar a background) son features, NO bloqueantes para el release. Pueden ir en versiones futuras.
