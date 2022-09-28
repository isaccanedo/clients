import { ITreeNodeObject } from "@bitwarden/common/models/domain/treeNode";

export type TopLevelTreeNodeId = "vaults" | "types" | "collections" | "folders";
export class TopLevelTreeNode implements ITreeNodeObject {
  id: TopLevelTreeNodeId;
  name: string; // localizationString
}
