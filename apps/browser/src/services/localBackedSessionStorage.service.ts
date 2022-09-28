import { Jsonify } from "type-fest";

import { AbstractEncryptService } from "@bitwarden/common/abstractions/abstractEncrypt.service";
import {
  AbstractCachedStorageService,
  MemoryStorageServiceInterface,
} from "@bitwarden/common/abstractions/storage.service";
import { EncString } from "@bitwarden/common/models/domain/encString";
import { MemoryStorageOptions } from "@bitwarden/common/models/domain/storageOptions";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetricCryptoKey";

import { devFlag } from "../decorators/dev-flag.decorator";
import { devFlagEnabled } from "../flags";

import { AbstractKeyGenerationService } from "./abstractions/abstractKeyGeneration.service";
import BrowserLocalStorageService from "./browserLocalStorage.service";
import BrowserMemoryStorageService from "./browserMemoryStorage.service";

const keys = {
  encKey: "localEncryptionKey",
  sessionKey: "session",
};

export class LocalBackedSessionStorageService
  extends AbstractCachedStorageService
  implements MemoryStorageServiceInterface
{
  private cache = new Map<string, unknown>();
  private localStorage = new BrowserLocalStorageService();
  private sessionStorage = new BrowserMemoryStorageService();

  constructor(
    private encryptService: AbstractEncryptService,
    private keyGenerationService: AbstractKeyGenerationService
  ) {
    super();
  }

  async get<T>(key: string, options?: MemoryStorageOptions<T>): Promise<T> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    return await this.getBypassCache(key, options);
  }

  async getBypassCache<T>(key: string, options?: MemoryStorageOptions<T>): Promise<T> {
    const session = await this.getLocalSession(await this.getSessionEncKey());
    if (session == null || !Object.keys(session).includes(key)) {
      return null;
    }

    let value = session[key];
    if (options?.deserializer != null) {
      value = options.deserializer(value as Jsonify<T>);
    }

    this.cache.set(key, value);
    return this.cache.get(key) as T;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) != null;
  }

  async save<T>(key: string, obj: T): Promise<void> {
    if (obj == null) {
      this.cache.delete(key);
    } else {
      this.cache.set(key, obj);
    }

    const sessionEncKey = await this.getSessionEncKey();
    const localSession = (await this.getLocalSession(sessionEncKey)) ?? {};
    localSession[key] = obj;
    await this.setLocalSession(localSession, sessionEncKey);
  }

  async remove(key: string): Promise<void> {
    await this.save(key, null);
  }

  async getLocalSession(encKey: SymmetricCryptoKey): Promise<Record<string, unknown>> {
    const local = await this.localStorage.get<string>(keys.sessionKey);

    if (local == null) {
      return null;
    }

    if (devFlagEnabled("storeSessionDecrypted")) {
      return local as any as Record<string, unknown>;
    }

    const sessionJson = await this.encryptService.decryptToUtf8(new EncString(local), encKey);
    if (sessionJson == null) {
      // Error with decryption -- session is lost, delete state and key and start over
      await this.setSessionEncKey(null);
      await this.localStorage.remove(keys.sessionKey);
      return null;
    }
    return JSON.parse(sessionJson);
  }

  async setLocalSession(session: Record<string, unknown>, key: SymmetricCryptoKey) {
    if (devFlagEnabled("storeSessionDecrypted")) {
      await this.setDecryptedLocalSession(session);
    } else {
      await this.setEncryptedLocalSession(session, key);
    }
  }

  @devFlag("storeSessionDecrypted")
  async setDecryptedLocalSession(session: Record<string, unknown>): Promise<void> {
    // Make sure we're storing the jsonified version of the session
    const jsonSession = JSON.parse(JSON.stringify(session));
    if (session == null) {
      await this.localStorage.remove(keys.sessionKey);
    } else {
      await this.localStorage.save(keys.sessionKey, jsonSession);
    }
  }

  async setEncryptedLocalSession(session: Record<string, unknown>, key: SymmetricCryptoKey) {
    const jsonSession = JSON.stringify(session);
    const encSession = await this.encryptService.encrypt(jsonSession, key);

    if (encSession == null) {
      return await this.localStorage.remove(keys.sessionKey);
    }
    await this.localStorage.save(keys.sessionKey, encSession.encryptedString);
  }

  async getSessionEncKey(): Promise<SymmetricCryptoKey> {
    let storedKey = await this.sessionStorage.get<SymmetricCryptoKey>(keys.encKey);
    if (storedKey == null || Object.keys(storedKey).length == 0) {
      storedKey = await this.keyGenerationService.makeEphemeralKey();
      await this.setSessionEncKey(storedKey);
    }
    return SymmetricCryptoKey.fromJSON(storedKey);
  }

  async setSessionEncKey(input: SymmetricCryptoKey): Promise<void> {
    if (input == null) {
      await this.sessionStorage.remove(keys.encKey);
    } else {
      await this.sessionStorage.save(keys.encKey, input);
    }
  }
}
