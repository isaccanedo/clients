import { Component, Input } from "@angular/core";

import { ProviderUserBulkRequest } from "@bitwarden/common/models/request/provider/providerUserBulkRequest";

import { BulkRemoveComponent as OrganizationBulkRemoveComponent } from "src/app/organizations/manage/bulk/bulk-remove.component";

@Component({
  templateUrl:
    "../../../../../../../apps/web/src/app/organizations/manage/bulk/bulk-remove.component.html",
})
export class BulkRemoveComponent extends OrganizationBulkRemoveComponent {
  @Input() providerId: string;

  async deleteUsers() {
    const request = new ProviderUserBulkRequest(this.users.map((user) => user.id));
    return await this.apiService.deleteManyProviderUsers(this.providerId, request);
  }

  protected get removeUsersWarning() {
    return this.i18nService.t("removeUsersWarning");
  }
}
