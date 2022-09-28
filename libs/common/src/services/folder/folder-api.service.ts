import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { FolderApiServiceAbstraction } from "@bitwarden/common/abstractions/folder/folder-api.service.abstraction";
import { InternalFolderService } from "@bitwarden/common/abstractions/folder/folder.service.abstraction";
import { FolderData } from "@bitwarden/common/models/data/folderData";
import { Folder } from "@bitwarden/common/models/domain/folder";
import { FolderRequest } from "@bitwarden/common/models/request/folderRequest";
import { FolderResponse } from "@bitwarden/common/models/response/folderResponse";

export class FolderApiService implements FolderApiServiceAbstraction {
  constructor(private folderService: InternalFolderService, private apiService: ApiService) {}

  async save(folder: Folder): Promise<any> {
    const request = new FolderRequest(folder);

    let response: FolderResponse;
    if (folder.id == null) {
      response = await this.postFolder(request);
      folder.id = response.id;
    } else {
      response = await this.putFolder(folder.id, request);
    }

    const data = new FolderData(response);
    await this.folderService.upsert(data);
  }

  async delete(id: string): Promise<any> {
    await this.deleteFolder(id);
    await this.folderService.delete(id);
  }

  async get(id: string): Promise<FolderResponse> {
    const r = await this.apiService.send("GET", "/folders/" + id, null, true, true);
    return new FolderResponse(r);
  }

  private async postFolder(request: FolderRequest): Promise<FolderResponse> {
    const r = await this.apiService.send("POST", "/folders", request, true, true);
    return new FolderResponse(r);
  }

  async putFolder(id: string, request: FolderRequest): Promise<FolderResponse> {
    const r = await this.apiService.send("PUT", "/folders/" + id, request, true, true);
    return new FolderResponse(r);
  }

  private deleteFolder(id: string): Promise<any> {
    return this.apiService.send("DELETE", "/folders/" + id, null, true, false);
  }
}
