import { useRef, useState } from 'react';

import { useBoardStacks } from '@/database/hooks/useBoardContent';
import { useBoards } from '@/database/hooks/useBoards';
import { useCardActions } from '@/features/board/hooks/useCardActions';
import { CardPickerSheet, type CardPickerResult } from './CardPickerSheet';
import { QuickCardFormSheet } from './QuickCardFormSheet';

export interface QuickAddCardFlowProps {
  visible: boolean;
  accountId: string | null;
  onClose: () => void;
}

type Target = { boardLocalId: string; stackLocalId: string };

/**
 * Spec §7.6's quick-add: board → list → form → Save. Reused as-is by both the
 * Today tab and Search (Task 11 wires the two call sites); this component owns
 * only the two-step state machine between CardPickerSheet (mode="stack", so it
 * resolves at the list, one level short of a card) and QuickCardFormSheet.
 * `useCardActions.create` is the only write path — a component never calls
 * `mutate` itself. Closing either step drops the picked target and calls the
 * caller's `onClose`, so a reopen always starts over at the picker rather than
 * resuming a stale target.
 *
 * CardPickerSheet fully self-closes on every successful pick — its own
 * `pick()` calls `onPick` then `onClose`, not just on a cancel — so this
 * flow can't tell "picked" from "cancelled" from the close call alone.
 * `justPicked` is a ref rather than state because it must be readable
 * synchronously inside that same `onClose` call, before React has applied
 * the pick's state updates.
 */
export function QuickAddCardFlow({ visible, accountId, onClose }: QuickAddCardFlowProps) {
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [target, setTarget] = useState<Target | null>(null);
  const justPicked = useRef(false);

  const boards = useBoards(accountId);
  const stacks = useBoardStacks(accountId, target?.boardLocalId ?? null);
  const actions = useCardActions(accountId);

  const close = () => {
    setStep('pick');
    setTarget(null);
    onClose();
  };

  const handlePick = ({ boardLocalId, stackLocalId }: CardPickerResult) => {
    justPicked.current = true;
    setTarget({ boardLocalId, stackLocalId });
    setStep('form');
  };

  // Fires both for a cancelled picker and for a completed pick — only the
  // former should close the whole flow; the latter must leave the form step
  // `handlePick` just set alone.
  const handlePickerClose = () => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    close();
  };

  const handleSubmit = ({ title, duedate }: { title: string; duedate: number | null }) => {
    if (!target) return;
    void actions.create({ ...target, title, duedate }).catch(() => undefined);
  };

  return (
    <>
      <CardPickerSheet
        visible={visible && step === 'pick'}
        accountId={accountId}
        mode="stack"
        onClose={handlePickerClose}
        onPick={handlePick}
      />
      <QuickCardFormSheet
        visible={visible && step === 'form'}
        boardTitle={boards.find((b) => b.id === target?.boardLocalId)?.title ?? ''}
        stackTitle={stacks.find((s) => s.id === target?.stackLocalId)?.title ?? ''}
        onClose={close}
        onSubmit={handleSubmit}
      />
    </>
  );
}
