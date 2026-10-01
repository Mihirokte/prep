import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MenuEvent, PrepApi } from '../shared/api'
import type { Content } from '../shared/types'

// The only surface the page gets: typed calls into the main process. No Node,
// no ipcRenderer, no file system.

const api: PrepApi = {
  content: {
    get: () => ipcRenderer.invoke('content:get'),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, content: Content) => cb(content)
      ipcRenderer.on('content:changed', handler)
      return () => {
        ipcRenderer.removeListener('content:changed', handler)
      }
    },
  },
  progress: {
    get: (key) => ipcRenderer.invoke('progress:get', key),
    set: (key, value) => ipcRenderer.invoke('progress:set', key, value),
    remove: (key) => ipcRenderer.invoke('progress:remove', key),
  },
  agent: {
    run: (request) => ipcRenderer.invoke('agent:run', request),
    cancel: () => ipcRenderer.invoke('agent:cancel'),
    apply: (id) => ipcRenderer.invoke('agent:apply', id),
    discard: (id) => ipcRenderer.invoke('agent:discard', id),
    undo: () => ipcRenderer.invoke('agent:undo'),
    status: () => ipcRenderer.invoke('agent:status'),
  },
  onMenu: (cb) => {
    const handler = (_e: IpcRendererEvent, event: MenuEvent) => cb(event)
    ipcRenderer.on('menu', handler)
    return () => {
      ipcRenderer.removeListener('menu', handler)
    }
  },
}

contextBridge.exposeInMainWorld('prep', api)
