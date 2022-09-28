import { Component, ViewChild, ViewContainerRef } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { ModalService } from "@bitwarden/angular/services/modal.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { OrganizationApiServiceAbstraction } from "@bitwarden/common/abstractions/organization/organization-api.service.abstraction";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { OrganizationKeysRequest } from "@bitwarden/common/models/request/organizationKeysRequest";
import { OrganizationUpdateRequest } from "@bitwarden/common/models/request/organizationUpdateRequest";
import { OrganizationResponse } from "@bitwarden/common/models/response/organizationResponse";

import { ApiKeyComponent } from "../../settings/api-key.component";
import { PurgeVaultComponent } from "../../settings/purge-vault.component";
import { TaxInfoComponent } from "../../settings/tax-info.component";

import { DeleteOrganizationComponent } from "./delete-organization.component";

@Component({
  selector: "app-org-account",
  templateUrl: "account.component.html",
})
// eslint-disable-next-line rxjs-angular/prefer-takeuntil
export class AccountComponent {
  @ViewChild("deleteOrganizationTemplate", { read: ViewContainerRef, static: true })
  deleteModalRef: ViewContainerRef;
  @ViewChild("purgeOrganizationTemplate", { read: ViewContainerRef, static: true })
  purgeModalRef: ViewContainerRef;
  @ViewChild("apiKeyTemplate", { read: ViewContainerRef, static: true })
  apiKeyModalRef: ViewContainerRef;
  @ViewChild("rotateApiKeyTemplate", { read: ViewContainerRef, static: true })
  rotateApiKeyModalRef: ViewContainerRef;
  @ViewChild(TaxInfoComponent) taxInfo: TaxInfoComponent;

  selfHosted = false;
  canManageBilling = true;
  loading = true;
  canUseApi = false;
  org: OrganizationResponse;
  formPromise: Promise<OrganizationResponse>;
  taxFormPromise: Promise<unknown>;

  private organizationId: string;

  constructor(
    private modalService: ModalService,
    private i18nService: I18nService,
    private route: ActivatedRoute,
    private platformUtilsService: PlatformUtilsService,
    private cryptoService: CryptoService,
    private logService: LogService,
    private router: Router,
    private organizationService: OrganizationService,
    private organizationApiService: OrganizationApiServiceAbstraction
  ) {}

  async ngOnInit() {
    this.selfHosted = this.platformUtilsService.isSelfHost();

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
    this.route.parent.parent.params.subscribe(async (params) => {
      this.organizationId = params.organizationId;
      this.canManageBilling = this.organizationService.get(this.organizationId).canManageBilling;
      try {
        this.org = await this.organizationApiService.get(this.organizationId);
        this.canUseApi = this.org.useApi;
      } catch (e) {
        this.logService.error(e);
      }
    });
    this.loading = false;
  }

  async submit() {
    try {
      const request = new OrganizationUpdateRequest();
      request.name = this.org.name;
      request.businessName = this.org.businessName;
      request.billingEmail = this.org.billingEmail;
      request.identifier = this.org.identifier;

      // Backfill pub/priv key if necessary
      if (!this.org.hasPublicAndPrivateKeys) {
        const orgShareKey = await this.cryptoService.getOrgKey(this.organizationId);
        const orgKeys = await this.cryptoService.makeKeyPair(orgShareKey);
        request.keys = new OrganizationKeysRequest(orgKeys[0], orgKeys[1].encryptedString);
      }

      this.formPromise = this.organizationApiService.save(this.organizationId, request);
      await this.formPromise;
      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t("organizationUpdated")
      );
    } catch (e) {
      this.logService.error(e);
    }
  }

  async submitTaxInfo() {
    this.taxFormPromise = this.taxInfo.submitTaxInfo();
    await this.taxFormPromise;
    this.platformUtilsService.showToast("success", null, this.i18nService.t("taxInfoUpdated"));
  }

  async deleteOrganization() {
    await this.modalService.openViewRef(
      DeleteOrganizationComponent,
      this.deleteModalRef,
      (comp) => {
        comp.organizationId = this.organizationId;
        // eslint-disable-next-line rxjs-angular/prefer-takeuntil
        comp.onSuccess.subscribe(() => {
          this.router.navigate(["/"]);
        });
      }
    );
  }

  async purgeVault() {
    await this.modalService.openViewRef(PurgeVaultComponent, this.purgeModalRef, (comp) => {
      comp.organizationId = this.organizationId;
    });
  }

  async viewApiKey() {
    await this.modalService.openViewRef(ApiKeyComponent, this.apiKeyModalRef, (comp) => {
      comp.keyType = "organization";
      comp.entityId = this.organizationId;
      comp.postKey = this.organizationApiService.getOrCreateApiKey.bind(
        this.organizationApiService
      );
      comp.scope = "api.organization";
      comp.grantType = "client_credentials";
      comp.apiKeyTitle = "apiKey";
      comp.apiKeyWarning = "apiKeyWarning";
      comp.apiKeyDescription = "apiKeyDesc";
    });
  }

  async rotateApiKey() {
    await this.modalService.openViewRef(ApiKeyComponent, this.rotateApiKeyModalRef, (comp) => {
      comp.keyType = "organization";
      comp.isRotation = true;
      comp.entityId = this.organizationId;
      comp.postKey = this.organizationApiService.rotateApiKey.bind(this.organizationApiService);
      comp.scope = "api.organization";
      comp.grantType = "client_credentials";
      comp.apiKeyTitle = "apiKey";
      comp.apiKeyWarning = "apiKeyWarning";
      comp.apiKeyDescription = "apiKeyRotateDesc";
    });
  }
}
