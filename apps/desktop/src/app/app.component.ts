import {
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  SecurityContext,
  Type,
  ViewChild,
  ViewContainerRef,
} from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { IndividualConfig, ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

import { ModalRef } from "@bitwarden/angular/components/modal/modal.ref";
import { ModalService } from "@bitwarden/angular/services/modal.service";
import { AuthService } from "@bitwarden/common/abstractions/auth.service";
import { BroadcasterService } from "@bitwarden/common/abstractions/broadcaster.service";
import { CipherService } from "@bitwarden/common/abstractions/cipher.service";
import { CollectionService } from "@bitwarden/common/abstractions/collection.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { EventService } from "@bitwarden/common/abstractions/event.service";
import { InternalFolderService } from "@bitwarden/common/abstractions/folder/folder.service.abstraction";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { KeyConnectorService } from "@bitwarden/common/abstractions/keyConnector.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { NotificationsService } from "@bitwarden/common/abstractions/notifications.service";
import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { InternalPolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { SearchService } from "@bitwarden/common/abstractions/search.service";
import { SettingsService } from "@bitwarden/common/abstractions/settings.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { SyncService } from "@bitwarden/common/abstractions/sync/sync.service.abstraction";
import { SystemService } from "@bitwarden/common/abstractions/system.service";
import { VaultTimeoutService } from "@bitwarden/common/abstractions/vaultTimeout/vaultTimeout.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vaultTimeout/vaultTimeoutSettings.service";
import { AuthenticationStatus } from "@bitwarden/common/enums/authenticationStatus";
import { CipherType } from "@bitwarden/common/enums/cipherType";

import { MenuUpdateRequest } from "../main/menu/menu.updater";

import { DeleteAccountComponent } from "./accounts/delete-account.component";
import { PremiumComponent } from "./accounts/premium.component";
import { SettingsComponent } from "./accounts/settings.component";
import { ExportComponent } from "./vault/export.component";
import { FolderAddEditComponent } from "./vault/folder-add-edit.component";
import { GeneratorComponent } from "./vault/generator.component";
import { PasswordGeneratorHistoryComponent } from "./vault/password-generator-history.component";

const BroadcasterSubscriptionId = "AppComponent";
const IdleTimeout = 60000 * 10; // 10 minutes
const SyncInterval = 6 * 60 * 60 * 1000; // 6 hours

const systemTimeoutOptions = {
  onLock: -2,
  onSuspend: -3,
  onIdle: -4,
};

@Component({
  selector: "app-root",
  styles: [],
  template: `
    <ng-template #settings></ng-template>
    <ng-template #premium></ng-template>
    <ng-template #passwordHistory></ng-template>
    <ng-template #appFolderAddEdit></ng-template>
    <ng-template #exportVault></ng-template>
    <ng-template #appGenerator></ng-template>
    <app-header></app-header>
    <div id="container">
      <div class="loading" *ngIf="loading">
        <i class="bwi bwi-spinner bwi-spin bwi-3x" aria-hidden="true"></i>
      </div>
      <router-outlet *ngIf="!loading"></router-outlet>
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild("settings", { read: ViewContainerRef, static: true }) settingsRef: ViewContainerRef;
  @ViewChild("premium", { read: ViewContainerRef, static: true }) premiumRef: ViewContainerRef;
  @ViewChild("passwordHistory", { read: ViewContainerRef, static: true })
  passwordHistoryRef: ViewContainerRef;
  @ViewChild("exportVault", { read: ViewContainerRef, static: true })
  exportVaultModalRef: ViewContainerRef;
  @ViewChild("appFolderAddEdit", { read: ViewContainerRef, static: true })
  folderAddEditModalRef: ViewContainerRef;
  @ViewChild("appGenerator", { read: ViewContainerRef, static: true })
  generatorModalRef: ViewContainerRef;

  loading = false;

  private lastActivity: number = null;
  private modal: ModalRef = null;
  private idleTimer: number = null;
  private isIdle = false;
  private activeUserId: string = null;

  private destroy$ = new Subject<void>();

  constructor(
    private broadcasterService: BroadcasterService,
    private folderService: InternalFolderService,
    private settingsService: SettingsService,
    private syncService: SyncService,
    private passwordGenerationService: PasswordGenerationService,
    private cipherService: CipherService,
    private authService: AuthService,
    private router: Router,
    private toastrService: ToastrService,
    private i18nService: I18nService,
    private sanitizer: DomSanitizer,
    private ngZone: NgZone,
    private vaultTimeoutService: VaultTimeoutService,
    private vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    private cryptoService: CryptoService,
    private logService: LogService,
    private messagingService: MessagingService,
    private collectionService: CollectionService,
    private searchService: SearchService,
    private notificationsService: NotificationsService,
    private platformUtilsService: PlatformUtilsService,
    private systemService: SystemService,
    private stateService: StateService,
    private eventService: EventService,
    private policyService: InternalPolicyService,
    private modalService: ModalService,
    private keyConnectorService: KeyConnectorService
  ) {}

  ngOnInit() {
    this.stateService.activeAccount$.pipe(takeUntil(this.destroy$)).subscribe((userId) => {
      this.activeUserId = userId;
    });

    this.ngZone.runOutsideAngular(() => {
      setTimeout(async () => {
        await this.updateAppMenu();
      }, 1000);

      window.ontouchstart = () => this.recordActivity();
      window.onmousedown = () => this.recordActivity();
      window.onscroll = () => this.recordActivity();
      window.onkeypress = () => this.recordActivity();
    });

    this.broadcasterService.subscribe(BroadcasterSubscriptionId, async (message: any) => {
      this.ngZone.run(async () => {
        switch (message.command) {
          case "loggedIn":
          case "unlocked":
            this.notificationsService.updateConnection();
            this.updateAppMenu();
            this.systemService.cancelProcessReload();
            break;
          case "loggedOut":
            this.modalService.closeAll();
            this.notificationsService.updateConnection();
            this.updateAppMenu();
            await this.systemService.clearPendingClipboard();
            await this.systemService.startProcessReload(this.authService);
            break;
          case "authBlocked":
            this.router.navigate(["login"]);
            break;
          case "logout":
            this.loading = message.userId == null || message.userId === this.activeUserId;
            await this.logOut(!!message.expired, message.userId);
            this.loading = false;
            break;
          case "lockVault":
            await this.vaultTimeoutService.lock(message.userId);
            break;
          case "lockAllVaults":
            for (const userId in this.stateService.accounts.getValue()) {
              if (userId != null) {
                await this.vaultTimeoutService.lock(userId);
              }
            }
            break;
          case "locked":
            this.modalService.closeAll();
            if (
              message.userId == null ||
              message.userId === (await this.stateService.getUserId())
            ) {
              await this.router.navigate(["lock"]);
            }
            this.notificationsService.updateConnection();
            await this.updateAppMenu();
            await this.systemService.clearPendingClipboard();
            await this.systemService.startProcessReload(this.authService);
            break;
          case "reloadProcess":
            (window.location as any).reload(true);
            break;
          case "syncStarted":
            break;
          case "syncCompleted":
            await this.updateAppMenu();
            break;
          case "openSettings":
            await this.openModal<SettingsComponent>(SettingsComponent, this.settingsRef);
            break;
          case "openPremium":
            await this.openModal<PremiumComponent>(PremiumComponent, this.premiumRef);
            break;
          case "showFingerprintPhrase": {
            const fingerprint = await this.cryptoService.getFingerprint(
              await this.stateService.getUserId()
            );
            const result = await this.platformUtilsService.showDialog(
              this.i18nService.t("yourAccountsFingerprint") + ":\n" + fingerprint.join("-"),
              this.i18nService.t("fingerprintPhrase"),
              this.i18nService.t("learnMore"),
              this.i18nService.t("close")
            );
            if (result) {
              this.platformUtilsService.launchUri("https://bitwarden.com/help/fingerprint-phrase/");
            }
            break;
          }
          case "deleteAccount":
            this.modalService.open(DeleteAccountComponent, { replaceTopModal: true });
            break;
          case "openPasswordHistory":
            await this.openModal<PasswordGeneratorHistoryComponent>(
              PasswordGeneratorHistoryComponent,
              this.passwordHistoryRef
            );
            break;
          case "showToast":
            this.showToast(message);
            break;
          case "copiedToClipboard":
            if (!message.clearing) {
              this.systemService.clearClipboard(message.clipboardValue, message.clearMs);
            }
            break;
          case "ssoCallback":
            this.router.navigate(["sso"], {
              queryParams: { code: message.code, state: message.state },
            });
            break;
          case "premiumRequired": {
            const premiumConfirmed = await this.platformUtilsService.showDialog(
              this.i18nService.t("premiumRequiredDesc"),
              this.i18nService.t("premiumRequired"),
              this.i18nService.t("learnMore"),
              this.i18nService.t("cancel")
            );
            if (premiumConfirmed) {
              await this.openModal<PremiumComponent>(PremiumComponent, this.premiumRef);
            }
            break;
          }
          case "emailVerificationRequired": {
            const emailVerificationConfirmed = await this.platformUtilsService.showDialog(
              this.i18nService.t("emailVerificationRequiredDesc"),
              this.i18nService.t("emailVerificationRequired"),
              this.i18nService.t("learnMore"),
              this.i18nService.t("cancel")
            );
            if (emailVerificationConfirmed) {
              this.platformUtilsService.launchUri(
                "https://bitwarden.com/help/create-bitwarden-account/"
              );
            }
            break;
          }
          case "syncVault":
            try {
              await this.syncService.fullSync(true, true);
              this.platformUtilsService.showToast(
                "success",
                null,
                this.i18nService.t("syncingComplete")
              );
            } catch {
              this.platformUtilsService.showToast(
                "error",
                null,
                this.i18nService.t("syncingFailed")
              );
            }
            break;
          case "checkSyncVault":
            try {
              const lastSync = await this.syncService.getLastSync();
              let lastSyncAgo = SyncInterval + 1;
              if (lastSync != null) {
                lastSyncAgo = new Date().getTime() - lastSync.getTime();
              }

              if (lastSyncAgo >= SyncInterval) {
                await this.syncService.fullSync(false);
              }
            } catch (e) {
              this.logService.error(e);
            }
            this.messagingService.send("scheduleNextSync");
            break;
          case "exportVault":
            await this.openExportVault();
            break;
          case "newLogin":
            this.routeToVault("add", CipherType.Login);
            break;
          case "newCard":
            this.routeToVault("add", CipherType.Card);
            break;
          case "newIdentity":
            this.routeToVault("add", CipherType.Identity);
            break;
          case "newSecureNote":
            this.routeToVault("add", CipherType.SecureNote);
            break;
          default:
            break;
          case "newFolder":
            await this.addFolder();
            break;
          case "openGenerator":
            // openGenerator has extended functionality if called in the vault
            if (!this.router.url.includes("vault")) {
              await this.openGenerator();
            }
            break;
          case "convertAccountToKeyConnector":
            this.router.navigate(["/remove-password"]);
            break;
          case "switchAccount": {
            if (message.userId != null) {
              await this.stateService.setActiveUser(message.userId);
            }
            const locked =
              (await this.authService.getAuthStatus(message.userId)) ===
              AuthenticationStatus.Locked;
            if (locked) {
              this.messagingService.send("locked", { userId: message.userId });
            } else {
              this.messagingService.send("unlocked");
              this.loading = true;
              await this.syncService.fullSync(true);
              this.loading = false;
              this.router.navigate(["vault"]);
            }
            break;
          }
          case "systemSuspended":
            await this.checkForSystemTimeout(systemTimeoutOptions.onSuspend);
            break;
          case "systemLocked":
            await this.checkForSystemTimeout(systemTimeoutOptions.onLock);
            break;
          case "systemIdle":
            await this.checkForSystemTimeout(systemTimeoutOptions.onIdle);
            break;
        }
      });
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
  }

  async openExportVault() {
    this.modalService.closeAll();

    const [modal, childComponent] = await this.modalService.openViewRef(
      ExportComponent,
      this.exportVaultModalRef
    );
    this.modal = modal;

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    childComponent.onSaved.subscribe(() => {
      this.modal.close();
    });

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.modal.onClosed.subscribe(() => {
      this.modal = null;
    });
  }

  async addFolder() {
    this.modalService.closeAll();

    const [modal, childComponent] = await this.modalService.openViewRef(
      FolderAddEditComponent,
      this.folderAddEditModalRef,
      (comp) => (comp.folderId = null)
    );
    this.modal = modal;

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
    childComponent.onSavedFolder.subscribe(async () => {
      this.modal.close();
      this.syncService.fullSync(false);
    });

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.modal.onClosed.subscribe(() => {
      this.modal = null;
    });
  }

  async openGenerator() {
    this.modalService.closeAll();

    [this.modal] = await this.modalService.openViewRef(
      GeneratorComponent,
      this.generatorModalRef,
      (comp) => (comp.comingFromAddEdit = false)
    );

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.modal.onClosed.subscribe(() => {
      this.modal = null;
    });
  }

  private async updateAppMenu() {
    let updateRequest: MenuUpdateRequest;
    const stateAccounts = this.stateService.accounts?.getValue();
    if (stateAccounts == null || Object.keys(stateAccounts).length < 1) {
      updateRequest = {
        accounts: null,
        activeUserId: null,
        hideChangeMasterPassword: true,
      };
    } else {
      const accounts: { [userId: string]: any } = {};
      for (const i in stateAccounts) {
        if (i != null && stateAccounts[i]?.profile?.userId != null) {
          const userId = stateAccounts[i].profile.userId;
          accounts[userId] = {
            isAuthenticated: await this.stateService.getIsAuthenticated({
              userId: userId,
            }),
            isLocked:
              (await this.authService.getAuthStatus(userId)) === AuthenticationStatus.Locked,
            email: stateAccounts[i].profile.email,
            userId: stateAccounts[i].profile.userId,
          };
        }
      }
      updateRequest = {
        accounts: accounts,
        activeUserId: await this.stateService.getUserId(),
        hideChangeMasterPassword: await this.keyConnectorService.getUsesKeyConnector(),
      };
    }

    this.messagingService.send("updateAppMenu", { updateRequest: updateRequest });
  }

  private async logOut(expired: boolean, userId?: string) {
    const userBeingLoggedOut = await this.stateService.getUserId({ userId: userId });
    await Promise.all([
      this.eventService.uploadEvents(userBeingLoggedOut),
      this.syncService.setLastSync(new Date(0), userBeingLoggedOut),
      this.cryptoService.clearKeys(userBeingLoggedOut),
      this.settingsService.clear(userBeingLoggedOut),
      this.cipherService.clear(userBeingLoggedOut),
      this.folderService.clear(userBeingLoggedOut),
      this.collectionService.clear(userBeingLoggedOut),
      this.passwordGenerationService.clear(userBeingLoggedOut),
      this.vaultTimeoutSettingsService.clear(userBeingLoggedOut),
      this.policyService.clear(userBeingLoggedOut),
      this.keyConnectorService.clear(),
    ]);

    if (userBeingLoggedOut === this.activeUserId) {
      this.searchService.clearIndex();
      this.authService.logOut(async () => {
        if (expired) {
          this.platformUtilsService.showToast(
            "warning",
            this.i18nService.t("loggedOut"),
            this.i18nService.t("loginExpired")
          );
        }
      });
    }

    const preLogoutActiveUserId = this.activeUserId;
    await this.stateService.clean({ userId: userBeingLoggedOut });

    if (this.activeUserId == null) {
      this.router.navigate(["login"]);
    } else if (preLogoutActiveUserId !== this.activeUserId) {
      this.messagingService.send("switchAccount");
    }

    await this.updateAppMenu();
  }

  private async recordActivity() {
    if (this.activeUserId == null) {
      return;
    }

    const now = new Date().getTime();
    if (this.lastActivity != null && now - this.lastActivity < 250) {
      return;
    }

    this.lastActivity = now;
    await this.stateService.setLastActive(now, { userId: this.activeUserId });

    // Idle states
    if (this.isIdle) {
      this.isIdle = false;
      this.idleStateChanged();
    }
    if (this.idleTimer != null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.idleTimer = window.setTimeout(() => {
      if (!this.isIdle) {
        this.isIdle = true;
        this.idleStateChanged();
      }
    }, IdleTimeout);
  }

  private idleStateChanged() {
    if (this.isIdle) {
      this.notificationsService.disconnectFromInactivity();
    } else {
      this.notificationsService.reconnectFromActivity();
    }
  }

  private async openModal<T>(type: Type<T>, ref: ViewContainerRef) {
    this.modalService.closeAll();

    [this.modal] = await this.modalService.openViewRef(type, ref);

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.modal.onClosed.subscribe(() => {
      this.modal = null;
    });
  }

  private showToast(msg: any) {
    let message = "";

    const options: Partial<IndividualConfig> = {};

    if (typeof msg.text === "string") {
      message = msg.text;
    } else if (msg.text.length === 1) {
      message = msg.text[0];
    } else {
      msg.text.forEach(
        (t: string) =>
          (message += "<p>" + this.sanitizer.sanitize(SecurityContext.HTML, t) + "</p>")
      );
      options.enableHtml = true;
    }
    if (msg.options != null) {
      if (msg.options.trustedHtml === true) {
        options.enableHtml = true;
      }
      if (msg.options.timeout != null && msg.options.timeout > 0) {
        options.timeOut = msg.options.timeout;
      }
    }

    this.toastrService.show(message, msg.title, options, "toast-" + msg.type);
  }

  private routeToVault(action: string, cipherType: CipherType) {
    if (!this.router.url.includes("vault")) {
      this.router.navigate(["/vault"], {
        queryParams: {
          action: action,
          addType: cipherType,
        },
        replaceUrl: true,
      });
    }
  }

  private async checkForSystemTimeout(timeout: number): Promise<void> {
    for (const userId in this.stateService.accounts.getValue()) {
      if (userId == null) {
        continue;
      }
      const options = await this.getVaultTimeoutOptions(userId);
      if (options[0] === timeout) {
        options[1] === "logOut"
          ? this.logOut(false, userId)
          : await this.vaultTimeoutService.lock(userId);
      }
    }
  }

  private async getVaultTimeoutOptions(userId: string): Promise<[number, string]> {
    const timeout = await this.stateService.getVaultTimeout({ userId: userId });
    const action = await this.stateService.getVaultTimeoutAction({ userId: userId });
    return [timeout, action];
  }
}
