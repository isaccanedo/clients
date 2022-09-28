import { Directive, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { first } from "rxjs/operators";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { UsernameGenerationService } from "@bitwarden/common/abstractions/usernameGeneration.service";
import { PasswordGeneratorPolicyOptions } from "@bitwarden/common/models/domain/passwordGeneratorPolicyOptions";

@Directive()
export class GeneratorComponent implements OnInit {
  @Input() comingFromAddEdit = false;
  @Input() type: string;
  @Output() onSelected = new EventEmitter<string>();

  usernameGeneratingPromise: Promise<string>;
  typeOptions: any[];
  passTypeOptions: any[];
  usernameTypeOptions: any[];
  subaddressOptions: any[];
  catchallOptions: any[];
  forwardOptions: any[];
  usernameOptions: any = {};
  passwordOptions: any = {};
  username = "-";
  password = "-";
  showOptions = false;
  avoidAmbiguous = false;
  enforcedPasswordPolicyOptions: PasswordGeneratorPolicyOptions;
  usernameWebsite: string = null;

  constructor(
    protected passwordGenerationService: PasswordGenerationService,
    protected usernameGenerationService: UsernameGenerationService,
    protected platformUtilsService: PlatformUtilsService,
    protected stateService: StateService,
    protected i18nService: I18nService,
    protected logService: LogService,
    protected route: ActivatedRoute,
    private win: Window
  ) {
    this.typeOptions = [
      { name: i18nService.t("password"), value: "password" },
      { name: i18nService.t("username"), value: "username" },
    ];
    this.passTypeOptions = [
      { name: i18nService.t("password"), value: "password" },
      { name: i18nService.t("passphrase"), value: "passphrase" },
    ];
    this.usernameTypeOptions = [
      {
        name: i18nService.t("plusAddressedEmail"),
        value: "subaddress",
        desc: i18nService.t("plusAddressedEmailDesc"),
      },
      {
        name: i18nService.t("catchallEmail"),
        value: "catchall",
        desc: i18nService.t("catchallEmailDesc"),
      },
      {
        name: i18nService.t("forwardedEmail"),
        value: "forwarded",
        desc: i18nService.t("forwardedEmailDesc"),
      },
      { name: i18nService.t("randomWord"), value: "word" },
    ];
    this.subaddressOptions = [{ name: i18nService.t("random"), value: "random" }];
    this.catchallOptions = [{ name: i18nService.t("random"), value: "random" }];
    this.forwardOptions = [
      { name: "SimpleLogin", value: "simplelogin" },
      { name: "AnonAddy", value: "anonaddy" },
      { name: "Firefox Relay", value: "firefoxrelay" },
      { name: "Fastmail", value: "fastmail" },
      { name: "DuckDuckGo", value: "duckduckgo" },
    ];
  }

  async ngOnInit() {
    // eslint-disable-next-line rxjs/no-async-subscribe
    this.route.queryParams.pipe(first()).subscribe(async (qParams) => {
      const passwordOptionsResponse = await this.passwordGenerationService.getOptions();
      this.passwordOptions = passwordOptionsResponse[0];
      this.enforcedPasswordPolicyOptions = passwordOptionsResponse[1];
      this.avoidAmbiguous = !this.passwordOptions.ambiguous;
      this.passwordOptions.type =
        this.passwordOptions.type === "passphrase" ? "passphrase" : "password";

      this.usernameOptions = await this.usernameGenerationService.getOptions();
      if (this.usernameOptions.type == null) {
        this.usernameOptions.type = "word";
      }
      if (
        this.usernameOptions.subaddressEmail == null ||
        this.usernameOptions.subaddressEmail === ""
      ) {
        this.usernameOptions.subaddressEmail = await this.stateService.getEmail();
      }
      if (this.usernameWebsite == null) {
        this.usernameOptions.subaddressType = this.usernameOptions.catchallType = "random";
      } else {
        this.usernameOptions.website = this.usernameWebsite;
        const websiteOption = { name: this.i18nService.t("websiteName"), value: "website-name" };
        this.subaddressOptions.push(websiteOption);
        this.catchallOptions.push(websiteOption);
      }

      if (this.type !== "username" && this.type !== "password") {
        if (qParams.type === "username" || qParams.type === "password") {
          this.type = qParams.type;
        } else {
          const generatorOptions = await this.stateService.getGeneratorOptions();
          this.type = generatorOptions?.type ?? "password";
        }
      }
      if (this.regenerateWithoutButtonPress()) {
        await this.regenerate();
      }
    });
  }

  async typeChanged() {
    await this.stateService.setGeneratorOptions({ type: this.type });
    if (this.regenerateWithoutButtonPress()) {
      await this.regenerate();
    }
  }

  async regenerate() {
    if (this.type === "password") {
      await this.regeneratePassword();
    } else if (this.type === "username") {
      await this.regenerateUsername();
    }
  }

  async sliderChanged() {
    this.savePasswordOptions(false);
    await this.passwordGenerationService.addHistory(this.password);
  }

  async sliderInput() {
    this.normalizePasswordOptions();
    this.password = await this.passwordGenerationService.generatePassword(this.passwordOptions);
  }

  async savePasswordOptions(regenerate = true) {
    this.normalizePasswordOptions();
    await this.passwordGenerationService.saveOptions(this.passwordOptions);

    if (regenerate && this.regenerateWithoutButtonPress()) {
      await this.regeneratePassword();
    }
  }

  async saveUsernameOptions(regenerate = true) {
    await this.usernameGenerationService.saveOptions(this.usernameOptions);
    if (this.usernameOptions.type === "forwarded") {
      this.username = "-";
    }
    if (regenerate && this.regenerateWithoutButtonPress()) {
      await this.regenerateUsername();
    }
  }

  async regeneratePassword() {
    this.password = await this.passwordGenerationService.generatePassword(this.passwordOptions);
    await this.passwordGenerationService.addHistory(this.password);
  }

  regenerateUsername() {
    return this.generateUsername();
  }

  async generateUsername() {
    try {
      this.usernameGeneratingPromise = this.usernameGenerationService.generateUsername(
        this.usernameOptions
      );
      this.username = await this.usernameGeneratingPromise;
      if (this.username === "" || this.username === null) {
        this.username = "-";
      }
    } catch (e) {
      this.logService.error(e);
    }
  }

  copy() {
    const password = this.type === "password";
    const copyOptions = this.win != null ? { window: this.win } : null;
    this.platformUtilsService.copyToClipboard(
      password ? this.password : this.username,
      copyOptions
    );
    this.platformUtilsService.showToast(
      "info",
      null,
      this.i18nService.t("valueCopied", this.i18nService.t(password ? "password" : "username"))
    );
  }

  select() {
    this.onSelected.emit(this.type === "password" ? this.password : this.username);
  }

  toggleOptions() {
    this.showOptions = !this.showOptions;
  }

  regenerateWithoutButtonPress() {
    return this.type !== "username" || this.usernameOptions.type !== "forwarded";
  }

  private normalizePasswordOptions() {
    // Application level normalize options depedent on class variables
    this.passwordOptions.ambiguous = !this.avoidAmbiguous;

    if (
      !this.passwordOptions.uppercase &&
      !this.passwordOptions.lowercase &&
      !this.passwordOptions.number &&
      !this.passwordOptions.special
    ) {
      this.passwordOptions.lowercase = true;
      if (this.win != null) {
        const lowercase = this.win.document.querySelector("#lowercase") as HTMLInputElement;
        if (lowercase) {
          lowercase.checked = true;
        }
      }
    }

    this.passwordGenerationService.normalizeOptions(
      this.passwordOptions,
      this.enforcedPasswordPolicyOptions
    );
  }
}
