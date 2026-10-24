/** Drawn menu glyphs. Same 24px box, currentColor, so the orb CSS controls the tint. */
import type { ReactNode } from "react";

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ChatIcon() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M6.1 4.6h11.8A2.5 2.5 0 0 1 20.4 7.1v6.6a2.5 2.5 0 0 1-2.5 2.5H8.4L5.2 19.4c-.55.48-1.4.08-1.4-.62v-2.4A2.5 2.5 0 0 1 3.6 13.7V7.1A2.5 2.5 0 0 1 6.1 4.6Z"
      />
      <circle cx="8.4" cy="10.4" r="1.05" fill="#fff" />
      <circle cx="12" cy="10.4" r="1.05" fill="#fff" />
      <circle cx="15.6" cy="10.4" r="1.05" fill="#fff" />
    </Glyph>
  );
}

export function TodayIcon() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M8 3.1a.95.95 0 0 1 1.9 0V4.8h4.2V3.1a.95.95 0 1 1 1.9 0V4.8H18a2.3 2.3 0 0 1 2.3 2.3v10.6A2.3 2.3 0 0 1 18 20H6a2.3 2.3 0 0 1-2.3-2.3V7.1A2.3 2.3 0 0 1 6 4.8h2.1V3.1Z"
      />
      <path d="M3.7 9.2h16.6" stroke="#fff" strokeWidth="1.5" />
      <rect x="7.1" y="12" width="3.15" height="3.15" rx="0.7" fill="#fff" />
      <rect x="11.45" y="12" width="3.15" height="3.15" rx="0.7" fill="#fff" opacity="0.55" />
    </Glyph>
  );
}

export function SleepIcon() {
  return (
    <Glyph>
      <path fill="currentColor" d="M15.1 3.4A7.6 7.6 0 1 0 20.6 16 6.5 6.5 0 0 1 15.1 3.4Z" />
    </Glyph>
  );
}

export function WakeIcon() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3.7" fill="currentColor" />
      {rays.map((deg) => (
        <rect key={deg} x="11.2" y="1.55" width="1.6" height="3.05" rx="0.8" fill="currentColor" transform={`rotate(${deg} 12 12)`} />
      ))}
    </Glyph>
  );
}

export function HideIcon() {
  return (
    <Glyph>
      <path
        d="M2.6 12.2S6.2 6.6 12 6.6s9.4 5.6 9.4 5.6-3.6 5.6-9.4 5.6-9.4-5.6-9.4-5.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.2" r="2.15" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.4 18.4 18.6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Glyph>
  );
}

export function PetsIcon() {
  return (
    <Glyph>
      <ellipse cx="12" cy="16.15" rx="3.65" ry="2.95" fill="currentColor" />
      <circle cx="7.15" cy="10.55" r="1.8" fill="currentColor" />
      <circle cx="10.55" cy="7.35" r="1.85" fill="currentColor" />
      <circle cx="14.55" cy="7.5" r="1.8" fill="currentColor" />
      <circle cx="17.55" cy="11.05" r="1.6" fill="currentColor" />
    </Glyph>
  );
}

export function SettingsIcon() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
      />
    </Glyph>
  );
}
