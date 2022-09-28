import { StepperSelectionEvent } from "@angular/cdk/stepper";
import { TitleCasePipe } from "@angular/common";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, fakeAsync, TestBed, tick } from "@angular/core/testing";
import { FormBuilder, UntypedFormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { Substitute } from "@fluffy-spoon/substitute";
import { BehaviorSubject } from "rxjs";

import { I18nPipe } from "@bitwarden/angular/pipes/i18n.pipe";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/abstractions/policy/policy-api.service.abstraction";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { StateService as BaseStateService } from "@bitwarden/common/abstractions/state.service";
import { PlanType } from "@bitwarden/common/enums/planType";
import { MasterPasswordPolicyOptions } from "@bitwarden/common/models/domain/masterPasswordPolicyOptions";

import { RouterService } from "../../core";

import { TrialInitiationComponent } from "./trial-initiation.component";
import { VerticalStepperComponent } from "./vertical-stepper/vertical-stepper.component";

describe("TrialInitiationComponent", () => {
  let component: TrialInitiationComponent;
  let fixture: ComponentFixture<TrialInitiationComponent>;
  const mockQueryParams = new BehaviorSubject<any>({ org: "enterprise" });
  const testOrgId = "91329456-5b9f-44b3-9279-6bb9ee6a0974";
  const formBuilder: FormBuilder = new FormBuilder();
  let routerSpy: jest.SpyInstance;

  let stateServiceMock: any;
  let apiServiceMock: any;
  let policyServiceMock: any;

  beforeEach(() => {
    // only mock functions we use in this component
    stateServiceMock = {
      getOrganizationInvitation: jest.fn(),
    };

    apiServiceMock = {
      getPoliciesByToken: jest.fn(),
    };

    policyServiceMock = {
      getMasterPasswordPolicyOptions: jest.fn(),
    };

    TestBed.configureTestingModule({
      imports: [
        RouterTestingModule.withRoutes([
          { path: "trial", component: TrialInitiationComponent },
          {
            path: `organizations/${testOrgId}/vault`,
            component: BlankComponent,
          },
          {
            path: `organizations/${testOrgId}/manage/people`,
            component: BlankComponent,
          },
        ]),
      ],
      declarations: [TrialInitiationComponent, I18nPipe],
      providers: [
        UntypedFormBuilder,
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: mockQueryParams.asObservable(),
          },
        },
        { provide: BaseStateService, useValue: stateServiceMock },
        { provide: PolicyService, useValue: policyServiceMock },
        { provide: ApiService, useValue: apiServiceMock },
        { provide: LogService, useClass: Substitute.for<LogService>() },
        { provide: I18nService, useClass: Substitute.for<I18nService>() },
        { provide: TitleCasePipe, useClass: Substitute.for<TitleCasePipe>() },
        {
          provide: PolicyApiServiceAbstraction,
          useClass: Substitute.for<PolicyApiServiceAbstraction>(),
        },
        {
          provide: VerticalStepperComponent,
          useClass: VerticalStepperStubComponent,
        },
        {
          provide: RouterService,
          useClass: Substitute.for<RouterService>(),
        },
      ],
      schemas: [NO_ERRORS_SCHEMA], // Allows child components to be ignored (such as register component)
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TrialInitiationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  // These tests demonstrate mocking service calls
  describe("onInit() enforcedPolicyOptions", () => {
    it("should not set enforcedPolicyOptions if state service returns no invite", async () => {
      stateServiceMock.getOrganizationInvitation.mockReturnValueOnce(null);
      // Need to recreate component with new service mock
      fixture = TestBed.createComponent(TrialInitiationComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();

      expect(component.enforcedPolicyOptions).toBe(undefined);
    });
    it("should set enforcedPolicyOptions if state service returns an invite", async () => {
      // Set up service method mocks
      stateServiceMock.getOrganizationInvitation.mockReturnValueOnce({
        organizationId: testOrgId,
        token: "token",
        email: "testEmail",
        organizationUserId: "123",
      });
      apiServiceMock.getPoliciesByToken.mockReturnValueOnce({
        data: [
          {
            id: "345",
            organizationId: testOrgId,
            type: 1,
            data: [
              {
                minComplexity: 4,
                minLength: 10,
                requireLower: null,
                requireNumbers: null,
                requireSpecial: null,
                requireUpper: null,
              },
            ],
            enabled: true,
          },
        ],
      });
      policyServiceMock.getMasterPasswordPolicyOptions.mockReturnValueOnce({
        minComplexity: 4,
        minLength: 10,
        requireLower: null,
        requireNumbers: null,
        requireSpecial: null,
        requireUpper: null,
      } as MasterPasswordPolicyOptions);

      // Need to recreate component with new service mocks
      fixture = TestBed.createComponent(TrialInitiationComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      expect(component.enforcedPolicyOptions).toMatchObject({
        minComplexity: 4,
        minLength: 10,
        requireLower: null,
        requireNumbers: null,
        requireSpecial: null,
        requireUpper: null,
      });
    });
  });

  // These tests demonstrate route params
  describe("Route params", () => {
    it("should set org variable to be enterprise and plan to EnterpriseAnnually if org param is enterprise", fakeAsync(() => {
      mockQueryParams.next({ org: "enterprise" });
      tick(); // wait for resolution
      fixture.detectChanges();
      component.ngOnInit();
      expect(component.org).toBe("enterprise");
      expect(component.plan).toBe(PlanType.EnterpriseAnnually);
    }));
    it("should not set org variable if no org param is provided", fakeAsync(() => {
      mockQueryParams.next({});
      tick(); // wait for resolution
      fixture = TestBed.createComponent(TrialInitiationComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(component.org).toBe("");
      expect(component.accountCreateOnly).toBe(true);
    }));
    it("should set the org to be families and plan to FamiliesAnnually if org param is invalid ", fakeAsync(async () => {
      mockQueryParams.next({ org: "hahahaha" });
      tick(); // wait for resolution
      fixture.detectChanges();
      component.ngOnInit();
      expect(component.org).toBe("families");
      expect(component.plan).toBe(PlanType.FamiliesAnnually);
    }));
  });

  // These tests demonstrate the use of a stub component
  describe("createAccount()", () => {
    beforeEach(() => {
      component.verticalStepper = TestBed.createComponent(VerticalStepperStubComponent)
        .componentInstance as VerticalStepperComponent;
    });

    it("should set email and call verticalStepper.next()", fakeAsync(() => {
      const verticalStepperNext = jest.spyOn(component.verticalStepper, "next");
      component.createdAccount("test@email.com");
      expect(verticalStepperNext).toHaveBeenCalled();
      expect(component.email).toBe("test@email.com");
    }));
  });

  describe("billingSuccess()", () => {
    beforeEach(() => {
      component.verticalStepper = TestBed.createComponent(VerticalStepperStubComponent)
        .componentInstance as VerticalStepperComponent;
    });

    it("should set orgId and call verticalStepper.next()", () => {
      const verticalStepperNext = jest.spyOn(component.verticalStepper, "next");
      component.billingSuccess({ orgId: testOrgId });
      expect(verticalStepperNext).toHaveBeenCalled();
      expect(component.orgId).toBe(testOrgId);
    });
  });

  describe("stepSelectionChange()", () => {
    beforeEach(() => {
      component.verticalStepper = TestBed.createComponent(VerticalStepperStubComponent)
        .componentInstance as VerticalStepperComponent;
    });

    it("on step 2 should show organization copy text", () => {
      component.stepSelectionChange({
        selectedIndex: 1,
        previouslySelectedIndex: 0,
      } as StepperSelectionEvent);

      expect(component.orgInfoSubLabel).toContain("Enter your");
      expect(component.orgInfoSubLabel).toContain(" organization information");
    });
    it("going from step 2 to 3 should set the orgInforSubLabel to be the Org name from orgInfoFormGroup", () => {
      component.orgInfoFormGroup = formBuilder.group({
        name: ["Hooli"],
        email: [""],
      });
      component.stepSelectionChange({
        selectedIndex: 2,
        previouslySelectedIndex: 1,
      } as StepperSelectionEvent);

      expect(component.orgInfoSubLabel).toContain("Hooli");
    });
  });

  describe("previousStep()", () => {
    beforeEach(() => {
      component.verticalStepper = TestBed.createComponent(VerticalStepperStubComponent)
        .componentInstance as VerticalStepperComponent;
    });

    it("should call verticalStepper.previous()", fakeAsync(() => {
      const verticalStepperPrevious = jest.spyOn(component.verticalStepper, "previous");
      component.previousStep();
      expect(verticalStepperPrevious).toHaveBeenCalled();
    }));
  });

  // These tests demonstrate router navigation
  describe("navigation methods", () => {
    beforeEach(() => {
      component.orgId = testOrgId;
      const router = TestBed.inject(Router);
      fixture.detectChanges();
      routerSpy = jest.spyOn(router, "navigate");
    });
    describe("navigateToOrgVault", () => {
      it("should call verticalStepper.previous()", fakeAsync(() => {
        component.navigateToOrgVault();
        expect(routerSpy).toHaveBeenCalledWith(["organizations", testOrgId, "vault"]);
      }));
    });
    describe("navigateToOrgVault", () => {
      it("should call verticalStepper.previous()", fakeAsync(() => {
        component.navigateToOrgInvite();
        expect(routerSpy).toHaveBeenCalledWith(["organizations", testOrgId, "manage", "people"]);
      }));
    });
  });
});

export class VerticalStepperStubComponent extends VerticalStepperComponent {}
export class BlankComponent {} // For router tests
