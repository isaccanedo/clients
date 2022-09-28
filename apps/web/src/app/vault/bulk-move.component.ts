import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { firstValueFrom, Observable } from "rxjs";

import { CipherService } from "@bitwarden/common/abstractions/cipher.service";
import { FolderService } from "@bitwarden/common/abstractions/folder/folder.service.abstraction";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { FolderView } from "@bitwarden/common/models/view/folderView";

@Component({
  selector: "app-vault-bulk-move",
  templateUrl: "bulk-move.component.html",
})
export class BulkMoveComponent implements OnInit {
  @Input() cipherIds: string[] = [];
  @Output() onMoved = new EventEmitter();

  folderId: string = null;
  folders$: Observable<FolderView[]>;
  formPromise: Promise<any>;

  constructor(
    private cipherService: CipherService,
    private platformUtilsService: PlatformUtilsService,
    private i18nService: I18nService,
    private folderService: FolderService
  ) {}

  async ngOnInit() {
    this.folders$ = this.folderService.folderViews$;
    this.folderId = (await firstValueFrom(this.folders$))[0].id;
  }

  async submit() {
    this.formPromise = this.cipherService.moveManyWithServer(this.cipherIds, this.folderId);
    await this.formPromise;
    this.onMoved.emit();
    this.platformUtilsService.showToast("success", null, this.i18nService.t("movedItems"));
  }
}
