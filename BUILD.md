# BUILD.md

Guía de build, troubleshooting, firma y versionado de TorchZhyla. CLAUDE.md la referencia pero NO la carga — léela cuando trabajes en el flujo de release o tengas problemas de build.

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
