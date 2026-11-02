// 最終レポートの変更のラベルが運ぶ、触ったファイル1つの形。

export type ChangedFile = {
  readonly path: string
  readonly change: "added" | "modified" | "deleted"
}
