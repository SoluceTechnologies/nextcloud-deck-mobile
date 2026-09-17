import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { CardTileData } from '../components/CardTile';
import type { ColumnState, DragFrame, DragTarget, DropResult } from './dragController';

export type DragContextValue = {
  // UI-thread state
  activeId: SharedValue<string | null>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  originX: SharedValue<number>;
  originY: SharedValue<number>;
  width: SharedValue<number>;
  // Captured at onStart so the overlay can compute a delta from the finger's
  // start point rather than jumping to an absolute position (see DragOverlay).
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  target: SharedValue<DragTarget | null>;
  frame: SharedValue<DragFrame>; // updated by the screen (scrollX, stackIds, geometry) and the columns (registry, listTopY)
  // JS-side
  activeData: CardTileData | null; // what the overlay draws; null hides it
  setActiveData: (data: CardTileData | null) => void;
  reportColumn: (stackId: string, state: ColumnState) => void;
  reportListTop: (y: number) => void;
  registerScroller: (stackId: string, scrollBy: (dy: number) => void) => () => void; // vertical autoscroll seams
  scrollColumnBy: (stackId: string, dy: number) => void; // invokes a registered scroller — the screen's autoscroll loop
  onDrop: (result: DropResult) => void; // supplied by the screen
  enabled: boolean; // board.canEdit
};

const emptyFrame: DragFrame = {
  stackIds: [],
  geometry: { gap: 0, columnWidth: 0, columnCount: 0 },
  scrollX: 0,
  listTopY: 0,
  registry: {},
};

const DragReactContext = createContext<DragContextValue | null>(null);

export type DragProviderProps = {
  enabled: boolean;
  onDrop: (result: DropResult) => void;
  children: React.ReactNode;
};

export function DragProvider({ enabled, onDrop, children }: DragProviderProps) {
  // DragProvider re-renders whenever setActiveData fires (activeData is React
  // state), and the mock react-native-reanimated used in tests hands back a
  // fresh { value } object from every useSharedValue() call rather than the
  // same instance across renders (unlike the real library). Routing each one
  // through a ref pins it to the object created on the first render, so a
  // gesture's worklet closures and the overlay's context read always share
  // the same object regardless of how many times the provider re-renders.
  const activeId = useRef(useSharedValue<string | null>(null)).current;
  const x = useRef(useSharedValue(0)).current;
  const y = useRef(useSharedValue(0)).current;
  const originX = useRef(useSharedValue(0)).current;
  const originY = useRef(useSharedValue(0)).current;
  const width = useRef(useSharedValue(0)).current;
  const startX = useRef(useSharedValue(0)).current;
  const startY = useRef(useSharedValue(0)).current;
  const target = useRef(useSharedValue<DragTarget | null>(null)).current;
  const frame = useRef(useSharedValue<DragFrame>(emptyFrame)).current;

  const [activeData, setActiveData] = useState<CardTileData | null>(null);
  const scrollers = useRef(new Map<string, (dy: number) => void>());

  const reportColumn = useCallback(
    (stackId: string, state: ColumnState) => {
      frame.modify((f) => ({ ...f, registry: { ...f.registry, [stackId]: state } }));
    },
    [frame],
  );

  const reportListTop = useCallback(
    (topY: number) => {
      frame.modify((f) => ({ ...f, listTopY: topY }));
    },
    [frame],
  );

  const registerScroller = useCallback((stackId: string, scrollBy: (dy: number) => void) => {
    scrollers.current.set(stackId, scrollBy);
    return () => {
      scrollers.current.delete(stackId);
    };
  }, []);

  // The autoscroll loop (the screen) knows only the target column's id — this is the
  // other half of the registerScroller seam, letting it reach the scrollBy a column
  // registered without either side holding a reference to the other.
  const scrollColumnBy = useCallback((stackId: string, dy: number) => {
    scrollers.current.get(stackId)?.(dy);
  }, []);

  const value: DragContextValue = {
    activeId, x, y, originX, originY, width, startX, startY, target, frame,
    activeData, setActiveData, reportColumn, reportListTop, registerScroller, scrollColumnBy,
    onDrop, enabled,
  };

  return <DragReactContext.Provider value={value}>{children}</DragReactContext.Provider>;
}

/** Requires a DragProvider ancestor — for the drag machinery itself (DraggableCard, DragOverlay), which is only ever mounted inside one. */
export function useDrag(): DragContextValue {
  const ctx = useContext(DragReactContext);
  if (!ctx) throw new Error('useDrag must be used within a DragProvider');
  return ctx;
}

/** Tolerates a missing DragProvider — for StackColumn, which renders with or without one depending on its `draggable` prop. */
export function useOptionalDrag(): DragContextValue | null {
  return useContext(DragReactContext);
}
