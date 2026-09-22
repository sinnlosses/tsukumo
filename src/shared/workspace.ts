// セッションが動いている場所（`docs/architecture.md`「worktree でセッションを分ける」）。
// **サーバとブラウザの両方が読む**ので shared に置く——サーバは claude を起こす `cwd` と
// プロジェクト設定の出どころをここから導き（`src/server/core/workspace.ts`）、ブラウザは
// 部屋の名前の `title` に出す（`src/browser/features/screen-nav/hooks/use-screen-nav.ts`。
// サイドバーの行だった時期は T-365 で終わった。`docs/design.md` 13.9「部屋の名前」）。
//
// **2つの場所が常に食い違っている**のがこの型の存在理由。tsukumo のプロセスは `bun link` が
// 指すコードで動き、claude はそのつど切った worktree で動くので、「どこのコードが動いていて、
// どこを書いているのか」は読み取れないと分からない（同節の決定2）。

/**
 * claude の作業先。**切ったか切っていないかで持ち物が違う**ので判別可能な合併型にする
 * （切っていないときにブランチと切り出し元は実在しない）。
 */
export type Workdir =
  /**
   * 起動したディレクトリでそのまま動く。**git リポジトリでないとき**と、
   * **`TSUKUMO_WORKTREE=0` を渡したとき**の2つだけ（同節の決定1）。
   */
  | { readonly kind: "direct"; readonly path: string }
  /**
   * セッション用に切った worktree。`origin` は切り出した元の作業ツリーで、
   * **プロジェクト設定（hooks・permissions・`.claude`）はそちらから読む**
   * （SDK の `projectConfigRoot`）。
   */
  | {
      readonly kind: "worktree"
      readonly path: string
      readonly branch: string
      readonly origin: string
    }

/** いま動いている場所の組。 */
export type Workspace = {
  /**
   * tsukumo のプロセスが動かしているコードの置き場（絶対パス）。**worktree を切っても
   * ここは動かない** — `tsukumo` と打った時点で `bun link` の指す先に決まっている。
   */
  readonly source: string
  /** claude の作業先。 */
  readonly workdir: Workdir
}
