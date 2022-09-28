import { Component, OnDestroy, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { Subject, takeUntil } from "rxjs";

import { CaptchaProtectedComponent } from "@bitwarden/angular/components/captchaProtected.component";
import { AnonymousHubService } from "@bitwarden/common/abstractions/anonymousHub.service";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AppIdService } from "@bitwarden/common/abstractions/appId.service";
import { AuthService } from "@bitwarden/common/abstractions/auth.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { CryptoFunctionService } from "@bitwarden/common/abstractions/cryptoFunction.service";
import { EnvironmentService } from "@bitwarden/common/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { AuthRequestType } from "@bitwarden/common/enums/authRequestType";
import { Utils } from "@bitwarden/common/misc/utils";
import { PasswordlessLogInCredentials } from "@bitwarden/common/models/domain/logInCredentials";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetricCryptoKey";
import { PasswordlessCreateAuthRequest } from "@bitwarden/common/models/request/passwordlessCreateAuthRequest";
import { AuthRequestResponse } from "@bitwarden/common/models/response/authRequestResponse";

@Component({
  selector: "app-login-with-device",
  templateUrl: "login-with-device.component.html",
})
export class LoginWithDeviceComponent
  extends CaptchaProtectedComponent
  implements OnInit, OnDestroy
{
  private destroy$ = new Subject<void>();
  email: string;
  showResendNotification = false;
  passwordlessRequest: PasswordlessCreateAuthRequest;
  onSuccessfulLoginTwoFactorNavigate: () => Promise<any>;
  onSuccessfulLogin: () => Promise<any>;
  onSuccessfulLoginNavigate: () => Promise<any>;

  protected twoFactorRoute = "2fa";
  protected successRoute = "vault";
  private authRequestKeyPair: [publicKey: ArrayBuffer, privateKey: ArrayBuffer];

  constructor(
    private router: Router,
    private cryptoService: CryptoService,
    private cryptoFunctionService: CryptoFunctionService,
    private appIdService: AppIdService,
    private passwordGenerationService: PasswordGenerationService,
    private apiService: ApiService,
    private authService: AuthService,
    private logService: LogService,
    private stateService: StateService,
    environmentService: EnvironmentService,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    private anonymousHubService: AnonymousHubService
  ) {
    super(environmentService, i18nService, platformUtilsService);

    const navigation = this.router.getCurrentNavigation();
    if (navigation) {
      this.email = navigation.extras?.state?.email;
    }

    //gets signalR push notification
    this.authService
      .getPushNotifcationObs$()
      .pipe(takeUntil(this.destroy$))
      .subscribe((id) => {
        this.confirmResponse(id);
      });
  }

  async ngOnInit() {
    if (!this.email) {
      this.router.navigate(["/login"]);
      return;
    }

    this.startPasswordlessLogin();
  }

  async startPasswordlessLogin() {
    this.showResendNotification = false;

    try {
      await this.buildAuthRequest();
      const reqResponse = await this.apiService.postAuthRequest(this.passwordlessRequest);

      if (reqResponse.id) {
        this.anonymousHubService.createHubConnection(reqResponse.id);
      }
    } catch (e) {
      this.logService.error(e);
    }

    setTimeout(() => {
      this.showResendNotification = true;
    }, 12000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.anonymousHubService.stopHubConnection();
  }

  private async confirmResponse(requestId: string) {
    try {
      const response = await this.apiService.getAuthResponse(
        requestId,
        this.passwordlessRequest.accessCode
      );

      if (!response.requestApproved) {
        return;
      }

      const credentials = await this.buildLoginCredntials(requestId, response);
      await this.authService.logIn(credentials);
      if (this.onSuccessfulLogin != null) {
        this.onSuccessfulLogin();
      }
      if (this.onSuccessfulLoginNavigate != null) {
        this.onSuccessfulLoginNavigate();
      } else {
        this.router.navigate([this.successRoute]);
      }
    } catch (error) {
      this.logService.error(error);
    }
  }

  private async buildAuthRequest() {
    this.authRequestKeyPair = await this.cryptoFunctionService.rsaGenerateKeyPair(2048);
    const fingerprint = await (
      await this.cryptoService.getFingerprint(this.email, this.authRequestKeyPair[0])
    ).join("-");
    const deviceIdentifier = await this.appIdService.getAppId();
    const publicKey = Utils.fromBufferToB64(this.authRequestKeyPair[0]);
    const accessCode = await this.passwordGenerationService.generatePassword({ length: 25 });

    this.passwordlessRequest = new PasswordlessCreateAuthRequest(
      this.email,
      deviceIdentifier,
      publicKey,
      AuthRequestType.AuthenticateAndUnlock,
      accessCode,
      fingerprint
    );
  }

  private async buildLoginCredntials(
    requestId: string,
    response: AuthRequestResponse
  ): Promise<PasswordlessLogInCredentials> {
    const decKey = await this.cryptoService.rsaDecrypt(response.key, this.authRequestKeyPair[1]);
    const decMasterPasswordHash = await this.cryptoService.rsaDecrypt(
      response.masterPasswordHash,
      this.authRequestKeyPair[1]
    );
    const key = new SymmetricCryptoKey(decKey);
    const localHashedPassword = Utils.fromBufferToUtf8(decMasterPasswordHash);

    return new PasswordlessLogInCredentials(
      this.email,
      this.passwordlessRequest.accessCode,
      requestId,
      key,
      localHashedPassword
    );
  }
}
