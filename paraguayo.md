# Caso Paraguay — análisis del problema de charset/encoding

Documento de trabajo para retomar la investigación si hace falta. Escrito el 2026-04-22.

## Síntoma reportado

Usuarios con "ISO-8859-1" configurado en el MUD reportan que los filtros de blind mode no capturan todas las líneas que deberían (el prompt sigue apareciendo en pantalla en lugar de silenciarse, stats no se capturan, etc.). Otros usuarios con la misma configuración de ISO-8859-1 no tienen el problema.

Usuario afectado concreto: **Paraguay, invidente, usa TalkBack**. Contacto directo complicado, no puede abrir consola ni depurar.

## Evidencia — captura del usuario

Archivo en `C:\proyectos\Claude\captura.png`. Muestra en el terminal:

```
Tu tipo de terminal ya es ansi.
Pv:3221\3221 Pe:910\910 Xp:1690110
PL:
Jgd:
Im�genes:0
```

**Dato clave**: el `á` de "Im**�**genes" aparece como `�` (U+FFFD, replacement character de Unicode). Eso **sólo** se produce cuando un decoder ve una secuencia inválida. En nuestro pipeline, el único camino que produce `�` es **decodificar bytes latin1 como UTF-8**: el byte 0xE1 (á en ISO-8859-1) no es un arranque válido en UTF-8 → se sustituye por U+FFFD.

Conclusión: en el momento de la captura, **BlowTorch estaba decodificando como UTF-8**, no como latin1, mientras el MUD enviaba bytes ISO-8859-1.

## Causa raíz identificada: bug del onboarding

Trace completo del caso reproducible:

1. Usuario instala APK nueva (con parámetro charset disponible) tras desinstalar versión vieja → AsyncStorage limpio
2. Abre app → `loadSettings()` no encuentra JSON → devuelve `DEFAULT_SETTINGS` de `settingsStorage.ts:39-71`. **`encoding: 'utf8'`** (línea 43), `onboardingDone: false`
3. Modal de bienvenida aparece (gracias a `!onboardingDone` en `ServerListScreen.tsx:48-49`)
4. Usuario pulsa "blind" → `handleSelectMode('blind')` en `ServerListScreen.tsx:55-60`
5. La línea crítica es **`ServerListScreen.tsx:57`**:
   ```ts
   await saveSettings({ ...current, uiMode: mode, onboardingDone: true });
   ```
   Hace spread de `current`, mete `uiMode` y `onboardingDone`. **No toca `encoding`**. Queda en `'utf8'`.

La lógica "blind → latin1" **solo existe en `SettingsScreen.updateSetting:33-36`**, y solo dispara cuando **cambias** uiMode desde la pantalla de Settings manualmente:

```ts
if (key === 'uiMode' && value === 'blind') {
  updated = { ...updated, encoding: 'latin1' };
}
```

Resultado: un usuario que completa el onboarding eligiendo blind **sale con `encoding: 'utf8'`**. Todos los acentos, ñ, etc. que el MUD envía en ISO-8859-1 colapsan a `�`, rompiendo la normalización de `isPromptLine` que solo contempla el acento correcto, la mayúscula, y `?`:

```ts
// blindModeService.ts:194-200
.replace(/[íÍi?]/g, 'i')  // í, Í, i, or corrupted → i
// NOTA: NO maneja �, por eso "Im�genes" no normaliza a "Imagenes"
```

## Otros hallazgos del código (relevantes pero secundarios)

### `stripAnsiCodes` es incompleto

`blindModeService.ts:329-334`:
```ts
return text.replace(new RegExp(esc + '\\[[0-9;]*m', 'g'), '');
```

Solo elimina SGR (`ESC [ ... m`). No quita cursor codes (`H`, `J`, `K`, `A-D`) ni OSC. Bug latente pero no el que rompe al usuario de Paraguay.

### El regex `\d*` está correcto

`blindModeService.ts:164` usa `\d*` (cero o más dígitos), así que `PL:` sin número matchea igual que `PL:42`. El cambio histórico que el usuario recordaba estaba bien aplicado. El motivo de que `PL:` y `Jgd:` sigan apareciendo en la captura sí encaja con la hipótesis del mismatch de encoding — la línea `PL:` aislada en ASCII puro sí matchea, pero puede haber llegado pegada a otro contexto con `�` u otro carácter que la descoloca. Dado que al arreglar el encoding los caracteres vuelven a ser válidos, este síntoma debería desaparecer también.

### Sanitización de C0/C1 descartada por ahora

Inicialmente planteamos sanitizar invisibles en el rango `[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F-\x9F]` (excluyendo ESC). Descartado porque:

### MUD de 30+ años

