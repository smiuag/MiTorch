# Google Play Store Setup Guide

This document explains how to prepare BlowTorch for publication on Google Play Store.

## ✅ What's Already Done

The following has been prepared for you:

- [x] **Privacy Policy** (`legal/PRIVACY_POLICY.md`)
- [x] **Terms of Service** (`legal/TERMS_OF_SERVICE.md`)
- [x] **versionCode Updated** (v3.0.0 → versionCode 30000)
- [x] **Build Configuration** Ready for release signing key
- [x] **Security** gradle.properties added to .gitignore

## 🔑 Next Steps: Generate Release Signing Key

### 1. Run the Key Generation Script

```powershell
cd aljhtar-store
.\GENERATE_SIGNING_KEY.ps1
```

This will:
- Ask for keystore password (save this!)
- Ask for key password
- Generate `android/app/my-release-key.jks`
- Display instructions for next step

### 2. Create gradle.properties

After running the script, create `android/gradle.properties`:

```properties
MYAPP_RELEASE_STORE_FILE=app/my-release-key.jks
MYAPP_RELEASE_STORE_PASSWORD=YOUR_PASSWORD_HERE
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_KEY_PASSWORD=YOUR_PASSWORD_HERE
```

**⚠️ IMPORTANT:**
- `gradle.properties` is in `.gitignore` (won't be committed)
- Never share this file
- Store passwords securely

### 3. Test Release Build

```powershell
cd android
./gradlew.bat bundleRelease
cd ..
```

Output will be at: `android/app/build/outputs/bundle/release/app-release.aab`

## 📱 Hosting Legal Documents

Your app needs public URLs for privacy policy and terms of service.

### Option 1: GitHub Pages (Free)

1. Create a GitHub repo (if not already)
2. Create `docs/` folder in your repo
3. Copy the legal files:
   ```
   docs/
   ├── privacy-policy.html
   └── terms-of-service.html
   ```
4. Convert `.md` to `.html` (use a markdown converter or GitHub's built-in rendering)
5. Enable GitHub Pages in repo settings
6. Use URLs like: `https://yourusername.github.io/blowtorch/privacy-policy.html`

### Option 2: Your Own Website

- Host the files on your domain
- URLs should be permanent (don't move them later)

## 📋 When You Have the Developer Account

Once you create your Google Play Developer account ($25):

1. Go to [Google Play Console](https://play.google.com/apps/publish)
2. Create new app
3. Fill in app details:
   - **Title:** BlowTorch
   - **Description:** Telnet/MUD client for Android
   - **Privacy Policy URL:** (from your hosted documents)
   - **Permissions:** INTERNET, FOREGROUND_SERVICE, etc. (auto-populated)
4. Upload screenshots (2-8)
5. Upload app bundle (`.aab` file from `android/app/build/outputs/bundle/release/`)
6. Set up internal testing first
7. Then alpha → beta → production

## 🔒 Security Checklist

- [ ] `gradle.properties` NOT committed to git
- [ ] `.jks` file backed up to secure location
- [ ] Signing key password stored securely
- [ ] `gradle.properties` never shared with anyone
- [ ] Privacy policy uploaded to public URL
- [ ] Terms of service uploaded to public URL

## 📊 Version Management

When releasing future versions:

| Version | versionCode |
|---------|-------------|
| 3.0.0 | 30000 |
| 3.0.1 | 30001 |
| 3.1.0 | 31000 |
| 3.2.0 | 32000 |
| 4.0.0 | 40000 |

Update `versionCode` in `android/app/build.gradle` before each release.

## 🚨 Troubleshooting

**"keytool not found"**
- Make sure Java is installed
- Add Java bin directory to PATH

**"Keystore file already exists"**
- Delete the existing file first, then run the script again

**"Invalid keystore"**
- Make sure the password is correct
- Regenerate if corrupted

## 💡 Tips

- Keep the keystore file safe (use cloud backup or external drive)
- Test the release APK locally before uploading
- Start with internal testing, not production release
- Use the same keystore for all future updates

## Questions?

See `legal/PRIVACY_POLICY.md` and `legal/TERMS_OF_SERVICE.md` for what you need on Google Play Console.
