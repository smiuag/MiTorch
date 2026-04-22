# Foreground Service - Planificación e Implementación

## Objetivo
Mantener la conexión Telnet activa cuando la app está en segundo plano (teléfono bloqueado), permitiendo que:
- La conexión siga escuchando mensajes
- Se detecten palabras clave (ej: "BONK")
- Se reproduzcan sonidos/vibraciones
- Los mensajes se acumulen en la terminal

## ¿Qué es un Foreground Service?

Un servicio de Android que corre en primer plano incluso cuando la app está minimizada. 

**Características:**
- Requiere mostrar una **notificación permanente** (no se puede cerrar)
- Android lo mantiene vivo mientras la notificación esté activa
- Consume más batería (conexión siempre activa)
- Código nativo (Java/Kotlin) + JavaScript

## Arquitectura Necesaria

```
┌─────────────────────────────────────┐
│   React Native App (JavaScript)     │
│  - TerminalScreen                   │
│  - ConnectionContext                │
└──────────────┬──────────────────────┘
               │ RN Bridge
┌──────────────┴──────────────────────┐
│   Foreground Service (Java/Kotlin)  │
│  - Mantiene socket Telnet vivo      │
│  - Escucha mensajes en background   │
│  - Detecta palabras clave           │
│  - Emite eventos a RN               │
└─────────────────────────────────────┘
```

## Módulos Necesarios

### 1. **Módulo RN para Foreground Service**
Opciones:
- `react-native-foreground-service` (recomendado)
- `react-native-service` 
- Código nativo personalizado (más trabajo)

### 2. **Capacidades Android Requeridas**
En `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

En `build.gradle`:
- `compileSdkVersion >= 31`
- Soporte para notificaciones (ya tenemos)

## Cambios de Código Necesarios

### En JavaScript (React Native)

1. **Crear `src/services/foregroundService.ts`**
   - Iniciar/detener servicio
   - Registrar listeners para eventos del servicio
   - Manejar palabras clave detectadas

2. **Actualizar `ConnectionContext`**
   - Añadir método `startForegroundService()`
   - Pasar la conexión al servicio nativo
   - Recibir eventos cuando llegan mensajes

3. **Actualizar `TerminalScreen`**
   - Botón para activar/desactivar servicio
   - Mostrar estado (activo/inactivo)
   - Escuchar eventos desde servicio

### En Código Nativo (Java/Kotlin)

1. **TelnetForegroundService.kt**
   - Servicio que mantiene la conexión Telnet viva
   - Escucha en un thread separado
   - Procesa bytes entrantes
   - Detecta palabras clave

2. **Bridge RN**
   - Exponer métodos JS para controlar el servicio
   - Emitir eventos cuando se detectan palabras clave

3. **Notificación Permanente**
   - Crear canal de notificación
   - Mostrar/actualizar notificación

## Configuración de Palabras Clave

```typescript
interface KeywordAlert {
  keyword: string;      // "BONK", "xxx te hace"
  soundFile?: string;   // ej: "bonk.wav"
  vibration?: number;   // ms
  enabled: boolean;
}
```

Almacenar en AsyncStorage para persistencia.

## Flujo de Ejecución

### Al activar:
```
1. Usuario presiona "Activar Background Listening"
2. Se inicia Foreground Service
3. Se crea notificación permanente
4. ConnectionContext pasa socket Telnet al servicio
5. Servicio empieza a escuchar en thread separado
```

### Al recibir mensaje:
```
1. Servicio recibe bytes del socket
2. Los decodifica según encoding (UTF-8)
3. Busca palabras clave
4. Si encuentra → reproduce sonido/vibración
5. Emite evento a RN
6. Se acumula en TerminalStateContext (si existe)
```

### Al desactivar:
```
1. Usuario presiona "Detener" O cierra notificación
2. Servicio libera socket (NO cierra conexión global)
3. Se elimina notificación
4. Servicio para
```

## Trade-offs y Consideraciones

### Batería
- ⚠️ Consume significativamente más batería
- Thread escuchando 24/7
- Socket TCP abierto
- **Mitigación:** Usuario puede activar/desactivar

### Permisos
- Requiere `FOREGROUND_SERVICE` (Android 12+)
- Requiere `POST_NOTIFICATIONS` (Android 13+)
- Será visible en "Apps corriendo en background"

### Confiabilidad
- Android puede matar el servicio en algunos casos (bajo memoria)
- Pero es más confiable que confiar en background task

### Complejidad
- Añade código nativo
- Sincronización entre JS y Java/Kotlin
- Testing más complicado

## Testing Manual

```
1. Abrir app
2. Conectar a servidor
3. Activar "Background Listening"
4. Bloquear teléfono
5. Desde otro cliente: enviar mensaje con palabra clave
6. Verificar: sonido/vibración
7. Desbloquear y verificar que el mensaje está en terminal
```

## Archivos a Crear/Modificar

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `src/services/foregroundService.ts` | RN | Control del servicio |
| `android/app/src/main/.../TelnetForegroundService.kt` | Nativo | Servicio principal |
| `android/app/src/main/.../TelnetBridge.kt` | Nativo | Bridge RN ↔ Servicio |
| `src/contexts/ConnectionContext.tsx` | RN | Integración con conexión |
| `src/screens/TerminalScreen.tsx` | RN | UI para activar/desactivar |
| `AndroidManifest.xml` | Config | Permisos y declaración |
| `build.gradle` | Config | Dependencias |

## Instalación de Módulos

```bash
npm install react-native-foreground-service
npx pod-install  # si es iOS
```

**Nota:** Probablemente necesitemos compilar código nativo personalizado además del módulo.

## Dependencias Estimadas

- `react-native-foreground-service`
- Posiblemente escribir servicio nativo personalizado
- Código Kotlin para interactuar con socket Telnet en background

## Próximos Pasos si Procedemos

1. Instalar módulo `react-native-foreground-service`
2. Crear clase Java/Kotlin para servicio Telnet
3. Crear bridge RN para comunicación
4. Implementar UI en TerminalScreen
5. Testing en dispositivo real
6. Optimizar batería/recursos

## Relación con TerminalStateContext

**IMPORTANTE:** Foreground Service y TerminalStateContext son **complementarios, no excluyentes**.

- **Foreground Service** → Mantiene conexión viva en background
- **TerminalStateContext** → Preserva estado al navegar entre pantallas

Para máxima funcionalidad, ambos deberían implementarse.
