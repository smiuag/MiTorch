import { Vibration } from 'react-native';
import { speechQueue } from '../services/speechQueueService';

// Helper de self-voicing para botones (modo blind con TalkBack apagado).
// Modelo TalkBack-style:
//   - Tap en botón SIN foco → mueve el foco a ese botón y anuncia su label.
//     No ejecuta.
//   - Tap en botón CON foco → ejecuta. El foco se mantiene (otra
//     ejecución requiere otro tap).
//   - Doble-tap rápido sobre un botón = primer tap pone foco + segundo tap
//     ejecuta (cae en el caso anterior). Funciona aunque antes el foco
//     estuviera en otro botón.
//   - `setFocusFromHover(key, label)`: mover el foco programáticamente
//     desde drag-explore (parent View detecta qué botón hay bajo el dedo
//     mientras arrastras). Anuncia el label si el foco cambia.
//
// Sin `selfVoicingActive`, `tap()` ejecuta directo — la API es la misma para
// todos los callers, la lógica de foco solo aplica en blind+self-voicing.

type FocusListener = (key: string | null) => void;

class SelfVoicingPressTracker {
  // Botón con foco actual (null = ningún botón). El foco persiste entre
  // toques: tap en otro botón lo mueve, tap en el mismo lo ejecuta. No hay
  // expiración por tiempo (a diferencia del modelo doble-tap original).
  private focusedKey: string | null = null;
  // Listeners para que componentes (p.ej. ButtonCell) se re-rendericen al
  // cambiar el foco y puedan dibujar un borde amarillo en el botón con foco.
  private listeners = new Set<FocusListener>();

  private setFocus(next: string | null): void {
    if (this.focusedKey === next) return;
    this.focusedKey = next;
    this.listeners.forEach((l) => l(next));
  }

  subscribe(listener: FocusListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  tap(active: boolean, key: string, label: string, onPress: () => void): void {
    if (!active) {
      onPress();
      return;
    }
    if (this.focusedKey === key) {
      // Botón ya estaba con foco → activar. Foco se queda donde está.
      onPress();
    } else {
      // Nuevo foco. Anuncia y descarta cualquier activación pendiente.
      this.setFocus(key);
      speechQueue.enqueue(label, 'high');
    }
  }

  /**
   * Mover el foco desde drag-explore (parent View captura touchmove y
   * encuentra el botón bajo el dedo). Si el foco cambia, se anuncia el
   * label nuevo. Si es el mismo botón, no hace nada (evita re-anuncios
   * de spam mientras el dedo se mueve dentro del mismo rect).
   */
  setFocusFromHover(key: string, label: string): void {
    if (this.focusedKey === key) return;
    this.setFocus(key);
    speechQueue.enqueue(label, 'high');
  }

  getFocusedKey(): string | null {
    return this.focusedKey;
  }

  clearFocus(): void {
    this.setFocus(null);
  }
}

export const selfVoicingPress = new SelfVoicingPressTracker();

// Registro global de botones con sus rects en coordenadas de pantalla, para
// que el drag-explore (parent.onTouchMove) pueda encontrar qué botón hay
// bajo el dedo sin recorrer el árbol de Views.
//
// Cada botón se registra en su `onLayout` midiendo con `measureInWindow`
// (coordenadas absolutas de pantalla, las mismas que `evt.nativeEvent.pageX/Y`).
// Se desregistra al desmontar o cuando deja de ser visible.

interface ButtonRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  onLongPress?: () => void;
  scope: string;
  sequential: boolean;
  // Modelo BlindNav (audiogame-style, gestos globales de pantalla):
  // onActivate se invoca al "tap" del BlindGestureContainer cuando este
  // item tiene el foco; onAdjust se invoca al swipe horizontal en el
  // mismo caso. Si onAdjust es undefined, el row dirá "No ajustable" al
  // intentar ajustarlo. Si onActivate es undefined, el row es informativo
  // (anuncia su label al recibir foco pero el tap no hace nada).
  onActivate?: () => void;
  onAdjust?: (direction: 'inc' | 'dec') => void;
}

const DEFAULT_SCOPE = 'default';

