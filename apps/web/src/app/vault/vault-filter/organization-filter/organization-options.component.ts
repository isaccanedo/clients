import { Component, Input } from "@angular/core";

import { ModalService } from "@bitwarden/angular/services/modal.service";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { OrganizationApiServiceAbstraction } from "@bitwarden/common/abstractions/organization/organization-api.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { SyncService } from "@bitwarden/common/abstractions/sync/sync.service.abstraction";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { Organization } from "@bitwarden/common/models/domain/organization";
import { Policy } from "@bitwarden/common/models/domain/policy";
import { OrganizationUserResetPasswordEnrollmentRequest } from "@bitwarden/common/models/request/organizationUserResetPasswordEnrollmentRequest";

import { EnrollMasterPasswordReset } from "../../../organizations/users/enroll-master-password-reset.component";

@Component({
  selector: "app-organization-options",
  templateUrl: "organization-options.component.html",
})
export class OrganizationOptionsComponent {
  actionPromise: Promise<void | boolean>;
  policies: Policy[];
  loaded = false;

  @Input() organization: Organization;

  constructor(
    private platformUtilsService: PlatformUtilsService,
    private i18nService: I18nService,
    private apiService: ApiService,
    private syncService: SyncService,
    private policyService: PolicyService,
    private modalService: ModalService,
    private logService: LogService,
    private organizationApiService: OrganizationApiServiceAbstraction
  ) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.policies = await this.policyService.getAll(PolicyType.ResetPassword);
    this.loaded = true;
  }

  allowEnrollmentChanges(org: Organization): boolean {
    if (org.usePolicies && org.useResetPassword && org.hasPublicAndPrivateKeys) {
      const policy = this.policies.find((p) => p.organizationId === org.id);
      if (policy != null && policy.enabled) {
        return org.resetPasswordEnrolled && policy.data.autoEnrollEnabled ? false : true;
      }
    }

    return false;
  }

  showEnrolledStatus(org: Organization): boolean {
    return (
      org.useResetPassword &&
      org.resetPasswordEnrolled &&
      this.policies.some((p) => p.organizationId === org.id && p.enabled)
    );
  }

  async unlinkSso(org: Organization) {
    const confirmed = await this.platformUtilsService.showDialog(
      this.i18nService.t("unlinkSsoConfirmation"),
      org.name,
      this.i18nService.t("yes"),
      this.i18nService.t("no"),
      "warning"
    );
    if (!confirmed) {
      return false;
    }

    try {
      this.actionPromise = this.apiService.deleteSsoUser(org.id).then(() => {
        return this.syncService.fullSync(true);
      });
      await this.actionPromise;
      this.platformUtilsService.showToast("success", null, "Unlinked SSO");
      await this.load();
    } catch (e) {
      this.logService.error(e);
    }
  }

  async leave(org: Organization) {
    const confirmed = await this.platformUtilsService.showDialog(
      this.i18nService.t("leaveOrganizationConfirmation"),
      org.name,
      this.i18nService.t("yes"),
      this.i18nService.t("no"),
      "warning"
    );
    if (!confirmed) {
      return false;
    }

    try {
      this.actionPromise = this.organizationApiService.leave(org.id);
      await this.actionPromise;
      this.platformUtilsService.showToast("success", null, this.i18nService.t("leftOrganization"));
      await this.load();
    } catch (e) {
      this.logService.error(e);
    }
  }

  async toggleResetPasswordEnrollment(org: Organization) {
    if (!this.organization.resetPasswordEnrolled) {
      this.modalService.open(EnrollMasterPasswordReset, {
        allowMultipleModals: true,
        data: {
          organization: org,
        },
      });
    } else {
      // Remove reset password
      const request = new OrganizationUserResetPasswordEnrollmentRequest();
      request.masterPasswordHash = "ignored";
      request.resetPasswordKey = null;
      this.actionPromise = this.apiService.putOrganizationUserResetPasswordEnrollment(
        this.organization.id,
        this.organization.userId,
        request
      );
      try {
        await this.actionPromise;
        this.platformUtilsService.showToast(
          "success",
          null,
          this.i18nService.t("withdrawPasswordResetSuccess")
        );
        this.syncService.fullSync(true);
      } catch (e) {
        this.logService.error(e);
      }
    }
  }
}
