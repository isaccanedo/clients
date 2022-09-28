import { CipherView } from "@bitwarden/common/models/view/cipherView";

import AutofillField from "../../models/autofillField";
import AutofillForm from "../../models/autofillForm";
import AutofillPageDetails from "../../models/autofillPageDetails";

export interface PageDetail {
  frameId: number;
  tab: chrome.tabs.Tab;
  details: AutofillPageDetails;
}

export interface AutoFillOptions {
  cipher: CipherView;
  pageDetails: PageDetail[];
  doc?: typeof window.document;
  tab: chrome.tabs.Tab;
  skipUsernameOnlyFill?: boolean;
  onlyEmptyFields?: boolean;
  onlyVisibleFields?: boolean;
  fillNewPassword?: boolean;
  skipLastUsed?: boolean;
}

export interface FormData {
  form: AutofillForm;
  password: AutofillField;
  username: AutofillField;
  passwords: AutofillField[];
}

export abstract class AutofillService {
  getFormsWithPasswordFields: (pageDetails: AutofillPageDetails) => FormData[];
  doAutoFill: (options: AutoFillOptions) => Promise<string>;
  doAutoFillOnTab: (
    pageDetails: PageDetail[],
    tab: chrome.tabs.Tab,
    fromCommand: boolean
  ) => Promise<string>;
  doAutoFillActiveTab: (pageDetails: PageDetail[], fromCommand: boolean) => Promise<string>;
}
