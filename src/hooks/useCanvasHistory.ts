import { useState, useCallback, useRef } from "react";
import { Canvas as FabricCanvas } from "fabric";

const MAX_HISTORY = 50;

export const useCanvasHistory = () => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<string[]>([]);
  const currentIndexRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const canvasRef = useRef<FabricCanvas | null>(null);

  const updateButtons = useCallback(() => {
    setCanUndo(currentIndexRef.current > 0);
    setCanRedo(currentIndexRef.current < historyRef.current.length - 1);
  }, []);

  const saveState = useCallback((canvas: FabricCanvas) => {
    if (isRestoringRef.current) return;
    
    canvasRef.current = canvas;
    
    // Get only user objects (exclude camera, safe-area, labels)
    const objects = canvas.getObjects().filter(obj => {
      const name = (obj as any).name;
      return name !== "camera-cutout" && name !== "camera-label" && name !== "safe-area";
    });
    
    const state = JSON.stringify({
      objects: objects.map(obj => obj.toObject(["name", "layerId"])),
      backgroundColor: canvas.backgroundColor,
    });

    // Remove any redo states
    if (currentIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, currentIndexRef.current + 1);
    }

    // Add new state
    historyRef.current.push(state);
    
    // Limit history size
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      currentIndexRef.current++;
    }

    updateButtons();
  }, [updateButtons]);

  const restoreState = useCallback(async (canvas: FabricCanvas, stateJson: string) => {
    isRestoringRef.current = true;
    
    try {
      const state = JSON.parse(stateJson);
      
      // Remove current user objects
      canvas.getObjects().forEach(obj => {
        const name = (obj as any).name;
        if (name !== "camera-cutout" && name !== "camera-label" && name !== "safe-area") {
          canvas.remove(obj);
        }
      });

      // Restore background
      canvas.backgroundColor = state.backgroundColor;

      // Restore objects
      if (state.objects && state.objects.length > 0) {
        await canvas.loadFromJSON({ objects: state.objects }, () => {
          // Move restored objects below UI elements
          const uiObjects = canvas.getObjects().filter(obj => {
            const name = (obj as any).name;
            return name === "camera-cutout" || name === "camera-label" || name === "safe-area";
          });
          
          uiObjects.forEach(obj => canvas.bringObjectToFront(obj));
          canvas.renderAll();
        });
      } else {
        canvas.renderAll();
      }
    } finally {
      isRestoringRef.current = false;
    }
  }, []);

  const undo = useCallback(async () => {
    if (!canvasRef.current || currentIndexRef.current <= 0) return;
    
    currentIndexRef.current--;
    const state = historyRef.current[currentIndexRef.current];
    await restoreState(canvasRef.current, state);
    updateButtons();
  }, [restoreState, updateButtons]);

  const redo = useCallback(async () => {
    if (!canvasRef.current || currentIndexRef.current >= historyRef.current.length - 1) return;
    
    currentIndexRef.current++;
    const state = historyRef.current[currentIndexRef.current];
    await restoreState(canvasRef.current, state);
    updateButtons();
  }, [restoreState, updateButtons]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    currentIndexRef.current = -1;
    updateButtons();
  }, [updateButtons]);

  return {
    canUndo,
    canRedo,
    saveState,
    undo,
    redo,
    clearHistory,
  };
};
