// v1: the renderer is the same pure browser app as apps/web (@oscillo-synth/ui-web)
// and needs zero Node/Electron API access. This file intentionally exposes
// nothing. If a future feature needs main-process access (native save
// dialogs, etc.), add it here via contextBridge.exposeInMainWorld — do not
// disable contextIsolation/sandbox to get there.
export {};
