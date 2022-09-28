import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { Response } from "@bitwarden/node/cli/models/response";
import { StringResponse } from "@bitwarden/node/cli/models/response/stringResponse";

import { CliUtils } from "../utils";

export class GenerateCommand {
  constructor(
    private passwordGenerationService: PasswordGenerationService,
    private stateService: StateService
  ) {}

  async run(cmdOptions: Record<string, any>): Promise<Response> {
    const normalizedOptions = new Options(cmdOptions);
    const options = {
      uppercase: normalizedOptions.uppercase,
      lowercase: normalizedOptions.lowercase,
      number: normalizedOptions.number,
      special: normalizedOptions.special,
      length: normalizedOptions.length,
      type: normalizedOptions.type,
      wordSeparator: normalizedOptions.separator,
      numWords: normalizedOptions.words,
      capitalize: normalizedOptions.capitalize,
      includeNumber: normalizedOptions.includeNumber,
    };

    const enforcedOptions = (await this.stateService.getIsAuthenticated())
      ? (await this.passwordGenerationService.enforcePasswordGeneratorPoliciesOnOptions(options))[0]
      : options;

    const password = await this.passwordGenerationService.generatePassword(enforcedOptions);
    const res = new StringResponse(password);
    return Response.success(res);
  }
}

class Options {
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
  length: number;
  type: "passphrase" | "password";
  separator: string;
  words: number;
  capitalize: boolean;
  includeNumber: boolean;

  constructor(passedOptions: Record<string, any>) {
    this.uppercase = CliUtils.convertBooleanOption(passedOptions?.uppercase);
    this.lowercase = CliUtils.convertBooleanOption(passedOptions?.lowercase);
    this.number = CliUtils.convertBooleanOption(passedOptions?.number);
    this.special = CliUtils.convertBooleanOption(passedOptions?.special);
    this.capitalize = CliUtils.convertBooleanOption(passedOptions?.capitalize);
    this.includeNumber = CliUtils.convertBooleanOption(passedOptions?.includeNumber);
    this.length = passedOptions?.length != null ? parseInt(passedOptions?.length, null) : 14;
    this.type = passedOptions?.passphrase ? "passphrase" : "password";
    this.separator = passedOptions?.separator == null ? "-" : passedOptions.separator + "";
    this.words = passedOptions?.words != null ? parseInt(passedOptions.words, null) : 3;

    if (!this.uppercase && !this.lowercase && !this.special && !this.number) {
      this.lowercase = true;
      this.uppercase = true;
      this.number = true;
    }
    if (this.length < 5) {
      this.length = 5;
    }
    if (this.words < 3) {
      this.words = 3;
    }
    if (this.separator === "space") {
      this.separator = " ";
    } else if (this.separator != null && this.separator.length > 1) {
      this.separator = this.separator[0];
    }
  }
}
