# 🚀 Dev Workflow - BlowTorch

**Problema resuelto:** Conflictos de Metro, puertos ocupados, procesos fantasma.

**Solución:** Flujo determinista con script de limpieza.

---

## ⚡ Flujo Estándar (SIEMPRE usar este)

### Terminal 1: Preparación
```powershell
# Abre PowerShell en la carpeta raíz del proyecto

# Limpia todo
. .\reset-dev.ps1

# Espera el output ✅
```

### Terminal 2: Metro (bundler)
```powershell
# En una segunda ventana PowerShell

npm start

# Espera a ver:
# - "Starting Metro Bundler"
# - "Logs for your project will appear below"
# - SIN errores de puerto

# NO cierres esta terminal, deja corriendo
```

### Terminal 3: Build & Deploy
```powershell
# En una tercera ventana PowerShell

npm run android

# Esto:
# 1. Compila
# 2. Instala APK
# 3. Abre la app
# 4. Metro recarga automáticamente

# Después de los cambios, Metro recarga sin hacer nada más
```

---

## 🧹 Script de Limpieza: `reset-dev.ps1`

Siempre antes de empezar, ejecuta:

```powershell
. .\reset-dev.ps1
```

**Qué hace:**
- ✅ Mata procesos Node/Java sin piedad
- ✅ Reinicia ADB
- ✅ Limpia npm cache
- ✅ Configura `adb reverse tcp:8081 tcp:8081`
- ✅ Verifica puertos limpios
- ✅ Da instrucciones claras

---

## ⚠️ Reglas Críticas

| ❌ NO HACER | ✅ HACER |
|-----------|---------|
| Cambiar puerto a 8082/8083 | Siempre usar 8081 |
| Mezclar bash/cmd/PowerShell | Usar SOLO PowerShell en Windows |
| Matar Metro con Ctrl+C y relanzar al toque | Esperar 2-3 segundos, lanzar limpio |
| `npm start` + `npm run android` simultáneamente | Esperar a que Metro esté 100% listo |
| Matar procesos con `kill -9` en bash | Usar `reset-dev.ps1` o PowerShell |

---

## 🔥 Si algo está roto (ultimate fix)

```powershell
# Terminal PowerShell
. .\reset-dev.ps1

# Espera 5 segundos
Start-Sleep -Seconds 5

# Cierra todas las ventanas de PowerShell abiertas
# Abre una nueva y:

npm start

# En otra nueva:
npm run android
```

**Esto resuelve el 99% de problemas de puertos.**

---

## 📊 Diagnóstico: ¿qué está mal?

```powershell
# Ver procesos Node/Java abiertos
Get-Process node, java -ErrorAction SilentlyContinue

# Ver puertos ocupados
netstat -ano | Select-String LISTENING | Select-String "808\|9090"

# Verificar ADB
adb devices

# Ver logs en tiempo real
adb logcat | Select-String "BlowTorch|Metro"
```

---

## 💾 Guardado en Git

Este workflow está documentado. **NO cambiar puertos en el código**, siempre es 8081.

Si alguien trata de cambiar a 8082 o 8083, la respuesta es: **"Usa `reset-dev.ps1` primero"**.

---

## 🎯 Por qué esto funciona

1. **Procesos limpios** → Sin estados fantasma
2. **Shell consistente** → Sin incompatibilidades
3. **Puerto único** → Sin confusiones
4. **Flujo reproducible** → Siempre igual
5. **Esperas reales** → No timing issues

**Resultado:** Metro nunca más te molestará. 🎉
