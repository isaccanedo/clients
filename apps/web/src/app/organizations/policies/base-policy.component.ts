import { Directive, Input, OnInit } from "@angular/core";
import { UntypedFormControl, UntypedFormGroup } from "@angular/forms";

import { PolicyType } from "@bitwarden/common/enums/policyType";
import { Organization } from "@bitwarden/common/models/domain/organization";
import { PolicyRequest } from "@bitwarden/common/models/request/policyRequest";
import { PolicyResponse } from "@bitwarden/common/models/response/policyResponse";

export abstract class BasePolicy {
  abstract name: string;
  abstract description: string;
  abstract type: PolicyType;
  abstract component: any;

  display(organization: Organization) {
    return true;
  }
}

@Directive()
export abstract class BasePolicyComponent implements OnInit {
  @Input() policyResponse: PolicyResponse;
  @Input() policy: BasePolicy;

  enabled = new UntypedFormControl(false);
  data: UntypedFormGroup = null;

  ngOnInit(): void {
    this.enabled.setValue(this.policyResponse.enabled);

    if (this.policyResponse.data != null) {
      this.loadData();
    }
  }

  loadData() {
    this.data.patchValue(this.policyResponse.data ?? {});
  }

  buildRequestData() {
    if (this.data != null) {
      return this.data.value;
    }

    return null;
  }

  buildRequest(policiesEnabledMap: Map<PolicyType, boolean>) {
    const request = new PolicyRequest();
    request.enabled = this.enabled.value;
    request.type = this.policy.type;
    request.data = this.buildRequestData();

    return Promise.resolve(request);
  }
}
