import { useState } from 'react';

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
 */
export function QuickAddCardFlow({ visible, accountId, onClose }: QuickAddCardFlowProps) {
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [target, setTarget] = useState<Target | null>(null);

  const boards = useBoards(accountId);
  const stacks = useBoardStacks(accountId, target?.boardLocalId ?? null);
  const actions = useCardActions(accountId);

  const close = () => {
    setStep('pick');
    setTarget(null);
    onClose();
  };

  const handlePick = ({ boardLocalId, stackLocalId }: CardPickerResult) => {
    setTarget({ boardLocalId, stackLocalId });
    setStep('form');
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
        onClose={close}
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
