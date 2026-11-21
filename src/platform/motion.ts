/** "Reduce motion" from the phone's or computer's settings: calmer particles, wobble and slides. */
const query =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function prefersCalm(): boolean {
  return query?.matches ?? false;
}
