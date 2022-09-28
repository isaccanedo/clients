import "module-alias/register";

import { NativeMessagingVersion } from "@bitwarden/common/enums/nativeMessagingVersion";

import { LogUtils } from "../logUtils";
import NativeMessageService from "../nativeMessageService";
import * as config from "../variables";

(async () => {
  const nativeMessageService = new NativeMessageService(NativeMessagingVersion.One);

  const response = await nativeMessageService.sendHandshake(
    config.testRsaPublicKey,
    config.applicationName
  );
  LogUtils.logSuccess("Received response to handshake request");
  if (response.status) {
    LogUtils.logSuccess("Handshake success response");
  } else if (response.error === "canceled") {
    LogUtils.logWarning("Handshake canceled by user");
  } else {
    LogUtils.logError("Handshake failure response");
  }
  nativeMessageService.disconnect();
})();
