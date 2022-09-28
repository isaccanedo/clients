import { Component, NgZone, OnDestroy, OnInit } from "@angular/core";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { BroadcasterService } from "@bitwarden/common/abstractions/broadcaster.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { TokenService } from "@bitwarden/common/abstractions/token.service";

import { StateService } from "../core";

const BroadcasterSubscriptionId = "SettingsComponent";

@Component({
  selector: "app-settings",
  templateUrl: "settings.component.html",
})
export class SettingsComponent implements OnInit, OnDestroy {
  premium: boolean;
  selfHosted: boolean;
  hasFamilySponsorshipAvailable: boolean;
  hideSubscription: boolean;

  constructor(
    private tokenService: TokenService,
    private broadcasterService: BroadcasterService,
    private ngZone: NgZone,
    private platformUtilsService: PlatformUtilsService,
    private organizationService: OrganizationService,
    private stateService: StateService,
    private apiService: ApiService
  ) {}

  async ngOnInit() {
    this.broadcasterService.subscribe(BroadcasterSubscriptionId, async (message: any) => {
      this.ngZone.run(async () => {
        switch (message.command) {
          case "purchasedPremium":
            await this.load();
            break;
          default:
        }
      });
    });

    this.selfHosted = await this.platformUtilsService.isSelfHost();
    await this.load();
  }

  ngOnDestroy() {
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
  }

  async load() {
    this.premium = await this.stateService.getHasPremiumPersonally();
    this.hasFamilySponsorshipAvailable = await this.organizationService.canManageSponsorships();
    const hasPremiumFromOrg = await this.stateService.getHasPremiumFromOrganization();
    let billing = null;
    if (!this.selfHosted) {
      billing = await this.apiService.getUserBillingHistory();
    }
    this.hideSubscription =
      !this.premium && hasPremiumFromOrg && (this.selfHosted || billing?.hasNoHistory);
  }
}
