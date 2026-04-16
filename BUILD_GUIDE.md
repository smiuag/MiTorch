# BlowTorch APK Build Guide

## Configuración del Entorno

### Android SDK
**Ubicación del SDK:** 
```
C:\Users\diego\AppData\Local\Android\Sdk
```

**Cómo verificar:**
1. Abre Android Studio
2. File → Settings → Appearance & Behavior → System Settings → Android SDK
3. Copia la ruta que dice "Android SDK Location"

### Configuración Inicial

1. **local.properties** en `android/`:
```
sdk.dir=[RUTA_DEL_SDK]
```

Ejemplo:
```
sdk.dir=C:\Users\diego\AppData\Local\Android\Sdk
```

## Proceso de Compilación APK de Release

### 1. Actualizar Versión

Editar `app.json`:
```json
{
  "expo": {
    "version": "X.Y.Z",
    ...
  }
}
```

### 2. Compilar APK de Release

Desde la carpeta `android/`:
```bash
./gradlew assembleRelease
```

**Ubicación de la APK compilada:**
```
android/app/build/outputs/apk/release/app-release.apk
```

### 3. Copiar a la carpeta principal

```bash
cp android/app/build/outputs/apk/release/app-release.apk ../aljhtar-store-vX.Y.apk
```

### 4. Actualizar Memoria de Versión

Editar `C:\Users\diego\.claude\projects\C--proyectos-Claude-BlowTorch\memory\project_version.md`:
```
Current version: **X.Y**
Next version: **X.Y+1**
```

## Instalación en Dispositivo

### Opción 1: APK Debug (más rápido)
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Opción 2: APK Release
```bash
adb install aljhtar-store-vX.Y.apk
```

### Verificar dispositivo conectado
```bash
adb devices
```

## Pruebas en Desarrollo

### Opción 1: Metro Bundler (desarrollo en vivo)
```bash
npm start -- --port 8083
adb reverse tcp:8083 tcp:8083
```

Luego en el teléfono: shake + Reload

### Opción 2: APK Debug directa
```bash
npm run android
```

## Control de Versiones

### Patrón de versiones
- **Mayor.Menor.Patch** (X.Y.Z)
- Ej: 2.0.0, 2.1.0, 2.1.1

### Qué cambios requieren versión nueva
- Nuevas features → Incrementar Menor
- Bug fixes → Incrementar Patch
- Breaking changes → Incrementar Mayor

### Archivo de versión
Ubicación: `C:\Users\diego\.claude\projects\C--proyectos-Claude-BlowTorch\memory\project_version.md`

Mantener actualizado SIEMPRE después de compilar APK.

## Checklist antes de compilar

- [ ] Cambios committeados en git
- [ ] `npm start` compilando sin errores en consola
- [ ] Verificados los cambios en teléfono (si es posible)
- [ ] Versión en `app.json` actualizada
- [ ] Commit con mensaje "Bump version to X.Y.Z"
- [ ] Commit hecho con `git push`

## Troubleshooting

### Error: "SDK location not found"
- Verificar que `android/local.properties` existe
- Verificar que la ruta en `sdk.dir` es correcta

### Error: "No Android connected device"
- Para compilar APK: usar `./gradlew assembleRelease` (no requiere dispositivo)
- Para instalar: conectar dispositivo USB con depuración habilitada
- Verificar: `adb devices`

### Gradle daemon issues
```bash
./gradlew --stop
./gradlew assembleRelease
```

## APKs Generadas

Histórico de versiones generadas:
- v2.0: aljhtar-store-v2.0.apk
- v2.1: aljhtar-store-v2.1.apk

Ubicación: `C:\proyectos\Claude\BlowTorch\`
