/// <reference types="vite/client" />

interface Window {
  /** Added by the Android shell (MainActivity.kt) to style the system bars. */
  HakawatiSystemBars?: { setDarkIcons(dark: boolean): void };
}
