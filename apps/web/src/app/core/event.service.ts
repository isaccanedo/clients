import { Injectable } from "@angular/core";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { DeviceType } from "@bitwarden/common/enums/deviceType";
import { EventType } from "@bitwarden/common/enums/eventType";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { EventResponse } from "@bitwarden/common/models/response/eventResponse";

@Injectable()
export class EventService {
  constructor(private i18nService: I18nService, private policyService: PolicyService) {}

  getDefaultDateFilters() {
    const d = new Date();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
    d.setDate(d.getDate() - 30);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0);
    return [this.toDateTimeLocalString(start), this.toDateTimeLocalString(end)];
  }

  formatDateFilters(filterStart: string, filterEnd: string) {
    const start: Date = new Date(filterStart);
    const end: Date = new Date(filterEnd + ":59.999");
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      throw new Error("Invalid date range.");
    }
    return [start.toISOString(), end.toISOString()];
  }

  async getEventInfo(ev: EventResponse, options = new EventOptions()): Promise<EventInfo> {
    const appInfo = this.getAppInfo(ev.deviceType);
    const { message, humanReadableMessage } = await this.getEventMessage(ev, options);
    return {
      message: message,
      humanReadableMessage: humanReadableMessage,
      appIcon: appInfo[0],
      appName: appInfo[1],
    };
  }

  private async getEventMessage(ev: EventResponse, options: EventOptions) {
    let msg = "";
    let humanReadableMsg = "";
    switch (ev.type) {
      // User
      case EventType.User_LoggedIn:
        msg = humanReadableMsg = this.i18nService.t("loggedIn");
        break;
      case EventType.User_ChangedPassword:
        msg = humanReadableMsg = this.i18nService.t("changedPassword");
        break;
      case EventType.User_Updated2fa:
        msg = humanReadableMsg = this.i18nService.t("enabledUpdated2fa");
        break;
      case EventType.User_Disabled2fa:
        msg = humanReadableMsg = this.i18nService.t("disabled2fa");
        break;
      case EventType.User_Recovered2fa:
        msg = humanReadableMsg = this.i18nService.t("recovered2fa");
        break;
      case EventType.User_FailedLogIn:
        msg = humanReadableMsg = this.i18nService.t("failedLogin");
        break;
      case EventType.User_FailedLogIn2fa:
        msg = humanReadableMsg = this.i18nService.t("failedLogin2fa");
        break;
      case EventType.User_ClientExportedVault:
        msg = humanReadableMsg = this.i18nService.t("exportedVault");
        break;
      case EventType.User_UpdatedTempPassword:
        msg = humanReadableMsg = this.i18nService.t("updatedMasterPassword");
        break;
      case EventType.User_MigratedKeyToKeyConnector:
        msg = humanReadableMsg = this.i18nService.t("migratedKeyConnector");
        break;
      // Cipher
      case EventType.Cipher_Created:
        msg = this.i18nService.t("createdItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("createdItemId", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_Updated:
        msg = this.i18nService.t("editedItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("editedItemId", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_Deleted:
        msg = this.i18nService.t("permanentlyDeletedItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "permanentlyDeletedItemId",
          this.getShortId(ev.cipherId)
        );
        break;
      case EventType.Cipher_SoftDeleted:
        msg = this.i18nService.t("deletedItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("deletedItemId", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_Restored:
        msg = this.i18nService.t("restoredItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("restoredItemId", this.formatCipherId(ev, options));
        break;
      case EventType.Cipher_AttachmentCreated:
        msg = this.i18nService.t("createdAttachmentForItem", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "createdAttachmentForItem",
          this.getShortId(ev.cipherId)
        );
        break;
      case EventType.Cipher_AttachmentDeleted:
        msg = this.i18nService.t("deletedAttachmentForItem", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "deletedAttachmentForItem",
          this.getShortId(ev.cipherId)
        );
        break;
      case EventType.Cipher_Shared:
        msg = this.i18nService.t("movedItemIdToOrg", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("movedItemIdToOrg", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_ClientViewed:
        msg = this.i18nService.t("viewedItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("viewedItemId", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_ClientToggledPasswordVisible:
        msg = this.i18nService.t("viewedPasswordItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("viewedPasswordItemId", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_ClientToggledHiddenFieldVisible:
        msg = this.i18nService.t("viewedHiddenFieldItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "viewedHiddenFieldItemId",
          this.getShortId(ev.cipherId)
        );
        break;
      case EventType.Cipher_ClientToggledCardCodeVisible:
        msg = this.i18nService.t("viewedSecurityCodeItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "viewedSecurityCodeItemId",
          this.getShortId(ev.cipherId)
        );
        break;
      case EventType.Cipher_ClientCopiedHiddenField:
        msg = this.i18nService.t("copiedHiddenFieldItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "copiedHiddenFieldItemId",
          this.getShortId(ev.cipherId)
        );
        break;
      case EventType.Cipher_ClientCopiedPassword:
        msg = this.i18nService.t("copiedPasswordItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("copiedPasswordItemId", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_ClientCopiedCardCode:
        msg = this.i18nService.t("copiedSecurityCodeItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "copiedSecurityCodeItemId",
          this.getShortId(ev.cipherId)
        );
        break;
      case EventType.Cipher_ClientAutofilled:
        msg = this.i18nService.t("autofilledItemId", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t("autofilledItemId", this.getShortId(ev.cipherId));
        break;
      case EventType.Cipher_UpdatedCollections:
        msg = this.i18nService.t("editedCollectionsForItem", this.formatCipherId(ev, options));
        humanReadableMsg = this.i18nService.t(
          "editedCollectionsForItem",
          this.getShortId(ev.cipherId)
        );
        break;
      // Collection
      case EventType.Collection_Created:
        msg = this.i18nService.t("createdCollectionId", this.formatCollectionId(ev));
        humanReadableMsg = this.i18nService.t(
          "createdCollectionId",
          this.getShortId(ev.collectionId)
        );
        break;
      case EventType.Collection_Updated:
        msg = this.i18nService.t("editedCollectionId", this.formatCollectionId(ev));
        humanReadableMsg = this.i18nService.t(
          "editedCollectionId",
          this.getShortId(ev.collectionId)
        );
        break;
      case EventType.Collection_Deleted:
        msg = this.i18nService.t("deletedCollectionId", this.formatCollectionId(ev));
        humanReadableMsg = this.i18nService.t(
          "deletedCollectionId",
          this.getShortId(ev.collectionId)
        );
        break;
      // Group
      case EventType.Group_Created:
        msg = this.i18nService.t("createdGroupId", this.formatGroupId(ev));
        humanReadableMsg = this.i18nService.t("createdGroupId", this.getShortId(ev.groupId));
        break;
      case EventType.Group_Updated:
        msg = this.i18nService.t("editedGroupId", this.formatGroupId(ev));
        humanReadableMsg = this.i18nService.t("editedGroupId", this.getShortId(ev.groupId));
        break;
      case EventType.Group_Deleted:
        msg = this.i18nService.t("deletedGroupId", this.formatGroupId(ev));
        humanReadableMsg = this.i18nService.t("deletedGroupId", this.getShortId(ev.groupId));
        break;
      // Org user
      case EventType.OrganizationUser_Invited:
        msg = this.i18nService.t("invitedUserId", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "invitedUserId",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_Confirmed:
        msg = this.i18nService.t("confirmedUserId", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "confirmedUserId",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_Updated:
        msg = this.i18nService.t("editedUserId", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "editedUserId",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_Removed:
        msg = this.i18nService.t("removedUserId", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "removedUserId",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_UpdatedGroups:
        msg = this.i18nService.t("editedGroupsForUser", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "editedGroupsForUser",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_UnlinkedSso:
        msg = this.i18nService.t("unlinkedSsoUser", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "unlinkedSsoUser",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_ResetPassword_Enroll:
        msg = this.i18nService.t("eventEnrollPasswordReset", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "eventEnrollPasswordReset",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_ResetPassword_Withdraw:
        msg = this.i18nService.t("eventWithdrawPasswordReset", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "eventWithdrawPasswordReset",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_AdminResetPassword:
        msg = this.i18nService.t("eventAdminPasswordReset", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "eventAdminPasswordReset",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_ResetSsoLink:
        msg = this.i18nService.t("eventResetSsoLink", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "eventResetSsoLink",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_FirstSsoLogin:
        msg = this.i18nService.t("firstSsoLogin", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "firstSsoLogin",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_Revoked:
        msg = this.i18nService.t("revokedUserId", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "revokedUserId",
          this.getShortId(ev.organizationUserId)
        );
        break;
      case EventType.OrganizationUser_Restored:
        msg = this.i18nService.t("restoredUserId", this.formatOrgUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "restoredUserId",
          this.getShortId(ev.organizationUserId)
        );
        break;
      // Org
      case EventType.Organization_Updated:
        msg = humanReadableMsg = this.i18nService.t("editedOrgSettings");
        break;
      case EventType.Organization_PurgedVault:
        msg = humanReadableMsg = this.i18nService.t("purgedOrganizationVault");
        break;
      case EventType.Organization_ClientExportedVault:
        msg = humanReadableMsg = this.i18nService.t("exportedOrganizationVault");
        break;
      case EventType.Organization_VaultAccessed:
        msg = humanReadableMsg = this.i18nService.t("vaultAccessedByProvider");
        break;
      case EventType.Organization_EnabledSso:
        msg = humanReadableMsg = this.i18nService.t("enabledSso");
        break;
      case EventType.Organization_DisabledSso:
        msg = humanReadableMsg = this.i18nService.t("disabledSso");
        break;
      case EventType.Organization_EnabledKeyConnector:
        msg = humanReadableMsg = this.i18nService.t("enabledKeyConnector");
        break;
      case EventType.Organization_DisabledKeyConnector:
        msg = humanReadableMsg = this.i18nService.t("disabledKeyConnector");
        break;
      case EventType.Organization_SponsorshipsSynced:
        msg = humanReadableMsg = this.i18nService.t("sponsorshipsSynced");
        break;
      // Policies
      case EventType.Policy_Updated: {
        msg = this.i18nService.t("modifiedPolicyId", this.formatPolicyId(ev));

        const policies = await this.policyService.getAll();
        const policy = policies.filter((p) => p.id === ev.policyId)[0];
        let p1 = this.getShortId(ev.policyId);
        if (policy != null) {
          p1 = PolicyType[policy.type];
        }

        humanReadableMsg = this.i18nService.t("modifiedPolicyId", p1);
        break;
      }
      // Provider users:
      case EventType.ProviderUser_Invited:
        msg = this.i18nService.t("invitedUserId", this.formatProviderUserId(ev));
        humanReadableMsg = this.i18nService.t("invitedUserId", this.getShortId(ev.providerUserId));
        break;
      case EventType.ProviderUser_Confirmed:
        msg = this.i18nService.t("confirmedUserId", this.formatProviderUserId(ev));
        humanReadableMsg = this.i18nService.t(
          "confirmedUserId",
          this.getShortId(ev.providerUserId)
        );
        break;
      case EventType.ProviderUser_Updated:
        msg = this.i18nService.t("editedUserId", this.formatProviderUserId(ev));
        humanReadableMsg = this.i18nService.t("editedUserId", this.getShortId(ev.providerUserId));
        break;
      case EventType.ProviderUser_Removed:
        msg = this.i18nService.t("removedUserId", this.formatProviderUserId(ev));
        humanReadableMsg = this.i18nService.t("removedUserId", this.getShortId(ev.providerUserId));
        break;
      case EventType.ProviderOrganization_Created:
        msg = this.i18nService.t("createdOrganizationId", this.formatProviderOrganizationId(ev));
        humanReadableMsg = this.i18nService.t(
          "createdOrganizationId",
          this.getShortId(ev.providerOrganizationId)
        );
        break;
      case EventType.ProviderOrganization_Added:
        msg = this.i18nService.t("addedOrganizationId", this.formatProviderOrganizationId(ev));
        humanReadableMsg = this.i18nService.t(
          "addedOrganizationId",
          this.getShortId(ev.providerOrganizationId)
        );
        break;
      case EventType.ProviderOrganization_Removed:
        msg = this.i18nService.t("removedOrganizationId", this.formatProviderOrganizationId(ev));
        humanReadableMsg = this.i18nService.t(
          "removedOrganizationId",
          this.getShortId(ev.providerOrganizationId)
        );
        break;
      case EventType.ProviderOrganization_VaultAccessed:
        msg = this.i18nService.t("accessedClientVault", this.formatProviderOrganizationId(ev));
        humanReadableMsg = this.i18nService.t(
          "accessedClientVault",
          this.getShortId(ev.providerOrganizationId)
        );
        break;
      default:
        break;
    }
    return {
      message: msg === "" ? null : msg,
      humanReadableMessage: humanReadableMsg === "" ? null : humanReadableMsg,
    };
  }

  private getAppInfo(deviceType: DeviceType): [string, string] {
    switch (deviceType) {
      case DeviceType.Android:
        return ["bwi-android", this.i18nService.t("mobile") + " - Android"];
      case DeviceType.iOS:
        return ["bwi-apple", this.i18nService.t("mobile") + " - iOS"];
      case DeviceType.UWP:
        return ["bwi-windows", this.i18nService.t("mobile") + " - Windows"];
      case DeviceType.ChromeExtension:
        return ["bwi-chrome", this.i18nService.t("extension") + " - Chrome"];
      case DeviceType.FirefoxExtension:
        return ["bwi-firefox", this.i18nService.t("extension") + " - Firefox"];
      case DeviceType.OperaExtension:
        return ["bwi-opera", this.i18nService.t("extension") + " - Opera"];
      case DeviceType.EdgeExtension:
        return ["bwi-edge", this.i18nService.t("extension") + " - Edge"];
      case DeviceType.VivaldiExtension:
        return ["bwi-puzzle", this.i18nService.t("extension") + " - Vivaldi"];
      case DeviceType.SafariExtension:
        return ["bwi-safari", this.i18nService.t("extension") + " - Safari"];
      case DeviceType.WindowsDesktop:
        return ["bwi-windows", this.i18nService.t("desktop") + " - Windows"];
      case DeviceType.MacOsDesktop:
        return ["bwi-apple", this.i18nService.t("desktop") + " - macOS"];
      case DeviceType.LinuxDesktop:
        return ["bwi-linux", this.i18nService.t("desktop") + " - Linux"];
      case DeviceType.ChromeBrowser:
        return ["bwi-globe", this.i18nService.t("webVault") + " - Chrome"];
      case DeviceType.FirefoxBrowser:
        return ["bwi-globe", this.i18nService.t("webVault") + " - Firefox"];
      case DeviceType.OperaBrowser:
        return ["bwi-globe", this.i18nService.t("webVault") + " - Opera"];
      case DeviceType.SafariBrowser:
        return ["bwi-globe", this.i18nService.t("webVault") + " - Safari"];
      case DeviceType.VivaldiBrowser:
        return ["bwi-globe", this.i18nService.t("webVault") + " - Vivaldi"];
      case DeviceType.EdgeBrowser:
        return ["bwi-globe", this.i18nService.t("webVault") + " - Edge"];
      case DeviceType.IEBrowser:
        return ["bwi-globe", this.i18nService.t("webVault") + " - IE"];
      case DeviceType.UnknownBrowser:
        return [
          "bwi-globe",
          this.i18nService.t("webVault") + " - " + this.i18nService.t("unknown"),
        ];
      default:
        return ["bwi-globe", this.i18nService.t("unknown")];
    }
  }

  private formatCipherId(ev: EventResponse, options: EventOptions) {
    const shortId = this.getShortId(ev.cipherId);
    if (ev.organizationId == null || !options.cipherInfo) {
      return "<code>" + shortId + "</code>";
    }
    const a = this.makeAnchor(shortId);
    a.setAttribute(
      "href",
      "#/organizations/" +
        ev.organizationId +
        "/vault?search=" +
        shortId +
        "&viewEvents=" +
        ev.cipherId
    );
    return a.outerHTML;
  }

  private formatGroupId(ev: EventResponse) {
    const shortId = this.getShortId(ev.groupId);
    const a = this.makeAnchor(shortId);
    a.setAttribute(
      "href",
      "#/organizations/" + ev.organizationId + "/manage/groups?search=" + shortId
    );
    return a.outerHTML;
  }

  private formatCollectionId(ev: EventResponse) {
    const shortId = this.getShortId(ev.collectionId);
    const a = this.makeAnchor(shortId);
    a.setAttribute(
      "href",
      "#/organizations/" + ev.organizationId + "/manage/collections?search=" + shortId
    );
    return a.outerHTML;
  }

  private formatOrgUserId(ev: EventResponse) {
    const shortId = this.getShortId(ev.organizationUserId);
    const a = this.makeAnchor(shortId);
    a.setAttribute(
      "href",
      "#/organizations/" +
        ev.organizationId +
        "/manage/people?search=" +
        shortId +
        "&viewEvents=" +
        ev.organizationUserId
    );
    return a.outerHTML;
  }

  private formatProviderUserId(ev: EventResponse) {
    const shortId = this.getShortId(ev.providerUserId);
    const a = this.makeAnchor(shortId);
    a.setAttribute(
      "href",
      "#/providers/" +
        ev.providerId +
        "/manage/people?search=" +
        shortId +
        "&viewEvents=" +
        ev.providerUserId
    );
    return a.outerHTML;
  }

  private formatProviderOrganizationId(ev: EventResponse) {
    const shortId = this.getShortId(ev.providerOrganizationId);
    const a = this.makeAnchor(shortId);
    a.setAttribute("href", "#/providers/" + ev.providerId + "/clients?search=" + shortId);
    return a.outerHTML;
  }

  private formatPolicyId(ev: EventResponse) {
    const shortId = this.getShortId(ev.policyId);
    const a = this.makeAnchor(shortId);
    a.setAttribute(
      "href",
      "#/organizations/" + ev.organizationId + "/manage/policies?policyId=" + ev.policyId
    );
    return a.outerHTML;
  }

  private makeAnchor(shortId: string) {
    const a = document.createElement("a");
    a.title = this.i18nService.t("view");
    a.innerHTML = "<code>" + shortId + "</code>";
    return a;
  }

  private getShortId(id: string) {
    return id?.substring(0, 8);
  }

  private toDateTimeLocalString(date: Date) {
    return (
      date.getFullYear() +
      "-" +
      this.pad(date.getMonth() + 1) +
      "-" +
      this.pad(date.getDate()) +
      "T" +
      this.pad(date.getHours()) +
      ":" +
      this.pad(date.getMinutes())
    );
  }

  private pad(num: number) {
    const norm = Math.floor(Math.abs(num));
    return (norm < 10 ? "0" : "") + norm;
  }
}

export class EventInfo {
  message: string;
  humanReadableMessage: string;
  appIcon: string;
  appName: string;
}

export class EventOptions {
  cipherInfo = true;
}
