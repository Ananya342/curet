/** Target glyph for the Focus orb: same 24px box and currentColor as the other menu icons. */
export function FocusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
