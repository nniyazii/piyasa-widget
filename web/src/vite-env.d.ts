/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** "snapshot": statik yayın, geçmiş data/history'den · "proxy": /api vekili · boş: kendiliğinden */
  readonly VITE_HISTORY?: 'snapshot' | 'proxy' | 'none'
}
