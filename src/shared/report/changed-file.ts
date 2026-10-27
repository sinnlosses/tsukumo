// 最終レポートの変更の札が運ぶ、触ったファイル1つの形。

export type ChangedFile = {
  readonly path: string
  readonly change: "added" | "modified" | "deleted"
}
