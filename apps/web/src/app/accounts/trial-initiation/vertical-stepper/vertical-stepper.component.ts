import { CdkStepper } from "@angular/cdk/stepper";
import { Component, Input } from "@angular/core";

@Component({
  selector: "app-vertical-stepper",
  templateUrl: "vertical-stepper.component.html",
  providers: [{ provide: CdkStepper, useExisting: VerticalStepperComponent }],
})
export class VerticalStepperComponent extends CdkStepper {
  @Input()
  activeClass = "active";

  isNextButtonHidden() {
    return !(this.steps.length === this.selectedIndex + 1);
  }

  isStepDisabled(index: number) {
    if (this.selectedIndex !== index) {
      return this.selectedIndex === index - 1
        ? !this.steps.find((_, i) => i == index - 1)?.completed
        : true;
    }
    return false;
  }

  selectStepByIndex(index: number): void {
    this.selectedIndex = index;
  }
}
