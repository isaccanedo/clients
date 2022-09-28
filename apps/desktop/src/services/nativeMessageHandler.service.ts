import { Injectable } from "@angular/core";
import { ipcRenderer } from "electron";
import Swal from "sweetalert2";

import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { CryptoFunctionService } from "@bitwarden/common/abstractions/cryptoFunction.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { NativeMessagingVersion } from "@bitwarden/common/enums/nativeMessagingVersion";
import { Utils } from "@bitwarden/common/misc/utils";
import { EncString } from "@bitwarden/common/models/domain/encString";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetricCryptoKey";
import { StateService } from "@bitwarden/common/services/state.service";

import { DecryptedCommandData } from "src/models/nativeMessaging/decryptedCommandData";
import { EncryptedMessage } from "src/models/nativeMessaging/encryptedMessage";
import { EncryptedMessageResponse } from "src/models/nativeMessaging/encryptedMessageResponse";
import { Message } from "src/models/nativeMessaging/message";
import { UnencryptedMessage } from "src/models/nativeMessaging/unencryptedMessage";
import { UnencryptedMessageResponse } from "src/models/nativeMessaging/unencryptedMessageResponse";

import { EncryptedMessageHandlerService } from "./encryptedMessageHandlerService";

const EncryptionAlgorithm = "sha1";

@Injectable()
export class NativeMessageHandlerService {
  private ddgSharedSecret: SymmetricCryptoKey;

  constructor(
    private stateService: StateService,
    private cryptoService: CryptoService,
    private cryptoFunctionService: CryptoFunctionService,
    private messagingService: MessagingService,
    private i18nService: I18nService,
    private encryptedMessageHandlerService: EncryptedMessageHandlerService
  ) {}

  async handleMessage(message: Message) {
    const decryptedCommand = message as UnencryptedMessage;
    if (message.version != NativeMessagingVersion.Latest) {
      this.sendResponse({
        messageId: message.messageId,
        version: NativeMessagingVersion.Latest,
        payload: {
          error: "version-discrepancy",
        },
      });
    } else {
      if (decryptedCommand.command === "bw-handshake") {
        await this.handleDecryptedMessage(decryptedCommand);
      } else {
        await this.handleEncryptedMessage(message as EncryptedMessage);
      }
    }
  }

  private async handleDecryptedMessage(message: UnencryptedMessage) {
    const { messageId, payload } = message;
    const { publicKey, applicationName } = payload;
    if (!publicKey) {
      this.sendResponse({
        messageId: messageId,
        version: NativeMessagingVersion.Latest,
        payload: {
          error: "cannot-decrypt",
        },
      });
      return;
    }

    try {
      const remotePublicKey = Utils.fromB64ToArray(publicKey).buffer;
      const ddgEnabled = await this.stateService.getEnableDuckDuckGoBrowserIntegration();

      if (!ddgEnabled) {
        this.sendResponse({
          messageId: messageId,
          version: NativeMessagingVersion.Latest,
          payload: {
            error: "canceled",
          },
        });

        return;
      }

      // Ask for confirmation from user
      this.messagingService.send("setFocus");
      const submitted = await Swal.fire({
        heightAuto: false,
        titleText: this.i18nService.t("verifyNativeMessagingConnectionTitle", applicationName),
        html: `${this.i18nService.t("verifyNativeMessagingConnectionDesc")}<br>${this.i18nService.t(
          "verifyNativeMessagingConnectionWarning"
        )}`,
        showCancelButton: true,
        cancelButtonText: this.i18nService.t("no"),
        showConfirmButton: true,
        confirmButtonText: this.i18nService.t("yes"),
        allowOutsideClick: false,
        focusCancel: true,
      });

      if (submitted.value !== true) {
        this.sendResponse({
          messageId: messageId,
          version: NativeMessagingVersion.Latest,
          payload: {
            error: "canceled",
          },
        });
        return;
      }

      const secret = await this.cryptoFunctionService.randomBytes(64);
      this.ddgSharedSecret = new SymmetricCryptoKey(secret);
      const sharedKeyB64 = new SymmetricCryptoKey(secret).toJSON().keyB64;

      await this.stateService.setDuckDuckGoSharedKey(sharedKeyB64);

      const encryptedSecret = await this.cryptoFunctionService.rsaEncrypt(
        secret,
        remotePublicKey,
        EncryptionAlgorithm
      );

      this.sendResponse({
        messageId: messageId,
        version: NativeMessagingVersion.Latest,
        payload: {
          status: "success",
          sharedKey: Utils.fromBufferToB64(encryptedSecret),
        },
      });
    } catch (error) {
      this.sendResponse({
        messageId: messageId,
        version: NativeMessagingVersion.Latest,
        payload: {
          error: "cannot-decrypt",
        },
      });
    }
  }

  private async handleEncryptedMessage(message: EncryptedMessage) {
    message.encryptedCommand = EncString.fromJSON(message.encryptedCommand.toString());
    const decryptedCommandData = await this.decryptPayload(message);
    const { command } = decryptedCommandData;

    try {
      const responseData = await this.encryptedMessageHandlerService.responseDataForCommand(
        decryptedCommandData
      );

      await this.sendEncryptedResponse(message, { command, payload: responseData });
    } catch (error) {
      this.sendEncryptedResponse(message, { command, payload: {} });
    }
  }

  private async encryptPayload(
    payload: DecryptedCommandData,
    key: SymmetricCryptoKey
  ): Promise<EncString> {
    return await this.cryptoService.encrypt(JSON.stringify(payload), key);
  }

  private async decryptPayload(message: EncryptedMessage): Promise<DecryptedCommandData> {
    if (!this.ddgSharedSecret) {
      const storedKey = await this.stateService.getDuckDuckGoSharedKey();
      if (storedKey == null) {
        this.sendResponse({
          messageId: message.messageId,
          version: NativeMessagingVersion.Latest,
          payload: {
            error: "cannot-decrypt",
          },
        });
        return;
      }
      this.ddgSharedSecret = SymmetricCryptoKey.fromJSON({ keyB64: storedKey });
    }

    return JSON.parse(
      await this.cryptoService.decryptToUtf8(
        message.encryptedCommand as EncString,
        this.ddgSharedSecret
      )
    );
  }

  private async sendEncryptedResponse(
    originalMessage: EncryptedMessage,
    response: DecryptedCommandData
  ) {
    if (!this.ddgSharedSecret) {
      this.sendResponse({
        messageId: originalMessage.messageId,
        version: NativeMessagingVersion.Latest,
        payload: {
          error: "cannot-decrypt",
        },
      });

      return;
    }

    const encryptedPayload = await this.encryptPayload(response, this.ddgSharedSecret);

    this.sendResponse({
      messageId: originalMessage.messageId,
      version: NativeMessagingVersion.Latest,
      encryptedPayload,
    });
  }

  private sendResponse(response: EncryptedMessageResponse | UnencryptedMessageResponse) {
    ipcRenderer.send("nativeMessagingReply", response);
  }
}
