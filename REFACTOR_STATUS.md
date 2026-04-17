# Estado de Refactor Unificado de UI

## Ramas
- **Rama actual**: `refactor/unified-ui`
- **Rama principal**: Los dos modos existentes permanecen intactos

## Componentes Nuevos Creados

### 1. Tipos Extendidos (`src/types/index.ts`)
- `OrientationLayout`: Layout para una orientación
- `FloatingButton`: Botón flotante
- `UnifiedLayoutConfig`: Configuración para ambas orientaciones

### 2. Storage (`src/storage/orientationLayoutStorage.ts`)
- `loadOrientationLayout()`: Carga layout por orientación
- `saveOrientationLayout()`: Guarda layout por orientación
- Persistencia en AsyncStorage

### 3. Componentes Principales

#### `UnifiedTerminalLayout.tsx`
- Orquesta layouts vertical (60/40) y horizontal (60/40)
- Maneja teclado nativo con Animated.View (desplaza toda interfaz)
- Carga botones flotantes por orientación
- Ref a TerminalSection para auto-scroll

#### `TerminalSection.tsx` (forwardRef)
- FlatList con líneas del MUD
- Auto-scroll cuando llegan nuevas líneas
- Botón "Volver al final"
- MiniMap si visible
- Handle: `scrollToBottom()`

#### `ChatSection.tsx`
- ChannelTabs con canal "Todos"
- Mensajes filtrados por canal
- VitalBars integradas
- Input con auto-prefijo de alias
- Scroll independiente

#### `FloatingButtonsOverlay.tsx`
- Grid de botones por orientación
- Se superpone sobre TerminalSection
- No afecta scroll/interacción

## Cambios en Existentes
- `VitalBars.tsx`: nuevo prop `orientation`

## Commits
1. FASE 1-2: Tipos, storage, split screen
2. FASE 4: Terminal con auto-scroll
3. FASE 5: Botones flotantes

## Testing Pendiente
- Build y pruebas en emulador Android
- Verificar split 60/40, scrolls independientes, auto-scroll, teclado
