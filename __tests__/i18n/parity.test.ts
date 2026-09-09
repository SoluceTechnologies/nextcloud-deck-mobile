import en from '../../src/locales/en.json';
import fr from '../../src/locales/fr.json';
import de from '../../src/locales/de.json';
import es from '../../src/locales/es.json';
import itLocale from '../../src/locales/it.json';
import ru from '../../src/locales/ru.json';

function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? keyPaths(v as Record<string, unknown>, path)
      : [path];
  });
}

// The "tabs" keys are translated for en and fr only as of the Deck bootstrap;
// de/es/it/ru still carry only their pre-existing "tabs.settings" key and fall
// back to English for the rest until someone translates them.
const withoutPendingTranslations = (paths: string[]) =>
  paths.filter((path) => !path.startsWith('tabs.'));

describe('locale parity', () => {
  const base = withoutPendingTranslations(keyPaths(en)).sort();
  it.each([
    ['fr', fr],
    ['de', de],
    ['es', es],
    ['it', itLocale],
    ['ru', ru],
  ])('%s has exactly the same keys as en', (_name, locale) => {
    expect(withoutPendingTranslations(keyPaths(locale as Record<string, unknown>)).sort()).toEqual(base);
  });
});
