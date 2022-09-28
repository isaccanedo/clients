import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { AbstractStorageService } from "@bitwarden/common/abstractions/storage.service";
import { Utils } from "@bitwarden/common/misc/utils";
import { EncArrayBuffer } from "@bitwarden/common/models/domain/encArrayBuffer";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetricCryptoKey";

export class NodeEnvSecureStorageService implements AbstractStorageService {
  constructor(
    private storageService: AbstractStorageService,
    private logService: LogService,
    private cryptoService: () => CryptoService
  ) {}

  async get<T>(key: string): Promise<T> {
    const value = await this.storageService.get<string>(this.makeProtectedStorageKey(key));
    if (value == null) {
      return null;
    }
    const obj = await this.decrypt(value);
    return obj as any;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) != null;
  }

  async save(key: string, obj: any): Promise<any> {
    if (obj == null) {
      return this.remove(key);
    }

    if (obj !== null && typeof obj !== "string") {
      throw new Error("Only string storage is allowed.");
    }
    const protectedObj = await this.encrypt(obj);
    await this.storageService.save(this.makeProtectedStorageKey(key), protectedObj);
  }

  remove(key: string): Promise<any> {
    return this.storageService.remove(this.makeProtectedStorageKey(key));
  }

  private async encrypt(plainValue: string): Promise<string> {
    const sessionKey = this.getSessionKey();
    if (sessionKey == null) {
      throw new Error("No session key available.");
    }
    const encValue = await this.cryptoService().encryptToBytes(
      Utils.fromB64ToArray(plainValue).buffer,
      sessionKey
    );
    if (encValue == null) {
      throw new Error("Value didn't encrypt.");
    }

    return Utils.fromBufferToB64(encValue.buffer);
  }

  private async decrypt(encValue: string): Promise<string> {
    try {
      const sessionKey = this.getSessionKey();
      if (sessionKey == null) {
        return null;
      }

      const encBuf = EncArrayBuffer.fromB64(encValue);
      const decValue = await this.cryptoService().decryptFromBytes(encBuf, sessionKey);
      if (decValue == null) {
        this.logService.info("Failed to decrypt.");
        return null;
      }

      return Utils.fromBufferToB64(decValue);
    } catch (e) {
      this.logService.info("Decrypt error.");
      return null;
    }
  }

  private getSessionKey() {
    try {
      if (process.env.BW_SESSION != null) {
        const sessionBuffer = Utils.fromB64ToArray(process.env.BW_SESSION).buffer;
        if (sessionBuffer != null) {
          const sessionKey = new SymmetricCryptoKey(sessionBuffer);
          if (sessionBuffer != null) {
            return sessionKey;
          }
        }
      }
    } catch (e) {
      this.logService.info("Session key is invalid.");
    }

    return null;
  }

  private makeProtectedStorageKey(key: string) {
    return "__PROTECTED__" + key;
  }
}
