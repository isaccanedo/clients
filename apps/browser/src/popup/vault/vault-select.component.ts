import { animate, state, style, transition, trigger } from "@angular/animations";
import { ConnectedPosition, Overlay, OverlayRef } from "@angular/cdk/overlay";
import { TemplatePortal } from "@angular/cdk/portal";
import {
  Component,
  ElementRef,
  EventEmitter,
  OnInit,
  Output,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  HostListener,
  OnDestroy,
} from "@angular/core";
import { BehaviorSubject, concatMap, map, merge, Observable, Subject, takeUntil } from "rxjs";

import { VaultFilter } from "@bitwarden/angular/vault/vault-filter/models/vault-filter.model";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { Organization } from "@bitwarden/common/models/domain/organization";

import { VaultFilterService } from "../../services/vaultFilter.service";

@Component({
  selector: "app-vault-select",
  templateUrl: "vault-select.component.html",
  animations: [
    trigger("transformPanel", [
      state(
        "void",
        style({
          opacity: 0,
        })
      ),
      transition(
        "void => open",
        animate(
          "100ms linear",
          style({
            opacity: 1,
          })
        )
      ),
      transition("* => void", animate("100ms linear", style({ opacity: 0 }))),
    ]),
  ],
})
export class VaultSelectComponent implements OnInit, OnDestroy {
  @Output() onVaultSelectionChanged = new EventEmitter();

  @ViewChild("toggleVaults", { read: ElementRef })
  buttonRef: ElementRef<HTMLButtonElement>;
  @ViewChild("vaultSelectorTemplate", { read: TemplateRef }) templateRef: TemplateRef<HTMLElement>;

  private _selectedVault = new BehaviorSubject<string>(null);

  isOpen = false;
  loaded = false;
  organizations$: Observable<Organization[]>;
  selectedVault$: Observable<string> = this._selectedVault.asObservable();

  vaultFilter: VaultFilter = new VaultFilter();
  enforcePersonalOwnership = false;
  overlayPostition: ConnectedPosition[] = [
    {
      originX: "start",
      originY: "bottom",
      overlayX: "start",
      overlayY: "top",
    },
  ];

  private overlayRef: OverlayRef;
  private _destroy = new Subject<void>();

  shouldShow(organizations: Organization[]): boolean {
    return (
      (organizations.length > 0 && !this.enforcePersonalOwnership) ||
      (organizations.length > 1 && this.enforcePersonalOwnership)
    );
  }

  constructor(
    private vaultFilterService: VaultFilterService,
    private i18nService: I18nService,
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
    private platformUtilsService: PlatformUtilsService,
    private organizationService: OrganizationService
  ) {}

  @HostListener("document:keydown.escape", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (this.isOpen) {
      event.preventDefault();
      this.close();
    }
  }

  async ngOnInit() {
    this.organizations$ = this.organizationService.organizations$
      .pipe(takeUntil(this._destroy))
      .pipe(map((orgs) => orgs.sort((a, b) => a.name.localeCompare(b.name))));

    this.organizations$
      .pipe(
        concatMap(async (organizations) => {
          this.enforcePersonalOwnership =
            await this.vaultFilterService.checkForPersonalOwnershipPolicy();

          if (this.shouldShow(organizations)) {
            if (this.enforcePersonalOwnership && !this.vaultFilter.myVaultOnly) {
              const firstOrganization = organizations[0];
              this._selectedVault.next(firstOrganization.name);
              this.vaultFilterService.setVaultFilter(firstOrganization.id);
              this.vaultFilter.selectedOrganizationId = firstOrganization.id;
            } else if (this.vaultFilter.myVaultOnly) {
              this._selectedVault.next(this.i18nService.t(this.vaultFilterService.myVault));
            } else if (this.vaultFilter.selectedOrganizationId != null) {
              const selectedOrganization = organizations.find(
                (o) => o.id === this.vaultFilter.selectedOrganizationId
              );
              this._selectedVault.next(selectedOrganization.name);
            } else {
              this._selectedVault.next(this.i18nService.t(this.vaultFilterService.allVaults));
            }
          }
        })
      )
      .pipe(takeUntil(this._destroy))
      .subscribe();

    this.loaded = true;
  }

  ngOnDestroy(): void {
    this._destroy.next();
    this._destroy.complete();
    this._selectedVault.complete();
  }

  openOverlay() {
    const viewPortHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    const positionStrategyBuilder = this.overlay.position();

    const positionStrategy = positionStrategyBuilder
      .flexibleConnectedTo(this.buttonRef.nativeElement)
      .withFlexibleDimensions(true)
      .withPush(true)
      .withViewportMargin(10)
      .withGrowAfterOpen(true)
      .withPositions(this.overlayPostition);

    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      positionStrategy,
      maxHeight: viewPortHeight - 160,
      backdropClass: "cdk-overlay-transparent-backdrop",
      scrollStrategy: this.overlay.scrollStrategies.close(),
    });

    const templatePortal = new TemplatePortal(this.templateRef, this.viewContainerRef);
    this.overlayRef.attach(templatePortal);
    this.isOpen = true;

    // Handle closing
    merge(
      this.overlayRef.outsidePointerEvents(),
      this.overlayRef.backdropClick(),
      this.overlayRef.detachments()
      // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    ).subscribe(() => {
      this.close();
    });
  }

  close() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = undefined;
    }
    this.isOpen = false;
  }

  selectOrganization(organization: Organization) {
    if (!organization.enabled) {
      this.platformUtilsService.showToast(
        "error",
        null,
        this.i18nService.t("disabledOrganizationFilterError")
      );
    } else {
      this._selectedVault.next(organization.name);
      this.vaultFilterService.setVaultFilter(organization.id);
      this.onVaultSelectionChanged.emit();
      this.close();
    }
  }
  selectAllVaults() {
    this._selectedVault.next(this.i18nService.t(this.vaultFilterService.allVaults));
    this.vaultFilterService.setVaultFilter(this.vaultFilterService.allVaults);
    this.onVaultSelectionChanged.emit();
    this.close();
  }
  selectMyVault() {
    this._selectedVault.next(this.i18nService.t(this.vaultFilterService.myVault));
    this.vaultFilterService.setVaultFilter(this.vaultFilterService.myVault);
    this.onVaultSelectionChanged.emit();
    this.close();
  }
}
