const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("jarvisSettings", {
  get: () => ipcRenderer.invoke("settings:get"),
  save: (s) => ipcRenderer.invoke("settings:save", s)
});
