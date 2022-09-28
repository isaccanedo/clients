import { Directive, EventEmitter, Input, Output } from "@angular/core";

import { ITreeNodeObject } from "@bitwarden/common/models/domain/treeNode";
import { CollectionView } from "@bitwarden/common/models/view/collectionView";

import { DynamicTreeNode } from "../models/dynamic-tree-node.model";
import { TopLevelTreeNode } from "../models/top-level-tree-node.model";
import { VaultFilter } from "../models/vault-filter.model";

@Directive()
export class CollectionFilterComponent {
  @Input() hide = false;
  @Input() collapsedFilterNodes: Set<string>;
  @Input() collectionNodes: DynamicTreeNode<CollectionView>;
  @Input() activeFilter: VaultFilter;

  @Output() onNodeCollapseStateChange: EventEmitter<ITreeNodeObject> =
    new EventEmitter<ITreeNodeObject>();
  @Output() onFilterChange: EventEmitter<VaultFilter> = new EventEmitter<VaultFilter>();

  readonly collectionsGrouping: TopLevelTreeNode = {
    id: "collections",
    name: "collections",
  };

  get collections() {
    return this.collectionNodes?.fullList;
  }

  get nestedCollections() {
    return this.collectionNodes?.nestedList;
  }

  get show() {
    return !this.hide && this.collections != null && this.collections.length > 0;
  }

  isCollapsed(node: ITreeNodeObject) {
    return this.collapsedFilterNodes.has(node.id);
  }

  applyFilter(collection: CollectionView) {
    this.activeFilter.resetFilter();
    this.activeFilter.selectedCollection = true;
    this.activeFilter.selectedCollectionId = collection.id;
    this.onFilterChange.emit(this.activeFilter);
  }

  async toggleCollapse(node: ITreeNodeObject) {
    this.onNodeCollapseStateChange.emit(node);
  }
}
