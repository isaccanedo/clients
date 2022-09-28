import { NgModule } from "@angular/core";

import { SharedModule } from "../../shared";

import { OrganizationNameBadgeComponent } from "./organization-name-badge.component";

@NgModule({
  imports: [SharedModule],
  declarations: [OrganizationNameBadgeComponent],
  exports: [OrganizationNameBadgeComponent],
})
export class OrganizationBadgeModule {}