class ButtonRegistry {
  private buttons = new Map<string, ButtonRect>();
  // Solo los botones cuyo `scope` coincida con `activeScope` son visibles
  // para `findAtPoint`. Esto permite que cuando un modal abra (p. ej.
  // ButtonEditModal con scope='editButton'), los botones del Terminal
  // (scope='default') queden ocultos al drag-explore aunque sus rects
  // sigan registrados — los del modal son los únicos navegables. Cuando
  // el modal cierra restablece a 'default'.
  private activeScope: string = DEFAULT_SCOPE;

  setActiveScope(scope: string): void {
    this.activeScope = scope;
  }

  getActiveScope(): string {
    return this.activeScope;
  }

  register(
    key: string,
    rect: { x: number; y: number; w: number; h: number },
    label: string,
    onLongPress?: () => void,
    scope: string = DEFAULT_SCOPE,
    sequential: boolean = true,
  ): void {
    // El caller pasa una key única (responsabilidad suya — incluir el
    // scope como prefijo, p.ej. `editButton:save`). Aquí simplemente
    // guardamos asociando el scope para filtrado. Las acciones BlindNav
    // (onActivate/onAdjust) se asignan aparte vía setActions porque no
    // todos los registradores las conocen (SelfVoicingTouchable suele tener
    // solo onPress en el callsite original).
    const prev = this.buttons.get(key);
    this.buttons.set(key, {
      ...rect,
      label,
      onLongPress,
      scope,
      sequential,
      onActivate: prev?.onActivate,
      onAdjust: prev?.onAdjust,
    });
  }

  setActions(key: string, actions: { onActivate?: () => void; onAdjust?: (dir: 'inc' | 'dec') => void }): void {
    const entry = this.buttons.get(key);
    if (!entry) {
      // Aún no registrado (orden de useEffect). Lo guardamos parcial; el
      // próximo register conservará estos callbacks gracias al merge.
      this.buttons.set(key, {
        x: 0, y: 0, w: 0, h: 0, label: '', scope: DEFAULT_SCOPE, sequential: true,
        ...actions,
      });
      return;
    }
    entry.onActivate = actions.onActivate;
    entry.onAdjust = actions.onAdjust;
  }

  getEntry(key: string): ButtonRect | undefined {
    return this.buttons.get(key);
  }

  unregister(key: string): void {
    this.buttons.delete(key);
  }

