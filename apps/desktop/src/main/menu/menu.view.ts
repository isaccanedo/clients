import { MenuItemConstructorOptions } from "electron";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";

import { IMenubarMenu } from "./menubar";

export class ViewMenu implements IMenubarMenu {
  readonly id: "viewMenu";

  get label(): string {
    return this.localize("view");
  }

  get items(): MenuItemConstructorOptions[] {
    return [
      this.searchVault,
      this.separator,
      this.generator,
      this.passwordHistory,
      this.separator,
      this.zoomIn,
      this.zoomOut,
      this.resetZoom,
      this.separator,
      this.toggleFullscreen,
      this.separator,
      this.reload,
      this.toggleDevTools,
    ];
  }

  private readonly _i18nService: I18nService;
  private readonly _messagingService: MessagingService;
  private readonly _isLocked: boolean;

  constructor(i18nService: I18nService, messagingService: MessagingService, isLocked: boolean) {
    this._i18nService = i18nService;
    this._messagingService = messagingService;
    this._isLocked = isLocked;
  }

  private get searchVault(): MenuItemConstructorOptions {
    return {
      id: "searchVault",
      label: this.localize("searchVault"),
      click: () => this.sendMessage("focusSearch"),
      accelerator: "CmdOrCtrl+F",
      enabled: !this._isLocked,
    };
  }

  private get separator(): MenuItemConstructorOptions {
    return { type: "separator" };
  }

  private get generator(): MenuItemConstructorOptions {
    return {
      id: "generator",
      label: this.localize("generator"),
      click: () => this.sendMessage("openGenerator"),
      accelerator: "CmdOrCtrl+G",
      enabled: !this._isLocked,
    };
  }

  private get passwordHistory(): MenuItemConstructorOptions {
    return {
      id: "passwordHistory",
      label: this.localize("passwordHistory"),
      click: () => this.sendMessage("openPasswordHistory"),
      enabled: !this._isLocked,
    };
  }

  private get zoomIn(): MenuItemConstructorOptions {
    return {
      id: "zoomIn",
      label: this.localize("zoomIn"),
      role: "zoomIn",
      accelerator: "CmdOrCtrl+=",
    };
  }

  private get zoomOut(): MenuItemConstructorOptions {
    return {
      id: "zoomOut",
      label: this.localize("zoomOut"),
      role: "zoomOut",
      accelerator: "CmdOrCtrl+-",
    };
  }

  private get resetZoom(): MenuItemConstructorOptions {
    return {
      id: "resetZoom",
      label: this.localize("resetZoom"),
      role: "resetZoom",
      accelerator: "CmdOrCtrl+0",
    };
  }

  private get toggleFullscreen(): MenuItemConstructorOptions {
    return {
      id: "toggleFullScreen",
      label: this.localize("toggleFullScreen"),
      role: "togglefullscreen",
    };
  }

  private get reload(): MenuItemConstructorOptions {
    return {
      id: "reload",
      label: this.localize("reload"),
      role: "forceReload",
    };
  }

  private get toggleDevTools(): MenuItemConstructorOptions {
    return {
      id: "toggleDevTools",
      label: this.localize("toggleDevTools"),
      role: "toggleDevTools",
      accelerator: "F12",
    };
  }

  private localize(s: string) {
    return this._i18nService.t(s);
  }

  private sendMessage(message: string) {
    this._messagingService.send(message);
  }
}
