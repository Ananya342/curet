/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default Gemini key from .env.local, used when none is saved in Settings. */
  readonly LIFEPET_GEMINI_KEY?: string;
}
