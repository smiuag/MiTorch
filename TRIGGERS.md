# TRIGGERS.md

Doctrina, modelo de datos y plan por fases del sistema de triggers. CLAUDE.md la referencia pero NO la carga — léela cuando crees triggers, toques `triggerEngine`, o trabajes en variables/prompt parsing.

## Sistema de Triggers (plan aprobado 2026-04-27)

Sistema declarativo de reglas que interceptan líneas entrantes del MUD y permiten silenciarlas (gag), modificarlas (replace, color), o disparar efectos (sonido, comando, notificación). Los triggers se organizan en **plantillas** (grupos) que se asignan a uno o varios servidores y se reutilizan entre ellos.

### Estado actual

**Implementado:** motor (`src/services/triggerEngine.ts`) + storage (`src/storage/triggerStorage.ts`) + 7 acciones (`gag`, `color`, `replace`, `play_sound`, `send`, `notify`, `floating`, `set_var`) + editor visual de patrones en cajas (`TriggerPatternBuilder`) con modo experto regex como escape hatch + editor de campos de acción (`TriggerActionTextBuilder`) + variables del sistema (Fase 3) + variables de usuario (Fase 5) + export/import ZIP per-pack y backup global (con sonidos incluidos) + reordenación con flechas ▲/▼ + auto-asignación a personajes nuevos.

**Pantallas:** `TriggersScreen` (lista), `TriggerEditorScreen` (contenido + asignación). Entrada: Settings → "Triggers".

**Sin plantillas seeded en código** (limpieza 2026-05-01): la APK ya no embebe `createSoundsPack`/`createCombatePack` ni los wavs `assets/sounds/`. El único origen de plantillas y sonidos es importar/exportar — el `torchzhyla-defaults.zip` (fuera de `aljhtar-store/`) trae Sonidos del MUD, Combate completo, Comunicaciones y Movimiento. Usuarios que tengan los packs seeded vivos en su disk los conservan, pero las refs `builtin:*` quedan mudas (el editor las muestra como `builtin:combate/critico.wav` raw); camino de recuperación: importar el ZIP.

**Reglas no derivables del código:**
- **Sonido kill-switch global**: el toggle "Usar sonidos" se gatea en `!silentModeEnabledRef.current` — `play_sound` respeta esto independientemente de qué pack lo dispare.
- **Notificaciones**: la acción `notify` solo dispara si el toggle global "Usar notificaciones" está ON Y la app NO está en primer plano. Si la app está activa, el usuario ya está mirando — la notificación sería ruido.
- **Order matters dentro del pack** — first-match-wins (en blocking) o acumula (en `blocking: false`). Triggers específicos primero, catchalls al final.
- **Tipo `[número]` en cajas = `(\d+)`** — solo dígitos enteros, RdL no usa decimales ni miles. Si surge otro MUD se evaluarán tipos `[número decimal]` o `[número con miles]` aparte; NO generalizar.
- **Lua/scripting descartado para v1.** Cubrir ~90% con declarativo es suficiente. Si aparece necesidad real de lógica condicional compleja, se evaluará `fengari`.

**Pendiente accesibilidad (~1h, alto impacto):** defaultear a modo experto cuando `uiMode === 'blind'` (cajas son visuales, regex en texto plano es navegable con TalkBack) y añadir resumen narrado del patrón debajo del editor.

**Notas de compat:** `play_sound.file` solo se reproduce con prefijo `custom:{uuid}.{ext}`. Refs sin ese prefijo (legacy `builtin:*` o paths bare) caen a silent no-op en runtime y se renderizan raw en el editor para que el usuario las identifique y reasigne. Sonidos custom se cargan on-demand sin caché para no inflar memoria.

### Decisiones de diseño aprobadas

- **Plantillas como grupos de triggers**: una plantilla contiene N triggers y se asigna entera a 1 o varios servidores. Para variaciones por servidor: duplicar la plantilla, modificar, asignar a otros. NO se asignan triggers individuales a servidores.
- **Primera regla gana** (no cascada): los triggers se evalúan en orden y la primera que matchea ejecuta TODAS sus acciones y para. Si quieres color + sonido + notify para el mismo evento, los pones como tres acciones del mismo trigger. Razón: predecibilidad, sobre todo cuando un server tiene varias plantillas asignadas que pueden solapar.
- **Tipos como UX, no constraints**: cuando el usuario crea un trigger elige un "tipo" (gag / color / sonido / notify / comando / replace / combo) que prefilla campos por defecto, pero después puede añadirle cualquier acción. El tipo es solo metadata para el wizard y el icono de la lista.
- **Variables curadas, no user-defined**: el sistema mantiene una lista cerrada de variables (vida, energía, etc.) que se actualizan automáticamente parseando el prompt del MUD. El usuario NO puede crear variables ni modificarlas; solo definir triggers que reaccionan cuando cambian. La lista exacta y el formato de prompt se cierran al empezar Fase 3.

