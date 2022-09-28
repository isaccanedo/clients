import { ApiService as AbstractApiService } from "@bitwarden/common/abstractions/api.service";
import { ApiService } from "@bitwarden/common/services/api.service";

import { AppIdServiceInitOptions, appIdServiceFactory } from "./app-id-service.factory";
import {
  environmentServiceFactory,
  EnvironmentServiceInitOptions,
} from "./environment-service.factory";
import { CachedServices, factory, FactoryOptions } from "./factory-options";
import {
  PlatformUtilsServiceInitOptions,
  platformUtilsServiceFactory,
} from "./platform-utils-service.factory";
import { TokenServiceInitOptions, tokenServiceFactory } from "./token-service.factory";

type ApiServiceFactoryOptions = FactoryOptions & {
  apiServiceOptions: {
    logoutCallback: (expired: boolean) => Promise<void>;
    customUserAgent?: string;
  };
};

export type ApiServiceInitOptions = ApiServiceFactoryOptions &
  TokenServiceInitOptions &
  PlatformUtilsServiceInitOptions &
  EnvironmentServiceInitOptions &
  AppIdServiceInitOptions;

export function apiServiceFactory(
  cache: { apiService?: AbstractApiService } & CachedServices,
  opts: ApiServiceInitOptions
): Promise<AbstractApiService> {
  return factory(
    cache,
    "apiService",
    opts,
    async () =>
      new ApiService(
        await tokenServiceFactory(cache, opts),
        await platformUtilsServiceFactory(cache, opts),
        await environmentServiceFactory(cache, opts),
        await appIdServiceFactory(cache, opts),
        opts.apiServiceOptions.logoutCallback,
        opts.apiServiceOptions.customUserAgent
      )
  );
}
