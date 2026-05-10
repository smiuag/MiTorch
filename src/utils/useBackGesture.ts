import { useRef } from 'react';
import { GestureResponderEvent } from 'react-native';

// Hook que devuelve handlers `onTouchStart/Move/End` para que el usuario pueda
// salir de la pantalla con un swipe-down de 2 dedos (equivale a pulsar el
// botón "Volver"). Pensado para todas las pantallas que tengan goBack —
// el `BlindGestureContainer` interno reclama el responder cuando aplica, pero
// los onTouch* burbujean igual y la captura funciona en ambos modos.
//
// Umbral 30px (mismo que GesturePickerModal y twofingers de TerminalScreen).
// Sin filtro de velocidad: si en el futuro choca con scroll de 2 dedos en
// pantallas largas, subir el umbral o añadir velocidad mínima.
export function useBackGesture(onBack: () => void) {
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);

  const onTouchStart = (evt: GestureResponderEvent) => {
    const touches = evt.nativeEvent.touches;
    if (touches.length === 2) {
      const [t1, t2] = touches;
      startRef.current = {
        x: (t1.pageX + t2.pageX) / 2,
        y: (t1.pageY + t2.pageY) / 2,
      };
      firedRef.current = false;
    }
  };

  const onTouchMove = (evt: GestureResponderEvent) => {
    if (firedRef.current) return;
    const touches = evt.nativeEvent.touches;
    if (touches.length !== 2) return;
    const [t1, t2] = touches;
    const cx = (t1.pageX + t2.pageX) / 2;
    const cy = (t1.pageY + t2.pageY) / 2;
    const dx = cx - startRef.current.x;
    const dy = cy - startRef.current.y;
    if (dy > 30 && Math.abs(dy) > Math.abs(dx)) {
      firedRef.current = true;
      onBack();
    }
  };

  const onTouchEnd = (evt: GestureResponderEvent) => {
    if (evt.nativeEvent.touches.length === 0) {
      firedRef.current = false;
    }
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}
