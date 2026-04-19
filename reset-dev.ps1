# Reset dev environment completely - Windows PowerShell script
# Use: . .\reset-dev.ps1

Write-Host "🧹 Limpiando ambiente de desarrollo..." -ForegroundColor Yellow

# 1. Mata todos los procesos Node/Expo de verdad
Write-Host "1️⃣  Matando procesos Node..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Mata ADB y sus procesos
Write-Host "2️⃣  Reiniciando ADB..." -ForegroundColor Cyan
adb kill-server 2>&1 | Out-Null
Start-Sleep -Seconds 1
adb start-server 2>&1 | Out-Null

# 3. Limpia cache de Expo/Metro
Write-Host "3️⃣  Limpiando cache de Metro..." -ForegroundColor Cyan
npm install 2>&1 | Out-Null

# 4. Asegura el puerto estándar
Write-Host "4️⃣  Configurando ADB reverse en puerto 8081..." -ForegroundColor Cyan
adb reverse tcp:8081 tcp:8081
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ ADB reverse configurado correctamente" -ForegroundColor Green
} else {
    Write-Host "⚠️  Aviso: ADB reverse falló, pero continuando..." -ForegroundColor Yellow
}

# 5. Verifica que no hay procesos en los puertos
Write-Host "5️⃣  Verificando puertos..." -ForegroundColor Cyan
$portInUse = netstat -ano 2>&1 | Select-String -Pattern "0.0.0.0:(8081|8082|8083)" | Select-String LISTENING
if ($portInUse) {
    Write-Host "⚠️  Puertos ocupados detectados:" -ForegroundColor Yellow
    Write-Host $portInUse
} else {
    Write-Host "✅ Puertos limpios (8081-8083)" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Ambiente listo. Próximos pasos:" -ForegroundColor Green
Write-Host "   1. npm start          (espera a que esté listo)"
Write-Host "   2. npm run android    (en otra terminal PowerShell)"
Write-Host ""
Write-Host "🚀 Flujo estándar SIEMPRE:" -ForegroundColor Cyan
Write-Host "   - Usa SOLO PowerShell"
Write-Host "   - NO cambies de puerto"
Write-Host "   - Espera logs reales, no 5 segundos"
Write-Host "   - 1 metro a la vez, 1 build a la vez"
Write-Host ""
