# BUILD.md

Guía de build, troubleshooting, firma y versionado de TorchZhyla. CLAUDE.md la referencia pero NO la carga — léela cuando trabajes en el flujo de release o tengas problemas de build.

## Build Guide

Los flujos de build (debug, release, AAB store) están encapsulados en la skill **`/build`** (ver `.claude/skills/build/SKILL.md`). Pide en lenguaje natural ("instálame el debug", "saca un AAB para Play patch") o usa el slash command (`/build debug`, `/build release`, `/build store [patch|minor|major]`).

### Outputs

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `android/app/build/outputs/apk/release/app-release.apk`
- Release AAB (Play): `android/app/build/outputs/bundle/release/app-release.aab`

### Desarrollo con Metro

`/build debug` instala la APK pero el JS lo sirve Metro en runtime. Flujo manual del Metro:

```powershell
. .\reset-dev.ps1   # mata Node/Java, resetea ADB, adb reverse tcp:8081 tcp:8081
npm start           # Metro en 8081 (SIEMPRE 8081, no 8082/8083)
```

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

Doctrina (la skill `/build store` la enforza):
- `versionName` semver: PATCH = bugfix, MINOR = feature compatible, MAJOR = breaking/UX grande.
- `versionCode`: `+1` por cada release publicada. Solo sube, nunca baja.
- Sincronizar `android/app/build.gradle` (versionCode + versionName) y `app.json` (`version`). Si divergen, manda `build.gradle`.

Última publicada en Play: **1.0.1 (versionCode 2)** — internal testing (2026-05-03). Actualizar a mano cuando subas la siguiente al portal de Play.
