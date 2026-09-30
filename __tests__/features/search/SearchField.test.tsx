import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { SearchField } from '../../../src/features/search/components/SearchField';
import { EMPTY_MODEL, reduceSearch } from '../../../src/features/search/searchModel';
import type { SearchModel } from '../../../src/features/search/searchModel';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k }),
}));

const typed = (text: string): SearchModel => reduceSearch(EMPTY_MODEL, { type: 'input', text }, () => null);

function setup(model: SearchModel) {
  const handlers = {
    onChangeInput: jest.fn(),
    onBackspaceEmpty: jest.fn(),
    onSubmit: jest.fn(),
    onBlur: jest.fn(),
    onSelectToken: jest.fn(),
    onRemoveToken: jest.fn(),
    onClear: jest.fn(),
  };
  render(<SearchField model={model} {...handlers} />, { wrapper: ThemeWrapper });
  return handlers;
}

const backspace = () =>
  fireEvent(screen.getByTestId('search-input'), 'keyPress', { nativeEvent: { key: 'Backspace' } });

it('shows tokens as pills and the pending key', () => {
  setup(reduceSearch(typed('tag:design '), { type: 'startFilter', key: 'list' }, () => null));
  expect(screen.getByTestId('token-tag-design')).toBeTruthy();
  expect(screen.getByTestId('pending-token')).toBeTruthy();
  expect(screen.getByText('list:')).toBeTruthy();
});

it('reports a backspace when the input is empty', () => {
  const handlers = setup(typed('tag:design '));
  backspace();
  expect(handlers.onBackspaceEmpty).toHaveBeenCalledTimes(1);
});

it('lets a backspace inside typed text through', () => {
  const handlers = setup(typed('loyer'));
  backspace();
  expect(handlers.onBackspaceEmpty).not.toHaveBeenCalled();
});

it('selects a pill on tap and removes it from its cross once selected', () => {
  const model = typed('tag:design ');
  const id = model.segments[0].kind === 'token' ? model.segments[0].token.id : '';
  const handlers = setup({ ...model, selectedId: id });
  fireEvent.press(screen.getByTestId('token-tag-design'));
  expect(handlers.onSelectToken).toHaveBeenCalledWith(id);
  fireEvent.press(screen.getByTestId('token-remove-tag-design'));
  expect(handlers.onRemoveToken).toHaveBeenCalledWith(id);
});

it('offers removal as an accessibility action on a selected pill', () => {
  const model = typed('tag:design ');
  const id = model.segments[0].kind === 'token' ? model.segments[0].token.id : '';
  const handlers = setup({ ...model, selectedId: id });
  const pill = screen.getByTestId('token-tag-design');
  expect(pill).toHaveProp('accessibilityActions', [{ name: 'delete', label: 'search.removeFilter' }]);
  fireEvent(pill, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
  expect(handlers.onRemoveToken).toHaveBeenCalledWith(id);
});

it('shows no cross on a pill that is not selected', () => {
  setup(typed('tag:design '));
  expect(screen.queryByTestId('token-remove-tag-design')).toBeNull();
});

it('forwards typing, submit, blur and clear', () => {
  const handlers = setup(typed('loyer'));
  fireEvent.changeText(screen.getByTestId('search-input'), 'loyers');
  expect(handlers.onChangeInput).toHaveBeenCalledWith('loyers');
  fireEvent(screen.getByTestId('search-input'), 'submitEditing');
  expect(handlers.onSubmit).toHaveBeenCalled();
  fireEvent(screen.getByTestId('search-input'), 'blur');
  expect(handlers.onBlur).toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('common.clear'));
  expect(handlers.onClear).toHaveBeenCalled();
});

it('shows the placeholder and no clear button when empty', () => {
  setup(EMPTY_MODEL);
  expect(screen.getByTestId('search-input')).toHaveProp('placeholder', 'search.placeholder');
  expect(screen.getByTestId('search-input')).toHaveProp('accessibilityLabel', 'search.placeholder');
  expect(screen.queryByLabelText('common.clear')).toBeNull();
});
