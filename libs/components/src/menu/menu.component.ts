import { FocusKeyManager } from "@angular/cdk/a11y";
import {
  Component,
  Output,
  TemplateRef,
  ViewChild,
  EventEmitter,
  ContentChildren,
  QueryList,
  AfterContentInit,
} from "@angular/core";

import { MenuItemDirective } from "./menu-item.directive";

@Component({
  selector: "bit-menu",
  templateUrl: "./menu.component.html",
  exportAs: "menuComponent",
})
export class MenuComponent implements AfterContentInit {
  @ViewChild(TemplateRef) templateRef: TemplateRef<any>;
  @Output() closed = new EventEmitter<void>();
  @ContentChildren(MenuItemDirective, { descendants: true })
  menuItems: QueryList<MenuItemDirective>;
  keyManager: FocusKeyManager<MenuItemDirective>;

  ngAfterContentInit() {
    this.keyManager = new FocusKeyManager(this.menuItems).withWrap();
  }
}
