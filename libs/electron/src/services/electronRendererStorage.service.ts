import { ipcRenderer } from "electron";

import { AbstractStorageService } from "@bitwarden/common/abstractions/storage.service";

export class ElectronRendererStorageService implements AbstractStorageService {
  get<T>(key: string): Promise<T> {
    return ipcRenderer.invoke("storageService", {
      action: "get",
      key: key,
    });
  }

  has(key: string): Promise<boolean> {
    return ipcRenderer.invoke("storageService", {
      action: "has",
      key: key,
    });
  }

  save(key: string, obj: any): Promise<any> {
    return ipcRenderer.invoke("storageService", {
      action: "save",
      key: key,
      obj: obj,
    });
  }

  remove(key: string): Promise<any> {
    return ipcRenderer.invoke("storageService", {
      action: "remove",
      key: key,
    });
  }
}
