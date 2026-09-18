import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { CardTileData } from '../components/CardTile';
import type { ColumnState, DragFrame, DragTarget, DropResult } from './dragController';

/**
 * The stable "machinery": shared values and callbacks that never change
 * identity across a drag lift/drop. Deliberately excludes `activeData` (see
 * ActiveDataContext below) — DraggableCard and StackColumn read only this,
 * so a lift/drop (which changes only activeData) never re-renders them.
 */
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

// Narrow, high-churn context: what the overlay draws, null while nothing is
// lifted. Split out of DragContextValue so its every lift/drop update only
// re-renders its two actual readers (DragOverlay, BoardColumns) rather than
// every mounted DraggableCard tile — a context update bypasses React.memo
// entirely, so folding this into the machinery context above would re-render
// (and reconcile a fresh Gesture.Pan() for) every tile on the board on the
// first frame of every gesture. `undefined` (vs. the valid `null` "nothing
// active" value) distinguishes "no provider" for the same missing-provider
// guard useDrag() already has.
const ActiveDataReactContext = createContext<CardTileData | null | undefined>(undefined);

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

  // Both reporters are called from the JS thread (a column's onLayout, and the
  // measureInWindow callback under it) but write through modify(), whose
  // modifier the runtime executes on the UI thread. The 'worklet' directive is
  // what makes that legal: without it the modifier stays a JS-runtime function
  // and the UI runtime refuses to call it ("Tried to synchronously call a
  // Remote Function"). modify() is the right API here rather than assigning
  // frame.value, because the scroll handler writes scrollX from the UI thread
  // and a JS-side read-modify-write could clobber it with a stale copy.
  const reportColumn = useCallback(
    (stackId: string, state: ColumnState) => {
      frame.modify((f) => {
        'worklet';
        return { ...f, registry: { ...f.registry, [stackId]: state } };
      });
    },
    [frame],
  );

  const reportListTop = useCallback(
    (topY: number) => {
      frame.modify((f) => {
        'worklet';
        return { ...f, listTopY: topY };
      });
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

  // Every field here is already reference-stable across renders (refs and
  // useCallback above) except the screen-supplied onDrop/enabled — so this
  // only gets a new identity when one of those actually changes, and a
  // setActiveData-triggered re-render (lift/drop) leaves it untouched. That
  // stability is what lets DragReactContext's consumers (DraggableCard via
  // useDrag, StackColumn via useOptionalDrag) skip re-rendering on lift/drop.
  const value = useMemo<DragContextValue>(
    () => ({
      activeId, x, y, originX, originY, width, startX, startY, target, frame,
      setActiveData, reportColumn, reportListTop, registerScroller, scrollColumnBy,
      onDrop, enabled,
    }),
    [
      activeId, x, y, originX, originY, width, startX, startY, target, frame,
      setActiveData, reportColumn, reportListTop, registerScroller, scrollColumnBy,
      onDrop, enabled,
    ],
  );

  return (
    <DragReactContext.Provider value={value}>
      <ActiveDataReactContext.Provider value={activeData}>{children}</ActiveDataReactContext.Provider>
    </DragReactContext.Provider>
  );
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

/** The floating copy's data, null while nothing is lifted — for DragOverlay and BoardColumns only (see ActiveDataReactContext above). */
export function useDragActiveData(): CardTileData | null {
  const ctx = useContext(ActiveDataReactContext);
  if (ctx === undefined) throw new Error('useDragActiveData must be used within a DragProvider');
  return ctx;
}
