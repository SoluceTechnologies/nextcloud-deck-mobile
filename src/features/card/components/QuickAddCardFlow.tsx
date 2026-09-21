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

export function QuickAddCardFlow({ visible, accountId, onClose }: QuickAddCardFlowProps) {
  const [target, setTarget] = useState<Target | null>(null);
  const step = target ? 'form' : 'pick';
  const justPicked = useRef(false);

  const boards = useBoards(accountId);
  const stacks = useBoardStacks(accountId, target?.boardLocalId ?? null);
  const actions = useCardActions(accountId);

  const close = () => {
    setTarget(null);
    onClose();
  };

  const handlePick = ({ boardLocalId, stackLocalId }: CardPickerResult) => {
    justPicked.current = true;
    setTarget({ boardLocalId, stackLocalId });
  };

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