### Modelo de datos

```typescript
type TriggerType = 'gag' | 'color' | 'sound' | 'notify' | 'command' | 'replace' | 'combo' | 'variable';

interface Trigger {
  id: string;
  name: string;
  type: TriggerType;             // solo UX; el motor mira `actions[]` y `source`
  enabled: boolean;
  source: TriggerSource;         // qué dispara la evaluación
  actions: TriggerAction[];      // qué hace cuando dispara
}

type TriggerSource =
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'variable'; name: string; condition: VariableCondition };  // Fase 3

type TriggerAction =
  | { type: 'gag' }
  | { type: 'replace'; with: string }                            // soporta $1, $2, $old, $new
  | { type: 'color'; fg?: string; bg?: string; bold?: boolean }
  | { type: 'play_sound'; file: string }                         // 'custom:{uuid}.wav'
  | { type: 'send'; command: string }
  | { type: 'notify'; message: string };

type VariableCondition =
  | { event: 'appears' }
  | { event: 'changes' }
  | { event: 'equals'; value: number | string }
  | { event: 'crosses_below'; value: number }                    // edge-triggered
  | { event: 'crosses_above'; value: number };                   // edge-triggered

interface TriggerPack {
  id: string;
  name: string;
  triggers: Trigger[];
  assignedServerIds: string[];
}
```

### Pipeline

```
Telnet → ansiParser → AnsiSpan[] → [TriggerEngine.process()] → MudLine → render
                                          ↓
                              gag → descartar línea (stop)
                              replace → mutar texto (stop)
                              color → mutar spans (stop)
                              play_sound / send / notify → side-effects (stop)
```

`triggerEngine.process(text, spans)` evalúa los triggers cargados (concatenados de todas las plantillas asignadas al server activo). Primera regex que matchea ejecuta sus acciones y devuelve. Si la acción incluye `gag`, devuelve `null` y la línea se descarta. Si no, devuelve la línea posiblemente mutada + lista de side-effects que el llamante (`TerminalScreen`) ejecuta.

### Plan por fases

Fases 1, 2, 4 y 5: implementadas. Detalle vive en git history y en el código. Lo único que sobrevive aquí: doctrina + variables + prompt canónico (Fase 3).

#### Fase 3 — Variables del sistema (HECHO 2026-04-28)

Triggers que reaccionan al estado del juego parseado del prompt del MUD. Implementación: `promptParser.ts`, `playerStatsService.ts` (con `prevValues` para edge-detection), `triggerEngine.evaluateVariableTriggers` (first-match-wins **por variable**, no global).

##### Variables expuestas al usuario

Nombres en castellano en la UI; mapeo a campos internos en inglés (en `playerStatsService`).

Numéricas (default `0`):
- `vida` → `playerHP`, `vida_max` → `playerMaxHP`, `vida_pct` (derivada)
- `energia` → `playerEnergy`, `energia_max` → `playerMaxEnergy`, `energia_pct` (derivada)
- `xp` → `playerXP`, `imagenes` → `playerImages`, `pieles` → `playerSkins`
- `inercia` → `playerInertia`, `astucia` → `playerAstuteness`
- `jugadores_sala` → `roomPlayers`, `carga` → `carry`
- `acciones_movimiento` → `actionsMovement`, `acciones_principales` → `actionsPrimary`, `acciones_secundarias` → `actionsSecondary`, `acciones_menores` → `actionsMinor`

Texto (default `""`):
- `salidas` → `roomExits`
- `enemigos` → `roomEnemies` (los que tú puedes matar)
- `aliados` → `roomAllies`
- `combatientes` → `roomCombatants` (los que pelean contigo)

Derivadas (no almacenadas, computan al consultar):
- `vida_pct`, `energia_pct`
- `en_combate` = `roomCombatants !== ""`
- `personaje` = `playerName` (rellenado desde `ServerProfile.username` al cambiar de server)

