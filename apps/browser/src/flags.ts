import {
  flagEnabled as baseFlagEnabled,
  devFlagEnabled as baseDevFlagEnabled,
  devFlagValue as baseDevFlagValue,
  SharedFlags,
  SharedDevFlags,
} from "@bitwarden/common/misc/flags";

import { GroupPolicyEnvironment } from "./types/group-policy-environment";

// required to avoid linting errors when there are no flags
/* eslint-disable-next-line @typescript-eslint/ban-types */
export type Flags = {} & SharedFlags;

// required to avoid linting errors when there are no flags
/* eslint-disable-next-line @typescript-eslint/ban-types */
export type DevFlags = {
  storeSessionDecrypted?: boolean;
  managedEnvironment?: GroupPolicyEnvironment;
} & SharedDevFlags;

export function flagEnabled(flag: keyof Flags): boolean {
  return baseFlagEnabled<Flags>(flag);
}

export function devFlagEnabled(flag: keyof DevFlags) {
  return baseDevFlagEnabled<DevFlags>(flag);
}

export function devFlagValue(flag: keyof DevFlags) {
  return baseDevFlagValue(flag);
}
