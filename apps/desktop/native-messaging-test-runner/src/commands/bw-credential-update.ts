import "module-alias/register";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { NativeMessagingVersion } from "@bitwarden/common/enums/nativeMessagingVersion";

import { CredentialUpdatePayload } from "../../../src/models/nativeMessaging/encryptedMessagePayloads/credentialUpdatePayload";
import { LogUtils } from "../logUtils";
import NativeMessageService from "../nativeMessageService";
import * as config from "../variables";

// Command line arguments
const argv: any = yargs(hideBin(process.argv))
  .option("name", {
    alias: "n",
    demand: true,
    describe: "Name that the updated login will be given",
    type: "string",
  })
  .option("username", {
    alias: "u",
    demand: true,
    describe: "Username that the login will be given",
    type: "string",
  })
  .option("password", {
    alias: "p",
    demand: true,
    describe: "Password that the login will be given",
    type: "string",
  })
  .option("uri", {
    demand: true,
    describe: "Uri that the login will be given",
    type: "string",
  })
  .option("credentialId", {
    demand: true,
    describe: "GUID of the credential to update",
    type: "string",
  }).argv;

const { name, username, password, uri, credentialId } = argv;

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

  // Get active account userId
  const status = await nativeMessageService.checkStatus(handshakeResponse.sharedKey);

  const activeUser = status.payload.filter((a) => a.active === true && a.status === "unlocked")[0];
  if (activeUser === undefined) {
    LogUtils.logError("No active or unlocked user");
  }
  LogUtils.logInfo("Active userId: " + activeUser.id);

  const response = await nativeMessageService.credentialUpdate(handshakeResponse.sharedKey, {
    name: name,
    password: password,
    userName: username,
    uri: uri,
    userId: activeUser.id,
    credentialId: credentialId,
  } as CredentialUpdatePayload);

  if (response.payload.status === "failure") {
    LogUtils.logError("Failure response returned ");
  } else if (response.payload.status === "success") {
    LogUtils.logSuccess("Success response returned ");
  } else {
    LogUtils.logWarning("Other response: ", response);
  }

  nativeMessageService.disconnect();
})();
