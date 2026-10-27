// Feature switches (feedback #1020) from src/features.json: the 'default' profile, with
// 'public' laid over it when built with `npm run build:public` (Vite mode "public").
import config from '../features.json'

export function featuresFor(mode, cfg = config) {
  return { ...(cfg.default || {}), ...(mode === 'public' ? cfg.public || {} : {}) }
}

export const FEATURES = featuresFor(import.meta.env?.MODE)

/** On unless switched off; no key means on. */
export const isOn = (key, features = FEATURES) => !key || features[key] !== false
