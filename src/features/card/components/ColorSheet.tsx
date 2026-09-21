import { useTranslation } from 'react-i18next';

import { Palette, X } from 'lucide-react-native';
import { View, StyleSheet } from 'react-native';

import { IconTile, Item, List, Sheet } from '@/ui/components';
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
      <List>
        {/* What the card is set to now, so the sheet states the current value
            rather than leaving the swatch row to imply it. */}
        <Item
          title={t('card.color')}
          description={value ?? t('card.noColor')}
          leading={
            value ? (
              <View style={[styles.tile, { backgroundColor: value }]}>
                <Palette size={20} color="#ffffff" />
              </View>
            ) : (
              <IconTile><Palette /></IconTile>
            )
          }
        />
        <Item
          testID="color-clear"
          title={t('card.clearColor')}
          leading={<IconTile tint="danger"><X /></IconTile>}
          onPress={() => {
            onSelect(null);
            onClose();
          }}
        />
      </List>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
