import en from '../../src/locales/en.json';
import fr from '../../src/locales/fr.json';
import de from '../../src/locales/de.json';
import es from '../../src/locales/es.json';
import itLocale from '../../src/locales/it.json';
import ru from '../../src/locales/ru.json';

// A language's plural forms are its own (CLDR): de/es/it need one+other,
// ru needs one+few+many+other. Comparing raw key sets would therefore call a
// correctly-pluralised Russian file a mismatch, so compare stems — the suffix
// set is the language's business, the stem set is the contract.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? keyPaths(v as Record<string, unknown>, path)
      : [path.replace(PLURAL_SUFFIX, '')];
  });
}

function stems(obj: Record<string, unknown>): string[] {
  return [...new Set(keyPaths(obj))].sort();
}

describe('locale parity', () => {
  const base = stems(en);
  it.each([
    ['fr', fr], ['de', de], ['es', es], ['it', itLocale], ['ru', ru],
  ])('%s has exactly the same keys as en', (_name, locale) => {
    expect(stems(locale as Record<string, unknown>)).toEqual(base);
  });
});

it('gives ru all four of its CLDR plural forms', () => {
  for (const stem of [['boards', 'count'], ['board', 'cardCount'], ['today', 'overdueBanner']]) {
    const section = (ru as any)[stem[0]];
    for (const form of ['one', 'few', 'many', 'other']) {
      expect(section).toHaveProperty(`${stem[1]}_${form}`);
    }
  }
});
