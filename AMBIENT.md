# AMBIENT.md

Doctrina del reproductor de música ambiente por tipo de room. CLAUDE.md la referencia pero NO la carga — léela cuando toques `ambientPlayer`, `roomCategorizer` o la pantalla "Mis ambientes".

## Sistema de Ambientación (HECHO 2026-04-30)

Loop de música de fondo que cambia con el **tipo de room** (no por zona específica). 17 categorías hardcoded + `default` (subterraneo, bosque, ciudad, pantano, mar_costa, etc.). El `roomCategorizer` clasifica por keywords sobre el nombre normalizado de la sala. Cobertura medida ~94% sobre `map-reinos.json`; los defaults restantes son ciudades específicas que el usuario puede asignar al pool `default` desde la UI.

**Pipeline**: `MapService.currentRoomChanged` → `categorizeRoom(room.n)` → `AmbientPlayer.setCategory(category)` (debounced 500 ms) → crossfade 1.5 s entre el sound viejo y el nuevo. Si la categoría no tiene wavs asignados → silencio. Si tiene varios → random al entrar (no round-robin, no resume del anterior).

**Reglas operativas no derivables del código:**
- **Distribución sin wavs**: la APK no bundlea wavs de ambient. Los aporta el usuario importando ZIP o cargándolos manualmente desde "Mis ambientes".
- **Background**: AppState `'background'` → fade-out + pause; `'active'` → reanuda con la categoría actual del mapa. NO sigue sonando con pantalla bloqueada (decisión de fricción con notificaciones).
- **Stop al desconectar** (`telnetService.disconnect`) y al perder sala identificada (`currentRoom === null`).
- **Refs ausentes**: si una `custom:{uuid}.wav` ya no existe en disco → log + saltar a la siguiente del array. Si todas faltan → silencio + log. La UI muestra `(falta) <filename>` en los slots.
- **Kill-switch**: el toggle propio (`ambientEnabled` 🎵 en TerminalScreen) es independiente del `silentModeEnabled` global, pero ambos silencian.
- **`effectsVolume`** (slider en Settings, debajo del toggle Música ambiente) afecta a TODOS los `play_sound` de triggers vía `SoundContext` en sus 3 rutas (custom centrado, custom panned con `react-native-sound`, builtin warmed). Default 0.7.
- **Loop gapless** depende del wav: deben venir cortados en zero-crossing con cola que continúa la cabeza, si no se oye click. Si un wav del usuario tiene click → es problema del wav, no del player.

**Settings**: `ambientEnabled` (bool, default true), `ambientVolume` (0..1, default 0.4), `effectsVolume` (0..1, default 0.7). Storage `aljhtar_ambient_mappings` con map por categoría → array de refs `custom:{uuid}.wav` (cap 4 por categoría, `MAX_SOUNDS_PER_CATEGORY` exportado para la UI).

**Archivos clave**: `src/services/roomCategorizer.ts`, `src/services/ambientPlayer.ts` (singleton), `src/storage/ambientStorage.ts`, `src/screens/MyAmbientsScreen.tsx`, `src/screens/ConfigBackupScreen.tsx`, toggle 🎵 en `TerminalScreen.tsx`.

**Import/export granular** (formato `torchzhyla-config-backup` v4, HECHO 2026-05-01). Pantalla `ConfigBackupScreen` accesible desde Settings con checkboxes para cada sección. Defaults: TODO marcado al abrir el modal — el usuario desmarca lo que no quiera.
- **Plantillas** (un checkbox por pack). Cada pack arrastra sus user vars referenciadas + sus sonidos custom.
- **Ambiente**: `ambientMappings` completos + sus sonidos asignados.
- **Personajes**: `ServerProfile[]` + por server su `buttonLayout` + `channelAliases` + `channelOrder`. **La contraseña NUNCA viaja en el ZIP** (stripped en `exportConfigToZip` antes de serializar). El usuario destino tendrá que reescribirla.
- **Settings de la app**: blob de `AppSettings` SIN gestos (esos van en su propio bloque desde v4). Sustituye los settings del destino preservando los gestos actuales del usuario que importa, salvo que también se marque "Atajos de gestos".
- **Atajos de gestos**: bloque `gestures` top-level con `gesturesEnabled` y el array `GestureConfig[]`. Bloque independiente desde v4 — antes viajaban dentro de settings sin granularidad.
- **Master "Todo"**: check derivado del estado de los sub-checks. Marcado solo cuando todos los sub-checks están marcados; al desmarcarlo desmarca todos los demás. Tras desmarcar un sub-check, "Todo" se desmarca automáticamente.

Reglas operativas:
- **El export solo bundlea wavs referenciados** por las secciones marcadas. Si exportas solo ambient sin packs, los wavs de los packs no van en el ZIP.
- **El import bundlea solo los wavs necesarios** para lo que el usuario marque (ahorra tiempo en ZIPs grandes con secciones no deseadas).
- **Servers en import: añadir duplicados** (sin merge por nombre/host). Si el usuario importa "Aljhtar" y ya tiene "Aljhtar", verá dos en la lista. Cada server importado recibe id fresco; layouts/aliases/order se reescriben con el id nuevo vía `serverIdMap`.
- **Ambient en import: merge por categoría** — las que vienen pisan, las ausentes se conservan.
- **Single-pack ZIPs (`pack.json` del export per-plantilla)** se aceptan en este flujo y se normalizan como un manifest de UN pack sin otras secciones. Compat hacia atrás con todos los ZIPs anteriores: lectura acepta tanto `torchzhyla-config-backup` como el legacy `torchzhyla-trigger-backup`.
- **Versiones**: v4 extrae `gestures` a campo top-level (settings ya no los lleva). v3 añade servers/layouts/channelAliases/channelOrder/settings. v2 añadió ambientMappings. v1 solo packs+sounds. Importar un v4 en una app más vieja falla con mensaje claro ("versión más reciente, actualiza la app"). Versiones más antiguas se siguen aceptando en lectura sin lógica especial: si un v3 traía gestos dentro de settings, al importar "Settings" en un app v4 esos gestos se descartan (los actuales del usuario se preservan).

**APIs** (`src/services/triggerPackExport.ts`):
- `exportConfigToZip({ packIds, includeAmbient, includeServers, includeSettings, includeGestures })`.
- `readImportManifest(zipUri)` → `ImportManifest` (qué contiene el ZIP, sin side-effects).
- `applyImport(manifest, selections)` → aplica solo lo seleccionado, devuelve resumen.
- Single-pack flow per-plantilla sigue intacto: `exportPackToZip(pack)` desde TriggersScreen.
