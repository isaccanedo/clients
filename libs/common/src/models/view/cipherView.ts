import { Jsonify } from "type-fest";

import { CipherRepromptType } from "../../enums/cipherRepromptType";
import { CipherType } from "../../enums/cipherType";
import { LinkedIdType } from "../../enums/linkedIdType";
import { LocalData } from "../data/localData";
import { Cipher } from "../domain/cipher";

import { AttachmentView } from "./attachmentView";
import { CardView } from "./cardView";
import { FieldView } from "./fieldView";
import { IdentityView } from "./identityView";
import { LoginView } from "./loginView";
import { PasswordHistoryView } from "./passwordHistoryView";
import { SecureNoteView } from "./secureNoteView";
import { View } from "./view";

export class CipherView implements View {
  id: string = null;
  organizationId: string = null;
  folderId: string = null;
  name: string = null;
  notes: string = null;
  type: CipherType = null;
  favorite = false;
  organizationUseTotp = false;
  edit = false;
  viewPassword = true;
  localData: LocalData;
  login = new LoginView();
  identity = new IdentityView();
  card = new CardView();
  secureNote = new SecureNoteView();
  attachments: AttachmentView[] = null;
  fields: FieldView[] = null;
  passwordHistory: PasswordHistoryView[] = null;
  collectionIds: string[] = null;
  revisionDate: Date = null;
  deletedDate: Date = null;
  reprompt: CipherRepromptType = CipherRepromptType.None;

  constructor(c?: Cipher) {
    if (!c) {
      return;
    }

    this.id = c.id;
    this.organizationId = c.organizationId;
    this.folderId = c.folderId;
    this.favorite = c.favorite;
    this.organizationUseTotp = c.organizationUseTotp;
    this.edit = c.edit;
    this.viewPassword = c.viewPassword;
    this.type = c.type;
    this.localData = c.localData;
    this.collectionIds = c.collectionIds;
    this.revisionDate = c.revisionDate;
    this.deletedDate = c.deletedDate;
    // Old locally stored ciphers might have reprompt == null. If so set it to None.
    this.reprompt = c.reprompt ?? CipherRepromptType.None;
  }

  private get item() {
    switch (this.type) {
      case CipherType.Login:
        return this.login;
      case CipherType.SecureNote:
        return this.secureNote;
      case CipherType.Card:
        return this.card;
      case CipherType.Identity:
        return this.identity;
      default:
        break;
    }

    return null;
  }

  get subTitle(): string {
    return this.item.subTitle;
  }

  get hasPasswordHistory(): boolean {
    return this.passwordHistory && this.passwordHistory.length > 0;
  }

  get hasAttachments(): boolean {
    return this.attachments && this.attachments.length > 0;
  }

  get hasOldAttachments(): boolean {
    if (this.hasAttachments) {
      for (let i = 0; i < this.attachments.length; i++) {
        if (this.attachments[i].key == null) {
          return true;
        }
      }
    }
    return false;
  }

  get hasFields(): boolean {
    return this.fields && this.fields.length > 0;
  }

  get passwordRevisionDisplayDate(): Date {
    if (this.type !== CipherType.Login || this.login == null) {
      return null;
    } else if (this.login.password == null || this.login.password === "") {
      return null;
    }
    return this.login.passwordRevisionDate;
  }

  get isDeleted(): boolean {
    return this.deletedDate != null;
  }

  get linkedFieldOptions() {
    return this.item.linkedFieldOptions;
  }

  linkedFieldValue(id: LinkedIdType) {
    const linkedFieldOption = this.linkedFieldOptions?.get(id);
    if (linkedFieldOption == null) {
      return null;
    }

    const item = this.item;
    return this.item[linkedFieldOption.propertyKey as keyof typeof item];
  }

  linkedFieldI18nKey(id: LinkedIdType): string {
    return this.linkedFieldOptions.get(id)?.i18nKey;
  }

  static fromJSON(obj: Partial<Jsonify<CipherView>>): CipherView {
    const view = new CipherView();
    const revisionDate = obj.revisionDate == null ? null : new Date(obj.revisionDate);
    const deletedDate = obj.deletedDate == null ? null : new Date(obj.deletedDate);
    const attachments = obj.attachments?.map((a: any) => AttachmentView.fromJSON(a));
    const fields = obj.fields?.map((f: any) => FieldView.fromJSON(f));
    const passwordHistory = obj.passwordHistory?.map((ph: any) => PasswordHistoryView.fromJSON(ph));

    Object.assign(view, obj, {
      revisionDate: revisionDate,
      deletedDate: deletedDate,
      attachments: attachments,
      fields: fields,
      passwordHistory: passwordHistory,
    });

    switch (obj.type) {
      case CipherType.Card:
        view.card = CardView.fromJSON(obj.card);
        break;
      case CipherType.Identity:
        view.identity = IdentityView.fromJSON(obj.identity);
        break;
      case CipherType.Login:
        view.login = LoginView.fromJSON(obj.login);
        break;
      case CipherType.SecureNote:
        view.secureNote = SecureNoteView.fromJSON(obj.secureNote);
        break;
      default:
        break;
    }

    return view;
  }
}
