/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the share Worker (worker/), e.g. "https://iitbmap-share.<you>.workers.dev/". */
  readonly VITE_SHARE_URL?: string;
}
