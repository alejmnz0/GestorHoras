/**
 * Aplica el tema (claro/oscuro/sistema), el color de acento, la paleta de superficies y el
 * efecto cristal al documento. El proceso principal fija nativeTheme.themeSource, de modo que
 * prefers-color-scheme ya refleja la elección del usuario (o la del sistema si eligió «Sistema»).
 */
import type { Settings } from '../../shared/types';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export type ThemeSettings = Pick<Settings, 'theme' | 'accent'> &
  Partial<Pick<Settings, 'customAccent' | 'palette' | 'glassPanels' | 'wallpaper'>>;

/** Luminancia relativa (0-1) de un color #rrggbb. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyTheme(s: ThemeSettings): void {
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches);
  root.classList.toggle('dark', dark);
  root.dataset.accent = s.accent;
  root.dataset.palette = s.palette ?? 'default';
  root.dataset.glass = String(!!s.glassPanels && !!s.wallpaper && s.wallpaper !== 'none');
  if (s.accent === 'custom' && s.customAccent) {
    root.style.setProperty('--custom-accent', s.customAccent);
    // Texto oscuro sobre acentos muy claros para que se lea.
    root.style.setProperty('--color-on-accent', luminance(s.customAccent) > 0.45 ? '#0f172a' : '#ffffff');
  } else {
    root.style.removeProperty('--custom-accent');
    root.style.removeProperty('--color-on-accent');
  }
}

/** Mantiene el tema sincronizado con la configuración y con los cambios del sistema. */
export function watchSystemTheme(get: () => ThemeSettings | null): () => void {
  const onChange = () => {
    const s = get();
    if (s) applyTheme(s);
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
