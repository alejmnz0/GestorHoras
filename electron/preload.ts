/**
 * Puente seguro entre la interfaz y el proceso principal (contextIsolation activado).
 * La interfaz solo puede llamar a estas funciones concretas; no tiene acceso a Node.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';
import type { IpcResult } from '../shared/types';

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as T));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: Api = {
  app: {
    info: () => call('app:info'),
    openDataFolder: () => call('app:openDataFolder'),
    logError: (m) => call('app:logError', m),
  },
  users: {
    list: () => call('users:list'),
    create: (name) => call('users:create', name),
    rename: (id, name) => call('users:rename', id, name),
  },
  projects: {
    list: (opts) => call('projects:list', opts),
    create: (input) => call('projects:create', input),
    update: (id, input) => call('projects:update', id, input),
    setActive: (id, active) => call('projects:setActive', id, active),
    remove: (id) => call('projects:remove', id),
  },
  entries: {
    day: (userId, date) => call('entries:day', userId, date),
    create: (input) => call('entries:create', input),
    update: (id, input) => call('entries:update', id, input),
    remove: (id) => call('entries:remove', id),
    history: (filter) => call('entries:history', filter),
    exportHistory: (filter, format) => call('entries:exportHistory', filter, format),
  },
  settings: {
    get: () => call('settings:get'),
    update: (patch) => call('settings:update', patch),
    reset: () => call('settings:reset'),
  },
  reminders: {
    status: () => call('reminders:status'),
    snooze: (m) => call('reminders:snooze', m),
    pause: (o) => call('reminders:pause', o),
    resume: () => call('reminders:resume'),
    test: () => call('reminders:test'),
  },
  backup: {
    export: () => call('backup:export'),
    import: () => call('backup:import'),
  },
  window: {
    toFloating: () => call('window:toFloating'),
  },
  floating: {
    summary: () => call('floating:summary'),
    dragStart: () => ipcRenderer.send('floating:dragStart'),
    dragMove: (dx, dy) => ipcRenderer.send('floating:dragMove', dx, dy),
    dragEnd: () => ipcRenderer.send('floating:dragEnd'),
    click: () => ipcRenderer.send('floating:click'),
    contextMenu: () => ipcRenderer.send('floating:contextMenu'),
    setIgnoreMouse: (ignore) => ipcRenderer.send('floating:setIgnoreMouse', ignore),
  },
  on: {
    dataChanged: (cb) => subscribe('data:changed', cb),
    settingsChanged: (cb) => subscribe('settings:changed', cb),
    reminder: (cb) => subscribe('reminder', cb),
    reminderStatus: (cb) => subscribe('reminders:status', cb),
    floatingShown: (cb) => subscribe('floating:shown', cb),
  },
};

contextBridge.exposeInMainWorld('api', api);
