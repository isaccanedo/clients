import { ApiService } from "../abstractions/api.service";
import { CryptoService } from "../abstractions/crypto.service";
import { StateService } from "../abstractions/state.service";
import { UsernameGenerationService as BaseUsernameGenerationService } from "../abstractions/usernameGeneration.service";
import { AnonAddyForwarder } from "../emailForwarders/anonAddyForwarder";
import { DuckDuckGoForwarder } from "../emailForwarders/duckDuckGoForwarder";
import { FastmailForwarder } from "../emailForwarders/fastmailForwarder";
import { FirefoxRelayForwarder } from "../emailForwarders/firefoxRelayForwarder";
import { Forwarder } from "../emailForwarders/forwarder";
import { ForwarderOptions } from "../emailForwarders/forwarderOptions";
import { SimpleLoginForwarder } from "../emailForwarders/simpleLoginForwarder";
import { EEFLongWordList } from "../misc/wordlist";

const DefaultOptions = {
  type: "word",
  wordCapitalize: true,
  wordIncludeNumber: true,
  subaddressType: "random",
  catchallType: "random",
  forwardedService: "simplelogin",
  forwardedAnonAddyDomain: "anonaddy.me",
};

export class UsernameGenerationService implements BaseUsernameGenerationService {
  constructor(
    private cryptoService: CryptoService,
    private stateService: StateService,
    private apiService: ApiService
  ) {}

  generateUsername(options: any): Promise<string> {
    if (options.type === "catchall") {
      return this.generateCatchall(options);
    } else if (options.type === "subaddress") {
      return this.generateSubaddress(options);
    } else if (options.type === "forwarded") {
      return this.generateForwarded(options);
    } else {
      return this.generateWord(options);
    }
  }

  async generateWord(options: any): Promise<string> {
    const o = Object.assign({}, DefaultOptions, options);

    if (o.wordCapitalize == null) {
      o.wordCapitalize = true;
    }
    if (o.wordIncludeNumber == null) {
      o.wordIncludeNumber = true;
    }

    const wordIndex = await this.cryptoService.randomNumber(0, EEFLongWordList.length - 1);
    let word = EEFLongWordList[wordIndex];
    if (o.wordCapitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    if (o.wordIncludeNumber) {
      const num = await this.cryptoService.randomNumber(1, 9999);
      word = word + this.zeroPad(num.toString(), 4);
    }
    return word;
  }

  async generateSubaddress(options: any): Promise<string> {
    const o = Object.assign({}, DefaultOptions, options);

    const subaddressEmail = o.subaddressEmail;
    if (subaddressEmail == null || subaddressEmail.length < 3) {
      return o.subaddressEmail;
    }
    const atIndex = subaddressEmail.indexOf("@");
    if (atIndex < 1 || atIndex >= subaddressEmail.length - 1) {
      return subaddressEmail;
    }
    if (o.subaddressType == null) {
      o.subaddressType = "random";
    }

    const emailBeginning = subaddressEmail.substr(0, atIndex);
    const emailEnding = subaddressEmail.substr(atIndex + 1, subaddressEmail.length);

    let subaddressString = "";
    if (o.subaddressType === "random") {
      subaddressString = await this.randomString(8);
    } else if (o.subaddressType === "website-name") {
      subaddressString = o.website;
    }
    return emailBeginning + "+" + subaddressString + "@" + emailEnding;
  }

  async generateCatchall(options: any): Promise<string> {
    const o = Object.assign({}, DefaultOptions, options);

    if (o.catchallDomain == null || o.catchallDomain === "") {
      return null;
    }
    if (o.catchallType == null) {
      o.catchallType = "random";
    }

    let startString = "";
    if (o.catchallType === "random") {
      startString = await this.randomString(8);
    } else if (o.catchallType === "website-name") {
      startString = o.website;
    }
    return startString + "@" + o.catchallDomain;
  }

  async generateForwarded(options: any): Promise<string> {
    const o = Object.assign({}, DefaultOptions, options);

    if (o.forwardedService == null) {
      return null;
    }

    let forwarder: Forwarder = null;
    const forwarderOptions = new ForwarderOptions();
    forwarderOptions.website = o.website;
    if (o.forwardedService === "simplelogin") {
      forwarder = new SimpleLoginForwarder();
      forwarderOptions.apiKey = o.forwardedSimpleLoginApiKey;
    } else if (o.forwardedService === "anonaddy") {
      forwarder = new AnonAddyForwarder();
      forwarderOptions.apiKey = o.forwardedAnonAddyApiToken;
      forwarderOptions.anonaddy.domain = o.forwardedAnonAddyDomain;
    } else if (o.forwardedService === "firefoxrelay") {
      forwarder = new FirefoxRelayForwarder();
      forwarderOptions.apiKey = o.forwardedFirefoxApiToken;
    } else if (o.forwardedService === "fastmail") {
      forwarder = new FastmailForwarder();
      forwarderOptions.apiKey = o.forwardedFastmailApiToken;
    } else if (o.forwardedService === "duckduckgo") {
      forwarder = new DuckDuckGoForwarder();
      forwarderOptions.apiKey = o.forwardedDuckDuckGoToken;
    }

    if (forwarder == null) {
      return null;
    }

    return forwarder.generate(this.apiService, forwarderOptions);
  }

  async getOptions(): Promise<any> {
    let options = await this.stateService.getUsernameGenerationOptions();
    if (options == null) {
      options = Object.assign({}, DefaultOptions);
    } else {
      options = Object.assign({}, DefaultOptions, options);
    }
    await this.stateService.setUsernameGenerationOptions(options);
    return options;
  }

  async saveOptions(options: any) {
    await this.stateService.setUsernameGenerationOptions(options);
  }

  private async randomString(length: number) {
    let str = "";
    const charSet = "abcdefghijklmnopqrstuvwxyz1234567890";
    for (let i = 0; i < length; i++) {
      const randomCharIndex = await this.cryptoService.randomNumber(0, charSet.length - 1);
      str += charSet.charAt(randomCharIndex);
    }
    return str;
  }

  // ref: https://stackoverflow.com/a/10073788
  private zeroPad(number: string, width: number) {
    return number.length >= width
      ? number
      : new Array(width - number.length + 1).join("0") + number;
  }
}
