import { HostBinding, Directive } from "@angular/core";

@Directive({
  selector: "th[bitCell], td[bitCell]",
})
export class CellDirective {
  @HostBinding("class") get classList() {
    return ["tw-p-3"];
  }
}
