import { ComponentFixture, TestBed } from "@angular/core/testing";

import { Icon, svgIcon } from "./icon";
import { BitIconComponent } from "./icon.component";

describe("IconComponent", () => {
  let component: BitIconComponent;
  let fixture: ComponentFixture<BitIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BitIconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BitIconComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should have empty innerHtml when input is not an Icon", () => {
    const fakeIcon = { svg: "harmful user input" } as Icon;

    component.icon = fakeIcon;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toBe("");
  });

  it("should contain icon when input is a safe Icon", () => {
    const icon = svgIcon`<svg><text x="0" y="15">safe icon</text></svg>`;

    component.icon = icon;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.innerHTML).toBe(`<svg><text x="0" y="15">safe icon</text></svg>`);
  });
});
