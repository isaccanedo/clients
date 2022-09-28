import { Component } from "@angular/core";

import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";

@Component({
  selector: "app-premium-badge",
  template: `
    <button type="button" *appNotPremium bitBadge badgeType="success" (click)="premiumRequired()">
      {{ "premium" | i18n }}
    </button>
  `,
})
export class PremiumBadgeComponent {
  constructor(private messagingService: MessagingService) {}

  premiumRequired() {
    this.messagingService.send("premiumRequired");
  }
}