##### Prompt canónico TorchZhyla

```
prompt $lPv:$v\$V Pe:$g\$G Xp:$x Carga:$c$lSL:$s$lPL:$a$lNM:$k$lLD:$K$lJgd:$j$lImagenes:$e$lPieles:$p$lInercia:$n$lAstucia:$t$lAcc:$AM\$AP\$AS\$AZ$l
```

`prompt` y `promptcombate` son **idénticos**. Estado de combate se deriva de `en_combate`. Botón "Aplicar prompt TorchZhyla" en edición del server (manual, one-shot, requiere conexión abierta, confirmación previa). NO hay auto-aplicar al conectar — respeto a usuarios sin triggers.

`Imagenes:` SIN tilde en el canónico (optimización post-Fase 3 para quitar `stripAccents` del hot path). Si un personaje tiene aplicado el canónico viejo con tilde, deja de capturar `imagenes` hasta reaplicar.

##### Eventos de triggers de variable

| UI label | Internal | Significado |
|---|---|---|
| aparece | `appears` | Pasa de `0`/`""` a un valor real |
| cambia | `changes` | Cualquier cambio de valor |
| igual a | `equals` | Igual a X (case-sensitive) |
| baja de | `crosses_below` | Estaba ≥N, ahora <N (edge-triggered) |
| sube de | `crosses_above` | Estaba ≤N, ahora >N (edge-triggered) |

Templates de acciones soportan `$old` / `$new` (no `$1` — esos son solo para regex triggers).

##### Doctrina "canónico o nada"

El prompt parser asume el formato canónico para fast-path: dispatch directo por leading token, regex por campo sin lookahead/alternación, primera línea (`Pv:X/Y Pe:X/Y Xp:N Carga:N`) en una sola regex de 6 capturas. Si el usuario tiene un prompt custom, las capturas best-effort siguen siendo posibles para los campos que coincidan con el formato esperado, pero el flujo está optimizado para el canónico.

Otras reglas operativas:
- Detección de "esto es prompt" anclada a `^` con tokens conocidos. Mensaje en canal con `Pv:50/100` en medio NO se gaguea.
- Triggers de regex NO se evalúan sobre líneas de prompt (son metadata, no contenido del juego). Sí se gaguean siempre (terminal limpio).
- Si NO hay triggers de variable activos, el parser solo hace `isPromptLine` (regex.test) para gaguear; NO ejecuta `parsePromptUpdates` ni evaluación.

##### Lección de optimización (2026-04-29)

Tras un día puliendo el `promptParser` por un retraso percibido de 3-4 s en bursts, el cuello real estaba en otro lado: cada `onData` del TCP llegaba con UNA línea (no batch como asumía `addMultipleLines`), cada línea disparaba un `setLines` y un re-render síncrono del FlatList de 80-130 ms. Para 30 líneas eran 3 s de UI lag — no el parser. Fix: `scheduleLinesFlush()` con `requestAnimationFrame` que coalesce múltiples llamadas en un único render por frame.

**Lección**: antes de optimizar un sub-sistema sospechoso, **medir** con `performance.now()`. El "batch" del productor (TCP) puede no ser real — el coalescing tiene que venir del consumidor (RAF/microtask/timer).

#### Fase 5 — Variables de usuario (HECHO 2026-04-29)

Variables de "memoria" que el usuario crea desde "Mis variables" (Settings → Mis variables) y referencia en triggers como `${nombre}`. Cierra la brecha "triggers reactivos sin estado" → "con estado persistente entre disparos".

**Reglas operativas no derivables del código:**
- **Sintaxis con llaves siempre** (`${nombre}`) para distinguir de `$1`/`$old`/`$new`. Variable no declarada o sin valor → expande a `""` (fail-quiet).
- **Persistencia two-layer**: declaraciones persisten en AsyncStorage por server (`aljhtar_user_vars_{serverId}`); valores son memoria-only. Restart de app: declaraciones sobreviven, valores se vacían.
- **Solo se crean desde "Mis variables"** — el editor de triggers tiene picker pero NO crea inline. Razón: una iteración previa con auto-creación perezosa fue confusa y poco descubrible.
- **Bootstrap automático**: al cargar un server o al importar un pack, se recolectan refs de user-vars y se auto-declaran las que falten. Cubre packs migrados de modelos antiguos y packs importados.
- **Reservados**: nombres de `VARIABLE_SPECS` (vida, energia, etc.). Bloqueado al crear.
- **Loop protection**: cascadas user-var → user-var con depth-cap 3 (después se corta y `console.warn`).

