import { Directive, OnInit } from "@angular/core";
import { ActivatedRoute, Params, Router } from "@angular/router";
import { first } from "rxjs/operators";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";

@Directive()
export abstract class BaseAcceptComponent implements OnInit {
  loading = true;
  authed = false;
  email: string;
  actionPromise: Promise<any>;

  protected requiredParameters: string[] = [];
  protected failedShortMessage = "inviteAcceptFailedShort";
  protected failedMessage = "inviteAcceptFailed";

  constructor(
    protected router: Router,
    protected platformUtilService: PlatformUtilsService,
    protected i18nService: I18nService,
    protected route: ActivatedRoute,
    protected stateService: StateService
  ) {}

  abstract authedHandler(qParams: Params): Promise<void>;
  abstract unauthedHandler(qParams: Params): Promise<void>;

  ngOnInit() {
    // eslint-disable-next-line rxjs/no-async-subscribe
    this.route.queryParams.pipe(first()).subscribe(async (qParams) => {
      let error = this.requiredParameters.some((e) => qParams?.[e] == null || qParams[e] === "");
      let errorMessage: string = null;
      if (!error) {
        this.authed = await this.stateService.getIsAuthenticated();

        if (this.authed) {
          try {
            await this.authedHandler(qParams);
          } catch (e) {
            error = true;
            errorMessage = e.message;
          }
        } else {
          this.email = qParams.email;
          await this.unauthedHandler(qParams);
        }
      }

      if (error) {
        const message =
          errorMessage != null
            ? this.i18nService.t(this.failedShortMessage, errorMessage)
            : this.i18nService.t(this.failedMessage);
        this.platformUtilService.showToast("error", null, message, { timeout: 10000 });
        this.router.navigate(["/"]);
      }

      this.loading = false;
    });
  }
}
