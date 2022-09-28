import { BehaviorSubject, concatMap } from "rxjs";

import { LogService } from "../abstractions/log.service";
import { StateService as StateServiceAbstraction } from "../abstractions/state.service";
import { StateMigrationService } from "../abstractions/stateMigration.service";
import {
  MemoryStorageServiceInterface,
  AbstractStorageService,
} from "../abstractions/storage.service";
import { HtmlStorageLocation } from "../enums/htmlStorageLocation";
import { KdfType } from "../enums/kdfType";
import { StorageLocation } from "../enums/storageLocation";
import { ThemeType } from "../enums/themeType";
import { UriMatchType } from "../enums/uriMatchType";
import { StateFactory } from "../factories/stateFactory";
import { CipherData } from "../models/data/cipherData";
import { CollectionData } from "../models/data/collectionData";
import { EncryptedOrganizationKeyData } from "../models/data/encryptedOrganizationKeyData";
import { EventData } from "../models/data/eventData";
import { FolderData } from "../models/data/folderData";
import { LocalData } from "../models/data/localData";
import { OrganizationData } from "../models/data/organizationData";
import { PolicyData } from "../models/data/policyData";
import { ProviderData } from "../models/data/providerData";
import { SendData } from "../models/data/sendData";
import { ServerConfigData } from "../models/data/server-config.data";
import {
  Account,
  AccountData,
  AccountSettings,
  AccountSettingsSettings,
} from "../models/domain/account";
import { EncString } from "../models/domain/encString";
import { EnvironmentUrls } from "../models/domain/environmentUrls";
import { GeneratedPasswordHistory } from "../models/domain/generatedPasswordHistory";
import { GlobalState } from "../models/domain/globalState";
import { Policy } from "../models/domain/policy";
import { State } from "../models/domain/state";
import { StorageOptions } from "../models/domain/storageOptions";
import { SymmetricCryptoKey } from "../models/domain/symmetricCryptoKey";
import { WindowState } from "../models/domain/windowState";
import { CipherView } from "../models/view/cipherView";
import { CollectionView } from "../models/view/collectionView";
import { SendView } from "../models/view/sendView";

const keys = {
  state: "state",
  global: "global",
  authenticatedAccounts: "authenticatedAccounts",
  activeUserId: "activeUserId",
  tempAccountSettings: "tempAccountSettings", // used to hold account specific settings (i.e clear clipboard) between initial migration and first account authentication
  accountActivity: "accountActivity",
};

const partialKeys = {
  autoKey: "_masterkey_auto",
  biometricKey: "_masterkey_biometric",
  masterKey: "_masterkey",
};

const DDG_SHARED_KEY = "DuckDuckGoSharedKey";

export class StateService<
  TGlobalState extends GlobalState = GlobalState,
  TAccount extends Account = Account
