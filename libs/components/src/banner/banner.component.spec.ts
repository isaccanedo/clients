import { ComponentFixture, TestBed } from "@angular/core/testing";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";

import { SharedModule } from "../shared/shared.module";
import { I18nMockService } from "../utils/i18n-mock.service";

import { BannerComponent } from "./banner.component";

describe("BannerComponent", () => {
  let component: BannerComponent;
  let fixture: ComponentFixture<BannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [BannerComponent],
      providers: [
        {
          provide: I18nService,
          useFactory: () =>
            new I18nMockService({
              close: "Close",
            }),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create with alert", () => {
    expect(component.useAlertRole).toBe(true);
    const el = fixture.nativeElement.children[0];
    expect(el.getAttribute("role")).toEqual("status");
    expect(el.getAttribute("aria-live")).toEqual("polite");
  });

  it("useAlertRole=false", () => {
    component.useAlertRole = false;
    fixture.autoDetectChanges();

    expect(component.useAlertRole).toBe(false);
    const el = fixture.nativeElement.children[0];
    expect(el.getAttribute("role")).toBeNull();
    expect(el.getAttribute("aria-live")).toBeNull();
  });
});
