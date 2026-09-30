import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import type Stack from '@/database/models/Stack';
import type { CardTileData } from '../components/CardTile';
import type { ColumnState, DragFrame, DragTarget, DropResult } from './dragController';

export type StackDragData = {
  stack: Pick<Stack, 'id' | 'title'>;
  cards: CardTileData[];
  width: number;
  height: number;
};
export type DragData = CardTileData | StackDragData;

export type DragContextValue = {
  activeId: SharedValue<string | null>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  originX: SharedValue<number>;
  originY: SharedValue<number>;
  width: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  target: SharedValue<DragTarget | null>;
  frame: SharedValue<DragFrame>;
  setActiveData: (data: DragData | null) => void;
  reportColumn: (stackId: string, state: ColumnState) => void;
  reportListTop: (y: number) => void;
  registerScroller: (stackId: string, scrollBy: (dy: number) => void) => () => void;
  scrollColumnBy: (stackId: string, dy: number) => void;
  onDrop: (result: DropResult) => void;
  onStackHover?: (stackId: string, index: number) => void;
  onStackDrop?: (stackId: string, index: number) => void;
  enabled: boolean;
};

const emptyFrame: DragFrame = {
  stackIds: [],
  geometry: { gap: 0, columnWidth: 0, columnCount: 0 },
  scrollX: 0,
  listTopY: 0,
  registry: {},
};

const DragReactContext = createContext<DragContextValue | null>(null);

const ActiveDataReactContext = createContext<DragData | null | undefined>(undefined);

export type DragProviderProps = {
  enabled: boolean;
  onDrop: (result: DropResult) => void;
  onStackHover?: (stackId: string, index: number) => void;
  onStackDrop?: (stackId: string, index: number) => void;
  children: React.ReactNode;
};

export function DragProvider({ enabled, onDrop, onStackHover, onStackDrop, children }: DragProviderProps) {
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

  const [activeData, setActiveData] = useState<DragData | null>(null);
  const scrollers = useRef(new Map<string, (dy: number) => void>());

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


  const scrollColumnBy = useCallback((stackId: string, dy: number) => {
    scrollers.current.get(stackId)?.(dy);
  }, []);

  const value = useMemo<DragContextValue>(
    () => ({
      activeId, x, y, originX, originY, width, startX, startY, target, frame,
      setActiveData, reportColumn, reportListTop, registerScroller, scrollColumnBy,
      onDrop, onStackHover, onStackDrop, enabled,
    }),
    [
      activeId, x, y, originX, originY, width, startX, startY, target, frame,
      setActiveData, reportColumn, reportListTop, registerScroller, scrollColumnBy,
      onDrop, onStackHover, onStackDrop, enabled,
    ],
  );

  return (
    <DragReactContext.Provider value={value}>
      <ActiveDataReactContext.Provider value={activeData}>{children}</ActiveDataReactContext.Provider>
    </DragReactContext.Provider>
  );
}

export function useDrag(): DragContextValue {
  const ctx = useContext(DragReactContext);
  if (!ctx) throw new Error('useDrag must be used within a DragProvider');
  return ctx;
}

export function useOptionalDrag(): DragContextValue | null {
  return useContext(DragReactContext);
}

export function useDragActiveData(): DragData | null {
  const ctx = useContext(ActiveDataReactContext);
  if (ctx === undefined) throw new Error('useDragActiveData must be used within a DragProvider');
  return ctx;
}
