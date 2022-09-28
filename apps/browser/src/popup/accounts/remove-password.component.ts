import { Component } from "@angular/core";

import { RemovePasswordComponent as BaseRemovePasswordComponent } from "@bitwarden/angular/components/remove-password.component";

@Component({
  selector: "app-remove-password",
  templateUrl: "remove-password.component.html",
})
export class RemovePasswordComponent extends BaseRemovePasswordComponent {}
