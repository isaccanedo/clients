import { FocusKeyManager } from "@angular/cdk/a11y";
import { coerceNumberProperty } from "@angular/cdk/coercion";
import {
  AfterContentChecked,
  AfterContentInit,
  AfterViewInit,
  Component,
  ContentChildren,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  QueryList,
  ViewChildren,
} from "@angular/core";
import { Subject, takeUntil } from "rxjs";

import { TabListItemDirective } from "../shared/tab-list-item.directive";

import { TabComponent } from "./tab.component";

/** Used to generate unique ID's for each tab component */
let nextId = 0;

@Component({
  selector: "bit-tab-group",
  templateUrl: "./tab-group.component.html",
})
export class TabGroupComponent
  implements AfterContentChecked, AfterContentInit, AfterViewInit, OnDestroy
{
  private readonly _groupId: number;
  private readonly destroy$ = new Subject<void>();
  private _indexToSelect: number | null = 0;

  /**
   * Aria label for the tab list menu
   */
  @Input() label = "";

  /**
   * Keep the content of off-screen tabs in the DOM.
   * Useful for keeping <audio> or <video> elements from re-initializing
   * after navigating between tabs.
   */
  @Input() preserveContent = false;

  @ContentChildren(TabComponent) tabs: QueryList<TabComponent>;
  @ViewChildren(TabListItemDirective) tabLabels: QueryList<TabListItemDirective>;

  /** The index of the active tab. */
  @Input()
  get selectedIndex(): number | null {
    return this._selectedIndex;
  }
  set selectedIndex(value: number) {
    this._indexToSelect = coerceNumberProperty(value, null);
  }
  private _selectedIndex: number | null = null;

  /** Output to enable support for two-way binding on `[(selectedIndex)]` */
  @Output() readonly selectedIndexChange: EventEmitter<number> = new EventEmitter<number>();

  /** Event emitted when the tab selection has changed. */
  @Output() readonly selectedTabChange: EventEmitter<BitTabChangeEvent> =
    new EventEmitter<BitTabChangeEvent>();

  /**
   * Focus key manager for keeping tab controls accessible.
   * https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tablist_role#keyboard_interactions
   */
  keyManager: FocusKeyManager<TabListItemDirective>;

  constructor() {
    this._groupId = nextId++;
  }

  protected getTabContentId(id: number): string {
    return `bit-tab-content-${this._groupId}-${id}`;
  }

  protected getTabLabelId(id: number): string {
    return `bit-tab-label-${this._groupId}-${id}`;
  }

  selectTab(index: number) {
    this.selectedIndex = index;
  }

  /**
   * After content is checked, the tab group knows what tabs are defined and which index
   * should be currently selected.
   */
  ngAfterContentChecked(): void {
    const indexToSelect = (this._indexToSelect = this._clampTabIndex(this._indexToSelect));

    if (this._selectedIndex != indexToSelect) {
      const isFirstRun = this._selectedIndex == null;

      if (!isFirstRun) {
        this.selectedTabChange.emit({
          index: indexToSelect,
          tab: this.tabs.toArray()[indexToSelect],
        });
      }

      // These values need to be updated after change detection as
      // the checked content may have references to them.
      Promise.resolve().then(() => {
        this.tabs.forEach((tab, index) => (tab.isActive = index === indexToSelect));

        if (!isFirstRun) {
          this.selectedIndexChange.emit(indexToSelect);
        }
      });

      // Manually update the _selectedIndex and keyManager active item
      this._selectedIndex = indexToSelect;
      if (this.keyManager) {
        this.keyManager.setActiveItem(indexToSelect);
      }
    }
  }

  ngAfterViewInit(): void {
    this.keyManager = new FocusKeyManager(this.tabLabels)
      .withHorizontalOrientation("ltr")
      .withWrap()
      .withHomeAndEnd();
  }

  ngAfterContentInit() {
    // Subscribe to any changes in the number of tabs, in order to be able
    // to re-render content when new tabs are added or removed.
    this.tabs.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      const indexToSelect = this._clampTabIndex(this._indexToSelect);

      // If the selected tab didn't explicitly change, keep the previously
      // selected tab selected/active
      if (indexToSelect === this._selectedIndex) {
        const tabs = this.tabs.toArray();
        let selectedTab: TabComponent | undefined;

        for (let i = 0; i < tabs.length; i++) {
          if (tabs[i].isActive) {
            // Set both _indexToSelect and _selectedIndex to avoid firing a change
            // event which could cause an infinite loop if adding a tab within the
            // selectedIndexChange event
            this._indexToSelect = this._selectedIndex = i;
            selectedTab = tabs[i];
            break;
          }
        }

        // No active tab found and a tab does exist means the active tab
        // was removed, so a new active tab must be set manually
        if (!selectedTab && tabs[indexToSelect]) {
          tabs[indexToSelect].isActive = true;
          this.selectedTabChange.emit({
            index: indexToSelect,
            tab: tabs[indexToSelect],
          });
        }
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private _clampTabIndex(index: number): number {
    return Math.min(this.tabs.length - 1, Math.max(index || 0, 0));
  }
}

export class BitTabChangeEvent {
  /**
   * The currently selected tab index
   */
  index: number;
  /**
   * The currently selected tab
   */
  tab: TabComponent;
}
