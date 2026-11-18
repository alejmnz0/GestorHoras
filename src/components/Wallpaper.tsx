/**
 * Capa de fondo de pantalla detrás de toda la interfaz (degradados, patrones o imagen propia).
 */
import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types';
import { api } from '../lib/api';

export function Wallpaper({ settings }: { settings: Settings }) {
  const [image, setImage] = useState<string | null>(null);
  const wantsImage = settings.wallpaper === 'image';

  useEffect(() => {
    if (!wantsImage) return setImage(null);
    let alive = true;
    api.appearance
      .wallpaperImage()
      .then((url) => alive && setImage(url))
      .catch(() => alive && setImage(null));
    return () => {
      alive = false;
    };
  }, [wantsImage, settings.wallpaperImageId]);

  if (settings.wallpaper === 'none' || (wantsImage && !image)) return null;
  return (
    <div
      aria-hidden
      className="app-wallpaper"
      data-wp={settings.wallpaper}
      style={
        {
          '--wp-intensity': settings.wallpaperIntensity / 100,
          ...(image ? { '--wp-image': `url("${image}")` } : {}),
        } as React.CSSProperties
      }
    />
  );
}
