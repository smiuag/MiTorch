# Generate Release Signing Key for Google Play Store
# Run this script ONCE and keep the generated key safe!

Write-Host "
========================================
TorchZhyla Release Signing Key Generator
========================================

IMPORTANT:
- Run this script ONCE
- Save the keystore file in a SAFE location
- If you lose this keystore, you CANNOT update your app on Google Play
- Back it up to a secure location
========================================
" -ForegroundColor Yellow

# Ask for password
$storePassword = Read-Host "Enter keystore password (min 6 characters, save this!)"
$keyPassword = Read-Host "Enter key password (can be same as keystore password)"

if ($storePassword.Length -lt 6) {
    Write-Host "Password must be at least 6 characters!" -ForegroundColor Red
    exit 1
}

# Generate keystore
$keystorePath = "android/app/my-release-key.jks"
$keyAlias = "my-key-alias"

if (Test-Path $keystorePath) {
    Write-Host "ERROR: Keystore file already exists at $keystorePath" -ForegroundColor Red
    Write-Host "If you want to regenerate, delete it first and run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "`nGenerating signing key..." -ForegroundColor Cyan

$javaPath = "keytool"
$keygenArgs = @(
    "-genkey",
    "-v",
    "-keystore", $keystorePath,
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-validity", "10000",
    "-alias", $keyAlias,
    "-storepass", $storePassword,
    "-keypass", $keyPassword
)

# Run keytool (will ask for additional info interactively)
& $javaPath @keygenArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to generate keystore!" -ForegroundColor Red
    exit 1
}

Write-Host "
========================================
✅ Signing key generated successfully!
========================================

Location: $keystorePath
Key Alias: $keyAlias

NEXT STEPS:
1. Save this information securely:
   - Keystore path: $keystorePath
   - Store password: [YOU ENTERED]
   - Key alias: $keyAlias
   - Key password: [YOU ENTERED]

2. Create android/gradle.properties with:
   MYAPP_RELEASE_STORE_FILE=$keystorePath
   MYAPP_RELEASE_STORE_PASSWORD=[YOUR PASSWORD]
   MYAPP_RELEASE_KEY_ALIAS=$keyAlias
   MYAPP_RELEASE_KEY_PASSWORD=[YOUR PASSWORD]

3. The build.gradle has been updated to use this key for releases.

⚠️ BACKUP YOUR KEYSTORE FILE!
   If you lose it, you cannot update your app on Google Play.
   Store it in a safe location (cloud backup, external drive, password manager, etc.)

========================================
" -ForegroundColor Green

Write-Host "Done!" -ForegroundColor Green
