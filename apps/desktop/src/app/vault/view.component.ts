import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  NgZone,
  OnChanges,
  Output,
} from "@angular/core";

import { ViewComponent as BaseViewComponent } from "@bitwarden/angular/components/view.component";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AuditService } from "@bitwarden/common/abstractions/audit.service";
import { BroadcasterService } from "@bitwarden/common/abstractions/broadcaster.service";
import { CipherService } from "@bitwarden/common/abstractions/cipher.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { EventService } from "@bitwarden/common/abstractions/event.service";
import { FileDownloadService } from "@bitwarden/common/abstractions/fileDownload/fileDownload.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { PasswordRepromptService } from "@bitwarden/common/abstractions/passwordReprompt.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { TokenService } from "@bitwarden/common/abstractions/token.service";
import { TotpService } from "@bitwarden/common/abstractions/totp.service";
import { CipherView } from "@bitwarden/common/models/view/cipherView";

const BroadcasterSubscriptionId = "ViewComponent";

@Component({
  selector: "app-vault-view",
  templateUrl: "view.component.html",
})
export class ViewComponent extends BaseViewComponent implements OnChanges {
  @Output() onViewCipherPasswordHistory = new EventEmitter<CipherView>();

  constructor(
    cipherService: CipherService,
    totpService: TotpService,
    tokenService: TokenService,
    i18nService: I18nService,
    cryptoService: CryptoService,
    platformUtilsService: PlatformUtilsService,
    auditService: AuditService,
    broadcasterService: BroadcasterService,
    ngZone: NgZone,
    changeDetectorRef: ChangeDetectorRef,
    eventService: EventService,
    apiService: ApiService,
    private messagingService: MessagingService,
    passwordRepromptService: PasswordRepromptService,
    logService: LogService,
    stateService: StateService,
    fileDownloadService: FileDownloadService
  ) {
    super(
      cipherService,
      totpService,
      tokenService,
      i18nService,
      cryptoService,
      platformUtilsService,
      auditService,
      window,
      broadcasterService,
      ngZone,
      changeDetectorRef,
      eventService,
      apiService,
      passwordRepromptService,
      logService,
      stateService,
      fileDownloadService
    );
  }
  ngOnInit() {
    super.ngOnInit();
    this.broadcasterService.subscribe(BroadcasterSubscriptionId, (message: any) => {
      this.ngZone.run(() => {
        switch (message.command) {
          case "windowHidden":
            this.onWindowHidden();
            break;
          default:
        }
      });
    });
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
  }

  async ngOnChanges() {
    await super.load();
  }

  viewHistory() {
    this.onViewCipherPasswordHistory.emit(this.cipher);
  }

  async copy(value: string, typeI18nKey: string, aType: string) {
    super.copy(value, typeI18nKey, aType);
    this.messagingService.send("minimizeOnCopy");
  }

  onWindowHidden() {
    this.showPassword = false;
    this.showCardNumber = false;
    this.showCardCode = false;
    if (this.cipher !== null && this.cipher.hasFields) {
      this.cipher.fields.forEach((field) => {
        field.showValue = false;
      });
    }
  }

  showGetPremium() {
    if (!this.canAccessPremium) {
      this.messagingService.send("premiumRequired");
    }
  }
}
