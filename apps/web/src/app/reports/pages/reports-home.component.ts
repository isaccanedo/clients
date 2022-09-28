import { Component, OnInit } from "@angular/core";

import { StateService } from "@bitwarden/common/abstractions/state.service";

import { ReportEntry } from "../models/report-entry";
import { ReportVariant } from "../models/report-variant";
import { reports, ReportType } from "../reports";

@Component({
  selector: "app-reports-home",
  templateUrl: "reports-home.component.html",
})
export class ReportsHomeComponent implements OnInit {
  reports: ReportEntry[];

  constructor(private stateService: StateService) {}

  async ngOnInit(): Promise<void> {
    const userHasPremium = await this.stateService.getCanAccessPremium();

    const reportRequiresPremium = userHasPremium
      ? ReportVariant.Enabled
      : ReportVariant.RequiresPremium;

    this.reports = [
      {
        ...reports[ReportType.ExposedPasswords],
        variant: reportRequiresPremium,
      },
      {
        ...reports[ReportType.ReusedPasswords],
        variant: reportRequiresPremium,
      },
      {
        ...reports[ReportType.WeakPasswords],
        variant: reportRequiresPremium,
      },
      {
        ...reports[ReportType.UnsecuredWebsites],
        variant: reportRequiresPremium,
      },
      {
        ...reports[ReportType.Inactive2fa],
        variant: reportRequiresPremium,
      },
      {
        ...reports[ReportType.DataBreach],
        variant: ReportVariant.Enabled,
      },
    ];
  }
}
