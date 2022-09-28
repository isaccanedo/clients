import { Component, Input } from "@angular/core";

import { ProviderUserStatusType } from "@bitwarden/common/enums/providerUserStatusType";
import { ProviderUserBulkConfirmRequest } from "@bitwarden/common/models/request/provider/providerUserBulkConfirmRequest";
import { ProviderUserBulkRequest } from "@bitwarden/common/models/request/provider/providerUserBulkRequest";

import { BulkConfirmComponent as OrganizationBulkConfirmComponent } from "src/app/organizations/manage/bulk/bulk-confirm.component";
import { BulkUserDetails } from "src/app/organizations/manage/bulk/bulk-status.component";

@Component({
  templateUrl:
    "../../../../../../../apps/web/src/app/organizations/manage/bulk/bulk-confirm.component.html",
})
export class BulkConfirmComponent extends OrganizationBulkConfirmComponent {
  @Input() providerId: string;

  protected isAccepted(user: BulkUserDetails) {
    return user.status === ProviderUserStatusType.Accepted;
  }

  protected async getPublicKeys() {
    const request = new ProviderUserBulkRequest(this.filteredUsers.map((user) => user.id));
    return await this.apiService.postProviderUsersPublicKey(this.providerId, request);
  }

  protected getCryptoKey() {
    return this.cryptoService.getProviderKey(this.providerId);
  }

  protected async postConfirmRequest(userIdsWithKeys: any[]) {
    const request = new ProviderUserBulkConfirmRequest(userIdsWithKeys);
    return await this.apiService.postProviderUserBulkConfirm(this.providerId, request);
  }
}
