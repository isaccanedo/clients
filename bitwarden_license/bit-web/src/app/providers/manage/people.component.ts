import { Component, OnInit, ViewChild, ViewContainerRef } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { first } from "rxjs/operators";

import { SearchPipe } from "@bitwarden/angular/pipes/search.pipe";
import { UserNamePipe } from "@bitwarden/angular/pipes/user-name.pipe";
import { ModalService } from "@bitwarden/angular/services/modal.service";
import { ValidationService } from "@bitwarden/angular/services/validation.service";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { ProviderService } from "@bitwarden/common/abstractions/provider.service";
import { SearchService } from "@bitwarden/common/abstractions/search.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { ProviderUserStatusType } from "@bitwarden/common/enums/providerUserStatusType";
import { ProviderUserType } from "@bitwarden/common/enums/providerUserType";
import { ProviderUserBulkRequest } from "@bitwarden/common/models/request/provider/providerUserBulkRequest";
import { ProviderUserConfirmRequest } from "@bitwarden/common/models/request/provider/providerUserConfirmRequest";
import { ListResponse } from "@bitwarden/common/models/response/listResponse";
import { ProviderUserBulkResponse } from "@bitwarden/common/models/response/provider/providerUserBulkResponse";
import { ProviderUserUserDetailsResponse } from "@bitwarden/common/models/response/provider/providerUserResponse";

import { BasePeopleComponent } from "src/app/common/base.people.component";
import { BulkStatusComponent } from "src/app/organizations/manage/bulk/bulk-status.component";
import { EntityEventsComponent } from "src/app/organizations/manage/entity-events.component";

import { BulkConfirmComponent } from "./bulk/bulk-confirm.component";
import { BulkRemoveComponent } from "./bulk/bulk-remove.component";
import { UserAddEditComponent } from "./user-add-edit.component";

