import { Component, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormControl } from "@angular/forms";
import { Subscription } from "rxjs";

import { StateService } from "@bitwarden/common/abstractions/state.service";

import { SearchBarService, SearchBarState } from "./search-bar.service";

@Component({
  selector: "app-search",
  templateUrl: "search.component.html",
})
export class SearchComponent implements OnInit, OnDestroy {
  state: SearchBarState;
  searchText: UntypedFormControl = new UntypedFormControl(null);

  private activeAccountSubscription: Subscription;

  constructor(private searchBarService: SearchBarService, private stateService: StateService) {
    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.searchBarService.state$.subscribe((state) => {
      this.state = state;
    });

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.searchText.valueChanges.subscribe((value) => {
      this.searchBarService.setSearchText(value);
    });
  }

  ngOnInit() {
    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.activeAccountSubscription = this.stateService.activeAccount$.subscribe((value) => {
      this.searchBarService.setSearchText("");
      this.searchText.patchValue("");
    });
  }

  ngOnDestroy() {
    this.activeAccountSubscription.unsubscribe();
  }
}
