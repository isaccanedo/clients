import { BrowserWindow, MenuItemConstructorOptions } from "electron";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { UpdaterMain } from "@bitwarden/electron/updater.main";
import { isMac, isMacAppStore } from "@bitwarden/electron/utils";

import { FirstMenu } from "./menu.first";
import { MenuAccount } from "./menu.updater";
import { IMenubarMenu } from "./menubar";

export class FileMenu extends FirstMenu implements IMenubarMenu {
  readonly id: string = "fileMenu";

  get label(): string {
    return this.localize("file");
  }

  get items(): MenuItemConstructorOptions[] {
    let items = [
      this.addNewLogin,
      this.addNewItem,
      this.addNewFolder,
      this.separator,
      this.syncVault,
      this.exportVault,
    ];

    if (!isMac()) {
      items = [
        ...items,
        ...[
          this.separator,
          this.settings,
          this.lock,
          this.lockAll,
          this.logOut,
          this.separator,
          this.quitBitwarden,
        ],
      ];
    }

    return items;
  }

  constructor(
    i18nService: I18nService,
    messagingService: MessagingService,
    updater: UpdaterMain,
    window: BrowserWindow,
    accounts: { [userId: string]: MenuAccount },
    isLocked: boolean
  ) {
    super(i18nService, messagingService, updater, window, accounts, isLocked);
  }

  private get addNewLogin(): MenuItemConstructorOptions {
    return {
      label: this.localize("addNewLogin"),
      click: () => this.sendMessage("newLogin"),
      accelerator: "CmdOrCtrl+N",
      id: "addNewLogin",
      enabled: !this._isLocked,
    };
  }

  private get addNewItem(): MenuItemConstructorOptions {
    return {
      label: this.localize("addNewItem"),
      id: "addNewItem",
      submenu: this.addNewItemSubmenu,
      enabled: !this._isLocked,
    };
  }

  private get addNewItemSubmenu(): MenuItemConstructorOptions[] {
    return [
      {
        id: "typeLogin",
        label: this.localize("typeLogin"),
        click: () => this.sendMessage("newLogin"),
        accelerator: "CmdOrCtrl+Shift+L",
      },
      {
        id: "typeCard",
        label: this.localize("typeCard"),
        click: () => this.sendMessage("newCard"),
        accelerator: "CmdOrCtrl+Shift+C",
      },
      {
        id: "typeIdentity",
        label: this.localize("typeIdentity"),
        click: () => this.sendMessage("newIdentity"),
        accelerator: "CmdOrCtrl+Shift+I",
      },
      {
        id: "typeSecureNote",
        label: this.localize("typeSecureNote"),
        click: () => this.sendMessage("newSecureNote"),
        accelerator: "CmdOrCtrl+Shift+S",
      },
    ];
  }

  private get addNewFolder(): MenuItemConstructorOptions {
    return {
      id: "addNewFolder",
      label: this.localize("addNewFolder"),
      click: () => this.sendMessage("newFolder"),
      enabled: !this._isLocked,
    };
  }

  private get syncVault(): MenuItemConstructorOptions {
    return {
      id: "syncVault",
      label: this.localize("syncVault"),
      click: () => this.sendMessage("syncVault"),
      enabled: !this._isLocked,
    };
  }

  private get exportVault(): MenuItemConstructorOptions {
    return {
      id: "exportVault",
      label: this.localize("exportVault"),
      click: () => this.sendMessage("exportVault"),
      enabled: !this._isLocked,
    };
  }

  private get quitBitwarden(): MenuItemConstructorOptions {
    return {
      id: "quitBitwarden",
      label: this.localize("quitBitwarden"),
      visible: !isMacAppStore(),
      role: "quit",
    };
  }
}