@Component({
  selector: "provider-people",
  templateUrl: "people.component.html",
})
// eslint-disable-next-line rxjs-angular/prefer-takeuntil
export class PeopleComponent
  extends BasePeopleComponent<ProviderUserUserDetailsResponse>
  implements OnInit
{
  @ViewChild("addEdit", { read: ViewContainerRef, static: true }) addEditModalRef: ViewContainerRef;
  @ViewChild("groupsTemplate", { read: ViewContainerRef, static: true })
  groupsModalRef: ViewContainerRef;
  @ViewChild("eventsTemplate", { read: ViewContainerRef, static: true })
  eventsModalRef: ViewContainerRef;
  @ViewChild("bulkStatusTemplate", { read: ViewContainerRef, static: true })
  bulkStatusModalRef: ViewContainerRef;
  @ViewChild("bulkConfirmTemplate", { read: ViewContainerRef, static: true })
  bulkConfirmModalRef: ViewContainerRef;
  @ViewChild("bulkRemoveTemplate", { read: ViewContainerRef, static: true })
  bulkRemoveModalRef: ViewContainerRef;

  userType = ProviderUserType;
  userStatusType = ProviderUserStatusType;
  providerId: string;
  accessEvents = false;

  constructor(
    apiService: ApiService,
    private route: ActivatedRoute,
    i18nService: I18nService,
    modalService: ModalService,
    platformUtilsService: PlatformUtilsService,
    cryptoService: CryptoService,
    private router: Router,
    searchService: SearchService,
    validationService: ValidationService,
    logService: LogService,
    searchPipe: SearchPipe,
    userNamePipe: UserNamePipe,
    stateService: StateService,
    private providerService: ProviderService
  ) {
    super(
      apiService,
      searchService,
      i18nService,
      platformUtilsService,
      cryptoService,
      validationService,
      modalService,
      logService,
      searchPipe,
      userNamePipe,
      stateService
    );
  }

  ngOnInit() {
    // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
    this.route.parent.params.subscribe(async (params) => {
      this.providerId = params.providerId;
      const provider = await this.providerService.get(this.providerId);

      if (!provider.canManageUsers) {
        this.router.navigate(["../"], { relativeTo: this.route });
        return;
      }

      this.accessEvents = provider.useEvents;

      await this.load();

      /* eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe, rxjs/no-nested-subscribe */
      this.route.queryParams.pipe(first()).subscribe(async (qParams) => {
        this.searchText = qParams.search;
        if (qParams.viewEvents != null) {
          const user = this.users.filter((u) => u.id === qParams.viewEvents);
          if (user.length > 0 && user[0].status === ProviderUserStatusType.Confirmed) {
            this.events(user[0]);
          }
        }
      });
    });
  }

  getUsers(): Promise<ListResponse<ProviderUserUserDetailsResponse>> {
    return this.apiService.getProviderUsers(this.providerId);
  }

  deleteUser(id: string): Promise<any> {
    return this.apiService.deleteProviderUser(this.providerId, id);
  }

  revokeUser(id: string): Promise<any> {
    // Not implemented.
    return null;
  }

  restoreUser(id: string): Promise<any> {
    // Not implemented.
    return null;
  }

  reinviteUser(id: string): Promise<any> {
    return this.apiService.postProviderUserReinvite(this.providerId, id);
  }

  async confirmUser(user: ProviderUserUserDetailsResponse, publicKey: Uint8Array): Promise<any> {
    const providerKey = await this.cryptoService.getProviderKey(this.providerId);
    const key = await this.cryptoService.rsaEncrypt(providerKey.key, publicKey.buffer);
    const request = new ProviderUserConfirmRequest();
    request.key = key.encryptedString;
    await this.apiService.postProviderUserConfirm(this.providerId, user.id, request);
  }

  async edit(user: ProviderUserUserDetailsResponse) {
    const [modal] = await this.modalService.openViewRef(
      UserAddEditComponent,
      this.addEditModalRef,
      (comp) => {
        comp.name = this.userNamePipe.transform(user);
        comp.providerId = this.providerId;
        comp.providerUserId = user != null ? user.id : null;
        comp.onSavedUser.subscribe(() => {
          modal.close();
          this.load();
        });
        comp.onDeletedUser.subscribe(() => {
          modal.close();
          this.removeUser(user);
        });
      }
    );
  }

  async events(user: ProviderUserUserDetailsResponse) {
    await this.modalService.openViewRef(EntityEventsComponent, this.eventsModalRef, (comp) => {
      comp.name = this.userNamePipe.transform(user);
      comp.providerId = this.providerId;
      comp.entityId = user.id;
      comp.showUser = false;
      comp.entity = "user";
    });
  }

  async bulkRemove() {
    if (this.actionPromise != null) {
      return;
    }

    const [modal] = await this.modalService.openViewRef(
      BulkRemoveComponent,
      this.bulkRemoveModalRef,
      (comp) => {
        comp.providerId = this.providerId;
        comp.users = this.getCheckedUsers();
      }
    );

    await modal.onClosedPromise();
    await this.load();
  }

  async bulkReinvite() {
    if (this.actionPromise != null) {
      return;
    }

    const users = this.getCheckedUsers();
    const filteredUsers = users.filter((u) => u.status === ProviderUserStatusType.Invited);

    if (filteredUsers.length <= 0) {
      this.platformUtilsService.showToast(
        "error",
        this.i18nService.t("errorOccurred"),
        this.i18nService.t("noSelectedUsersApplicable")
      );
      return;
    }

    try {
      const request = new ProviderUserBulkRequest(filteredUsers.map((user) => user.id));
      const response = this.apiService.postManyProviderUserReinvite(this.providerId, request);
      this.showBulkStatus(
        users,
        filteredUsers,
        response,
        this.i18nService.t("bulkReinviteMessage")
      );
    } catch (e) {
      this.validationService.showError(e);
    }
    this.actionPromise = null;
  }

  async bulkConfirm() {
    if (this.actionPromise != null) {
      return;
    }

    const [modal] = await this.modalService.openViewRef(
      BulkConfirmComponent,
      this.bulkConfirmModalRef,
      (comp) => {
        comp.providerId = this.providerId;
        comp.users = this.getCheckedUsers();
      }
    );

    await modal.onClosedPromise();
    await this.load();
  }

  private async showBulkStatus(
    users: ProviderUserUserDetailsResponse[],
    filteredUsers: ProviderUserUserDetailsResponse[],
    request: Promise<ListResponse<ProviderUserBulkResponse>>,
    successfullMessage: string
  ) {
    const [modal, childComponent] = await this.modalService.openViewRef(
      BulkStatusComponent,
      this.bulkStatusModalRef,
      (comp) => {
        comp.loading = true;
      }
    );

    // Workaround to handle closing the modal shortly after it has been opened
    let close = false;
    modal.onShown.subscribe(() => {
      if (close) {
        modal.close();
      }
    });

    try {
      const response = await request;

      if (modal) {
        const keyedErrors: any = response.data
          .filter((r) => r.error !== "")
          .reduce((a, x) => ({ ...a, [x.id]: x.error }), {});
        const keyedFilteredUsers: any = filteredUsers.reduce((a, x) => ({ ...a, [x.id]: x }), {});

        childComponent.users = users.map((user) => {
          let message = keyedErrors[user.id] ?? successfullMessage;
          // eslint-disable-next-line
          if (!keyedFilteredUsers.hasOwnProperty(user.id)) {
            message = this.i18nService.t("bulkFilteredMessage");
          }

          return {
            user: user,
            error: keyedErrors.hasOwnProperty(user.id), // eslint-disable-line
            message: message,
          };
        });
        childComponent.loading = false;
      }
    } catch {
      close = true;
      modal.close();
    }
  }
}
