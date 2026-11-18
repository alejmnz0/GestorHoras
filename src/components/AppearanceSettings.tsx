/**
 * Configuración → Apariencia: tema, color de acento (incluido uno libre), paleta de superficies,
 * fondo de pantalla (degradados, patrones o una imagen propia), intensidad y paneles de cristal.
 */
import { Check, ImagePlus, Monitor, Moon, Pipette, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ACCENTS, PALETTES, THEMES, WALLPAPERS } from '../../shared/rules';
import type { Settings, Wallpaper } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { Row } from './SettingsLayout';
import { useToast } from './Toast';
import { Button, Toggle, cx } from './ui';

export function AppearanceSettings({
  settings,
  save,
}: {
  settings: Settings;
  save: (patch: Partial<Settings>) => Promise<void>;
}) {
  const toast = useToast();
  const [custom, setCustom] = useState(settings.customAccent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setCustom(settings.customAccent), [settings.customAccent]);
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const hasWallpaper = settings.wallpaper !== 'none';

  function pickCustom(hex: string) {
    setCustom(hex);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save({ accent: 'custom', customAccent: hex }), 200);
  }

  async function chooseWallpaper(w: Wallpaper) {
    if (w !== 'image') return save({ wallpaper: w });
    if (settings.wallpaperImageId && settings.wallpaper !== 'image') return save({ wallpaper: 'image' });
    try {
      if (await api.appearance.pickWallpaper()) toast.success('Fondo de pantalla actualizado');
    } catch (e) {
      toast.error('No se pudo usar la imagen', errorMessage(e));
    }
  }

  return (
    <>
      <Row label="Tema">
        <div className="flex rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => {
            const Icon = t.value === 'light' ? Sun : t.value === 'dark' ? Moon : Monitor;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={settings.theme === t.value}
                onClick={() => save({ theme: t.value })}
                className={cx(
                  'flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition',
                  settings.theme === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Color de acento" hint="Botones, enlaces y resaltados">
        <div className="grid grid-cols-7 gap-2" role="radiogroup" aria-label="Color de acento">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={settings.accent === a.value}
              title={a.label}
              aria-label={a.label}
              onClick={() => save({ accent: a.value })}
              className={cx(
                'flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition hover:scale-110',
                settings.accent === a.value && 'ring-2 ring-slate-400',
              )}
              style={{ background: a.hex }}
            >
              {settings.accent === a.value && <Check className="size-3.5 text-white" />}
            </button>
          ))}
          <label
            title="Color personalizado"
            className={cx(
              'relative flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-white transition hover:scale-110',
              settings.accent === 'custom' && 'ring-2 ring-slate-400',
            )}
            style={{
              background:
                settings.accent === 'custom'
                  ? custom
                  : 'conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)',
            }}
          >
            <Pipette className="size-3.5 text-white drop-shadow" />
            <input
              type="color"
              aria-label="Color personalizado"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={custom}
              onChange={(e) => pickCustom(e.target.value)}
            />
          </label>
        </div>
      </Row>

      <div className="px-5 py-3.5">
        <p className="text-[13px] font-medium text-slate-700">Paleta</p>
        <p className="text-xs text-slate-400">Tonos de fondos y paneles; cada una tiene versión clara y de noche</p>
        <div className="mt-3 grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Paleta">
          {PALETTES.map((p) => {
            const [bg, panel] = isDark ? p.dark : p.light;
            const on = settings.palette === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => save({ palette: p.value })}
                className={cx(
                  'flex items-center gap-3 rounded-xl border p-2 text-left transition',
                  on ? 'border-brand-500 ring-3 ring-brand-500/15' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <span
                  className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-black/10"
                  style={{ background: bg }}
                >
                  <span className="absolute right-1 bottom-1 left-2.5 top-2.5 rounded-md shadow-sm" style={{ background: panel }} />
                  <span className="absolute bottom-2 left-4 h-1 w-3 rounded-full bg-brand-600" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-slate-800">{p.label}</span>
                  <span className="block truncate text-xs text-slate-400">{p.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3.5">
        <p className="text-[13px] font-medium text-slate-700">Fondo de pantalla</p>
        <p className="text-xs text-slate-400">Se ve detrás de las tarjetas. Puedes usar una imagen tuya (máx. 8 MB)</p>
        <div className="mt-3 grid grid-cols-5 gap-2.5" role="radiogroup" aria-label="Fondo de pantalla">
          {WALLPAPERS.map((w) => {
            const on = settings.wallpaper === w.value;
            return (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => void chooseWallpaper(w.value)}
                className="group text-center"
              >
                <span
                  className={cx(
                    'wp-thumb relative flex h-14 items-center justify-center overflow-hidden rounded-lg border bg-[var(--app-bg)] transition',
                    on ? 'border-brand-500 ring-3 ring-brand-500/20' : 'border-slate-200 group-hover:border-slate-300',
                  )}
                >
                  {w.value !== 'none' && w.value !== 'image' && <span className="app-wallpaper" data-wp={w.value} />}
                  {w.value === 'image' && <ImagePlus className="relative size-5 text-slate-400" />}
                  {on && (
                    <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-brand-600">
                      <Check className="size-3 text-on-accent" />
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-slate-600">{w.label}</span>
              </button>
            );
          })}
        </div>
        {settings.wallpaper === 'image' && (
          <Button size="sm" className="mt-3" icon={<ImagePlus className="size-3.5" />} onClick={async () => {
            try {
              if (await api.appearance.pickWallpaper()) toast.success('Fondo de pantalla actualizado');
            } catch (e) {
              toast.error('No se pudo usar la imagen', errorMessage(e));
            }
          }}>
            Cambiar imagen…
          </Button>
        )}
      </div>

      <Row label="Intensidad del fondo" hint={hasWallpaper ? `${settings.wallpaperIntensity} %` : 'Elige un fondo primero'}>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          disabled={!hasWallpaper}
          defaultValue={settings.wallpaperIntensity}
          key={settings.wallpaperIntensity}
          aria-label="Intensidad del fondo"
          className="w-48 accent-brand-600"
          onMouseUp={(e) => void save({ wallpaperIntensity: Number((e.target as HTMLInputElement).value) })}
          onKeyUp={(e) => void save({ wallpaperIntensity: Number((e.target as HTMLInputElement).value) })}
        />
      </Row>
      <Row label="Paneles de cristal" hint="Tarjetas y menú translúcidos que dejan ver el fondo">
        <Toggle
          checked={settings.glassPanels}
          disabled={!hasWallpaper}
          onChange={(v) => save({ glassPanels: v })}
          label="Paneles de cristal"
        />
      </Row>
    </>
  );
}
