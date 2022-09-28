import { Directive } from "@angular/core";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { SyncService } from "@bitwarden/common/abstractions/sync/sync.service.abstraction";
import { EncString } from "@bitwarden/common/models/domain/encString";
import { MasterPasswordPolicyOptions } from "@bitwarden/common/models/domain/masterPasswordPolicyOptions";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetricCryptoKey";
import { UpdateTempPasswordRequest } from "@bitwarden/common/models/request/updateTempPasswordRequest";

import { ChangePasswordComponent as BaseChangePasswordComponent } from "./change-password.component";

@Directive()
export class UpdateTempPasswordComponent extends BaseChangePasswordComponent {
  hint: string;
  key: string;
  enforcedPolicyOptions: MasterPasswordPolicyOptions;
  showPassword = false;

  onSuccessfulChangePassword: () => Promise<any>;

  constructor(
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    passwordGenerationService: PasswordGenerationService,
    policyService: PolicyService,
    cryptoService: CryptoService,
    messagingService: MessagingService,
    private apiService: ApiService,
    stateService: StateService,
    private syncService: SyncService,
    private logService: LogService
  ) {
    super(
      i18nService,
      cryptoService,
      messagingService,
      passwordGenerationService,
      platformUtilsService,
      policyService,
      stateService
    );
  }

  async ngOnInit() {
    await this.syncService.fullSync(true);
    super.ngOnInit();
  }

  togglePassword(confirmField: boolean) {
    this.showPassword = !this.showPassword;
    document.getElementById(confirmField ? "masterPasswordRetype" : "masterPassword").focus();
  }

  async setupSubmitActions(): Promise<boolean> {
    this.enforcedPolicyOptions = await this.policyService.getMasterPasswordPolicyOptions();
    this.email = await this.stateService.getEmail();
    this.kdf = await this.stateService.getKdfType();
    this.kdfIterations = await this.stateService.getKdfIterations();
    return true;
  }

  async submit() {
    // Validation
    if (!(await this.strongPassword())) {
      return;
    }

    if (!(await this.setupSubmitActions())) {
      return;
    }

    try {
      // Create new key and hash new password
      const newKey = await this.cryptoService.makeKey(
        this.masterPassword,
        this.email.trim().toLowerCase(),
        this.kdf,
        this.kdfIterations
      );
      const newPasswordHash = await this.cryptoService.hashPassword(this.masterPassword, newKey);

      // Grab user's current enc key
      const userEncKey = await this.cryptoService.getEncKey();

      // Create new encKey for the User
      const newEncKey = await this.cryptoService.remakeEncKey(newKey, userEncKey);

      await this.performSubmitActions(newPasswordHash, newKey, newEncKey);
    } catch (e) {
      this.logService.error(e);
    }
  }

  async performSubmitActions(
    masterPasswordHash: string,
    key: SymmetricCryptoKey,
    encKey: [SymmetricCryptoKey, EncString]
  ) {
    try {
      // Create request
      const request = new UpdateTempPasswordRequest();
      request.key = encKey[1].encryptedString;
      request.newMasterPasswordHash = masterPasswordHash;
      request.masterPasswordHint = this.hint;

      // Update user's password
      this.formPromise = this.apiService.putUpdateTempPassword(request);
      await this.formPromise;
      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t("updatedMasterPassword")
      );

      if (this.onSuccessfulChangePassword != null) {
        this.onSuccessfulChangePassword();
      } else {
        this.messagingService.send("logout");
      }
    } catch (e) {
      this.logService.error(e);
    }
  }
}
