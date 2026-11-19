// The only bridge from the setup screen (setup.html) to the app. Nothing else
// in the app gets it: the web screens run with no preload at all.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sellixSetup', {
  info: () => ipcRenderer.invoke('setup:info'),
  save: (form) =>
    ipcRenderer.invoke('setup:save', {
      code: String(form?.code ?? ''),
      email: String(form?.email ?? ''),
      password: String(form?.password ?? ''),
    }),
  cancel: () => ipcRenderer.invoke('setup:cancel'),
})
