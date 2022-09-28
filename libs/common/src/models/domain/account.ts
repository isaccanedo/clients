import { Except, Jsonify } from "type-fest";

import { Utils } from "@bitwarden/common/misc/utils";
import { DeepJsonify } from "@bitwarden/common/types/deep-jsonify";

import { AuthenticationStatus } from "../../enums/authenticationStatus";
import { KdfType } from "../../enums/kdfType";
import { UriMatchType } from "../../enums/uriMatchType";
import { CipherData } from "../data/cipherData";
import { CollectionData } from "../data/collectionData";
import { EncryptedOrganizationKeyData } from "../data/encryptedOrganizationKeyData";
import { EventData } from "../data/eventData";
import { FolderData } from "../data/folderData";
import { OrganizationData } from "../data/organizationData";
import { PolicyData } from "../data/policyData";
import { ProviderData } from "../data/providerData";
import { SendData } from "../data/sendData";
import { ServerConfigData } from "../data/server-config.data";
import { CipherView } from "../view/cipherView";
import { CollectionView } from "../view/collectionView";
import { SendView } from "../view/sendView";

import { EncString } from "./encString";
import { EnvironmentUrls } from "./environmentUrls";
import { GeneratedPasswordHistory } from "./generatedPasswordHistory";
import { Policy } from "./policy";
import { SymmetricCryptoKey } from "./symmetricCryptoKey";

export class EncryptionPair<TEncrypted, TDecrypted> {
  encrypted?: TEncrypted;
  decrypted?: TDecrypted;

  toJSON() {
    return {
      encrypted: this.encrypted,
      decrypted:
        this.decrypted instanceof ArrayBuffer
          ? Utils.fromBufferToByteString(this.decrypted)
          : this.decrypted,
    };
  }

  static fromJSON<TEncrypted, TDecrypted>(
    obj: Jsonify<EncryptionPair<Jsonify<TEncrypted>, Jsonify<TDecrypted>>>,
    decryptedFromJson?: (decObj: Jsonify<TDecrypted> | string) => TDecrypted,
    encryptedFromJson?: (encObj: Jsonify<TEncrypted>) => TEncrypted
  ) {
    if (obj == null) {
      return null;
    }

    const pair = new EncryptionPair<TEncrypted, TDecrypted>();
    if (obj?.encrypted != null) {
      pair.encrypted = encryptedFromJson
        ? encryptedFromJson(obj.encrypted)
        : (obj.encrypted as TEncrypted);
    }
    if (obj?.decrypted != null) {
      pair.decrypted = decryptedFromJson
        ? decryptedFromJson(obj.decrypted)
        : (obj.decrypted as TDecrypted);
    }
    return pair;
  }
}

export class DataEncryptionPair<TEncrypted, TDecrypted> {
  encrypted?: { [id: string]: TEncrypted };
  decrypted?: TDecrypted[];
}

// This is a temporary structure to handle migrated `DataEncryptionPair` to
//  avoid needing a data migration at this stage. It should be replaced with
//  proper data migrations when `DataEncryptionPair` is deprecated.
export class TemporaryDataEncryption<TEncrypted> {
  encrypted?: { [id: string]: TEncrypted };
}

export class AccountData {
  ciphers?: DataEncryptionPair<CipherData, CipherView> = new DataEncryptionPair<
    CipherData,
    CipherView
  >();
  folders? = new TemporaryDataEncryption<FolderData>();
  localData?: any;
  sends?: DataEncryptionPair<SendData, SendView> = new DataEncryptionPair<SendData, SendView>();
  collections?: DataEncryptionPair<CollectionData, CollectionView> = new DataEncryptionPair<
    CollectionData,
    CollectionView
  >();
  policies?: DataEncryptionPair<PolicyData, Policy> = new DataEncryptionPair<PolicyData, Policy>();
  passwordGenerationHistory?: EncryptionPair<
    GeneratedPasswordHistory[],
    GeneratedPasswordHistory[]
  > = new EncryptionPair<GeneratedPasswordHistory[], GeneratedPasswordHistory[]>();
  addEditCipherInfo?: any;
  eventCollection?: EventData[];
  organizations?: { [id: string]: OrganizationData };
  providers?: { [id: string]: ProviderData };
}

export class AccountKeys {
  cryptoMasterKey?: SymmetricCryptoKey;
  cryptoMasterKeyAuto?: string;
  cryptoMasterKeyB64?: string;
  cryptoMasterKeyBiometric?: string;
  cryptoSymmetricKey?: EncryptionPair<string, SymmetricCryptoKey> = new EncryptionPair<
    string,
    SymmetricCryptoKey
  >();
  organizationKeys?: EncryptionPair<
    { [orgId: string]: EncryptedOrganizationKeyData },
    Record<string, SymmetricCryptoKey>
  > = new EncryptionPair<
    { [orgId: string]: EncryptedOrganizationKeyData },
    Record<string, SymmetricCryptoKey>
  >();
  providerKeys?: EncryptionPair<any, Record<string, SymmetricCryptoKey>> = new EncryptionPair<
    any,
    Record<string, SymmetricCryptoKey>
  >();
  privateKey?: EncryptionPair<string, ArrayBuffer> = new EncryptionPair<string, ArrayBuffer>();
  publicKey?: ArrayBuffer;
  apiKeyClientSecret?: string;

  toJSON() {
    return Object.assign(this as Except<AccountKeys, "publicKey">, {
      publicKey: Utils.fromBufferToByteString(this.publicKey),
    });
  }

