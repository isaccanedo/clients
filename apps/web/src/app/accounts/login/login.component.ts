import { Component, NgZone } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { first } from "rxjs/operators";

import { LoginComponent as BaseLoginComponent } from "@bitwarden/angular/components/login.component";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AuthService } from "@bitwarden/common/abstractions/auth.service";
import { CryptoFunctionService } from "@bitwarden/common/abstractions/cryptoFunction.service";
import { EnvironmentService } from "@bitwarden/common/abstractions/environment.service";
import { FormValidationErrorsService } from "@bitwarden/common/abstractions/formValidationErrors.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/abstractions/policy/policy-api.service.abstraction";
import { InternalPolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { PolicyData } from "@bitwarden/common/models/data/policyData";
import { MasterPasswordPolicyOptions } from "@bitwarden/common/models/domain/masterPasswordPolicyOptions";
import { Policy } from "@bitwarden/common/models/domain/policy";
import { ListResponse } from "@bitwarden/common/models/response/listResponse";
import { PolicyResponse } from "@bitwarden/common/models/response/policyResponse";

import { flagEnabled } from "../../../utils/flags";
import { RouterService, StateService } from "../../core";

@Component({
  selector: "app-login",
  templateUrl: "login.component.html",
})
// eslint-disable-next-line rxjs-angular/prefer-takeuntil
export class LoginComponent extends BaseLoginComponent {
  showResetPasswordAutoEnrollWarning = false;
  enforcedPasswordPolicyOptions: MasterPasswordPolicyOptions;
  policies: ListResponse<PolicyResponse>;
  showPasswordless = false;

  constructor(
    authService: AuthService,
    router: Router,
    i18nService: I18nService,
    private route: ActivatedRoute,
    platformUtilsService: PlatformUtilsService,
    environmentService: EnvironmentService,
    passwordGenerationService: PasswordGenerationService,
    cryptoFunctionService: CryptoFunctionService,
    private apiService: ApiService,
    private policyApiService: PolicyApiServiceAbstraction,
    private policyService: InternalPolicyService,
    logService: LogService,
    ngZone: NgZone,
    protected stateService: StateService,
    private messagingService: MessagingService,
    private routerService: RouterService,
    formBuilder: FormBuilder,
    formValidationErrorService: FormValidationErrorsService
  ) {
    super(
      authService,
      router,
      platformUtilsService,
      i18nService,
      stateService,
      environmentService,
      passwordGenerationService,
      cryptoFunctionService,
      logService,
      ngZone,
      formBuilder,
      formValidationErrorService
    );
    this.onSuccessfulLogin = async () => {
      this.messagingService.send("setFullWidth");
    };
    this.onSuccessfulLoginNavigate = this.goAfterLogIn;
    this.showPasswordless = flagEnabled("showPasswordless");
  }

  async ngOnInit() {
    // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
    this.route.queryParams.pipe(first()).subscribe(async (qParams) => {
      if (qParams.email != null && qParams.email.indexOf("@") > -1) {
        this.formGroup.get("email")?.setValue(qParams.email);
      }
      if (qParams.premium != null) {
        this.routerService.setPreviousUrl("/settings/premium");
      } else if (qParams.org != null) {
        const route = this.router.createUrlTree(["create-organization"], {
          queryParams: { plan: qParams.org },
        });
        this.routerService.setPreviousUrl(route.toString());
      }

      // Are they coming from an email for sponsoring a families organization
      if (qParams.sponsorshipToken != null) {
        const route = this.router.createUrlTree(["setup/families-for-enterprise"], {
          queryParams: { token: qParams.sponsorshipToken },
        });
        this.routerService.setPreviousUrl(route.toString());
      }
      await super.ngOnInit();
      const rememberEmail = await this.stateService.getRememberEmail();
      this.formGroup.get("rememberEmail")?.setValue(rememberEmail);
    });

    const invite = await this.stateService.getOrganizationInvitation();
    if (invite != null) {
      let policyList: Policy[] = null;
      try {
        this.policies = await this.policyApiService.getPoliciesByToken(
          invite.organizationId,
          invite.token,
          invite.email,
          invite.organizationUserId
        );
        policyList = this.policyService.mapPoliciesFromToken(this.policies);
      } catch (e) {
        this.logService.error(e);
      }

      if (policyList != null) {
        const resetPasswordPolicy = this.policyService.getResetPasswordPolicyOptions(
          policyList,
          invite.organizationId
        );
        // Set to true if policy enabled and auto-enroll enabled
        this.showResetPasswordAutoEnrollWarning =
          resetPasswordPolicy[1] && resetPasswordPolicy[0].autoEnrollEnabled;

        this.enforcedPasswordPolicyOptions =
          await this.policyService.getMasterPasswordPolicyOptions(policyList);
      }
    }
  }

  async goAfterLogIn() {
    const masterPassword = this.formGroup.get("masterPassword")?.value;

    // Check master password against policy
    if (this.enforcedPasswordPolicyOptions != null) {
      const strengthResult = this.passwordGenerationService.passwordStrength(
        masterPassword,
        this.getPasswordStrengthUserInput()
      );
      const masterPasswordScore = strengthResult == null ? null : strengthResult.score;

      // If invalid, save policies and require update
      if (
        !this.policyService.evaluateMasterPassword(
          masterPasswordScore,
          masterPassword,
          this.enforcedPasswordPolicyOptions
        )
      ) {
        const policiesData: { [id: string]: PolicyData } = {};
        this.policies.data.map((p) => (policiesData[p.id] = new PolicyData(p)));
        await this.policyService.replace(policiesData);
        this.router.navigate(["update-password"]);
        return;
      }
    }

    const previousUrl = this.routerService.getPreviousUrl();
    if (previousUrl) {
      this.router.navigateByUrl(previousUrl);
    } else {
      this.router.navigate([this.successRoute]);
    }
  }

  async submit() {
    const rememberEmail = this.formGroup.get("rememberEmail")?.value;

    await this.stateService.setRememberEmail(rememberEmail);
    if (!rememberEmail) {
      await this.stateService.setRememberedEmail(null);
    }
    await super.submit(false);
  }

  async startPasswordlessLogin() {
    this.formGroup.get("masterPassword")?.clearValidators();
    this.formGroup.get("masterPassword")?.updateValueAndValidity();

    if (!this.formGroup.valid) {
      return;
    }

    const email = this.formGroup.get("email").value;
    this.router.navigate(["/login-with-device"], { state: { email: email } });
  }

  private getPasswordStrengthUserInput() {
    const email = this.formGroup.get("email")?.value;
    let userInput: string[] = [];
    const atPosition = email.indexOf("@");
    if (atPosition > -1) {
      userInput = userInput.concat(
        email
          .substr(0, atPosition)
          .trim()
          .toLowerCase()
          .split(/[^A-Za-z0-9]/)
      );
    }
    return userInput;
  }
}
