import { Component } from "@angular/core";
import { UntypedFormBuilder } from "@angular/forms";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PolicyType } from "@bitwarden/common/enums/policyType";

import { BasePolicy, BasePolicyComponent } from "./base-policy.component";

export class MasterPasswordPolicy extends BasePolicy {
  name = "masterPassPolicyTitle";
  description = "masterPassPolicyDesc";
  type = PolicyType.MasterPassword;
  component = MasterPasswordPolicyComponent;
}

@Component({
  selector: "policy-master-password",
  templateUrl: "master-password.component.html",
})
export class MasterPasswordPolicyComponent extends BasePolicyComponent {
  data = this.formBuilder.group({
    minComplexity: [null],
    minLength: [null],
    requireUpper: [null],
    requireLower: [null],
    requireNumbers: [null],
    requireSpecial: [null],
  });

  passwordScores: { name: string; value: number }[];
  showKeyConnectorInfo = false;

  constructor(
    private formBuilder: UntypedFormBuilder,
    i18nService: I18nService,
    private organizationService: OrganizationService
  ) {
    super();

    this.passwordScores = [
      { name: "-- " + i18nService.t("select") + " --", value: null },
      { name: i18nService.t("weak") + " (0)", value: 0 },
      { name: i18nService.t("weak") + " (1)", value: 1 },
      { name: i18nService.t("weak") + " (2)", value: 2 },
      { name: i18nService.t("good") + " (3)", value: 3 },
      { name: i18nService.t("strong") + " (4)", value: 4 },
    ];
  }

  async ngOnInit() {
    super.ngOnInit();
    const organization = await this.organizationService.get(this.policyResponse.organizationId);
    this.showKeyConnectorInfo = organization.keyConnectorEnabled;
  }
}
