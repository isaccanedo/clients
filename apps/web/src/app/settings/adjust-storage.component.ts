import { Component, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { OrganizationApiServiceAbstraction } from "@bitwarden/common/abstractions/organization/organization-api.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StorageRequest } from "@bitwarden/common/models/request/storageRequest";
import { PaymentResponse } from "@bitwarden/common/models/response/paymentResponse";

import { PaymentComponent } from "./payment.component";

@Component({
  selector: "app-adjust-storage",
  templateUrl: "adjust-storage.component.html",
})
export class AdjustStorageComponent {
  @Input() storageGbPrice = 0;
  @Input() add = true;
  @Input() organizationId: string;
  @Input() interval = "year";
  @Output() onAdjusted = new EventEmitter<number>();
  @Output() onCanceled = new EventEmitter();

  @ViewChild(PaymentComponent, { static: true }) paymentComponent: PaymentComponent;

  storageAdjustment = 0;
  formPromise: Promise<PaymentResponse | void>;

  constructor(
    private apiService: ApiService,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private logService: LogService,
    private organizationApiService: OrganizationApiServiceAbstraction
  ) {}

  async submit() {
    try {
      const request = new StorageRequest();
      request.storageGbAdjustment = this.storageAdjustment;
      if (!this.add) {
        request.storageGbAdjustment *= -1;
      }

      let paymentFailed = false;
      const action = async () => {
        let response: Promise<PaymentResponse>;
        if (this.organizationId == null) {
          response = this.formPromise = this.apiService.postAccountStorage(request);
        } else {
          response = this.formPromise = this.organizationApiService.updateStorage(
            this.organizationId,
            request
          );
        }
        const result = await response;
        if (result != null && result.paymentIntentClientSecret != null) {
          try {
            await this.paymentComponent.handleStripeCardPayment(
              result.paymentIntentClientSecret,
              null
            );
          } catch {
            paymentFailed = true;
          }
        }
      };
      this.formPromise = action();
      await this.formPromise;
      this.onAdjusted.emit(this.storageAdjustment);
      if (paymentFailed) {
        this.platformUtilsService.showToast(
          "warning",
          null,
          this.i18nService.t("couldNotChargeCardPayInvoice"),
          { timeout: 10000 }
        );
        this.router.navigate(["../billing"], { relativeTo: this.activatedRoute });
      } else {
        this.platformUtilsService.showToast(
          "success",
          null,
          this.i18nService.t("adjustedStorage", request.storageGbAdjustment.toString())
        );
      }
    } catch (e) {
      this.logService.error(e);
    }
  }

  cancel() {
    this.onCanceled.emit();
  }

  get adjustedStorageTotal(): number {
    return this.storageGbPrice * this.storageAdjustment;
  }
}
