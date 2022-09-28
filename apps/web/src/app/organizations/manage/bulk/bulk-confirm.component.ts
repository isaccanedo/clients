import { Component, Input, OnInit } from "@angular/core";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { OrganizationUserStatusType } from "@bitwarden/common/enums/organizationUserStatusType";
import { Utils } from "@bitwarden/common/misc/utils";
import { OrganizationUserBulkConfirmRequest } from "@bitwarden/common/models/request/organizationUserBulkConfirmRequest";
import { OrganizationUserBulkRequest } from "@bitwarden/common/models/request/organizationUserBulkRequest";

import { BulkUserDetails } from "./bulk-status.component";

@Component({
  selector: "app-bulk-confirm",
  templateUrl: "bulk-confirm.component.html",
})
export class BulkConfirmComponent implements OnInit {
  @Input() organizationId: string;
  @Input() users: BulkUserDetails[];

  excludedUsers: BulkUserDetails[];
  filteredUsers: BulkUserDetails[];
  publicKeys: Map<string, Uint8Array> = new Map();
  fingerprints: Map<string, string> = new Map();
  statuses: Map<string, string> = new Map();

  loading = true;
  done = false;
  error: string;

  constructor(
    protected cryptoService: CryptoService,
    protected apiService: ApiService,
    private i18nService: I18nService
  ) {}

  async ngOnInit() {
    this.excludedUsers = this.users.filter((u) => !this.isAccepted(u));
    this.filteredUsers = this.users.filter((u) => this.isAccepted(u));

    if (this.filteredUsers.length <= 0) {
      this.done = true;
    }

    const response = await this.getPublicKeys();

    for (const entry of response.data) {
      const publicKey = Utils.fromB64ToArray(entry.key);
      const fingerprint = await this.cryptoService.getFingerprint(entry.userId, publicKey.buffer);
      if (fingerprint != null) {
        this.publicKeys.set(entry.id, publicKey);
        this.fingerprints.set(entry.id, fingerprint.join("-"));
      }
    }

    this.loading = false;
  }

  async submit() {
    this.loading = true;
    try {
      const key = await this.getCryptoKey();
      const userIdsWithKeys: any[] = [];
      for (const user of this.filteredUsers) {
        const publicKey = this.publicKeys.get(user.id);
        if (publicKey == null) {
          continue;
        }
        const encryptedKey = await this.cryptoService.rsaEncrypt(key.key, publicKey.buffer);
        userIdsWithKeys.push({
          id: user.id,
          key: encryptedKey.encryptedString,
        });
      }
      const response = await this.postConfirmRequest(userIdsWithKeys);

      response.data.forEach((entry) => {
        const error = entry.error !== "" ? entry.error : this.i18nService.t("bulkConfirmMessage");
        this.statuses.set(entry.id, error);
      });

      this.done = true;
    } catch (e) {
      this.error = e.message;
    }
    this.loading = false;
  }

  protected isAccepted(user: BulkUserDetails) {
    return user.status === OrganizationUserStatusType.Accepted;
  }

  protected async getPublicKeys() {
    const request = new OrganizationUserBulkRequest(this.filteredUsers.map((user) => user.id));
    return await this.apiService.postOrganizationUsersPublicKey(this.organizationId, request);
  }

  protected getCryptoKey() {
    return this.cryptoService.getOrgKey(this.organizationId);
  }

  protected async postConfirmRequest(userIdsWithKeys: any[]) {
    const request = new OrganizationUserBulkConfirmRequest(userIdsWithKeys);
    return await this.apiService.postOrganizationUserBulkConfirm(this.organizationId, request);
  }
}
