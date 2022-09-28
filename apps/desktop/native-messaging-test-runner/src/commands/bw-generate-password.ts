import "module-alias/register";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { NativeMessagingVersion } from "@bitwarden/common/enums/nativeMessagingVersion";

import { LogUtils } from "../logUtils";
import NativeMessageService from "../nativeMessageService";
import * as config from "../variables";

const argv: any = yargs(hideBin(process.argv)).option("userId", {
  alias: "u",
  demand: true,
  describe: "UserId to generate password for",
  type: "string",
}).argv;

const { userId } = argv;

(async () => {
  const nativeMessageService = new NativeMessageService(NativeMessagingVersion.One);
  // Handshake
  LogUtils.logInfo("Sending Handshake");
  const handshakeResponse = await nativeMessageService.sendHandshake(
    config.testRsaPublicKey,
    config.applicationName
  );

  if (!handshakeResponse.status) {
    LogUtils.logError(" Handshake failed. Error was: " + handshakeResponse.error);
    nativeMessageService.disconnect();
    return;
  }

  LogUtils.logSuccess("Handshake success response");
  const response = await nativeMessageService.generatePassword(handshakeResponse.sharedKey, userId);

  if (response.payload.error != null) {
    LogUtils.logError("Error response returned: ", response.payload.error);
  } else {
    LogUtils.logSuccess("Response: ", response);
  }

  nativeMessageService.disconnect();
})();
