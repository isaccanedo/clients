import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { DeleteRecoverRequest } from "@bitwarden/common/models/request/deleteRecoverRequest";

@Component({
  selector: "app-recover-delete",
  templateUrl: "recover-delete.component.html",
})
export class RecoverDeleteComponent {
  email: string;
  formPromise: Promise<any>;

  constructor(
    private router: Router,
    private apiService: ApiService,
    private platformUtilsService: PlatformUtilsService,
    private i18nService: I18nService,
    private logService: LogService
  ) {}

  async submit() {
    try {
      const request = new DeleteRecoverRequest();
      request.email = this.email.trim().toLowerCase();
      this.formPromise = this.apiService.postAccountRecoverDelete(request);
      await this.formPromise;
      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t("deleteRecoverEmailSent")
      );
      this.router.navigate(["/"]);
    } catch (e) {
      this.logService.error(e);
    }
  }
}
