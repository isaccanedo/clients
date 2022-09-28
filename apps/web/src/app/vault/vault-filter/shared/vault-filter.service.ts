import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

import { DynamicTreeNode } from "@bitwarden/angular/vault/vault-filter/models/dynamic-tree-node.model";
import { VaultFilterService as BaseVaultFilterService } from "@bitwarden/angular/vault/vault-filter/services/vault-filter.service";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CipherService } from "@bitwarden/common/abstractions/cipher.service";
import { CollectionService } from "@bitwarden/common/abstractions/collection.service";
import { FolderService } from "@bitwarden/common/abstractions/folder/folder.service.abstraction";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { CollectionData } from "@bitwarden/common/models/data/collectionData";
import { Collection } from "@bitwarden/common/models/domain/collection";
import { CollectionDetailsResponse } from "@bitwarden/common/models/response/collectionResponse";
import { CollectionView } from "@bitwarden/common/models/view/collectionView";

@Injectable()
export class VaultFilterService extends BaseVaultFilterService {
  private _collapsedFilterNodes = new BehaviorSubject<Set<string>>(null);
  collapsedFilterNodes$: Observable<Set<string>> = this._collapsedFilterNodes.asObservable();

  constructor(
    stateService: StateService,
    organizationService: OrganizationService,
    folderService: FolderService,
    cipherService: CipherService,
    collectionService: CollectionService,
    policyService: PolicyService,
    private i18nService: I18nService,
    protected apiService: ApiService
  ) {
    super(
      stateService,
      organizationService,
      folderService,
      cipherService,
      collectionService,
      policyService
    );
  }

  async buildCollapsedFilterNodes(): Promise<Set<string>> {
    const nodes = await super.buildCollapsedFilterNodes();
    this._collapsedFilterNodes.next(nodes);
    return nodes;
  }

  async storeCollapsedFilterNodes(collapsedFilterNodes: Set<string>): Promise<void> {
    await super.storeCollapsedFilterNodes(collapsedFilterNodes);
    this._collapsedFilterNodes.next(collapsedFilterNodes);
  }

  async ensureVaultFiltersAreExpanded() {
    const collapsedFilterNodes = await super.buildCollapsedFilterNodes();
    if (!collapsedFilterNodes.has("vaults")) {
      return;
    }
    collapsedFilterNodes.delete("vaults");
    await this.storeCollapsedFilterNodes(collapsedFilterNodes);
  }

  async buildAdminCollections(organizationId: string) {
    let result: CollectionView[] = [];
    const collectionResponse = await this.apiService.getCollections(organizationId);
    if (collectionResponse?.data != null && collectionResponse.data.length) {
      const collectionDomains = collectionResponse.data.map(
        (r: CollectionDetailsResponse) => new Collection(new CollectionData(r))
      );
      result = await this.collectionService.decryptMany(collectionDomains);
    }

    const noneCollection = new CollectionView();
    noneCollection.name = this.i18nService.t("unassigned");
    noneCollection.organizationId = organizationId;
    result.push(noneCollection);

    const nestedCollections = await this.collectionService.getAllNested(result);
    return new DynamicTreeNode<CollectionView>({
      fullList: result,
      nestedList: nestedCollections,
    });
  }
}
