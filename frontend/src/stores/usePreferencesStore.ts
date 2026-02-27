import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'auto'
export type AccentKey = 'indigo' | 'blue' | 'violet' | 'emerald' | 'orange' | 'rose' | 'cyan' | 'amber'

// RGB triplets espace-séparés pour que Tailwind <alpha-value> fonctionne
export const ACCENT_PRESETS: Record<AccentKey, { name: string; hex: string; rgb: Record<number, string> }> = {
  indigo: {
    name: 'Indigo', hex: '#5c6bfa',
    rgb: { 50:'240 244 255', 100:'221 230 255', 200:'195 208 255', 300:'157 176 255', 400:'122 141 255', 500:'92 107 250', 600:'74 82 239', 700:'60 64 212', 800:'51 54 171', 900:'46 48 135' }
  },
  blue: {
    name: 'Bleu', hex: '#3b82f6',
    rgb: { 50:'239 246 255', 100:'219 234 254', 200:'191 219 254', 300:'147 197 253', 400:'96 165 250', 500:'59 130 246', 600:'37 99 235', 700:'29 78 216', 800:'30 64 175', 900:'30 58 138' }
  },
  violet: {
    name: 'Violet', hex: '#8b5cf6',
    rgb: { 50:'245 243 255', 100:'237 233 254', 200:'221 214 254', 300:'196 181 253', 400:'167 139 250', 500:'139 92 246', 600:'124 58 237', 700:'109 40 217', 800:'91 33 182', 900:'76 29 149' }
  },
  emerald: {
    name: 'Vert', hex: '#10b981',
    rgb: { 50:'236 253 245', 100:'209 250 229', 200:'167 243 208', 300:'110 231 183', 400:'52 211 153', 500:'16 185 129', 600:'5 150 105', 700:'4 120 87', 800:'6 95 70', 900:'6 78 59' }
  },
  orange: {
    name: 'Orange', hex: '#f97316',
    rgb: { 50:'255 247 237', 100:'255 237 213', 200:'254 215 170', 300:'253 186 116', 400:'251 146 60', 500:'249 115 22', 600:'234 88 12', 700:'194 65 12', 800:'154 52 18', 900:'124 45 18' }
  },
  rose: {
    name: 'Rose', hex: '#f43f5e',
    rgb: { 50:'255 241 242', 100:'255 228 230', 200:'254 205 211', 300:'253 164 175', 400:'251 113 133', 500:'244 63 94', 600:'225 29 72', 700:'190 18 60', 800:'159 18 57', 900:'136 19 55' }
  },
  cyan: {
    name: 'Cyan', hex: '#06b6d4',
    rgb: { 50:'236 254 255', 100:'207 250 254', 200:'165 243 252', 300:'103 232 249', 400:'34 211 238', 500:'6 182 212', 600:'8 145 178', 700:'14 116 144', 800:'21 94 117', 900:'22 78 99' }
  },
  amber: {
    name: 'Ambre', hex: '#f59e0b',
    rgb: { 50:'255 251 235', 100:'254 243 199', 200:'253 230 138', 300:'252 211 77', 400:'251 191 36', 500:'245 158 11', 600:'217 119 6', 700:'180 83 9', 800:'146 64 14', 900:'120 53 15' }
  }
}

export function applyAccent(key: AccentKey) {
  const preset = ACCENT_PRESETS[key]
  const root = document.documentElement
  Object.entries(preset.rgb).forEach(([shade, val]) => {
    root.style.setProperty(`--brand-${shade}`, val)
  })
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const isDark =
    mode === 'dark' ||
    (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

// ---- Couleurs de fond ----
export const BG_PRESETS: Record<string, { label: string; theme: 'dark' | 'light'; s900: string; s800: string; s700: string }> = {
  night:    { label: 'Nuit',       theme: 'dark',  s900: '#0d0e1a', s800: '#13152a', s700: '#1c1f3a' },
  slate:    { label: 'Ardoise',    theme: 'dark',  s900: '#0f172a', s800: '#1e293b', s700: '#273548' },
  forest:   { label: 'For\u00eat',     theme: 'dark',  s900: '#0c1a12', s800: '#122010', s700: '#1a2e1d' },
  plum:     { label: 'Prune',      theme: 'dark',  s900: '#1a0c1a', s800: '#26112e', s700: '#311840' },
  mahogany: { label: 'Acajou',     theme: 'dark',  s900: '#1a0f0a', s800: '#2a1608', s700: '#3a1e0a' },
  carbon:   { label: 'Carbone',    theme: 'dark',  s900: '#111827', s800: '#1f2937', s700: '#2d3748' },
  mist:     { label: 'Brume',      theme: 'light', s900: '#eef0f8', s800: '#ffffff', s700: '#e4e8f4' },
  pearl:    { label: 'Gris perle', theme: 'light', s900: '#f1f5f9', s800: '#ffffff', s700: '#e2e8f0' },
  mint:     { label: 'Menthe',     theme: 'light', s900: '#f0fdf4', s800: '#ffffff', s700: '#dcfce7' },
  lavender: { label: 'Lavande',    theme: 'light', s900: '#faf5ff', s800: '#ffffff', s700: '#f3e8ff' },
  peach:    { label: 'P\u00eache',      theme: 'light', s900: '#fff7ed', s800: '#ffffff', s700: '#ffedd5' },
  sand:     { label: 'Sable',      theme: 'light', s900: '#fefce8', s800: '#ffffff', s700: '#fef9c3' },
}
export type BgColorKey = keyof typeof BG_PRESETS

export function applyBgColor(key: BgColorKey) {
  const preset = BG_PRESETS[key]
  if (!preset) return
  const target = preset.theme === 'light' ? document.body : document.documentElement
  target.style.setProperty('--s900', preset.s900)
  target.style.setProperty('--s800', preset.s800)
  target.style.setProperty('--s700', preset.s700)
}

export function resetBgColor() {
  document.documentElement.style.removeProperty('--s900')
  document.documentElement.style.removeProperty('--s800')
  document.documentElement.style.removeProperty('--s700')
  document.body.style.removeProperty('--s900')
  document.body.style.removeProperty('--s800')
  document.body.style.removeProperty('--s700')
}

interface PreferencesStore {
  theme: ThemeMode
  accentColor: AccentKey
  bgColorKey: BgColorKey | null
  setTheme: (t: ThemeMode) => void
  setAccentColor: (c: AccentKey) => void
  setBgColor: (k: BgColorKey | null) => void
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      accentColor: 'indigo',
      bgColorKey: null,
      setTheme: (theme) => { set({ theme, bgColorKey: null }); resetBgColor(); applyTheme(theme) },
      setAccentColor: (accentColor) => { set({ accentColor }); applyAccent(accentColor) },
      setBgColor: (bgColorKey) => { set({ bgColorKey }); if (bgColorKey) applyBgColor(bgColorKey); else resetBgColor() }
    }),
    { name: 'filyo-preferences' }
  )
)
