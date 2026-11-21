import { en, type Strings } from './en';

/** The words for the current language. English only for now. */
export const s: Strings = en;

/** Fills {placeholders}: fmt('Version {version}', { version: '1.0' }) → 'Version 1.0'. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** A cosmetic's name ("wand/heart" → "Heart wand"), or its id made readable. */
export function nameOf(key: string): string {
  const named = s.names[key];
  if (named) return named;
  const id = key.slice(key.indexOf('/') + 1).replace(/-/g, ' ');
  return id.charAt(0).toUpperCase() + id.slice(1);
}
