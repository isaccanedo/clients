import { BehaviorSubject, concatMap } from "rxjs";

import { CipherService } from "../../abstractions/cipher.service";
import { CryptoService } from "../../abstractions/crypto.service";
import { InternalFolderService as InternalFolderServiceAbstraction } from "../../abstractions/folder/folder.service.abstraction";
import { I18nService } from "../../abstractions/i18n.service";
import { StateService } from "../../abstractions/state.service";
import { Utils } from "../../misc/utils";
import { CipherData } from "../../models/data/cipherData";
import { FolderData } from "../../models/data/folderData";
import { Folder } from "../../models/domain/folder";
import { SymmetricCryptoKey } from "../../models/domain/symmetricCryptoKey";
import { FolderView } from "../../models/view/folderView";

export class FolderService implements InternalFolderServiceAbstraction {
  protected _folders: BehaviorSubject<Folder[]> = new BehaviorSubject([]);
  protected _folderViews: BehaviorSubject<FolderView[]> = new BehaviorSubject([]);

  folders$ = this._folders.asObservable();
  folderViews$ = this._folderViews.asObservable();

  constructor(
    private cryptoService: CryptoService,
    private i18nService: I18nService,
    private cipherService: CipherService,
    private stateService: StateService
  ) {
    this.stateService.activeAccountUnlocked$
      .pipe(
        concatMap(async (unlocked) => {
          if (Utils.global.bitwardenContainerService == null) {
            return;
          }

          if (!unlocked) {
            this._folders.next([]);
            this._folderViews.next([]);
            return;
          }

          const data = await this.stateService.getEncryptedFolders();

          await this.updateObservables(data);
        })
      )
      .subscribe();
  }

  async clearCache(): Promise<void> {
    this._folderViews.next([]);
  }

  // TODO: This should be moved to EncryptService or something
  async encrypt(model: FolderView, key?: SymmetricCryptoKey): Promise<Folder> {
    const folder = new Folder();
    folder.id = model.id;
    folder.name = await this.cryptoService.encrypt(model.name, key);
    return folder;
  }

  async get(id: string): Promise<Folder> {
    const folders = this._folders.getValue();

    return folders.find((folder) => folder.id === id);
  }

  /**
   * @deprecated Only use in CLI!
   */
  async getAllDecryptedFromState(): Promise<FolderView[]> {
    const data = await this.stateService.getEncryptedFolders();
    const folders = Object.values(data || {}).map((f) => new Folder(f));

    return this.decryptFolders(folders);
  }

  async upsert(folder: FolderData | FolderData[]): Promise<void> {
    let folders = await this.stateService.getEncryptedFolders();
    if (folders == null) {
      folders = {};
    }

    if (folder instanceof FolderData) {
      const f = folder as FolderData;
      folders[f.id] = f;
    } else {
      (folder as FolderData[]).forEach((f) => {
        folders[f.id] = f;
      });
    }

    await this.updateObservables(folders);
    await this.stateService.setEncryptedFolders(folders);
  }

  async replace(folders: { [id: string]: FolderData }): Promise<void> {
    await this.updateObservables(folders);
    await this.stateService.setEncryptedFolders(folders);
  }

  async clear(userId?: string): Promise<any> {
    if (userId == null || userId == (await this.stateService.getUserId())) {
      this._folders.next([]);
      this._folderViews.next([]);
    }
    await this.stateService.setEncryptedFolders(null, { userId: userId });
  }

  async delete(id: string | string[]): Promise<any> {
    const folders = await this.stateService.getEncryptedFolders();
    if (folders == null) {
      return;
    }

    if (typeof id === "string") {
      if (folders[id] == null) {
        return;
      }
      delete folders[id];
    } else {
      (id as string[]).forEach((i) => {
        delete folders[i];
      });
    }

    await this.updateObservables(folders);
    await this.stateService.setEncryptedFolders(folders);

    // Items in a deleted folder are re-assigned to "No Folder"
    const ciphers = await this.stateService.getEncryptedCiphers();
    if (ciphers != null) {
      const updates: CipherData[] = [];
      for (const cId in ciphers) {
        if (ciphers[cId].folderId === id) {
          ciphers[cId].folderId = null;
          updates.push(ciphers[cId]);
        }
      }
      if (updates.length > 0) {
        this.cipherService.upsert(updates);
      }
    }
  }

  private async updateObservables(foldersMap: { [id: string]: FolderData }) {
    const folders = Object.values(foldersMap || {}).map((f) => new Folder(f));

    this._folders.next(folders);

    if (await this.cryptoService.hasKey()) {
      this._folderViews.next(await this.decryptFolders(folders));
    }
  }

  private async decryptFolders(folders: Folder[]) {
    const decryptFolderPromises = folders.map((f) => f.decrypt());
    const decryptedFolders = await Promise.all(decryptFolderPromises);

    decryptedFolders.sort(Utils.getSortFunction(this.i18nService, "name"));

    const noneFolder = new FolderView();
    noneFolder.name = this.i18nService.t("noneFolder");
    decryptedFolders.push(noneFolder);

    return decryptedFolders;
  }
}
