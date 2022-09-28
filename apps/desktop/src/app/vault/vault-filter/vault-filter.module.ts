import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { VaultFilterService } from "@bitwarden/angular/vault/vault-filter/services/vault-filter.service";

import { CollectionFilterComponent } from "./filters/collection-filter.component";
import { FolderFilterComponent } from "./filters/folder-filter.component";
import { OrganizationFilterComponent } from "./filters/organization-filter.component";
import { StatusFilterComponent } from "./filters/status-filter.component";
import { TypeFilterComponent } from "./filters/type-filter.component";
import { VaultFilterComponent } from "./vault-filter.component";

@NgModule({
  imports: [BrowserModule, JslibModule],
  declarations: [
    VaultFilterComponent,
    CollectionFilterComponent,
    FolderFilterComponent,
    OrganizationFilterComponent,
    StatusFilterComponent,
    TypeFilterComponent,
  ],
  exports: [VaultFilterComponent],
  providers: [VaultFilterService],
})
export class VaultFilterModule {}
