import "module-alias/register";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { NativeMessagingVersion } from "@bitwarden/common/enums/nativeMessagingVersion";

import { CredentialCreatePayload } from "../../../src/models/nativeMessaging/encryptedMessagePayloads/credentialCreatePayload";
import { LogUtils } from "../logUtils";
import NativeMessageService from "../nativeMessageService";
import * as config from "../variables";

const argv: any = yargs(hideBin(process.argv)).option("name", {
  alias: "n",
  demand: true,
  describe: "Name that the created login will be given",
  type: "string",
}).argv;

const { name } = argv;

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

  // Get active account userId
  const status = await nativeMessageService.checkStatus(handshakeResponse.sharedKey);

  const activeUser = status.payload.filter((a) => a.active === true && a.status === "unlocked")[0];
  if (activeUser === undefined) {
    LogUtils.logError("No active or unlocked user");
  }
  LogUtils.logInfo("Active userId: " + activeUser.id);

  LogUtils.logSuccess("Handshake success response");
  const response = await nativeMessageService.credentialCreation(handshakeResponse.sharedKey, {
    name: name,
    userName: "SuperAwesomeUser",
    password: "dolhpin",
    uri: "google.com",
    userId: activeUser.id,
  } as CredentialCreatePayload);

  if (response.payload.status === "failure") {
    LogUtils.logError("Failure response returned ");
  } else if (response.payload.status === "success") {
    LogUtils.logSuccess("Success response returned ");
  } else if (response.payload.error === "locked") {
    LogUtils.logError("Error: vault is locked");
  } else {
    LogUtils.logWarning("Other response: ", response);
  }

  nativeMessageService.disconnect();
})();
