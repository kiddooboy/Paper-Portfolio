/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GROW_API_TOKEN: string;
  readonly VITE_GROW_API_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
