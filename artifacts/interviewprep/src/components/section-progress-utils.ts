import { useLocation, useSearch } from 'wouter';
import type { SectionProgressSection } from '@workspace/api-client-react';

export type SPView = 'trends' | 'heatmap' | 'averages';
export type SPGroup = 'case' | 'week';
export type SPRange = 'last10' | 'all';
export type SPState = { view: SPView; group: SPGroup; range: SPRange };

/** Card-local palette: [fill, text] per whole score. Never used outside the Section progress card. */
export const SP_COLORS: Record<number, [string, string]> = {
  1: ['#F09595', '#501313'], 2: ['#F7C1C1', '#791F1F'], 3: ['#FAC775', '#633806'], 4: ['#C0DD97', '#27500A'], 5: ['#97C459', '#173404'],
};
export const SP_NA: [string, string] = ['#E8EAEE', '#5B6577'];
export const SP_UP: [string, string] = ['#DCEFD0', '#27500A'];
export const SP_DOWN: [string, string] = ['#FBDADA', '#791F1F'];

export function scoreColors(v: number | null): [string, string] {
  if (v === null) return SP_NA;
  return SP_COLORS[Math.min(5, Math.max(1, Math.round(v)))];
}
export const fmt1 = (v: number) => v.toFixed(1);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Plain YYYY-MM-DD split; never goes through Date/timezones. */
export function calDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return { short: `${MONTHS[m - 1]} ${day}`, long: `${MONTHS[m - 1]} ${day}, ${y}` };
}

export function parseSP(search: string): SPState {
  const p = new URLSearchParams(search);
  const v = p.get('view'), g = p.get('group'), r = p.get('range');
  return {
    view: v === 'heatmap' || v === 'averages' ? v : 'trends',
    group: g === 'week' ? 'week' : 'case',
    range: r === 'all' ? 'all' : 'last10',
  };
}

/** URL-backed Section progress state. Preserves unrelated params; defaults are omitted. */
export function useSectionProgressUrl() {
  const search = useSearch();
  const [location, nav] = useLocation();
  const state = parseSP(search);
  const set = (patch: Partial<SPState>) => {
    const next = { ...state, ...patch };
    const p = new URLSearchParams(search);
    if (next.view === 'trends') p.delete('view'); else p.set('view', next.view);
    if (next.group === 'case') p.delete('group'); else p.set('group', next.group);
    if (next.range === 'last10') p.delete('range'); else p.set('range', next.range);
    const s = p.toString();
    nav(s ? `${location}?${s}` : location);
  };
  return { state, set };
}

/** Change desc (non-null), then null-change sections in display order (array order from API). */
export function sortByChange(sections: SectionProgressSection[]) {
  return sections.map((s, i) => ({ s, i })).sort((a, b) => {
    const an = a.s.change === null, bn = b.s.change === null;
    if (an !== bn) return an ? 1 : -1;
    if (!an && a.s.change !== b.s.change) return (b.s.change as number) - (a.s.change as number);
    return a.i - b.i;
  }).map(x => x.s);
}

/** 3-case trailing average: mean of non-null scores at case positions i-2..i (by position, not by scored points). */
export function trailing3(scores: (number | null)[]) {
  return scores.map((_, i) => {
    const w = scores.slice(Math.max(0, i - 2), i + 1).filter((x): x is number => x !== null);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

export const subtitle = (st: SPState) => {
  const r = st.range === 'all' ? 'All cases' : 'Last 10 cases';
  if (st.view === 'averages') return 'All cases · marker = recent 5 average';
  if (st.view === 'trends') return st.group === 'case'
    ? `${r} · shaded = recent 5 · line = 3-case rolling average`
    : 'Weekly averages, Monday start · change compares your recent 5 vs earlier 5 cases';
  return st.group === 'case' ? `${r} · trend = recent 5 vs earlier 5` : 'Weekly averages · cases per week under each date';
};
