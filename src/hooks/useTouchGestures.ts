import { useEffect, useRef } from "react";
import { Canvas as FabricCanvas } from "fabric";

interface TouchState {
  initialDistance: number;
  initialAngle: number;
  initialScale: number;
  initialRotation: number;
  centerX: number;
  centerY: number;
}

export const useTouchGestures = (canvas: FabricCanvas | null) => {
  const touchStateRef = useRef<TouchState | null>(null);
  const isGesturingRef = useRef(false);

  useEffect(() => {
    if (!canvas) return;

    const getDistance = (touch1: Touch, touch2: Touch) => {
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getAngle = (touch1: Touch, touch2: Touch) => {
      return Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX
      ) * (180 / Math.PI);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      // Prevent default to avoid scrolling
      e.preventDefault();

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      touchStateRef.current = {
        initialDistance: getDistance(touch1, touch2),
        initialAngle: getAngle(touch1, touch2),
        initialScale: activeObject.scaleX || 1,
        initialRotation: activeObject.angle || 0,
        centerX: (touch1.clientX + touch2.clientX) / 2,
        centerY: (touch1.clientY + touch2.clientY) / 2,
      };
      isGesturingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !touchStateRef.current || !isGesturingRef.current) return;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      e.preventDefault();

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      const currentDistance = getDistance(touch1, touch2);
      const currentAngle = getAngle(touch1, touch2);

      // Calculate scale factor
      const scaleFactor = currentDistance / touchStateRef.current.initialDistance;
      const newScale = touchStateRef.current.initialScale * scaleFactor;

      // Calculate rotation delta
      const angleDelta = currentAngle - touchStateRef.current.initialAngle;
      const newRotation = touchStateRef.current.initialRotation + angleDelta;

      // Apply transformations with constraints
      const minScale = 0.1;
      const maxScale = 10;
      const constrainedScale = Math.min(Math.max(newScale, minScale), maxScale);

      activeObject.set({
        scaleX: constrainedScale,
        scaleY: constrainedScale,
        angle: newRotation,
      });

      activeObject.setCoords();
      canvas.renderAll();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && isGesturingRef.current) {
        isGesturingRef.current = false;
        touchStateRef.current = null;
        
        // Fire object:modified event for history tracking
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
          canvas.fire("object:modified", { target: activeObject });
        }
      }
    };

    const canvasElement = canvas.getElement();
    const upperCanvas = canvasElement.parentElement?.querySelector(".upper-canvas") as HTMLCanvasElement | null;
    const targetElement = upperCanvas || canvasElement;

    targetElement.addEventListener("touchstart", handleTouchStart, { passive: false });
    targetElement.addEventListener("touchmove", handleTouchMove, { passive: false });
    targetElement.addEventListener("touchend", handleTouchEnd, { passive: false });
    targetElement.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    return () => {
      targetElement.removeEventListener("touchstart", handleTouchStart);
      targetElement.removeEventListener("touchmove", handleTouchMove);
      targetElement.removeEventListener("touchend", handleTouchEnd);
      targetElement.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [canvas]);
};