  static fromJSON(obj: DeepJsonify<AccountKeys>): AccountKeys {
    if (obj == null) {
      return null;
    }

    return Object.assign(
      new AccountKeys(),
      { cryptoMasterKey: SymmetricCryptoKey.fromJSON(obj?.cryptoMasterKey) },
      {
        cryptoSymmetricKey: EncryptionPair.fromJSON(
          obj?.cryptoSymmetricKey,
          SymmetricCryptoKey.fromJSON
        ),
      },
      { organizationKeys: AccountKeys.initRecordEncryptionPairsFromJSON(obj?.organizationKeys) },
      { providerKeys: AccountKeys.initRecordEncryptionPairsFromJSON(obj?.providerKeys) },
      {
        privateKey: EncryptionPair.fromJSON<string, ArrayBuffer>(
          obj?.privateKey,
          (decObj: string) => Utils.fromByteStringToArray(decObj).buffer
        ),
      },
      {
        publicKey: Utils.fromByteStringToArray(obj?.publicKey)?.buffer,
      }
    );
  }

  static initRecordEncryptionPairsFromJSON(obj: any) {
    return EncryptionPair.fromJSON(obj, (decObj: any) => {
      if (obj == null) {
        return null;
      }

      const record: Record<string, SymmetricCryptoKey> = {};
      for (const id in decObj) {
        record[id] = SymmetricCryptoKey.fromJSON(decObj[id]);
      }
      return record;
    });
  }
}

export class AccountProfile {
  apiKeyClientId?: string;
  authenticationStatus?: AuthenticationStatus;
  convertAccountToKeyConnector?: boolean;
  email?: string;
  emailVerified?: boolean;
  entityId?: string;
  entityType?: string;
  everBeenUnlocked?: boolean;
  forcePasswordReset?: boolean;
  hasPremiumPersonally?: boolean;
  hasPremiumFromOrganization?: boolean;
  lastSync?: string;
  userId?: string;
  usesKeyConnector?: boolean;
  keyHash?: string;
  kdfIterations?: number;
  kdfType?: KdfType;

  static fromJSON(obj: Jsonify<AccountProfile>): AccountProfile {
    if (obj == null) {
      return null;
    }

    return Object.assign(new AccountProfile(), obj);
  }
}

export class AccountSettings {
  autoConfirmFingerPrints?: boolean;
  autoFillOnPageLoadDefault?: boolean;
  biometricUnlock?: boolean;
  clearClipboard?: number;
  collapsedGroupings?: string[];
  defaultUriMatch?: UriMatchType;
  disableAddLoginNotification?: boolean;
  disableAutoBiometricsPrompt?: boolean;
  disableAutoTotpCopy?: boolean;
  disableBadgeCounter?: boolean;
  disableChangedPasswordNotification?: boolean;
  disableContextMenuItem?: boolean;
  disableGa?: boolean;
  dontShowCardsCurrentTab?: boolean;
  dontShowIdentitiesCurrentTab?: boolean;
  enableAlwaysOnTop?: boolean;
  enableAutoFillOnPageLoad?: boolean;
  enableBiometric?: boolean;
  enableFullWidth?: boolean;
  enableGravitars?: boolean;
  environmentUrls: EnvironmentUrls = new EnvironmentUrls();
  equivalentDomains?: any;
  minimizeOnCopyToClipboard?: boolean;
  neverDomains?: { [id: string]: any };
  passwordGenerationOptions?: any;
  usernameGenerationOptions?: any;
  generatorOptions?: any;
  pinProtected?: EncryptionPair<string, EncString> = new EncryptionPair<string, EncString>();
  protectedPin?: string;
  settings?: AccountSettingsSettings; // TODO: Merge whatever is going on here into the AccountSettings model properly
  vaultTimeout?: number;
  vaultTimeoutAction?: string = "lock";
  serverConfig?: ServerConfigData;

  static fromJSON(obj: Jsonify<AccountSettings>): AccountSettings {
    if (obj == null) {
      return null;
    }

    return Object.assign(new AccountSettings(), obj, {
      environmentUrls: EnvironmentUrls.fromJSON(obj?.environmentUrls),
      pinProtected: EncryptionPair.fromJSON<string, EncString>(
        obj?.pinProtected,
        EncString.fromJSON
      ),
      serverConfig: ServerConfigData.fromJSON(obj?.serverConfig),
    });
  }
}

export type AccountSettingsSettings = {
  equivalentDomains?: { [id: string]: any };
};

export class AccountTokens {
  accessToken?: string;
  refreshToken?: string;
  securityStamp?: string;

  static fromJSON(obj: Jsonify<AccountTokens>): AccountTokens {
    if (obj == null) {
      return null;
    }

    return Object.assign(new AccountTokens(), obj);
  }
}

export class Account {
  data?: AccountData = new AccountData();
  keys?: AccountKeys = new AccountKeys();
  profile?: AccountProfile = new AccountProfile();
  settings?: AccountSettings = new AccountSettings();
  tokens?: AccountTokens = new AccountTokens();

  constructor(init: Partial<Account>) {
    Object.assign(this, {
      data: {
        ...new AccountData(),
        ...init?.data,
      },
      keys: {
        ...new AccountKeys(),
        ...init?.keys,
      },
      profile: {
        ...new AccountProfile(),
        ...init?.profile,
      },
      settings: {
        ...new AccountSettings(),
        ...init?.settings,
      },
      tokens: {
        ...new AccountTokens(),
        ...init?.tokens,
      },
    });
  }

  static fromJSON(json: Jsonify<Account>): Account {
    if (json == null) {
      return null;
    }

    return Object.assign(new Account({}), json, {
      keys: AccountKeys.fromJSON(json?.keys),
      profile: AccountProfile.fromJSON(json?.profile),
      settings: AccountSettings.fromJSON(json?.settings),
      tokens: AccountTokens.fromJSON(json?.tokens),
    });
  }
}
