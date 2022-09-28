import { Component, Input } from "@angular/core";

import { ReportVariant } from "../models/report-variant";

@Component({
  selector: "app-report-card",
  templateUrl: "report-card.component.html",
})
export class ReportCardComponent {
  @Input() title: string;
  @Input() description: string;
  @Input() route: string;
  @Input() icon: string;
  @Input() variant: ReportVariant;

  protected get disabled() {
    return this.variant != ReportVariant.Enabled;
  }

  protected get requiresPremium() {
    return this.variant == ReportVariant.RequiresPremium;
  }
}
