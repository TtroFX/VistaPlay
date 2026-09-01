/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_YOUTUBE_API_KEY?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface VistaPlayNativeMessageEvent {
  data: string
}

interface VistaPlayNativeBridge {
  postMessage(message: string): void
  onmessage: ((event: VistaPlayNativeMessageEvent) => void) | null
}

interface Window {
  VistaPlayNative?: VistaPlayNativeBridge
}
