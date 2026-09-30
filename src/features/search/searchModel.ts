export type FilterKey = 'board' | 'tag' | 'assigned' | 'list' | 'date' | 'title' | 'description';
export type Token = { id: string; key: FilterKey; value: string; label: string; color?: string };
export type Segment = { kind: 'token'; token: Token } | { kind: 'text'; text: string };
export type SearchModel = { segments: Segment[]; input: string; pending: FilterKey | null; selectedId: string | null };
export type Resolved = { value: string; label: string; color?: string };
export type Resolve = (key: FilterKey, raw: string) => Resolved | null;

export const EMPTY_MODEL: SearchModel = { segments: [], input: '', pending: null, selectedId: null };

export function isEmptyModel(model: SearchModel): boolean {
  return model.segments.length === 0 && model.pending === null && model.input.trim() === '';
}
