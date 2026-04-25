# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# AsyncStorage - prevenir que Proguard obfusque el módulo nativo
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class org.reactnative.asyncstorage.** { *; }

# Módulo nativo custom: torchzhyla-foreground
# Expo registra módulos por reflexión y el Service se referencia por nombre en AndroidManifest
-keep class expo.modules.torchzhylaforeground.** { *; }

# Add any project specific keep options here:
