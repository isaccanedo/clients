import { FocusableOption } from "@angular/cdk/a11y";
import { AfterViewInit, Component, HostListener, Input, OnDestroy, ViewChild } from "@angular/core";
import { RouterLinkActive } from "@angular/router";
import { Subject, takeUntil } from "rxjs";

import { TabListItemDirective } from "../shared/tab-list-item.directive";

import { TabNavBarComponent } from "./tab-nav-bar.component";

@Component({
  selector: "bit-tab-link",
  templateUrl: "tab-link.component.html",
})
export class TabLinkComponent implements FocusableOption, AfterViewInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild(TabListItemDirective) tabItem: TabListItemDirective;
  @ViewChild("rla") routerLinkActive: RouterLinkActive;

  @Input() route: string;
  @Input() disabled = false;

  @HostListener("keydown", ["$event"]) onKeyDown(event: KeyboardEvent) {
    if (event.code === "Space") {
      this.tabItem.click();
    }
  }

  get active() {
    return this.routerLinkActive?.isActive ?? false;
  }

  constructor(private _tabNavBar: TabNavBarComponent) {}

  focus(): void {
    this.tabItem.focus();
  }

  ngAfterViewInit() {
    // The active state of tab links are tracked via the routerLinkActive directive
    // We need to watch for changes to tell the parent nav group when the tab is active
    this.routerLinkActive.isActiveChange
      .pipe(takeUntil(this.destroy$))
      .subscribe((_) => this._tabNavBar.updateActiveLink());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
