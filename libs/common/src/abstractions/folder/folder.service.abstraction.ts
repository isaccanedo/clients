import { Observable } from "rxjs";

import { FolderData } from "../../models/data/folderData";
import { Folder } from "../../models/domain/folder";
import { SymmetricCryptoKey } from "../../models/domain/symmetricCryptoKey";
import { FolderView } from "../../models/view/folderView";

export abstract class FolderService {
  folders$: Observable<Folder[]>;
  folderViews$: Observable<FolderView[]>;

  clearCache: () => Promise<void>;
  encrypt: (model: FolderView, key?: SymmetricCryptoKey) => Promise<Folder>;
  get: (id: string) => Promise<Folder>;
  /**
   * @deprecated Only use in CLI!
   */
  getAllDecryptedFromState: () => Promise<FolderView[]>;
}

export abstract class InternalFolderService extends FolderService {
  upsert: (folder: FolderData | FolderData[]) => Promise<void>;
  replace: (folders: { [id: string]: FolderData }) => Promise<void>;
  clear: (userId: string) => Promise<any>;
  delete: (id: string | string[]) => Promise<any>;
}
