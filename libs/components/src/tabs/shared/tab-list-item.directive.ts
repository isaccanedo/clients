import { FocusableOption } from "@angular/cdk/a11y";
import { Directive, ElementRef, HostBinding, Input } from "@angular/core";

/**
 * Directive used for styling tab header items for both nav links (anchor tags)
 * and content tabs (button tags)
 */
@Directive({ selector: "[bitTabListItem]" })
export class TabListItemDirective implements FocusableOption {
  @Input() active: boolean;
  @Input() disabled: boolean;

  @HostBinding("attr.disabled")
  get disabledAttr() {
    return this.disabled || null; // native disabled attr must be null when false
  }

  constructor(private elementRef: ElementRef) {}

  focus() {
    this.elementRef.nativeElement.focus();
  }

  click() {
    this.elementRef.nativeElement.click();
  }

  @HostBinding("class")
  get classList(): string[] {
    return this.baseClassList
      .concat(this.active ? this.activeClassList : [])
      .concat(this.disabled ? this.disabledClassList : []);
  }

  get baseClassList(): string[] {
    return [
      "tw-block",
      "tw-relative",
      "tw-py-2",
      "tw-px-4",
      "tw-font-semibold",
      "tw-transition",
      "tw-rounded-t",
      "tw-border-0",
      "tw-border-x",
      "tw-border-t-4",
      "tw-border-transparent",
      "tw-border-solid",
      "tw-bg-transparent",
      "tw-text-main",
      "hover:tw-underline",
      "hover:tw-text-main",
      "focus-visible:tw-z-10",
      "focus-visible:tw-outline-none",
      "focus-visible:tw-ring-2",
      "focus-visible:tw-ring-primary-700",
    ];
  }

  get disabledClassList(): string[] {
    return [
      "!tw-bg-secondary-100",
      "!tw-text-muted",
      "hover:!tw-text-muted",
      "!tw-no-underline",
      "tw-cursor-not-allowed",
    ];
  }

  get activeClassList(): string[] {
    return [
      "tw--mb-px",
      "tw-border-x-secondary-300",
      "tw-border-t-primary-500",
      "tw-border-b",
      "tw-border-b-background",
      "tw-bg-background",
      "!tw-text-primary-500",
      "hover:tw-border-t-primary-700",
      "hover:!tw-text-primary-700",
      "focus-visible:tw-border-t-primary-700",
      "focus-visible:!tw-text-primary-700",
    ];
  }
}
