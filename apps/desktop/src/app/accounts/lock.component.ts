import { Component, NgZone } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { ipcRenderer } from "electron";

import { LockComponent as BaseLockComponent } from "@bitwarden/angular/components/lock.component";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { BroadcasterService } from "@bitwarden/common/abstractions/broadcaster.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { EnvironmentService } from "@bitwarden/common/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { KeyConnectorService } from "@bitwarden/common/abstractions/keyConnector.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { SyncService } from "@bitwarden/common/abstractions/sync/sync.service.abstraction";
import { VaultTimeoutService } from "@bitwarden/common/abstractions/vaultTimeout/vaultTimeout.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vaultTimeout/vaultTimeoutSettings.service";

const BroadcasterSubscriptionId = "LockComponent";

@Component({
  selector: "app-lock",
  templateUrl: "lock.component.html",
})
export class LockComponent extends BaseLockComponent {
  private deferFocus: boolean = null;
  authenicatedUrl = "vault";
  unAuthenicatedUrl = "update-temp-password";

  constructor(
    router: Router,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    messagingService: MessagingService,
    cryptoService: CryptoService,
    vaultTimeoutService: VaultTimeoutService,
    vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    environmentService: EnvironmentService,
    stateService: StateService,
    apiService: ApiService,
    private route: ActivatedRoute,
    private broadcasterService: BroadcasterService,
    ngZone: NgZone,
    logService: LogService,
    keyConnectorService: KeyConnectorService,
    private syncService: SyncService
  ) {
    super(
      router,
      i18nService,
      platformUtilsService,
      messagingService,
      cryptoService,
      vaultTimeoutService,
      vaultTimeoutSettingsService,
      environmentService,
      stateService,
      apiService,
      logService,
      keyConnectorService,
      ngZone
    );
  }

  async ngOnInit() {
    await super.ngOnInit();
    const autoPromptBiometric = !(await this.stateService.getNoAutoPromptBiometrics());

    await this.syncService.fullSync(true);

    const forcePasswordReset = await this.stateService.getForcePasswordReset();
    this.successRoute = forcePasswordReset === true ? this.unAuthenicatedUrl : this.authenicatedUrl;

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.route.queryParams.subscribe((params) => {
      if (this.supportsBiometric && params.promptBiometric && autoPromptBiometric) {
        setTimeout(async () => {
          if (await ipcRenderer.invoke("windowVisible")) {
            this.unlockBiometric();
          }
        }, 1000);
      }
    });
    this.broadcasterService.subscribe(BroadcasterSubscriptionId, async (message: any) => {
      this.ngZone.run(() => {
        switch (message.command) {
          case "windowHidden":
            this.onWindowHidden();
            break;
          case "windowIsFocused":
            if (this.deferFocus === null) {
              this.deferFocus = !message.windowIsFocused;
              if (!this.deferFocus) {
                this.focusInput();
              }
            } else if (this.deferFocus && message.windowIsFocused) {
              this.focusInput();
              this.deferFocus = false;
            }
            break;
          default:
        }
      });
    });
    this.messagingService.send("getWindowIsFocused");
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
  }

  onWindowHidden() {
    this.showPassword = false;
  }

  private focusInput() {
    document.getElementById(this.pinLock ? "pin" : "masterPassword").focus();
  }
}