**Pantalla "Mis variables"**: lista con valor actual + "Usada en N triggers" expansible que navega al editor del trigger via `autoOpenTriggerId`. Botón "Resetear" vacía solo VALORES, no declaraciones. Borrado individual deja refs colgando (expand a `""`).

**No bundleado**: ningún pack seeded usa `set_var` por ahora.

**Limitaciones deliberadas (fuera de scope v1):** aritmética en templates (`${count} + 1`), if-then-else, loops/timers (excepto `delay` planificado en Fase 6.4).

#### Fase 6 — Expansión hacia suite blind (planificada 2026-04-29)

Conjunto de extensiones del motor que abren la puerta a un pack tipo "Suite Blind RdL" (estilo Rhomdur) cubriendo ~85% de su funcionalidad sin meter scripting Lua. Se pueden abordar de forma independiente — cada sub-fase es un cambio acotado. Orden sugerido por coste/beneficio (más barato y útil primero).

**Doctrina general**:
- Todo es opt-in. Nada cambia el comportamiento por defecto de packs existentes.
- Filosofía "asistencia, no automatización": estas features mejoran feedback acústico/visual y reducen fricción de input, pero NO añaden auto-actions tipo auto-attack o auto-heal. La línea ToS de los MUDs se respeta — el usuario sigue tomando todas las decisiones. Ver "Validación pre-comando" más abajo: solo bloquea casos donde el cliente SABE que el comando va a fallar; no clasifica ni decide acciones.
- Compatibilidad: los packs sin uso de estas features siguen funcionando idéntico.

##### 6.1 — Múltiples paneles en blind mode (~3-4h)

**Hoy**: blind mode tiene 2 paneles fijos (`Panel 1` / `Panel 2`) y un botón switch que alterna. `LayoutButton.blindPanel` es `1 | 2`.

**Cambio**: paneles ilimitados con nombre. El switch cicla `1 → 2 → ... → N → 1`.

Reemplaza el concepto de `ModoJ` (Combate / XP / Idle) de los scripts blind: en vez de un modo global invisible que cambia el comportamiento de cada tecla, tienes paneles distintos con botones-comando concretos por modo. Ventajas:
- Estado visible (TalkBack anuncia "Modo Combate" al cambiar).
- Cero lógica condicional en los comandos.
- Más botones disponibles en total (paneles ilimitados, hoy tope = 2).
- Fácil de descubrir.

**Implementación**:
- `LayoutButton.blindPanel`: pasar de `1 | 2` a `number` (entero positivo). Compatible hacia atrás — los 1/2 actuales siguen funcionando.
- Nuevo storage: `aljhtar_blind_panels_{serverId}` (per-server, igual que el resto del layout) con array `{ id: number; name: string }[]`. Default `[{id:1, name:'Panel 1'}, {id:2, name:'Panel 2'}]`.
- `BlindModePanelSwitch` botón actualiza para ciclar y para anunciar el nombre del panel destino con `AccessibilityInfo.announceForAccessibility(panel.name)`.
- Settings → "Layout blind": pantalla nueva con lista de paneles, botones "+ Añadir panel", "✏ Renombrar", "✕ Borrar" (con warning si tiene botones), reordenar con flechas ▲/▼.
- `ButtonEditModal` añade dropdown "Panel" con la lista actualizada.

**Decisiones pendientes**:
- Per-server vs global: hoy los layouts de botones (incluido blind) son **per-server** (clave `buttonLayout_{serverId}`). La definición de paneles (qué paneles existen y cómo se llaman) podría ser global o per-server. Recomendación: hacerla **per-server** para consistencia con el layout que ya lo es. Si surge demanda de "modos compartidos entre personajes", se replantea.
- Default: ¿1 panel o 2? Mantener 2 para no sorprender a usuarios actuales.

**Limitación**: solo cubre el caso "modo de botones" del `ModoJ` del CMUD. Los modos de output (`ModoE`, `ModoS`, `ModoMono`, `ModoAmbientacion`) no se modelan con paneles — son toggles globales aparte (varios ya existen).

##### 6.2 — Expansión de `${var}` en comandos de botones (~30 min)

