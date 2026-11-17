/**
 * Aplica el tema (claro/oscuro/sistema) y el color de acento al documento.
 * El proceso principal fija nativeTheme.themeSource, de modo que prefers-color-scheme
 * ya refleja la elección del usuario (o la del sistema si eligió «Sistema»).
 */
import type { Settings } from '../../shared/types';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(s: Pick<Settings, 'theme' | 'accent'>): void {
  const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.accent = s.accent;
}

/** Mantiene el tema sincronizado con la configuración y con los cambios del sistema. */
export function watchSystemTheme(get: () => Pick<Settings, 'theme' | 'accent'> | null): () => void {
  const onChange = () => {
    const s = get();
    if (s) applyTheme(s);
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
