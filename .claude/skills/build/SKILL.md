---
name: build
description: Construir la app Android de TorchZhyla. Usar cuando el usuario pida crear/instalar una APK de debug, una APK de release, o un AAB para Play Store. Modos - debug (builda APK debug e instala vía adb), release (builda APK release, no instala), store (verifica working tree limpio, bumpea versión, builda AAB, commitea bump). Argumentos - debug, release, store [patch|minor|major].
---

# Build skill — TorchZhyla

Encapsula los tres flujos de build de la app. Reemplaza la sección "Flujos" de BUILD.md.

## Argumentos

- `debug` — APK debug + instalar.
- `release` — APK release, sin instalar.
- `store [patch|minor|major]` — AAB para Play. Default `patch`. Bumpea versión y commitea.

Si el usuario pide algo ambiguo ("hazme un build", "saca apk"), preguntar qué modo. Si pide algo no soportado (Web, iOS), explicar que solo Android.

## Reglas comunes a todos los modos

- Trabajar siempre desde la raíz del proyecto (`C:\proyectos\Claude\TorchZhyla\aljhtar-store`). Los `cd android` deben hacerse dentro del comando con `&&`, no como cambio persistente de cwd.
- En PowerShell el chaining es `;` + `if ($?)`; en Bash es `&&`. Usar Bash tool con `&&` para los flujos gradle (más legible y consistente con la doc).
- Si gradle falla, leer la salida y reportar el error real al usuario. NO reintentar a ciegas. NO usar `--no-verify` ni saltarse hooks.
- Al final de cada modo, reportar al usuario: qué se hizo, dónde está el output, qué pasos manuales quedan (si los hay).

## Modo debug

Comando único:

```bash
cd android && ./gradlew.bat assembleDebug && cd .. && adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

- Si `adb devices` no muestra ningún device conectado, abortar antes de buildar y avisar.
- Si Metro no está corriendo en 8081 (`curl -s http://localhost:8081/status`), recordar al usuario al final que arranque `npm start` para que la app cargue JS.
- Recordar también `adb reverse tcp:8081 tcp:8081` si el device está conectado por USB y Metro corre en el host.

## Modo release

Comando:

```bash
cd android && ./gradlew.bat assembleRelease
```

Tras buildar, verificar:
- `android/app/build/outputs/apk/release/app-release.apk` existe.
- Tamaño entre 10MB y 200MB (sanity check; fuera de rango = algo va mal con la firma o ProGuard).

NO instalar. Si el usuario quiere probarla, instala manualmente con `adb install -r <path>`.

## Modo store

Flujo en 6 pasos. Si cualquiera falla, abortar y reportar — NO seguir.

### 1. Working tree limpio (ABORT si sucio)

```bash
git status --porcelain
```

Si la salida no es vacía, abortar con mensaje claro:

> Working tree sucio. Hay cambios sin commitear. Comitea o stashea antes de hacer release.

NO auto-stashear, NO añadir al commit del bump, NO seguir.

### 2. Leer versión actual

De `android/app/build.gradle`:
- `versionCode N`
- `versionName "X.Y.Z"`

Verificar que `app.json` tiene `"version": "X.Y.Z"` (mismo). Si divergen, **manda `build.gradle`** según BUILD.md — usar ese como fuente de verdad y avisar al usuario de la divergencia.

### 3. Calcular nueva versión

Tipo de bump = arg del usuario, default `patch`. Solo aceptar `patch`, `minor`, `major`. Cualquier otra cosa → abortar.

Reglas semver:
- patch: `1.0.1` → `1.0.2`
- minor: `1.0.1` → `1.1.0`
- major: `1.0.1` → `2.0.0`

`versionCode` = anterior + 1, **siempre**, independiente del tipo.

### 4. Bumpear ambos ficheros

Edit en `android/app/build.gradle`:
- `versionCode N` → `versionCode N+1`
- `versionName "X.Y.Z"` → `versionName "NUEVA"`

Edit en `app.json`:
- `"version": "X.Y.Z"` → `"version": "NUEVA"`

(`app.json` solo lleva `version`, no `versionCode`.)

### 5. Buildar AAB

```bash
cd android && ./gradlew.bat bundleRelease
```

Verificar:
- `android/app/build/outputs/bundle/release/app-release.aab` existe.
- Tamaño entre 10MB y 200MB.

Si falla, NO commitear el bump. Dejar los cambios staged para que el usuario decida (revertir o reintentar).

### 6. Commit del bump

```bash
git add android/app/build.gradle app.json
git commit -m "chore(release): X.Y.Z (versionCode N+1)"
```

Usar `git add` específico de los dos ficheros, NO `-am`. Aunque el working tree estaba limpio al empezar (paso 1), el `bundleRelease` puede haber tocado ficheros generados — solo queremos commitear el bump.

### 7. Reportar al usuario

Mensaje final con:
- Versión nueva: `X.Y.Z (versionCode N+1)`.
- Path del AAB: `android/app/build/outputs/bundle/release/app-release.aab`.
- Recordatorio: subir a Play y, **cuando esté publicada**, actualizar la línea "Última publicada en Play" en BUILD.md. La skill NO lo hace automáticamente porque "buildeada" ≠ "publicada".

## Edge cases

- **`adb` no está en PATH**: abortar y avisar. No instalar offline.
- **Gradle daemon stuck**: si gradle cuelga >5min, sugerir `./gradlew.bat --stop` y reintentar.
- **No conectado a un device** (modo debug): abortar antes de buildar, ahorrar tiempo.
- **`assembleRelease` o `bundleRelease` falla por firma**: el usuario probablemente no tiene `android/gradle.properties` con las credenciales del keystore o no tiene `my-release-key.jks`. Indicarle que esos ficheros se distribuyen fuera del repo (ver BUILD.md → "Firma de Release").
- **Usuario en rama distinta de `main`**: NO bloquear ni avisar. Es legítimo hacer release desde una rama (aunque inusual). Confiar en el juicio del usuario.