> **2026-04-29:** ampliado a "tipos de botón + variables" (Comando / Aviso con dropdown). Plan ejecutable detallado en el bloque "Plan en preparación — Tipos de botón + variables (sub-fase 6.2)" abajo. La descripción que sigue se mantiene como referencia del scope original mínimo.

**Hoy**: los botones del `ButtonGrid` mandan `button.command` literal vía `telnetRef.current.send(...)`.

**Cambio**: pasar el comando por un `expandUserVars()` antes del send. Resuelve solo `${name}` desde `userVariablesService.get(name)` (no `$1`, no `$old/$new` — esos solo aplican en contexto de trigger).

**Implementación**:
- Nueva función `expandUserVars(template: string): string` en `src/utils/expandUserVars.ts` (o reutilizar la del engine si extraemos).
- `TerminalScreen` ButtonGrid handler envuelve `send(button.command)` → `send(expandUserVars(button.command))`. Mismo para `secondaryCommand` en blind.
- UI: el `ButtonEditModal` ya acepta cualquier string; el campo `command` puede contener `${nombre}` y se documenta en hint.

**Caso de uso**:
- Botón "Volver" con comando `${direccion_opuesta}`. Un trigger captura cada movimiento exitoso y mantiene `direccion_opuesta` actualizada. El botón reproduce la opuesta.
- Botón "Atacar objetivo" con `atacar ${objetivo}`.
- Botón "Curar a líder" con `curar ${grupo_lider}`.

**Validación pre-comando opcional** (~15 min adicional, toggle en Settings):
- Si `validateBeforeSend` está activo: tras expandir, si el resultado contiene una secuencia tipo `verbo $vacío` (variable resolvió a "") → no mandar, reproducir sonido de error.
- Si el comando es una sola dirección (`n`, `s`, `e`, `o`, `ne`, etc.) y no está en `${salidas}` → no mandar, reproducir sonido de error.
- Mantener el toggle por separado del feature básico de expansión. Empezar con expansión sola; añadir validación si se demanda.

##### 6.3 — Pan estéreo en `play_sound` (~1-1.5h)

**Hoy**: la acción `play_sound` reproduce centrado.

**Cambio**: campo opcional `pan: number` (rango -1 a +1, donde -1 es izquierda total, +1 derecha total, 0 centro). En blind mode el paneo direccional es esencial — los scripts blind lo usan masivamente para indicar de dónde viene un ataque, dónde está un aliado/enemigo, etc.

**Implementación**:
- Tipo: `{ type: 'play_sound'; file: string; pan?: number }`.
- `SoundContext.playSound` acepta segundo argumento `pan?: number`. Tras `sound.playAsync()`, si pan != 0, llamar `sound.setStatusAsync({ panValue: pan })` (expo-av API). Verificar que la versión actual de expo-av soporta panning — si no, usar sondeo nativo.
- Engine `applyAction` para `play_sound` pasa el pan al `playSoundRef.current`.
- UI en `TriggerEditModal`: dropdown bajo "Reproducir sonido" con opciones predefinidas (`Centro`, `Izquierda suave`, `Izquierda fuerte`, `Derecha suave`, `Derecha fuerte`) que mapean a -1, -0.5, 0, +0.5, +1. O slider numérico para usuarios avanzados.

**Caso de uso**:
- Trigger "alguien llega del este" → play_sound con pan +0.7. Suena a la derecha.
- Trigger "vida del enemigo al 30%" → pan -0.5 (los enemigos a la izquierda por convención del sistema blind).

**Limitación de RN/expo-av**: si la versión actual no soporta paneo, requiere upgrade de la librería. Verificar antes de empezar.

##### 6.4 — Acción `delay` (timer programado) (~1-1.5h)

**Hoy**: las acciones se ejecutan inmediatamente al disparar el trigger.

**Cambio**: nueva acción `delay` que pospone otra acción N segundos. Modela los **bloqueos temporizados** del sistema blind (ej.: tras `saltoheroico`, alarma a los 25s con sonido "se libera el bloqueo"; tras `esgrimir`, 55s; etc.).