El usuario confirmó que el MUD tiene más de 30 años. Eso descarta prácticamente cualquier problema de Windows-1252 vs ISO-8859-1 estricto:

- Se escribió en los 90 cuando Windows-1252 no estaba en el ecosistema MUD
- Código del servidor trata strings byte-a-byte, lleva décadas emitiendo idénticos bytes
- Contenido acumulado es puro ISO-8859-1: ASCII 0x20-0x7E + acentos 0xA0-0xFF, nunca 0x80-0x9F
- La probabilidad de que llegue un byte en 0x80-0x9F es mínima (solo si un jugador pega algo desde Word y el server lo echa en algún canal)

Por tanto **iconv-lite + CP1252 no aporta nada práctico** para este MUD. Latin1 del `Buffer` cubre perfectamente lo que emite. **Plan iconv-lite aparcado** salvo que aparezca un caso concreto.

## Plan de acción

### Pendiente de confirmación

El usuario intentará contactar al de Paraguay para **confirmar qué tiene seleccionado en Ajustes → Codificación**. Si tiene `UTF-8`, confirma la hipótesis del onboarding bug. Si tiene `ISO-8859-1 / Latin1`, hay que seguir investigando porque con `latin1` no se produce `�` — habría que mirar otros caminos (versión antigua de la APK, setting con valor no reconocido que cae al fallback, etc.).

### Si se confirma (o por defecto aplicamos el fix porque es seguro)

**Fix 1 — arreglar el onboarding** (`ServerListScreen.tsx:57`):
```ts
await saveSettings({
  ...current,
  uiMode: mode,
  encoding: mode === 'blind' ? 'latin1' : current.encoding,
  onboardingDone: true,
});
```

**Fix 2 — autoheal en `loadSettings()`** (`settingsStorage.ts:73-83`):
```ts
export async function loadSettings(): Promise<AppSettings> {
  const json = await AsyncStorage.getItem(SETTINGS_KEY);
  let settings: AppSettings;
  if (!json) {
    settings = { ...DEFAULT_SETTINGS };
  } else {
    settings = JSON.parse(json);
  }
  // Autoheal: blind mode requires latin1
  if (settings.uiMode === 'blind' && settings.encoding !== 'latin1') {
    settings = { ...settings, encoding: 'latin1' };
    await saveSettings(settings);
  }
  return rebuildSounds(settings);
}
```
Esto recupera al usuario de Paraguay (y cualquier otro atrapado en el mismo bug) **sin que él tenga que hacer nada**: basta con que actualice la app.

**Fix 3 — consolidar la regla en un solo sitio**: retirar la lógica duplicada de `SettingsScreen.updateSetting:33-36` (o dejarla; no hace daño, pero duplica el conocimiento).

**Fix 4 — añadir `�` a las clases de normalización** de `blindModeService.ts:194-200` como red de seguridad:
```ts
.replace(/[áÁa?�]/g, 'a')
.replace(/[éÉe?�]/g, 'e')
// ... etc
```
Coste mínimo, defensa frente a cualquier futuro mismatch similar.

### Lo que NO se va a hacer ahora

- Instalar iconv-lite
- Añadir "ISO-8859-1 tolerante (Windows-1252)" al modal
- Sanitizar invisibles C0/C1 en `emitText`
- Cambiar el default de encoding de `'utf8'` a `'latin1'`

Todo esto sigue siendo viable como mejora futura, pero no resuelve el síntoma observado.

## Archivos clave ya leídos

- `src/services/telnetService.ts` — emitText en línea 192-211, decode en 197
- `src/services/blindModeService.ts` — processLine en 340, isPromptLine en 187, stripAnsiCodes en 329
- `src/screens/TerminalScreen.tsx` — handler.onData en línea 478, processLine del handler en 316
- `src/screens/SettingsScreen.tsx` — updateSetting con lógica blind→latin1 en 30-59, modal de encoding en 468-527
- `src/screens/ServerListScreen.tsx` — handleSelectMode en 55-60 (onboarding, el bug)
- `src/storage/settingsStorage.ts` — DEFAULT_SETTINGS en 39-71 con encoding 'utf8' en 43, loadSettings en 73

## Notas para retomar

Si vuelves a este caso:

1. Lee esta nota completa para orientarte
2. Verifica que el bug del onboarding sigue en `ServerListScreen.tsx:57` (no se ha corregido mientras tanto)
3. Pregunta al usuario si ya tiene confirmación del setting real del usuario de Paraguay
4. Si ya ha cambiado de opinión y quiere aplicar el plan grande (iconv-lite, CP1252, opción nueva en modal), la arquitectura está descrita arriba — no hay blockers técnicos, solo es más trabajo para dudoso beneficio en este MUD concreto
