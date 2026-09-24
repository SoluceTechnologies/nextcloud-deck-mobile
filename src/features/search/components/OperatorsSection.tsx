import { Platform, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OPERATORS } from '@/features/search/parseQuery';
import { Item, List, SectionHeader, Stack, Typography } from '@/ui/components';

export interface OperatorsSectionProps {
  onTry: (example: string) => void;
}

export function OperatorsSection({ onTry }: OperatorsSectionProps) {
  const { t } = useTranslation();
  const rawExamples = t('search.examples', { returnObjects: true });
  const examples = Array.isArray(rawExamples) ? (rawExamples as string[]) : [];

  return (
    <>
      <Stack hAlign="stretch">
        <SectionHeader title={t('search.operators')} />
        <List>
          {OPERATORS.map((op) => (
            <Item
              key={op}
              testID={`operator-${op}`}
              title={t(`search.op.${op}`)}
              trailing={
                <Typography variant="body2" color="secondary" style={styles.mono}>
                  {`${op}:`}
                </Typography>
              }
              onPress={() => onTry(`${op}:`)}
            />
          ))}
        </List>
      </Stack>

      {examples.length > 0 ? (
        <Stack hAlign="stretch" style={styles.section}>
          <SectionHeader title={t('search.try')} />
          <List>
            {examples.map((example, i) => (
              <Item key={example} testID={`try-${i}`} title={example} onPress={() => onTry(example)} />
            ))}
          </List>
        </Stack>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  section: { marginTop: 24 },
});