**Implementación**:
- Tipo: `{ type: 'delay'; seconds: number; then: TriggerAction[] }`. La acción anidada es lo que se ejecuta al expirar el temporizador.
- Engine: nuevo Map `pendingTimers: Map<symbol, NodeJS.Timeout>` (o ref). Al disparar `delay`, `setTimeout(() => applyActions(action.then), seconds * 1000)`. Guardar el timer para poder cancelar en `clear()` o cambio de server.
- UI en `TriggerEditModal`: nueva acción "Esperar y luego..." con campo numérico de segundos + sub-editor para una acción anidada.
- Limitar la profundidad: solo un nivel de anidación (no permitir `delay` dentro de `delay` para evitar abuso). Los packs que necesiten más complejidad usan otro trigger.

**Cleanup**:
- Al desconectar / cambiar server / cargar nuevos triggers: cancelar todos los timers pendientes.
- Considerar persistencia: ¿sobreviven los timers a una recarga de Metro? No — se pierden (memoria-only). Aceptable.

**Caso de uso típico**:
- Trigger detecta que ejecutas `saltoheroico` → acción `delay 25s` con sub-acción `floating "saltoheroico se libera"` + sonido.
- Trigger detecta que se cumplió un buff → `delay 60s` para avisar de re-aplicar.

##### 6.5 — Modo experto de sonidos / gag selectivo (~2-3h)

**Hoy**: los triggers tienen `enabled: true/false` global, sin condicionalidad por modo del usuario.

**Cambio**: añadir setting global `expertModeEnabled: boolean` (toggle en Settings) y campo opcional `activeMode?: 'all' | 'expert' | 'normal'` por trigger (default `'all'`). El motor evalúa solo triggers cuyo `activeMode` matchee el modo actual.

**Implementación**:
- `Trigger.activeMode?: 'all' | 'expert' | 'normal'` — opcional, default `'all'`.
- `triggerEngine.setActiveTriggers` filtra al compilar: descarta los que no aplican al modo activo. Cambiar el toggle dispara `setActiveTriggers` again.
- Settings añade toggle "Modo experto: anunciar solo lo esencial".
- UI en `TriggerEditModal`: dropdown "Activo en: Siempre / Solo modo experto / Solo modo normal".

**Caso de uso**:
- Triggers de combate verboso (kills, esquivas, paradas) marcados "Solo modo normal". En experto se gaguean — el usuario asume que sabe lo que está pasando.
- Triggers de eventos críticos (muerte propia, vida baja) marcados "Siempre".
- Triggers experimentales del usuario marcados "Solo modo experto" — los activa cuando quiere ver verbose.

**Decisión cerrada**: campo único `activeMode` con tres valores en vez de dos campos booleanos. Más simple para el wizard.

**Coste**: el filtro en `setActiveTriggers` es trivial. La UI suma una línea en el editor. El "drama" es propagar el toggle global y forzar reload — usar el patrón de `settingsModalVisible` en TerminalScreen useEffect.

##### Lo que TODAVÍA NO cubre Fase 6

Para llegar al 100% del sistema blind necesitaríamos features que se han descartado conscientemente o son de alcance grande:

- **Gag global de líneas no esenciales (whitelist en lugar de blacklist)**: el `ModoE` de Rhomdur gaguea TODO excepto los anuncios que el script verbaliza. TorchZhyla solo permite blacklist (gag explícito por trigger). Modelar whitelist requiere otro paradigma — un toggle "silenciar todo lo no marcado" + flag `silentDefault: true` por línea. Significativo refactor del pipeline. NO Fase 6.
- **Sonidos en bucle con stop dinámico** (`#PlayLoop` + stop al cambiar estado): la alerta de vida al 30% que suena hasta recuperarte. Hoy `play_sound` es one-shot. Requiere acción `play_loop` + tracking de handles + acción `stop_sound`. Mid effort. Considerar para Fase 7 si surge.
- **Math en `set_var`**: contadores tipo `set_var muertes = ${muertes} + 1` no se evalúan — quedan como string literal. Necesita evaluador básico de expresiones. Out of scope sin un mini-DSL.
- **Listas dinámicas de strings** (NickX, RemitentesLista): user vars son strings simples. Para tener arrays hace falta tipo nuevo + acciones `push_to_list` / `clear_list` / `is_in_list`. Out of scope.
- **Macros condicionales en `command`** (botón con if/else según modo o estado): requeriría DSL en el campo command. Los paneles de Fase 6.1 cubren el 80% del caso de uso.
- **Auto-walks / paths**: secuencias temporizadas hardcoded por destino. Descartado por filosofía (cliente de accesibilidad, no de macroing).
- **Sonidos de ambientación dinámicos por sala/momento del día**: requiere mapper sala → sonido + concepto de momento. Fuera de scope.
- **Funciones reusables tipo correctores** (`FuncCorrectorPlayers`): cada trigger se escribe independiente. Sin sistema de funciones globales por filosofía declarativa.
- **Aliases redefinidos** (los `n`/`s`/`e` redefinidos durante un walk): no hay concepto de alias dinámico.

