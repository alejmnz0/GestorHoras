/**
 * Estado global mínimo: configuración, usuarios y un contador que cambia cuando
 * el proceso principal avisa de que los datos se han modificado.
 */
import { createContext, useContext } from 'react';
import type { Settings, User } from '../../shared/types';

export interface AppState {
  settings: Settings;
  users: User[];
  /** Se incrementa cada vez que cambian los datos (para recargar listas). */
  dataVersion: number;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  reloadUsers: () => Promise<User[]>;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const c = useContext(AppContext);
  if (!c) throw new Error('AppContext ausente');
  return c;
}