> implements StateServiceAbstraction<TAccount>
{
  accounts = new BehaviorSubject<{ [userId: string]: TAccount }>({});
  private activeAccountSubject = new BehaviorSubject<string>(null);
  activeAccount$ = this.activeAccountSubject.asObservable();

  private activeAccountUnlockedSubject = new BehaviorSubject<boolean>(false);
  activeAccountUnlocked$ = this.activeAccountUnlockedSubject.asObservable();

  private hasBeenInited = false;
  private isRecoveredSession = false;

  private accountDiskCache = new Map<string, TAccount>();

  constructor(
    protected storageService: AbstractStorageService,
    protected secureStorageService: AbstractStorageService,
    protected memoryStorageService: AbstractStorageService & MemoryStorageServiceInterface,
    protected logService: LogService,
    protected stateMigrationService: StateMigrationService,
    protected stateFactory: StateFactory<TGlobalState, TAccount>,
    protected useAccountCache: boolean = true
  ) {
    // If the account gets changed, verify the new account is unlocked
    this.activeAccountSubject
      .pipe(
        concatMap(async (userId) => {
          if (userId == null && this.activeAccountUnlockedSubject.getValue() == false) {
            return;
          } else if (userId == null) {
            this.activeAccountUnlockedSubject.next(false);
          }

          // FIXME: This should be refactored into AuthService or a similar service,
          //  as checking for the existance of the crypto key is a low level
          //  implementation detail.
          this.activeAccountUnlockedSubject.next((await this.getCryptoMasterKey()) != null);
        })
      )
      .subscribe();
  }

  async init(): Promise<void> {
    if (this.hasBeenInited) {
      return;
    }

    if (await this.stateMigrationService.needsMigration()) {
      await this.stateMigrationService.migrate();
    }

    await this.state().then(async (state) => {
      if (state == null) {
        await this.setState(new State<TGlobalState, TAccount>(this.createGlobals()));
      } else {
        this.isRecoveredSession = true;
      }
    });
    await this.initAccountState();
    this.hasBeenInited = true;
  }

  async initAccountState() {
    if (this.isRecoveredSession) {
      return;
    }

    await this.updateState(async (state) => {
      state.authenticatedAccounts =
        (await this.storageService.get<string[]>(keys.authenticatedAccounts)) ?? [];
      for (const i in state.authenticatedAccounts) {
        if (i != null) {
          await this.syncAccountFromDisk(state.authenticatedAccounts[i]);
        }
      }
      const storedActiveUser = await this.storageService.get<string>(keys.activeUserId);
      if (storedActiveUser != null) {
        state.activeUserId = storedActiveUser;
      }
      await this.pushAccounts();
      this.activeAccountSubject.next(state.activeUserId);

      return state;
    });
  }

  async syncAccountFromDisk(userId: string) {
    if (userId == null) {
      return;
    }
    await this.updateState(async (state) => {
      if (state.accounts == null) {
        state.accounts = {};
      }
      state.accounts[userId] = this.createAccount();
      const diskAccount = await this.getAccountFromDisk({ userId: userId });
      state.accounts[userId].profile = diskAccount.profile;
      return state;
    });
  }

  async addAccount(account: TAccount) {
    account = await this.setAccountEnvironmentUrls(account);
    await this.updateState(async (state) => {
      state.authenticatedAccounts.push(account.profile.userId);
      await this.storageService.save(keys.authenticatedAccounts, state.authenticatedAccounts);
      state.accounts[account.profile.userId] = account;
      return state;
    });
    await this.scaffoldNewAccountStorage(account);
    await this.setLastActive(new Date().getTime(), { userId: account.profile.userId });
    await this.setActiveUser(account.profile.userId);
    this.activeAccountSubject.next(account.profile.userId);
  }

  async setActiveUser(userId: string): Promise<void> {
    this.clearDecryptedDataForActiveUser();
    await this.updateState(async (state) => {
      state.activeUserId = userId;
      await this.storageService.save(keys.activeUserId, userId);
      this.activeAccountSubject.next(state.activeUserId);
      return state;
    });

    await this.pushAccounts();
  }

  async clean(options?: StorageOptions): Promise<void> {
    options = this.reconcileOptions(options, await this.defaultInMemoryOptions());
    await this.deAuthenticateAccount(options.userId);
    if (options.userId === (await this.state())?.activeUserId) {
      await this.dynamicallySetActiveUser();
    }

    await this.removeAccountFromDisk(options?.userId);
    this.removeAccountFromMemory(options?.userId);
    await this.pushAccounts();
  }

  async getAccessToken(options?: StorageOptions): Promise<string> {
    options = await this.getTimeoutBasedStorageOptions(options);
    return (await this.getAccount(options))?.tokens?.accessToken;
  }

  async setAccessToken(value: string, options?: StorageOptions): Promise<void> {
    options = await this.getTimeoutBasedStorageOptions(options);
    const account = await this.getAccount(options);
    account.tokens.accessToken = value;
    await this.saveAccount(account, options);
  }

  async getAddEditCipherInfo(options?: StorageOptions): Promise<any> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.data?.addEditCipherInfo;
  }

  async setAddEditCipherInfo(value: any, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.data.addEditCipherInfo = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getAlwaysShowDock(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.alwaysShowDock ?? false
    );
  }

  async setAlwaysShowDock(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.alwaysShowDock = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getApiKeyClientId(options?: StorageOptions): Promise<string> {
    options = await this.getTimeoutBasedStorageOptions(options);
    return (await this.getAccount(options))?.profile?.apiKeyClientId;
  }

  async setApiKeyClientId(value: string, options?: StorageOptions): Promise<void> {
    options = await this.getTimeoutBasedStorageOptions(options);
    const account = await this.getAccount(options);
    account.profile.apiKeyClientId = value;
    await this.saveAccount(account, options);
  }

  async getApiKeyClientSecret(options?: StorageOptions): Promise<string> {
    options = await this.getTimeoutBasedStorageOptions(options);
    return (await this.getAccount(options))?.keys?.apiKeyClientSecret;
  }

  async setApiKeyClientSecret(value: string, options?: StorageOptions): Promise<void> {
    options = await this.getTimeoutBasedStorageOptions(options);
    const account = await this.getAccount(options);
    account.keys.apiKeyClientSecret = value;
    await this.saveAccount(account, options);
  }

  async getAutoConfirmFingerPrints(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.autoConfirmFingerPrints ?? false
    );
  }

  async setAutoConfirmFingerprints(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.autoConfirmFingerPrints = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getAutoFillOnPageLoadDefault(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.autoFillOnPageLoadDefault ?? true
    );
  }

  async setAutoFillOnPageLoadDefault(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.autoFillOnPageLoadDefault = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getBiometricAwaitingAcceptance(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.biometricAwaitingAcceptance ?? false
    );
  }

  async setBiometricAwaitingAcceptance(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.biometricAwaitingAcceptance = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getBiometricFingerprintValidated(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.biometricFingerprintValidated ?? false
    );
  }

  async setBiometricFingerprintValidated(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.biometricFingerprintValidated = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getBiometricText(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.biometricText;
  }

  async setBiometricText(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.biometricText = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getBiometricUnlock(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.biometricUnlock ?? false
    );
  }

  async setBiometricUnlock(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.biometricUnlock = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getCanAccessPremium(options?: StorageOptions): Promise<boolean> {
    if (!(await this.getIsAuthenticated(options))) {
      return false;
    }

    return (
      (await this.getHasPremiumPersonally(options)) ||
      (await this.getHasPremiumFromOrganization(options))
    );
  }

  async getHasPremiumPersonally(options?: StorageOptions): Promise<boolean> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    return account?.profile?.hasPremiumPersonally;
  }

  async setHasPremiumPersonally(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.hasPremiumPersonally = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getHasPremiumFromOrganization(options?: StorageOptions): Promise<boolean> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );

    if (account.profile?.hasPremiumFromOrganization) {
      return true;
    }

    // TODO: older server versions won't send the hasPremiumFromOrganization flag, so we're keeping the old logic
    // for backwards compatibility. It can be removed after everyone has upgraded.
    const organizations = await this.getOrganizations(options);
    if (organizations == null) {
      return false;
    }

    for (const id of Object.keys(organizations)) {
      const o = organizations[id];
      if (o.enabled && o.usersGetPremium && !o.isProviderUser) {
        return true;
      }
    }

    return false;
  }

  async setHasPremiumFromOrganization(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.hasPremiumFromOrganization = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getClearClipboard(options?: StorageOptions): Promise<number> {
    return (
      (
        await this.getAccount(
          this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
        )
      )?.settings?.clearClipboard ?? null
    );
  }

  async setClearClipboard(value: number, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.clearClipboard = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getCollapsedGroupings(options?: StorageOptions): Promise<string[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.settings?.collapsedGroupings;
  }

  async setCollapsedGroupings(value: string[], options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.collapsedGroupings = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getConvertAccountToKeyConnector(options?: StorageOptions): Promise<boolean> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.profile?.convertAccountToKeyConnector;
  }

  async setConvertAccountToKeyConnector(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.convertAccountToKeyConnector = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getCryptoMasterKey(options?: StorageOptions): Promise<SymmetricCryptoKey> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    return account?.keys?.cryptoMasterKey;
  }

  async setCryptoMasterKey(value: SymmetricCryptoKey, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.keys.cryptoMasterKey = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );

    if (options.userId == this.activeAccountSubject.getValue()) {
      const nextValue = value != null;

      // Avoid emitting if we are already unlocked
      if (this.activeAccountUnlockedSubject.getValue() != nextValue) {
        this.activeAccountUnlockedSubject.next(nextValue);
      }
    }
  }

  async getCryptoMasterKeyAuto(options?: StorageOptions): Promise<string> {
    options = this.reconcileOptions(
      this.reconcileOptions(options, { keySuffix: "auto" }),
      await this.defaultSecureStorageOptions()
    );
    if (options?.userId == null) {
      return null;
    }
    return await this.secureStorageService.get<string>(
      `${options.userId}${partialKeys.autoKey}`,
      options
    );
  }

  async setCryptoMasterKeyAuto(value: string, options?: StorageOptions): Promise<void> {
    options = this.reconcileOptions(
      this.reconcileOptions(options, { keySuffix: "auto" }),
      await this.defaultSecureStorageOptions()
    );
    if (options?.userId == null) {
      return;
    }
    await this.saveSecureStorageKey(partialKeys.autoKey, value, options);
  }

  async getCryptoMasterKeyB64(options?: StorageOptions): Promise<string> {
    options = this.reconcileOptions(options, await this.defaultSecureStorageOptions());
    if (options?.userId == null) {
      return null;
    }
    return await this.secureStorageService.get<string>(
      `${options?.userId}${partialKeys.masterKey}`,
      options
    );
  }

  async setCryptoMasterKeyB64(value: string, options?: StorageOptions): Promise<void> {
    options = this.reconcileOptions(options, await this.defaultSecureStorageOptions());
    if (options?.userId == null) {
      return;
    }
    await this.saveSecureStorageKey(partialKeys.masterKey, value, options);
  }

  async getCryptoMasterKeyBiometric(options?: StorageOptions): Promise<string> {
    options = this.reconcileOptions(
      this.reconcileOptions(options, { keySuffix: "biometric" }),
      await this.defaultSecureStorageOptions()
    );
    if (options?.userId == null) {
      return null;
    }
    return await this.secureStorageService.get<string>(
      `${options.userId}${partialKeys.biometricKey}`,
      options
    );
  }

  async hasCryptoMasterKeyBiometric(options?: StorageOptions): Promise<boolean> {
    options = this.reconcileOptions(
      this.reconcileOptions(options, { keySuffix: "biometric" }),
      await this.defaultSecureStorageOptions()
    );
    if (options?.userId == null) {
      return false;
    }
    return await this.secureStorageService.has(
      `${options.userId}${partialKeys.biometricKey}`,
      options
    );
  }

  async setCryptoMasterKeyBiometric(value: string, options?: StorageOptions): Promise<void> {
    options = this.reconcileOptions(
      this.reconcileOptions(options, { keySuffix: "biometric" }),
      await this.defaultSecureStorageOptions()
    );
    if (options?.userId == null) {
      return;
    }
    await this.saveSecureStorageKey(partialKeys.biometricKey, value, options);
  }

  @withPrototypeForArrayMembers(CipherView, CipherView.fromJSON)
  async getDecryptedCiphers(options?: StorageOptions): Promise<CipherView[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.data?.ciphers?.decrypted;
  }

  async setDecryptedCiphers(value: CipherView[], options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.data.ciphers.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  @withPrototypeForArrayMembers(CollectionView)
  async getDecryptedCollections(options?: StorageOptions): Promise<CollectionView[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.data?.collections?.decrypted;
  }

  async setDecryptedCollections(value: CollectionView[], options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.data.collections.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getDecryptedCryptoSymmetricKey(options?: StorageOptions): Promise<SymmetricCryptoKey> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    return account?.keys?.cryptoSymmetricKey?.decrypted;
  }

  async setDecryptedCryptoSymmetricKey(
    value: SymmetricCryptoKey,
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.keys.cryptoSymmetricKey.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getDecryptedOrganizationKeys(
    options?: StorageOptions
  ): Promise<Map<string, SymmetricCryptoKey>> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    return this.recordToMap(account?.keys?.organizationKeys?.decrypted);
  }

  async setDecryptedOrganizationKeys(
    value: Map<string, SymmetricCryptoKey>,
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.keys.organizationKeys.decrypted = this.mapToRecord(value);
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  @withPrototypeForArrayMembers(GeneratedPasswordHistory)
  async getDecryptedPasswordGenerationHistory(
    options?: StorageOptions
  ): Promise<GeneratedPasswordHistory[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.data?.passwordGenerationHistory?.decrypted;
  }

  async setDecryptedPasswordGenerationHistory(
    value: GeneratedPasswordHistory[],
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.data.passwordGenerationHistory.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getDecryptedPinProtected(options?: StorageOptions): Promise<EncString> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.settings?.pinProtected?.decrypted;
  }

  async setDecryptedPinProtected(value: EncString, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.settings.pinProtected.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  @withPrototypeForArrayMembers(Policy)
  async getDecryptedPolicies(options?: StorageOptions): Promise<Policy[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.data?.policies?.decrypted;
  }

  async setDecryptedPolicies(value: Policy[], options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.data.policies.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getDecryptedPrivateKey(options?: StorageOptions): Promise<ArrayBuffer> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.keys?.privateKey.decrypted;
  }

  async setDecryptedPrivateKey(value: ArrayBuffer, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.keys.privateKey.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getDecryptedProviderKeys(
    options?: StorageOptions
  ): Promise<Map<string, SymmetricCryptoKey>> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    return this.recordToMap(account?.keys?.providerKeys?.decrypted);
  }

  async setDecryptedProviderKeys(
    value: Map<string, SymmetricCryptoKey>,
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.keys.providerKeys.decrypted = this.mapToRecord(value);
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  @withPrototypeForArrayMembers(SendView)
  async getDecryptedSends(options?: StorageOptions): Promise<SendView[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.data?.sends?.decrypted;
  }

  async setDecryptedSends(value: SendView[], options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.data.sends.decrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getDefaultUriMatch(options?: StorageOptions): Promise<UriMatchType> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.settings?.defaultUriMatch;
  }

  async setDefaultUriMatch(value: UriMatchType, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.defaultUriMatch = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDisableAddLoginNotification(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.disableAddLoginNotification ?? false
    );
  }

  async setDisableAddLoginNotification(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.disableAddLoginNotification = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDisableAutoBiometricsPrompt(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.disableAutoBiometricsPrompt ?? false
    );
  }

  async setDisableAutoBiometricsPrompt(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.disableAutoBiometricsPrompt = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDisableAutoTotpCopy(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.disableAutoTotpCopy ?? false
    );
  }

  async setDisableAutoTotpCopy(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.disableAutoTotpCopy = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDisableBadgeCounter(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.disableBadgeCounter ?? false
    );
  }

  async setDisableBadgeCounter(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.disableBadgeCounter = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDisableChangedPasswordNotification(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.disableChangedPasswordNotification ?? false
    );
  }

  async setDisableChangedPasswordNotification(
    value: boolean,
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.disableChangedPasswordNotification = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDisableContextMenuItem(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.disableContextMenuItem ?? false
    );
  }

  async setDisableContextMenuItem(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.disableContextMenuItem = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDisableFavicon(options?: StorageOptions): Promise<boolean> {
    return (
      (
        await this.getGlobals(
          this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
        )
      )?.disableFavicon ?? false
    );
  }

  async setDisableFavicon(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    globals.disableFavicon = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getDisableGa(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.disableGa ?? false
    );
  }

  async setDisableGa(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.disableGa = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDontShowCardsCurrentTab(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.dontShowCardsCurrentTab ?? false
    );
  }

  async setDontShowCardsCurrentTab(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.dontShowCardsCurrentTab = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDontShowIdentitiesCurrentTab(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.dontShowIdentitiesCurrentTab ?? false
    );
  }

  async setDontShowIdentitiesCurrentTab(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.dontShowIdentitiesCurrentTab = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getDuckDuckGoSharedKey(options?: StorageOptions): Promise<string> {
    options = this.reconcileOptions(options, await this.defaultSecureStorageOptions());
    if (options?.userId == null) {
      return null;
    }
    return await this.secureStorageService.get<string>(DDG_SHARED_KEY, options);
  }

  async setDuckDuckGoSharedKey(value: string, options?: StorageOptions): Promise<void> {
    options = this.reconcileOptions(options, await this.defaultSecureStorageOptions());
    if (options?.userId == null) {
      return;
    }
    value == null
      ? await this.secureStorageService.remove(DDG_SHARED_KEY, options)
      : await this.secureStorageService.save(DDG_SHARED_KEY, value, options);
  }

  async getEmail(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.profile?.email;
  }

  async setEmail(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.profile.email = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getEmailVerified(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.profile.emailVerified ?? false
    );
  }

  async setEmailVerified(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.emailVerified = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableAlwaysOnTop(options?: StorageOptions): Promise<boolean> {
    const accountPreference = (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.settings?.enableAlwaysOnTop;
    const globalPreference = (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.enableAlwaysOnTop;
    return accountPreference ?? globalPreference ?? false;
  }

  async setEnableAlwaysOnTop(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.enableAlwaysOnTop = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );

    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableAlwaysOnTop = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableAutoFillOnPageLoad(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.enableAutoFillOnPageLoad ?? false
    );
  }

  async setEnableAutoFillOnPageLoad(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.enableAutoFillOnPageLoad = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableBiometric(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableBiometrics ?? false
    );
  }

  async setEnableBiometric(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableBiometrics = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableBrowserIntegration(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableBrowserIntegration ?? false
    );
  }

  async setEnableBrowserIntegration(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableBrowserIntegration = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableBrowserIntegrationFingerprint(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableBrowserIntegrationFingerprint ?? false
    );
  }

  async setEnableBrowserIntegrationFingerprint(
    value: boolean,
    options?: StorageOptions
  ): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableBrowserIntegrationFingerprint = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableCloseToTray(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableCloseToTray ?? false
    );
  }

  async setEnableCloseToTray(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableCloseToTray = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableDuckDuckGoBrowserIntegration(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableDuckDuckGoBrowserIntegration ?? false
    );
  }

  async setEnableDuckDuckGoBrowserIntegration(
    value: boolean,
    options?: StorageOptions
  ): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableDuckDuckGoBrowserIntegration = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableFullWidth(options?: StorageOptions): Promise<boolean> {
    return (
      (
        await this.getAccount(
          this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
        )
      )?.settings?.enableFullWidth ?? false
    );
  }

  async setEnableFullWidth(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.enableFullWidth = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getEnableGravitars(options?: StorageOptions): Promise<boolean> {
    return (
      (
        await this.getAccount(
          this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
        )
      )?.settings?.enableGravitars ?? false
    );
  }

  async setEnableGravitars(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.enableGravitars = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getEnableMinimizeToTray(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableMinimizeToTray ?? false
    );
  }

  async setEnableMinimizeToTray(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableMinimizeToTray = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableStartToTray(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableStartToTray ?? false
    );
  }

  async setEnableStartToTray(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableStartToTray = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEnableTray(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.enableTray ?? false
    );
  }

  async setEnableTray(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.enableTray = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  @withPrototypeForObjectValues(CipherData)
  async getEncryptedCiphers(options?: StorageOptions): Promise<{ [id: string]: CipherData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions()))
    )?.data?.ciphers?.encrypted;
  }

  async setEncryptedCiphers(
    value: { [id: string]: CipherData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
    account.data.ciphers.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
  }

  @withPrototypeForObjectValues(CollectionData)
  async getEncryptedCollections(
    options?: StorageOptions
  ): Promise<{ [id: string]: CollectionData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions()))
    )?.data?.collections?.encrypted;
  }

  async setEncryptedCollections(
    value: { [id: string]: CollectionData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
    account.data.collections.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
  }

  async getEncryptedCryptoSymmetricKey(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.keys.cryptoSymmetricKey.encrypted;
  }

  async setEncryptedCryptoSymmetricKey(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.keys.cryptoSymmetricKey.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  @withPrototypeForObjectValues(FolderData)
  async getEncryptedFolders(options?: StorageOptions): Promise<{ [id: string]: FolderData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions()))
    )?.data?.folders?.encrypted;
  }

  async setEncryptedFolders(
    value: { [id: string]: FolderData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
    account.data.folders.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
  }

  async getEncryptedOrganizationKeys(
    options?: StorageOptions
  ): Promise<{ [orgId: string]: EncryptedOrganizationKeyData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.keys?.organizationKeys.encrypted;
  }

  async setEncryptedOrganizationKeys(
    value: { [orgId: string]: EncryptedOrganizationKeyData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.keys.organizationKeys.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  @withPrototypeForArrayMembers(GeneratedPasswordHistory)
  async getEncryptedPasswordGenerationHistory(
    options?: StorageOptions
  ): Promise<GeneratedPasswordHistory[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.data?.passwordGenerationHistory?.encrypted;
  }

  async setEncryptedPasswordGenerationHistory(
    value: GeneratedPasswordHistory[],
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.data.passwordGenerationHistory.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEncryptedPinProtected(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.settings?.pinProtected?.encrypted;
  }

  async setEncryptedPinProtected(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.pinProtected.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  @withPrototypeForObjectValues(PolicyData)
  async getEncryptedPolicies(options?: StorageOptions): Promise<{ [id: string]: PolicyData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.data?.policies?.encrypted;
  }

  async setEncryptedPolicies(
    value: { [id: string]: PolicyData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.data.policies.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEncryptedPrivateKey(options?: StorageOptions): Promise<string> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    return account?.keys?.privateKey?.encrypted;
  }

  async setEncryptedPrivateKey(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.keys.privateKey.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEncryptedProviderKeys(options?: StorageOptions): Promise<any> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.keys?.providerKeys?.encrypted;
  }

  async setEncryptedProviderKeys(value: any, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.keys.providerKeys.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  @withPrototypeForObjectValues(SendData)
  async getEncryptedSends(options?: StorageOptions): Promise<{ [id: string]: SendData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions()))
    )?.data?.sends.encrypted;
  }

  async setEncryptedSends(
    value: { [id: string]: SendData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
    account.data.sends.encrypted = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
  }

  async getEntityId(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.profile?.entityId;
  }

  async setEntityId(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.profile.entityId = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getEntityType(options?: StorageOptions): Promise<any> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.profile?.entityType;
  }

  async setEntityType(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.profile.entityType = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getEnvironmentUrls(options?: StorageOptions): Promise<EnvironmentUrls> {
    if ((await this.state())?.activeUserId == null) {
      return await this.getGlobalEnvironmentUrls(options);
    }
    options = this.reconcileOptions(options, await this.defaultOnDiskOptions());
    return (await this.getAccount(options))?.settings?.environmentUrls ?? new EnvironmentUrls();
  }

  async setEnvironmentUrls(value: EnvironmentUrls, options?: StorageOptions): Promise<void> {
    // Global values are set on each change and the current global settings are passed to any newly authed accounts.
    // This is to allow setting environement values before an account is active, while still allowing individual accounts to have their own environments.
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.environmentUrls = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEquivalentDomains(options?: StorageOptions): Promise<any> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.settings?.equivalentDomains;
  }

  async setEquivalentDomains(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.equivalentDomains = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  @withPrototypeForArrayMembers(EventData)
  async getEventCollection(options?: StorageOptions): Promise<EventData[]> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.data?.eventCollection;
  }

  async setEventCollection(value: EventData[], options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.data.eventCollection = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getEverBeenUnlocked(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions())))
        ?.profile?.everBeenUnlocked ?? false
    );
  }

  async setEverBeenUnlocked(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.profile.everBeenUnlocked = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getForcePasswordReset(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions())))
        ?.profile?.forcePasswordReset ?? false
    );
  }

  async setForcePasswordReset(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.profile.forcePasswordReset = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getInstalledVersion(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.installedVersion;
  }

  async setInstalledVersion(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.installedVersion = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getIsAuthenticated(options?: StorageOptions): Promise<boolean> {
    return (await this.getAccessToken(options)) != null && (await this.getUserId(options)) != null;
  }

  async getKdfIterations(options?: StorageOptions): Promise<number> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.profile?.kdfIterations;
  }

  async setKdfIterations(value: number, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.kdfIterations = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getKdfType(options?: StorageOptions): Promise<KdfType> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.profile?.kdfType;
  }

  async setKdfType(value: KdfType, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.kdfType = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getKeyHash(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.profile?.keyHash;
  }

  async setKeyHash(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.keyHash = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getLastActive(options?: StorageOptions): Promise<number> {
    options = this.reconcileOptions(options, await this.defaultOnDiskOptions());

    const accountActivity = await this.storageService.get<{ [userId: string]: number }>(
      keys.accountActivity,
      options
    );

    if (accountActivity == null || Object.keys(accountActivity).length < 1) {
      return null;
    }

    return accountActivity[options.userId];
  }

  async setLastActive(value: number, options?: StorageOptions): Promise<void> {
    options = this.reconcileOptions(options, await this.defaultOnDiskOptions());
    if (options.userId == null) {
      return;
    }
    const accountActivity =
      (await this.storageService.get<{ [userId: string]: number }>(
        keys.accountActivity,
        options
      )) ?? {};
    accountActivity[options.userId] = value;
    await this.storageService.save(keys.accountActivity, accountActivity, options);
  }

  async getLastSync(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions()))
    )?.profile?.lastSync;
  }

  async setLastSync(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
    account.profile.lastSync = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
  }

  async getLocalData(options?: StorageOptions): Promise<{ [cipherId: string]: LocalData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.data?.localData;
  }

  async setLocalData(
    value: { [cipherId: string]: LocalData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.data.localData = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getLocale(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.locale;
  }

  async setLocale(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    globals.locale = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getMainWindowSize(options?: StorageOptions): Promise<number> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.mainWindowSize;
  }

  async setMainWindowSize(value: number, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    globals.mainWindowSize = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getMinimizeOnCopyToClipboard(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.settings?.minimizeOnCopyToClipboard ?? false
    );
  }

  async setMinimizeOnCopyToClipboard(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.minimizeOnCopyToClipboard = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getNeverDomains(options?: StorageOptions): Promise<{ [id: string]: any }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.settings?.neverDomains;
  }

  async setNeverDomains(value: { [id: string]: any }, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.neverDomains = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getNoAutoPromptBiometrics(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.noAutoPromptBiometrics ?? false
    );
  }

  async setNoAutoPromptBiometrics(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.noAutoPromptBiometrics = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getNoAutoPromptBiometricsText(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.noAutoPromptBiometricsText;
  }

  async setNoAutoPromptBiometricsText(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.noAutoPromptBiometricsText = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getOpenAtLogin(options?: StorageOptions): Promise<boolean> {
    return (
      (await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions())))
        ?.openAtLogin ?? false
    );
  }

  async setOpenAtLogin(value: boolean, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.openAtLogin = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getOrganizationInvitation(options?: StorageOptions): Promise<any> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.organizationInvitation;
  }

  async setOrganizationInvitation(value: any, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    globals.organizationInvitation = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  /**
   * @deprecated Do not call this directly, use OrganizationService
   */
  async getOrganizations(options?: StorageOptions): Promise<{ [id: string]: OrganizationData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.data?.organizations;
  }

  /**
   * @deprecated Do not call this directly, use OrganizationService
   */
  async setOrganizations(
    value: { [id: string]: OrganizationData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.data.organizations = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getPasswordGenerationOptions(options?: StorageOptions): Promise<any> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.settings?.passwordGenerationOptions;
  }

  async setPasswordGenerationOptions(value: any, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.passwordGenerationOptions = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getUsernameGenerationOptions(options?: StorageOptions): Promise<any> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.settings?.usernameGenerationOptions;
  }

  async setUsernameGenerationOptions(value: any, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.usernameGenerationOptions = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getGeneratorOptions(options?: StorageOptions): Promise<any> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.settings?.generatorOptions;
  }

  async setGeneratorOptions(value: any, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.generatorOptions = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getProtectedPin(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.settings?.protectedPin;
  }

  async setProtectedPin(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.settings.protectedPin = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  @withPrototypeForObjectValues(ProviderData)
  async getProviders(options?: StorageOptions): Promise<{ [id: string]: ProviderData }> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.data?.providers;
  }

  async setProviders(
    value: { [id: string]: ProviderData },
    options?: StorageOptions
  ): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.data.providers = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getPublicKey(options?: StorageOptions): Promise<ArrayBuffer> {
    const keys = (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.keys;
    return keys?.publicKey;
  }

  async setPublicKey(value: ArrayBuffer, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.keys.publicKey = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getRefreshToken(options?: StorageOptions): Promise<string> {
    options = await this.getTimeoutBasedStorageOptions(options);
    return (await this.getAccount(options))?.tokens?.refreshToken;
  }

  async setRefreshToken(value: string, options?: StorageOptions): Promise<void> {
    options = await this.getTimeoutBasedStorageOptions(options);
    const account = await this.getAccount(options);
    account.tokens.refreshToken = value;
    await this.saveAccount(account, options);
  }

  async getRememberedEmail(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.rememberedEmail;
  }

  async setRememberedEmail(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    globals.rememberedEmail = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getSecurityStamp(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultInMemoryOptions()))
    )?.tokens?.securityStamp;
  }

  async setSecurityStamp(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
    account.tokens.securityStamp = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultInMemoryOptions())
    );
  }

  async getSettings(options?: StorageOptions): Promise<AccountSettingsSettings> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions()))
    )?.settings?.settings;
  }

  async setSettings(value: AccountSettingsSettings, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
    account.settings.settings = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskMemoryOptions())
    );
  }

  async getSsoCodeVerifier(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.ssoCodeVerifier;
  }

  async setSsoCodeVerifier(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.ssoCodeVerifier = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getSsoOrgIdentifier(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.ssoOrganizationIdentifier;
  }

  async setSsoOrganizationIdentifier(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    globals.ssoOrganizationIdentifier = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getSsoState(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.ssoState;
  }

  async setSsoState(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.ssoState = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getTheme(options?: StorageOptions): Promise<ThemeType> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.theme;
  }

  async setTheme(value: ThemeType, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    globals.theme = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getTwoFactorToken(options?: StorageOptions): Promise<string> {
    return (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.twoFactorToken;
  }

  async setTwoFactorToken(value: string, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    globals.twoFactorToken = value;
    await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getUserId(options?: StorageOptions): Promise<string> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.profile?.userId;
  }

  async getUsesKeyConnector(options?: StorageOptions): Promise<boolean> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskOptions()))
    )?.profile?.usesKeyConnector;
  }

  async setUsesKeyConnector(value: boolean, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    account.profile.usesKeyConnector = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async getVaultTimeout(options?: StorageOptions): Promise<number> {
    const accountVaultTimeout = (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.settings?.vaultTimeout;
    return accountVaultTimeout;
  }

  async setVaultTimeout(value: number, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.vaultTimeout = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getVaultTimeoutAction(options?: StorageOptions): Promise<string> {
    const accountVaultTimeoutAction = (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.settings?.vaultTimeoutAction;
    const globalVaultTimeoutAction = (
      await this.getGlobals(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.vaultTimeoutAction;
    return accountVaultTimeoutAction ?? globalVaultTimeoutAction;
  }

  async setVaultTimeoutAction(value: string, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.vaultTimeoutAction = value;
    await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getStateVersion(): Promise<number> {
    return (await this.getGlobals(await this.defaultOnDiskLocalOptions())).stateVersion ?? 1;
  }

  async setStateVersion(value: number): Promise<void> {
    const globals = await this.getGlobals(await this.defaultOnDiskOptions());
    globals.stateVersion = value;
    await this.saveGlobals(globals, await this.defaultOnDiskOptions());
  }

  async getWindow(): Promise<WindowState> {
    const globals = await this.getGlobals(await this.defaultOnDiskOptions());
    return globals?.window != null && Object.keys(globals.window).length > 0
      ? globals.window
      : new WindowState();
  }

  async setWindow(value: WindowState, options?: StorageOptions): Promise<void> {
    const globals = await this.getGlobals(
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
    globals.window = value;
    return await this.saveGlobals(
      globals,
      this.reconcileOptions(options, await this.defaultOnDiskOptions())
    );
  }

  async setServerConfig(value: ServerConfigData, options?: StorageOptions): Promise<void> {
    const account = await this.getAccount(
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
    account.settings.serverConfig = value;
    return await this.saveAccount(
      account,
      this.reconcileOptions(options, await this.defaultOnDiskLocalOptions())
    );
  }

  async getServerConfig(options: StorageOptions): Promise<ServerConfigData> {
    return (
      await this.getAccount(this.reconcileOptions(options, await this.defaultOnDiskLocalOptions()))
    )?.settings?.serverConfig;
  }

  protected async getGlobals(options: StorageOptions): Promise<TGlobalState> {
    let globals: TGlobalState;
    if (this.useMemory(options.storageLocation)) {
      globals = await this.getGlobalsFromMemory();
    }

    if (this.useDisk && globals == null) {
      globals = await this.getGlobalsFromDisk(options);
    }

    return globals ?? this.createGlobals();
  }

  protected async saveGlobals(globals: TGlobalState, options: StorageOptions) {
    return this.useMemory(options.storageLocation)
      ? this.saveGlobalsToMemory(globals)
      : await this.saveGlobalsToDisk(globals, options);
  }

  protected async getGlobalsFromMemory(): Promise<TGlobalState> {
    return (await this.state()).globals;
  }

  protected async getGlobalsFromDisk(options: StorageOptions): Promise<TGlobalState> {
    return await this.storageService.get<TGlobalState>(keys.global, options);
  }

  protected async saveGlobalsToMemory(globals: TGlobalState): Promise<void> {
    await this.updateState(async (state) => {
      state.globals = globals;
      return state;
    });
  }

  protected async saveGlobalsToDisk(globals: TGlobalState, options: StorageOptions): Promise<void> {
    if (options.useSecureStorage) {
      await this.secureStorageService.save(keys.global, globals, options);
    } else {
      await this.storageService.save(keys.global, globals, options);
    }
  }

  protected async getAccount(options: StorageOptions): Promise<TAccount> {
    try {
      let account: TAccount;
      if (this.useMemory(options.storageLocation)) {
        account = await this.getAccountFromMemory(options);
      }

      if (this.useDisk(options.storageLocation) && account == null) {
        account = await this.getAccountFromDisk(options);
      }

      return account;
    } catch (e) {
      this.logService.error(e);
    }
  }

  protected async getAccountFromMemory(options: StorageOptions): Promise<TAccount> {
    return await this.state().then(async (state) => {
      if (state.accounts == null) {
        return null;
      }
      return state.accounts[await this.getUserIdFromMemory(options)];
    });
  }

  protected async getUserIdFromMemory(options: StorageOptions): Promise<string> {
    return await this.state().then((state) => {
      return options?.userId != null
        ? state.accounts[options.userId]?.profile?.userId
        : state.activeUserId;
    });
  }

  protected async getAccountFromDisk(options: StorageOptions): Promise<TAccount> {
    if (options?.userId == null && (await this.state())?.activeUserId == null) {
      return null;
    }

    if (this.useAccountCache) {
      const cachedAccount = this.accountDiskCache.get(options.userId);
      if (cachedAccount != null) {
        return cachedAccount;
      }
    }

    const account = options?.useSecureStorage
      ? (await this.secureStorageService.get<TAccount>(options.userId, options)) ??
        (await this.storageService.get<TAccount>(
          options.userId,
          this.reconcileOptions(options, { htmlStorageLocation: HtmlStorageLocation.Local })
        ))
      : await this.storageService.get<TAccount>(options.userId, options);

    if (this.useAccountCache) {
      this.accountDiskCache.set(options.userId, account);
    }
    return account;
  }

  protected useMemory(storageLocation: StorageLocation) {
    return storageLocation === StorageLocation.Memory || storageLocation === StorageLocation.Both;
  }

  protected useDisk(storageLocation: StorageLocation) {
    return storageLocation === StorageLocation.Disk || storageLocation === StorageLocation.Both;
  }

  protected async saveAccount(
    account: TAccount,
    options: StorageOptions = {
      storageLocation: StorageLocation.Both,
      useSecureStorage: false,
    }
  ) {
    return this.useMemory(options.storageLocation)
      ? await this.saveAccountToMemory(account)
      : await this.saveAccountToDisk(account, options);
  }

  protected async saveAccountToDisk(account: TAccount, options: StorageOptions): Promise<void> {
    const storageLocation = options.useSecureStorage
      ? this.secureStorageService
      : this.storageService;

    await storageLocation.save(`${options.userId}`, account, options);

    if (this.useAccountCache) {
      this.accountDiskCache.delete(options.userId);
    }
  }

  protected async saveAccountToMemory(account: TAccount): Promise<void> {
    if (this.getAccountFromMemory({ userId: account.profile.userId }) !== null) {
      await this.updateState((state) => {
        return new Promise((resolve) => {
          state.accounts[account.profile.userId] = account;
          resolve(state);
        });
      });
    }
    await this.pushAccounts();
  }

  protected async scaffoldNewAccountStorage(account: TAccount): Promise<void> {
    // We don't want to manipulate the referenced in memory account
    const deepClone = JSON.parse(JSON.stringify(account));
    await this.scaffoldNewAccountLocalStorage(deepClone);
    await this.scaffoldNewAccountSessionStorage(deepClone);
    await this.scaffoldNewAccountMemoryStorage(deepClone);
  }

  // TODO: There is a tech debt item for splitting up these methods - only Web uses multiple storage locations in its storageService.
  // For now these methods exist with some redundancy to facilitate this special web requirement.
  protected async scaffoldNewAccountLocalStorage(account: TAccount): Promise<void> {
    const storedAccount = await this.getAccount(
      this.reconcileOptions(
        { userId: account.profile.userId },
        await this.defaultOnDiskLocalOptions()
      )
    );
    // EnvironmentUrls are set before authenticating and should override whatever is stored from any previous session
    const environmentUrls = account.settings.environmentUrls;
    if (storedAccount?.settings != null) {
      account.settings = storedAccount.settings;
    } else if (await this.storageService.has(keys.tempAccountSettings)) {
      account.settings = await this.storageService.get<AccountSettings>(keys.tempAccountSettings);
      await this.storageService.remove(keys.tempAccountSettings);
    }
    account.settings.environmentUrls = environmentUrls;
    if (account.settings.vaultTimeoutAction === "logOut" && account.settings.vaultTimeout != null) {
      account.tokens.accessToken = null;
      account.tokens.refreshToken = null;
      account.profile.apiKeyClientId = null;
      account.keys.apiKeyClientSecret = null;
    }
    await this.saveAccount(
      account,
      this.reconcileOptions(
        { userId: account.profile.userId },
        await this.defaultOnDiskLocalOptions()
      )
    );
  }

  protected async scaffoldNewAccountMemoryStorage(account: TAccount): Promise<void> {
    const storedAccount = await this.getAccount(
      this.reconcileOptions(
        { userId: account.profile.userId },
        await this.defaultOnDiskMemoryOptions()
      )
    );
    if (storedAccount?.settings != null) {
      storedAccount.settings.environmentUrls = account.settings.environmentUrls;
      account.settings = storedAccount.settings;
    }
    await this.storageService.save(
      account.profile.userId,
      account,
      await this.defaultOnDiskMemoryOptions()
    );
    await this.saveAccount(
      account,
      this.reconcileOptions(
        { userId: account.profile.userId },
        await this.defaultOnDiskMemoryOptions()
      )
    );
  }

  protected async scaffoldNewAccountSessionStorage(account: TAccount): Promise<void> {
    const storedAccount = await this.getAccount(
      this.reconcileOptions({ userId: account.profile.userId }, await this.defaultOnDiskOptions())
    );
    if (storedAccount?.settings != null) {
      storedAccount.settings.environmentUrls = account.settings.environmentUrls;
      account.settings = storedAccount.settings;
    }
    await this.storageService.save(
      account.profile.userId,
      account,
      await this.defaultOnDiskMemoryOptions()
    );
    await this.saveAccount(
      account,
      this.reconcileOptions({ userId: account.profile.userId }, await this.defaultOnDiskOptions())
    );
  }
  //

  protected async pushAccounts(): Promise<void> {
    await this.pruneInMemoryAccounts();
    await this.state().then((state) => {
      if (state.accounts == null || Object.keys(state.accounts).length < 1) {
        this.accounts.next(null);
        return;
      }

      this.accounts.next(state.accounts);
    });
  }

  protected reconcileOptions(
    requestedOptions: StorageOptions,
    defaultOptions: StorageOptions
  ): StorageOptions {
    if (requestedOptions == null) {
      return defaultOptions;
    }
    requestedOptions.userId = requestedOptions?.userId ?? defaultOptions.userId;
    requestedOptions.storageLocation =
      requestedOptions?.storageLocation ?? defaultOptions.storageLocation;
    requestedOptions.useSecureStorage =
      requestedOptions?.useSecureStorage ?? defaultOptions.useSecureStorage;
    requestedOptions.htmlStorageLocation =
      requestedOptions?.htmlStorageLocation ?? defaultOptions.htmlStorageLocation;
    requestedOptions.keySuffix = requestedOptions?.keySuffix ?? defaultOptions.keySuffix;
    return requestedOptions;
  }

  protected async defaultInMemoryOptions(): Promise<StorageOptions> {
    return {
      storageLocation: StorageLocation.Memory,
      userId: (await this.state()).activeUserId,
    };
  }

  protected async defaultOnDiskOptions(): Promise<StorageOptions> {
    return {
      storageLocation: StorageLocation.Disk,
      htmlStorageLocation: HtmlStorageLocation.Session,
      userId: (await this.state())?.activeUserId ?? (await this.getActiveUserIdFromStorage()),
      useSecureStorage: false,
    };
  }

  protected async defaultOnDiskLocalOptions(): Promise<StorageOptions> {
    return {
      storageLocation: StorageLocation.Disk,
      htmlStorageLocation: HtmlStorageLocation.Local,
      userId: (await this.state())?.activeUserId ?? (await this.getActiveUserIdFromStorage()),
      useSecureStorage: false,
    };
  }

  protected async defaultOnDiskMemoryOptions(): Promise<StorageOptions> {
    return {
      storageLocation: StorageLocation.Disk,
      htmlStorageLocation: HtmlStorageLocation.Memory,
      userId: (await this.state())?.activeUserId ?? (await this.getUserId()),
      useSecureStorage: false,
    };
  }

  protected async defaultSecureStorageOptions(): Promise<StorageOptions> {
    return {
      storageLocation: StorageLocation.Disk,
      useSecureStorage: true,
      userId: (await this.state())?.activeUserId ?? (await this.getActiveUserIdFromStorage()),
    };
  }

  protected async getActiveUserIdFromStorage(): Promise<string> {
    return await this.storageService.get<string>(keys.activeUserId);
  }

  protected async removeAccountFromLocalStorage(userId: string = null): Promise<void> {
    userId = userId ?? (await this.state())?.activeUserId;
    const storedAccount = await this.getAccount(
      this.reconcileOptions({ userId: userId }, await this.defaultOnDiskLocalOptions())
    );
    await this.saveAccount(
      this.resetAccount(storedAccount),
      this.reconcileOptions({ userId: userId }, await this.defaultOnDiskLocalOptions())
    );
  }

  protected async removeAccountFromSessionStorage(userId: string = null): Promise<void> {
    userId = userId ?? (await this.state())?.activeUserId;
    const storedAccount = await this.getAccount(
      this.reconcileOptions({ userId: userId }, await this.defaultOnDiskOptions())
    );
    await this.saveAccount(
      this.resetAccount(storedAccount),
      this.reconcileOptions({ userId: userId }, await this.defaultOnDiskOptions())
    );
  }

  protected async removeAccountFromSecureStorage(userId: string = null): Promise<void> {
    userId = userId ?? (await this.state())?.activeUserId;
    await this.setCryptoMasterKeyAuto(null, { userId: userId });
    await this.setCryptoMasterKeyBiometric(null, { userId: userId });
    await this.setCryptoMasterKeyB64(null, { userId: userId });
  }

  protected async removeAccountFromMemory(userId: string = null): Promise<void> {
    await this.updateState(async (state) => {
      userId = userId ?? state.activeUserId;
      delete state.accounts[userId];

      if (this.useAccountCache) {
        this.accountDiskCache.delete(userId);
      }

      return state;
    });
  }

  protected async pruneInMemoryAccounts() {
    // We preserve settings for logged out accounts, but we don't want to consider them when thinking about active account state
    for (const userId in (await this.state())?.accounts) {
      if (!(await this.getIsAuthenticated({ userId: userId }))) {
        await this.removeAccountFromMemory(userId);
      }
    }
  }

  // settings persist even on reset, and are not effected by this method
  protected resetAccount(account: TAccount) {
    const persistentAccountInformation = { settings: account.settings };
    return Object.assign(this.createAccount(), persistentAccountInformation);
  }

  protected async setAccountEnvironmentUrls(account: TAccount): Promise<TAccount> {
    account.settings.environmentUrls = await this.getGlobalEnvironmentUrls();
    return account;
  }

  protected async getGlobalEnvironmentUrls(options?: StorageOptions): Promise<EnvironmentUrls> {
    options = this.reconcileOptions(options, await this.defaultOnDiskOptions());
    return (await this.getGlobals(options)).environmentUrls ?? new EnvironmentUrls();
  }

  protected async clearDecryptedDataForActiveUser(): Promise<void> {
    await this.updateState(async (state) => {
      const userId = state?.activeUserId;
      if (userId != null && state?.accounts[userId]?.data != null) {
        state.accounts[userId].data = new AccountData();
      }

      return state;
    });
  }

  protected createAccount(init: Partial<TAccount> = null): TAccount {
    return this.stateFactory.createAccount(init);
  }

  protected createGlobals(init: Partial<TGlobalState> = null): TGlobalState {
    return this.stateFactory.createGlobal(init);
  }

  protected async deAuthenticateAccount(userId: string): Promise<void> {
    await this.setAccessToken(null, { userId: userId });
    await this.setLastActive(null, { userId: userId });
    await this.updateState(async (state) => {
      state.authenticatedAccounts = state.authenticatedAccounts.filter((id) => id !== userId);

      await this.storageService.save(keys.authenticatedAccounts, state.authenticatedAccounts);

      return state;
    });
  }

  protected async removeAccountFromDisk(userId: string) {
    await this.removeAccountFromSessionStorage(userId);
    await this.removeAccountFromLocalStorage(userId);
    await this.removeAccountFromSecureStorage(userId);
  }

  protected async dynamicallySetActiveUser() {
    const accounts = (await this.state())?.accounts;
    if (accounts == null || Object.keys(accounts).length < 1) {
      await this.setActiveUser(null);
      return;
    }
    for (const userId in accounts) {
      if (userId == null) {
        continue;
      }
      if (await this.getIsAuthenticated({ userId: userId })) {
        await this.setActiveUser(userId);
        break;
      }
      await this.setActiveUser(null);
    }
  }

  private async getTimeoutBasedStorageOptions(options?: StorageOptions): Promise<StorageOptions> {
    const timeoutAction = await this.getVaultTimeoutAction({ userId: options?.userId });
    const timeout = await this.getVaultTimeout({ userId: options?.userId });
    const defaultOptions =
      timeoutAction === "logOut" && timeout != null
        ? await this.defaultInMemoryOptions()
        : await this.defaultOnDiskOptions();
    return this.reconcileOptions(options, defaultOptions);
  }

  private async saveSecureStorageKey(key: string, value: string, options?: StorageOptions) {
    return value == null
      ? await this.secureStorageService.remove(`${options.userId}${key}`, options)
      : await this.secureStorageService.save(`${options.userId}${key}`, value, options);
  }

  protected async state(): Promise<State<TGlobalState, TAccount>> {
    const state = await this.memoryStorageService.get<State<TGlobalState, TAccount>>(keys.state, {
      deserializer: (s) => State.fromJSON(s),
    });
    return state;
  }

  private async setState(state: State<TGlobalState, TAccount>): Promise<void> {
    await this.memoryStorageService.save(keys.state, state);
  }

  protected async updateState(
    stateUpdater: (state: State<TGlobalState, TAccount>) => Promise<State<TGlobalState, TAccount>>
  ) {
    await this.state().then(async (state) => {
      const updatedState = await stateUpdater(state);
      if (updatedState == null) {
        throw new Error("Attempted to update state to null value");
      }

      await this.setState(updatedState);
    });
  }

  private mapToRecord<V>(map: Map<string, V>): Record<string, V> {
    return map == null ? null : Object.fromEntries(map);
  }

  private recordToMap<V>(record: Record<string, V>): Map<string, V> {
    return record == null ? null : new Map(Object.entries(record));
  }
}

export function withPrototype<T>(
  constructor: new (...args: any[]) => T,
  converter: (input: any) => T = (i) => i
): (
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor
) => { value: (...args: any[]) => Promise<T> } {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    return {
      value: function (...args: any[]) {
        const originalResult: Promise<T> = originalMethod.apply(this, args);

        if (!(originalResult instanceof Promise)) {
          throw new Error(
            `Error applying prototype to stored value -- result is not a promise for method ${String(
              propertyKey
            )}`
          );
        }

        return originalResult.then((result) => {
          return result == null ||
            result.constructor.name === constructor.prototype.constructor.name
            ? converter(result as T)
            : converter(
                Object.create(constructor.prototype, Object.getOwnPropertyDescriptors(result)) as T
              );
        });
      },
    };
  };
}

function withPrototypeForArrayMembers<T>(
  memberConstructor: new (...args: any[]) => T,
  memberConverter: (input: any) => T = (i) => i
): (
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor
) => { value: (...args: any[]) => Promise<T[]> } {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    return {
      value: function (...args: any[]) {
        const originalResult: Promise<any[]> = originalMethod.apply(this, args);

        if (!(originalResult instanceof Promise)) {
          throw new Error(
            `Error applying prototype to stored value -- result is not a promise for method ${String(
              propertyKey
            )}`
          );
        }

        return originalResult.then((result) => {
          if (result == null) {
            return null;
          } else if (!(result instanceof Array)) {
            throw new Error(
              `Attempted to retrieve non array type from state as an array for method ${String(
                propertyKey
              )}`
            );
          } else {
            return result.map((r) => {
              return r == null ||
                r.constructor.name === memberConstructor.prototype.constructor.name
                ? memberConverter(r)
                : memberConverter(
                    Object.create(memberConstructor.prototype, Object.getOwnPropertyDescriptors(r))
                  );
            });
          }
        });
      },
    };
  };
}

function withPrototypeForObjectValues<T>(
  valuesConstructor: new (...args: any[]) => T,
  valuesConverter: (input: any) => T = (i) => i
): (
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor
) => { value: (...args: any[]) => Promise<{ [key: string]: T }> } {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    return {
      value: function (...args: any[]) {
        const originalResult: Promise<{ [key: string]: T }> = originalMethod.apply(this, args);

        if (!(originalResult instanceof Promise)) {
          throw new Error(
            `Error applying prototype to stored value -- result is not a promise for method ${String(
              propertyKey
            )}`
          );
        }

        return originalResult.then((result) => {
          if (result == null) {
            return null;
          } else {
            for (const [key, val] of Object.entries(result)) {
              result[key] =
                val == null || val.constructor.name === valuesConstructor.prototype.constructor.name
                  ? valuesConverter(val)
                  : valuesConverter(
                      Object.create(
                        valuesConstructor.prototype,
                        Object.getOwnPropertyDescriptors(val)
                      )
                    );
            }

            return result as { [key: string]: T };
          }
        });
      },
    };
  };
}
