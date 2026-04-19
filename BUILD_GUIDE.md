# 🔨 BUILD GUIDE - BlowTorch

**Conclusiones finales sobre compilación, debugging y distribución**

---

## 📍 Ubicaciones de APKs

```
📁 android/app/build/outputs/apk/
├── debug/
│   └── app-debug.apk          ← Para testing en desarrollo
└── release/
    └── app-release.apk        ← Para distribución (Google Play, testing final)
```

---

## ✅ Flujo Correcto de Compilación

### 1️⃣ Debug APK (Para desarrollo/testing)

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

---

### 2️⃣ Release APK (Para distribución)

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

---

## 🎯 Flujos Completamente Documentados

### Escenario 1: Desarrollo rápido
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

---

### Escenario 2: Testing de release
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

---

### Escenario 3: Distribución (Google Play)
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

---

## 🚨 Problemas Comunes y Soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| "Port 8081 is being used" | Metro anterior no cerró | `reset-dev.ps1` |
| "Unable to resolve module" | Assets no en paths correctos | Ver `blindModeService.ts` require() |
| Build freezes | Gradle daemon stuck | `./gradlew.bat --stop` |
| App doesn't load JS | Metro no está corriendo | `npm start` en Terminal 1 |
| Sound not playing | Paths incorrectos en require | Verificar `soundModules` object |
| "INSTALL_FAILED_USER_RESTRICTED" | User confirmó cancel en device | Aceptar permisos en device |

---

## 📋 Checklist Pre-Release

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

---

## 🔍 Debugging en Release

### Logcat en tiempo real
```powershell
adb logcat | Select-String "BlowTorch|SOUND|BM|BLIND|Telnet"

# Ejemplos de logs esperados:
# [SOUND] Intentando reproducir: "bloqueos/bloqueo-termina.wav"
# [BLIND_PROCESS] Procesando con blind mode
# [CHECK] Procesando bloqueo
```

### Datos persistentes
```powershell
# Ver archivos almacenados
adb shell "run-as com.smiaug.torchzhyla cat /data/data/com.smiaug.torchzhyla/files/*"

# Limpiar datos (reset app)
adb shell pm clear com.smiaug.torchzhyla
```

---

## 📊 Métricas de Build

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

---

## 🎓 Arquitectura del Build

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

---

## 📱 Device Requirements

**Mínimo:**
- Android 6.0 (API 24)
- 50 MB espacio
- Internet (Telnet)

**Recomendado:**
- Android 10+ (API 29+)
- 100+ MB espacio
- Wi-Fi o 4G

---

## 🔐 Firma de APK (Release)

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

---

## ✨ Conclusiones

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

---

**Última actualización:** 2026-04-20
**Estado:** ✅ Documentado y testeado
