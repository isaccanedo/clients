import { ipcMain, systemPreferences } from "electron";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";

import { BiometricMain } from "../biometric/biometric.main";

export default class BiometricDarwinMain implements BiometricMain {
  constructor(private i18nservice: I18nService, private stateService: StateService) {}

  async init() {
    await this.stateService.setEnableBiometric(await this.supportsBiometric());
    await this.stateService.setBiometricText("unlockWithTouchId");
    await this.stateService.setNoAutoPromptBiometricsText("autoPromptTouchId");

    ipcMain.handle("biometric", async () => {
      return await this.authenticateBiometric();
    });
  }

  supportsBiometric(): Promise<boolean> {
    return Promise.resolve(systemPreferences.canPromptTouchID());
  }

  async authenticateBiometric(): Promise<boolean> {
    try {
      await systemPreferences.promptTouchID(this.i18nservice.t("touchIdConsentMessage"));
      return true;
    } catch {
      return false;
    }
  }
}
