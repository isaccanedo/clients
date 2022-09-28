import { DatePipe } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { ControlContainer, NgForm } from "@angular/forms";

import { EffluxDatesComponent as BaseEffluxDatesComponent } from "@bitwarden/angular/components/send/efflux-dates.component";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";

@Component({
  selector: "app-send-efflux-dates",
  templateUrl: "efflux-dates.component.html",
  viewProviders: [{ provide: ControlContainer, useExisting: NgForm }],
})
export class EffluxDatesComponent extends BaseEffluxDatesComponent {
  @Input() readonly inPopout: boolean;
  @Output() popOutWindow = new EventEmitter();

  constructor(
    protected i18nService: I18nService,
    protected platformUtilsService: PlatformUtilsService,
    protected datePipe: DatePipe
  ) {
    super(i18nService, platformUtilsService, datePipe);
  }
}