Si en el futuro se reactiva la pregunta "¿meter Lua/scripting?" estos serían los argumentos a favor. Por ahora la respuesta sigue siendo no.

##### Plan de ataque sugerido

Por orden de coste/beneficio. Cada sub-fase es independiente — se puede hacer la 6.2 sin la 6.1, etc.

1. **6.2 (`${var}` en botones)** — ~30 min. Más barata, desbloquea el caso "volver" inmediatamente. Tirar primero como prueba de concepto del frente "comandos de botones más inteligentes".
2. **6.1 (múltiples paneles)** — ~3-4h. Cambia el modelo mental del blind mode hacia algo más limpio. Bueno para hacer antes de meter más complejidad en triggers.
3. **6.3 (pan estéreo)** — ~1-1.5h. Verificar primero si expo-av actual lo soporta. Si sí, gana mucha UX en blind.
4. **6.4 (delay)** — ~1-1.5h. Habilita los bloqueos temporizados que son comunes en RdL.
5. **6.5 (modo experto)** — ~2-3h. La más subjetiva — depende de si en uso real surge la necesidad.

Total Fase 6 completa: ~8-12h de trabajo. Dependiendo de qué se aborde, el pack de "Suite Blind" puede tener diferentes niveles de cobertura.

#### Sub-fase 6.2 — Tipos de botón + variables (HECHO 2026-04-30)

`LayoutButton.kind?: 'command' | 'floating'` (undefined ≡ `'command'`). Comando manda al MUD; floating muestra mensaje local con `pushFloating` (anunciado por TalkBack si activo). Mismo campo `command` para el payload de ambos tipos.

`expandVars(template)` resuelve `${name}` contra system vars (`VARIABLE_SPECS`) primero, user vars después; inexistente → `""`. Aplicado en `sendCommand` antes de los intercepts y en el handler de botones floating.

Seed default `createBlindModeLayout`: VID/ENE/XP/Salidas pasan a `kind: 'floating'` con templates `${vida}/${vida_max}` etc.; Daño y Enemigo borrados. Layouts ya guardados de usuarios NO se tocan — la migración ignora `kind`.

Borrados los 6 intercepts hardcoded en `sendCommand` (consultar vida/energia/salidas, xp, ultimo daño, enemigos) — los botones VID/ENE/XP/Salidas ya no necesitan intercept; muestran floating directo sin pasar por `sendCommand`.

**Lo que desbloquea**: `set_var` como tercer tipo es trivial de añadir si surge caso real (combate, marcar objetivo); no implementado.

#### Combate básico Panel 2 (blind mode) — pendiente

Llenar el Panel 2 del blind mode con botones de combate genérico (sin habilidades de clase). Necesita pack "Combate genérico" seeded con captura de heridas y último remitente, y user vars `objetivo`/`heridas`/`ultimo_remitente`. Sin diseño cerrado todavía — esperar a que el pack Movimiento esté validado en uso real.

### Doctrinas de la sesión 2026-04-30