  /**
   * Encuentra el botón cuyo rect contiene el punto (x, y) en el scope
   * activo. Botones de otros scopes (= no visibles en este momento) se
   * ignoran. Si varios rects contienen el punto (caso típico: row que
   * envuelve a un botón interno), devuelve el de menor área — el más
   * específico, que es lo que el usuario espera al tocar concretamente
   * un sub-control. Devuelve null si el dedo está en zona vacía.
   */
  findAtPoint(x: number, y: number): { key: string; label: string; onLongPress?: () => void } | null {
    let best: { key: string; label: string; onLongPress?: () => void } | null = null;
    let bestArea = Infinity;
    for (const [key, b] of this.buttons) {
      if (b.scope !== this.activeScope) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        const area = b.w * b.h;
        if (area < bestArea) {
          best = { key, label: b.label, onLongPress: b.onLongPress };
          bestArea = area;
        }
      }
    }
    return best;
  }

  /**
   * Navegación secuencial estilo TalkBack: orden visual top-to-bottom,
   * left-to-right (rows que están en la misma altura aproximada se ordenan
   * por X). Devuelve el siguiente/anterior elemento del scope activo
   * partiendo de currentKey (o el primero/último si currentKey es null).
   * Wrap circular: el siguiente del último vuelve al primero.
   */
  findNext(currentKey: string | null): { key: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null {
    return this.findRelative(currentKey, 1);
  }

  findPrev(currentKey: string | null): { key: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null {
    return this.findRelative(currentKey, -1);
  }

  private findRelative(currentKey: string | null, dir: 1 | -1) {
    const items = Array.from(this.buttons.entries())
      .filter(([_, b]) => b.scope === this.activeScope && b.sequential)
      .sort(([_a, a], [_b, b]) => {
        // Tolerancia de 8px en Y para considerar "misma fila".
        if (Math.abs(a.y - b.y) < 8) return a.x - b.x;
        return a.y - b.y;
      });
    if (items.length === 0) return null;
    const idx = currentKey ? items.findIndex(([k]) => k === currentKey) : -1;
    let nextIdx: number;
    if (idx === -1) {
      nextIdx = dir === 1 ? 0 : items.length - 1;
    } else {
      nextIdx = (idx + dir + items.length) % items.length;
    }
    const [key, b] = items[nextIdx];
    return { key, label: b.label, rect: { x: b.x, y: b.y, w: b.w, h: b.h } };
  }
}

export const buttonRegistry = new ButtonRegistry();

// Bus de eventos para que cuando un ScrollView scrolle (cambian los pageY de
// sus hijos), todos los SelfVoicingRow/Touchable visibles re-midan su rect
// y actualicen el registry. Sin esto, drag-explore y navegación secuencial
// usarían coordenadas obsoletas tras cada scroll.
type SimpleListener = () => void;
class RemeasureBus {
  private listeners = new Set<SimpleListener>();
  subscribe(l: SimpleListener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  emit() { this.listeners.forEach(l => l()); }
}
export const remeasureBus = new RemeasureBus();

// Controller de navegación blind (modelo audiogame, no TalkBack):
//   - El usuario ciego total no necesita apuntar a ningún sitio concreto.
//   - tap = activar el item con foco (no enfocar).
//   - swipe vertical = next/prev item.
//   - swipe horizontal = ajustar valor del item (si lo soporta).
//   - long-press = repetir el anuncio actual.
//   - Vibración + voz en cada cambio de foco para confirmación táctil.
//
// El ítem activo se identifica por una `key` registrada en `buttonRegistry`.
// Cada pantalla blind monta un `BlindGestureContainer` que llama a estos
// métodos según el gesto. Al entrar a la pantalla, llamar `enter(welcome)`
// para anunciar contexto y enfocar el primer ítem; al salir `exit()`.

class BlindNavController {
  private currentKey: string | null = null;

  getCurrentKey(): string | null { return this.currentKey; }

  /**
   * Entrar a una pantalla blind. Anuncia el mensaje de bienvenida y, tras
   * un pequeño delay para dejar que los SelfVoicingRow se midan, enfoca
   * el primer ítem en orden visual.
   */
  enter(welcomeMessage: string): void {
    Vibration.vibrate(50);
    speechQueue.enqueue(welcomeMessage, 'high');
    setTimeout(() => this.first(), 500);
  }

  exit(): void {
    this.currentKey = null;
  }

  private setFocusByKey(key: string | null): void {
    if (key === this.currentKey) return;
    this.currentKey = key;
    if (!key) return;
    const entry = buttonRegistry.getEntry(key);
    if (entry) {
      Vibration.vibrate(20);
      speechQueue.enqueue(entry.label, 'high');
    }
  }

  next(): void {
    const item = buttonRegistry.findNext(this.currentKey);
    if (item) this.setFocusByKey(item.key);
  }

  prev(): void {
    const item = buttonRegistry.findPrev(this.currentKey);
    if (item) this.setFocusByKey(item.key);
  }

  first(): void {
    const item = buttonRegistry.findNext(null);
    if (item) this.setFocusByKey(item.key);
  }

  last(): void {
    const item = buttonRegistry.findPrev(null);
    if (item) this.setFocusByKey(item.key);
  }

  activate(): void {
    if (!this.currentKey) return;
    const entry = buttonRegistry.getEntry(this.currentKey);
    if (entry?.onActivate) {
      Vibration.vibrate(40);
      entry.onActivate();
    }
  }

  adjustInc(): void {
    if (!this.currentKey) return;
    const entry = buttonRegistry.getEntry(this.currentKey);
    if (entry?.onAdjust) {
      Vibration.vibrate(15);
      entry.onAdjust('inc');
    } else {
      speechQueue.enqueue('No ajustable', 'high');
    }
  }

  adjustDec(): void {
    if (!this.currentKey) return;
    const entry = buttonRegistry.getEntry(this.currentKey);
    if (entry?.onAdjust) {
      Vibration.vibrate(15);
      entry.onAdjust('dec');
    } else {
      speechQueue.enqueue('No ajustable', 'high');
    }
  }

  repeat(): void {
    if (!this.currentKey) {
      speechQueue.enqueue('Sin selección', 'high');
      return;
    }
    const entry = buttonRegistry.getEntry(this.currentKey);
    if (entry) {
      Vibration.vibrate(10);
      speechQueue.enqueue(entry.label, 'high');
    }
  }
}

export const blindNav = new BlindNavController();
