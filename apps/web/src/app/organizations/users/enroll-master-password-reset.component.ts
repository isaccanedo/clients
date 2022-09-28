import { Component } from "@angular/core";

import { ModalRef } from "@bitwarden/angular/components/modal/modal.ref";
import { ModalConfig } from "@bitwarden/angular/services/modal.service";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { OrganizationApiServiceAbstraction } from "@bitwarden/common/abstractions/organization/organization-api.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { SyncService } from "@bitwarden/common/abstractions/sync/sync.service.abstraction";
import { UserVerificationService } from "@bitwarden/common/abstractions/userVerification/userVerification.service.abstraction";
import { Utils } from "@bitwarden/common/misc/utils";
import { Organization } from "@bitwarden/common/models/domain/organization";
import { OrganizationUserResetPasswordEnrollmentRequest } from "@bitwarden/common/models/request/organizationUserResetPasswordEnrollmentRequest";
import { Verification } from "@bitwarden/common/types/verification";

@Component({
  selector: "app-enroll-master-password-reset",
  templateUrl: "enroll-master-password-reset.component.html",
})
export class EnrollMasterPasswordReset {
  organization: Organization;

  verification: Verification;
  formPromise: Promise<void>;

  constructor(
    private userVerificationService: UserVerificationService,
    private apiService: ApiService,
    private platformUtilsService: PlatformUtilsService,
    private i18nService: I18nService,
    private cryptoService: CryptoService,
    private syncService: SyncService,
    private logService: LogService,
    private modalRef: ModalRef,
    config: ModalConfig,
    private organizationApiService: OrganizationApiServiceAbstraction
  ) {
    this.organization = config.data.organization;
  }

  async submit() {
    let toastStringRef = "withdrawPasswordResetSuccess";

    this.formPromise = this.userVerificationService
      .buildRequest(this.verification, OrganizationUserResetPasswordEnrollmentRequest)
      .then(async (request) => {
        // Set variables
        let keyString: string = null;

        // Retrieve Public Key
        const orgKeys = await this.organizationApiService.getKeys(this.organization.id);
        if (orgKeys == null) {
          throw new Error(this.i18nService.t("resetPasswordOrgKeysError"));
        }

        const publicKey = Utils.fromB64ToArray(orgKeys.publicKey);

        // RSA Encrypt user's encKey.key with organization public key
        const encKey = await this.cryptoService.getEncKey();
        const encryptedKey = await this.cryptoService.rsaEncrypt(encKey.key, publicKey.buffer);
        keyString = encryptedKey.encryptedString;
        toastStringRef = "enrollPasswordResetSuccess";

        // Create request and execute enrollment
        request.resetPasswordKey = keyString;
        await this.apiService.putOrganizationUserResetPasswordEnrollment(
          this.organization.id,
          this.organization.userId,
          request
        );

        await this.syncService.fullSync(true);
      });
    try {
      await this.formPromise;
      this.platformUtilsService.showToast("success", null, this.i18nService.t(toastStringRef));
      this.modalRef.close();
    } catch (e) {
      this.logService.error(e);
    }
  }
}