**Política de distribución de plantillas y sonidos**:
- La APK se distribuye **limpia de plantillas y sonidos por defecto** — ningún `play_sound` con derechos de terceros, ningún pack seeded de un addon ajeno.
- Plantillas por defecto (Sonidos del MUD, Combate completo, Comunicaciones, Movimiento) van en `torchzhyla-defaults.zip` (raíz del repo TorchZhyla, fuera de `aljhtar-store/`), formato `torchzhyla-config-backup`. El usuario lo importa con Configuración → Importar.
- Razón: los wavs originales son de Rhomdur (addon CMUD blind/RL). No los redistribuimos en la APK.
- **Limpieza ejecutada 2026-05-01**: borrados `createSoundsPack`/`createCombatePack`, `enableSoundsPackForBlindMode`/`enableCombatePackForBlindMode`/`enablePackForBlindMode`, const `AVAILABLE_SOUNDS`, las 30 entradas builtin del cache de `SoundContext`, `assets/sounds/`, sección `sounds` de `blindModeFilters.json`, pestaña Built-in del sound picker. Usuarios con packs seeded vivos del APK anterior los conservan en disk pero las refs `builtin:*` quedan mudas — camino: importar el ZIP. AsyncStorage keys huérfanas `aljhtar_trigger_packs_sounds_seeded`/`...combate_seeded` quedan inocuas en disk de esos usuarios; no se ejecuta migración para borrarlas.
- Generar el ZIP con script Node + `jszip` (misma lib que la app). PowerShell `Compress-Archive` NO sirve — escribe paths con `\` que rompen el importador (jszip valida `/`).
- Push al móvil: `adb push C:\proyectos\Claude\TorchZhyla\torchzhyla-defaults.zip /sdcard/Download/`.

**`${personaje}` en regex (sustitución de nivel 2)**: `triggerEngine.setActiveTriggers` pre-procesa el pattern antes de compilar. Si encuentra `${personaje}` literal, lo sustituye por el nombre regex-escapado. Si no hay nick → sustituye por `(?!)` (nunca matchea). Recompile al cambiar de server. Desbloquea triggers tipo "menciónan tu nombre".

**Triggers `blocking: false`**: undefined ≡ true ≡ first-match-wins clásico (cadena cortada). Cuando `blocking === false`, el trigger dispara solo side-effects (`play_sound`/`send`/`notify`/`floating`/`set_var`) y el bucle CONTINÚA evaluando. Las mutaciones (`gag`/`replace`/`color`) se ignoran silenciosamente en no-bloqueantes (varias compitiendo por mutar lleva a display indefinido). Side-effects se acumulan; sonidos se superponen porque `playSound` crea instancias separadas de `Audio.Sound`.

**Cola de lectura para TalkBack** (`speechQueueService`): cada `AccessibilityInfo.announceForAccessibility` interrumpe al anterior — TalkBack no encola, atropella. Por eso TODO mensaje hablado pasa por la cola FIFO con timer `Math.max(800, len * charDurationMs)` ms. Cap 10 mensajes; `enqueue` es no-op si no hay screen reader. Setting `speechCharDurationMs` (default 20, rango 5-150) en "Velocidad de lectura".

**Captura de canales por texto plano**: con `consentir accesibilidad on` el MUD silencia pushes GMCP `Comm.Canales`. Fallback: state machine en `TerminalScreen` que se arma cuando el usuario teclea `canales`, detecta header `^Tus canales son:?$`, parsea líneas siguientes y rellena el modal de canales. Timeout 5s. NO captura mensajes en tiempo real (eso sigue siendo solo GMCP). Sigue habiendo logs `[CH_CAP]` temporales en producción — quitar cuando esté estable.

**Auto-asignación a personajes nuevos** (`TriggerPack.autoAssignToNew?: boolean`, undefined ≡ true): al crear o duplicar personaje, los packs con este flag añaden el nuevo serverId a `assignedServerIds`. Toggle en TriggerEditor "Auto-asignar a nuevos personajes" (default ON). En import: alert ofrece "¿Asignar a tus N personajes?" Sí/No.

**Naming "personaje" en UI**: rename UI-only de "Servidor" → "Personaje" (header de ServerListScreen, asignación en Triggers, etc.). Mantenidos como técnicos: "Host/Puerto del servidor", "Conectando al servidor", filtros de logs HTML, identificadores en código (`ServerProfile`, `serverId`, `loadServers`), tags `[server-key]` en `logService` (compat con backups). CLAUDE.md sigue usando "server" en docs internas.

**Schema final añadido (`src/types/index.ts`):**
```typescript
interface Trigger { blocking?: boolean; /* undefined ≡ true */ }
interface TriggerPack { autoAssignToNew?: boolean; /* undefined ≡ true */ }
interface PlayerVariables { playerName: string; /* desde ServerProfile.username */ }
interface AppSettings { speechCharDurationMs: number; /* default 20 */ }
```

### Decisiones pendientes

- **Orden entre plantillas** cuando un server tiene varias asignadas. Default actual: alfabético por nombre de plantilla. Reordenación manual entre plantillas se difiere a Fase 4 si hace falta. (La reordenación **dentro** de una plantilla ya está implementada con flechas ▲/▼.)

(Las decisiones de Fase 3 — lista de variables, formato de prompt, semántica de eventos, UX de "Aplicar prompt" — se cerraron el 2026-04-28, ver sección "Fase 3" arriba.)
