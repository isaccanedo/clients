import {
  ChangeDetectorRef,
  Component,
  ComponentFactoryResolver,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ViewContainerRef,
} from "@angular/core";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/abstractions/policy/policy-api.service.abstraction";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { PolicyRequest } from "@bitwarden/common/models/request/policyRequest";
import { PolicyResponse } from "@bitwarden/common/models/response/policyResponse";

import { BasePolicy, BasePolicyComponent } from "../policies/base-policy.component";

@Component({
  selector: "app-policy-edit",
  templateUrl: "policy-edit.component.html",
})
export class PolicyEditComponent {
  @Input() policy: BasePolicy;
  @Input() organizationId: string;
  @Input() policiesEnabledMap: Map<PolicyType, boolean> = new Map<PolicyType, boolean>();
  @Output() onSavedPolicy = new EventEmitter();

  @ViewChild("policyForm", { read: ViewContainerRef, static: true })
  policyFormRef: ViewContainerRef;

  policyType = PolicyType;
  loading = true;
  enabled = false;
  formPromise: Promise<any>;
  defaultTypes: any[];
  policyComponent: BasePolicyComponent;

  private policyResponse: PolicyResponse;

  constructor(
    private policyApiService: PolicyApiServiceAbstraction,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
    private componentFactoryResolver: ComponentFactoryResolver,
    private cdr: ChangeDetectorRef,
    private logService: LogService
  ) {}

  async ngAfterViewInit() {
    await this.load();
    this.loading = false;

    const factory = this.componentFactoryResolver.resolveComponentFactory(this.policy.component);
    this.policyComponent = this.policyFormRef.createComponent(factory)
      .instance as BasePolicyComponent;
    this.policyComponent.policy = this.policy;
    this.policyComponent.policyResponse = this.policyResponse;

    this.cdr.detectChanges();
  }

  async load() {
    try {
      this.policyResponse = await this.policyApiService.getPolicy(
        this.organizationId,
        this.policy.type
      );
    } catch (e) {
      if (e.statusCode === 404) {
        this.policyResponse = new PolicyResponse({ Enabled: false });
      } else {
        throw e;
      }
    }
  }

  async submit() {
    let request: PolicyRequest;
    try {
      request = await this.policyComponent.buildRequest(this.policiesEnabledMap);
    } catch (e) {
      this.platformUtilsService.showToast("error", null, e.message);
      return;
    }

    try {
      this.formPromise = this.policyApiService.putPolicy(
        this.organizationId,
        this.policy.type,
        request
      );
      await this.formPromise;
      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t("editedPolicyId", this.i18nService.t(this.policy.name))
      );
      this.onSavedPolicy.emit();
    } catch (e) {
      this.logService.error(e);
    }
  }
}
