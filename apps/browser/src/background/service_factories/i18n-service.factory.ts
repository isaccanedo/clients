import { I18nService as AbstractI18nService } from "@bitwarden/common/abstractions/i18n.service";
import { I18nService as BaseI18nService } from "@bitwarden/common/services/i18n.service";

import I18nService from "../../services/i18n.service";

import { FactoryOptions, CachedServices, factory } from "./factory-options";

type I18nServiceFactoryOptions = FactoryOptions & {
  i18nServiceOptions: {
    systemLanguage: string;
  };
};

export type I18nServiceInitOptions = I18nServiceFactoryOptions;

export async function i18nServiceFactory(
  cache: { i18nService?: AbstractI18nService } & CachedServices,
  opts: I18nServiceInitOptions
): Promise<AbstractI18nService> {
  const service = await factory(
    cache,
    "i18nService",
    opts,
    () => new I18nService(opts.i18nServiceOptions.systemLanguage)
  );
  if (!(service as BaseI18nService as any).inited) {
    await (service as BaseI18nService).init();
  }
  return service;
}
