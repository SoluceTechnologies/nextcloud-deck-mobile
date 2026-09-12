import { useTranslation } from 'react-i18next';

import { Item, Sheet } from '@/ui/components';
import { PaletteRow } from '@/features/board/components/PaletteRow';

export { DECK_PALETTE } from '@/features/board/palette';

export interface ColorSheetProps {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onSelect: (color: string | null) => void;
}

export function ColorSheet({ visible, value, onClose, onSelect }: ColorSheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('card.color')}>
      <PaletteRow
        value={value}
        onSelect={(color) => {
          onSelect(color);
          onClose();
        }}
      />
      <Item
        title={t('card.clearColor')}
        onPress={() => {
          onSelect(null);
          onClose();
        }}
      />
    </Sheet>
  );
}
