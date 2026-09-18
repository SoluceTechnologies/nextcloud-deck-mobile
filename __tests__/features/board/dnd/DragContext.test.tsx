import React from 'react';
import { render } from '@testing-library/react-native';

import { DragProvider, useDrag, type DragContextValue } from '../../../../src/features/board/dnd/DragContext';

// The two reporters below are called from the JS thread (a column's onLayout and
// its measureInWindow callback) but write through SharedValue.modify(), whose
// modifier runs on the UI runtime. A plain JS closure is a Remote Function there
// and crashes on device with "[Worklets] Tried to synchronously call a Remote
// Function" — a failure the old mock could not express, so these pin it.

let ctx: DragContextValue;

function Probe() {
  ctx = useDrag();
  return null;
}

function renderProvider() {
  return render(
    <DragProvider enabled onDrop={jest.fn()}>
      <Probe />
    </DragProvider>,
  );
}

describe('DragProvider frame reporters', () => {
  it('records a column layout without calling a non-worklet on the UI runtime', () => {
    renderProvider();

    const state = { scrollY: 12, tiles: [{ cardId: 'c1', y: 0, height: 80 }] };
    expect(() => ctx.reportColumn('s1', state)).not.toThrow();
    expect(ctx.frame.value.registry.s1).toEqual(state);
  });

  it('records the list top without calling a non-worklet on the UI runtime', () => {
    renderProvider();

    expect(() => ctx.reportListTop(200)).not.toThrow();
    expect(ctx.frame.value.listTopY).toBe(200);
  });

  it('keeps the rest of the frame when one column reports', () => {
    renderProvider();

    ctx.reportListTop(200);
    ctx.reportColumn('s1', { scrollY: 0, tiles: [] });
    ctx.reportColumn('s2', { scrollY: 5, tiles: [] });

    expect(ctx.frame.value.listTopY).toBe(200);
    expect(Object.keys(ctx.frame.value.registry).sort()).toEqual(['s1', 's2']);
  });
});
