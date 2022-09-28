import { Component } from "@angular/core";

/**
 * Component used for styling the tab header/background for both content and navigation tabs
 */
@Component({
  selector: "bit-tab-header",
  host: {
    class:
      "tw-h-16 tw-pl-4 tw-bg-background-alt tw-flex tw-items-end tw-border-0 tw-border-b tw-border-solid tw-border-secondary-300",
  },
  template: `<ng-content></ng-content>`,
})
export class TabHeaderComponent {}
