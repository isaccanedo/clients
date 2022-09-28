import "module-alias/register";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { NativeMessagingVersion } from "@bitwarden/common/enums/nativeMessagingVersion";

import { LogUtils } from "../logUtils";
import NativeMessageService from "../nativeMessageService";
import * as config from "../variables";

const argv: any = yargs(hideBin(process.argv)).option("uri", {
  alias: "u",
  demand: true,
  describe: "The uri to retrieve logins for",
  type: "string",
}).argv;

const { uri } = argv;

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
  const response = await nativeMessageService.credentialRetrieval(handshakeResponse.sharedKey, uri);

  if (response.payload.error != null) {
    LogUtils.logError("Error response returned: ", response.payload.error);
  } else {
    LogUtils.logSuccess("Credentials returned ", response);
  }

  nativeMessageService.disconnect();
})();
