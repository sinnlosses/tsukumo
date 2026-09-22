// セッションをどこで動かすかの**判断**（`docs/architecture.md`「worktree でセッションを分ける」）。
// **切るかどうか・どの名前で切るか・使い終えたものを畳むかどうか**をここが決め、実際に git を
// 起こして切る・畳むのは `src/server/adapter/worktree.ts`（原則3。`core → adapter` は禁止）。
//
// 時計もファイルも読まない。**「いま何時か」は引数で受け取る**（`startedAt`）——OS の
// タイムゾーンに依るので、読むのは adapter の側。

import { type Workdir, type Workspace } from "../../shared/workspace.ts"

/**
 * 同じ秒に起きたときに試す名前の数。**ディレクトリの作成が成功したほうが勝つ**ので、負けた側が
 * `-2`, `-3` と足して試す（T-349 の決定4）。ここまで全部負けたら諦めて起動を止める
 * （同じ秒に10個の tsukumo が起きる状況は、切る前に別の何かが壊れている）。
 */
const MAX_WORKTREE_NAME_CANDIDATES = 10

/** 切った worktree のブランチの前置き。`tsukumo/<名前>` の形になる（T-349 の決定4）。 */
const WORKTREE_BRANCH_PREFIX = "tsukumo"

/**
 * 切り出し元の作業ツリーの居場所。**中身は解釈しない**（`core` は git の置き場を知らない）。
 * 受け取ってそのまま {@link WorkspacePlan} へ載せ直すだけで、「git リポジトリかどうか」という
 * 「無いかもしれない」をこの入口で畳みきるためにある（`docs/coding-standards.md`
 * 「「無い」を層をまたいで運ばない」）。
 */
export type WorkspaceRepository = {
  /** 作業ツリーの根。切った worktree の `projectConfigRoot` になる。 */
  readonly root: string
  /** `.git` の場所。切った worktree と使用中の印はこの下に並ぶ。 */
  readonly gitDir: string
}

/**
 * 起動時の判断。**切らないと決まったときは場所まで決まる**（adapter に何も頼まない）ので、
 * 判別可能な合併型で分ける。
 */
export type WorkspacePlan =
  /** 起動したディレクトリでそのまま動く（git リポジトリでない・`TSUKUMO_WORKTREE=0`）。 */
  | { readonly kind: "direct"; readonly workspace: Workspace }
  /**
   * 切る。`names` は**先頭から順に試す候補**（同じ秒に2つ起きたとき用）。
   */
  | {
      readonly kind: "cut"
      readonly repository: WorkspaceRepository
      readonly names: readonly string[]
    }

export type WorkspacePlanOptions = {
  /** worktree を切ってよいか（`TSUKUMO_WORKTREE`）。 */
  readonly enabled: boolean
  /**
   * 起動したディレクトリが属する作業ツリー（git リポジトリでなければ undefined）。
   * **外の世界（`git` の返事）を写した直後の値**なので、ここで判別可能な合併型へ畳む。
   */
  readonly repository: WorkspaceRepository | undefined
  /** 起動したディレクトリ（切らないときはここがそのまま作業先になる）。 */
  readonly cwd: string
  /** tsukumo のプロセスが動かしているコードの置き場。 */
  readonly source: string
  /** 切った時刻（ローカル時刻。**名前はここから決まる**）。 */
  readonly startedAt: Temporal.PlainDateTime
}

/**
 * 切るかどうかと、切るならどの名前で切るかを決める。
 *
 * **1つ目のセッションも切る**（本体で作業するセッションを作らない。T-349 の決定1）ので、
 * 「自分が何番目か」を観測しない——分岐は git リポジトリかどうかと環境変数の2つだけ。
 */
export function planWorkspace(options: WorkspacePlanOptions): WorkspacePlan {
  const { repository } = options
  if (!options.enabled || repository === undefined) {
    return {
      kind: "direct",
      workspace: { source: options.source, workdir: { kind: "direct", path: options.cwd } },
    }
  }

  return { kind: "cut", repository, names: worktreeNameCandidates(options.startedAt) }
}

/** 切った worktree のブランチ名（`tsukumo/<名前>`）。**組み立てるのはここだけ。** */
export function worktreeBranch(name: string): string {
  return `${WORKTREE_BRANCH_PREFIX}/${name}`
}

/**
 * 切った worktree の場所から、claude を起こす `cwd` を決める。
 *
 * **`projectConfigRoot` と対で使う**（{@link workspaceProjectConfigRoot}）。この2つを分けるのが
 * worktree の要で、**ブランチが持っている `.claude/` ではなく切り出し元のものを読ませる**。
 */
export function workspaceCwd(workspace: Workspace): string {
  return workspace.workdir.path
}

/**
 * プロジェクト設定（hooks・permissions・`.claude` の各ツリー・`CLAUDE_PROJECT_DIR`）の
 * 出どころ。**切ったときは切り出し元**、切っていないときは作業先そのもの。
 */
export function workspaceProjectConfigRoot(workspace: Workspace): string {
  const { workdir } = workspace
  return workdir.kind === "worktree" ? workdir.origin : workdir.path
}

/** 使い終えた worktree1つぶんの、いま分かっていること（調べるのは adapter）。 */
export type WorktreeState = {
  /** 印に書かれた pid のプロセスが生きているか。 */
  readonly running: boolean
  /** 未コミットの変更があるか。 */
  readonly changed: boolean
  /** 切り出し元へ入っていないコミットがあるか。 */
  readonly unmerged: boolean
}

/**
 * 使い終えた worktree をどうするか。**残すときは理由を必ず持つ**ので、知らせ漏れが型から消える。
 */
export type WorktreeFold =
  /** まだ動いている tsukumo のもの。**何も知らせない**（正常な姿）。 */
  | { readonly kind: "in-use" }
  /** 畳む（`git worktree remove` ＋ `git branch -d`）。 */
  | { readonly kind: "fold" }
  /** 成果が残っているので消さない。**1行だけ知らせる**（T-349 の決定4）。 */
  | { readonly kind: "left"; readonly reason: "changed" | "unmerged" }

/**
 * 起動時の掃除で、使い終えた worktree1つをどうするかを決める。
 *
 * **消すのは「pid が生きていない ＋ 未コミットの変更も未マージのコミットも無い」ときだけ**。
 * 取り残しを溜めないことと、成果を黙って消さないことの折り合いがここにある。
 */
export function decideWorktreeFold(state: WorktreeState): WorktreeFold {
  if (state.running) {
    return { kind: "in-use" }
  }
  if (state.changed) {
    return { kind: "left", reason: "changed" }
  }
  if (state.unmerged) {
    return { kind: "left", reason: "unmerged" }
  }
  return { kind: "fold" }
}

/** 切った worktree から画面に出す姿を組み立てる（**組み立てるのはここだけ**）。 */
export function cutWorkspace(options: {
  readonly source: string
  readonly path: string
  readonly name: string
  readonly origin: string
}): Workspace {
  const workdir: Workdir = {
    kind: "worktree",
    path: options.path,
    branch: worktreeBranch(options.name),
    origin: options.origin,
  }
  return { source: options.source, workdir }
}

/**
 * 切った時刻から名前の候補を並べる。先頭が `YYYYMMDD-HHMMSS` で、以降は `-2`, `-3` と足したもの
 * （同じ秒に2つ起きたとき、ディレクトリの作成に負けた側が次を試す）。
 *
 * **タスクid もブランチの用途も名前に入れない**——切るのは起動時でタスクを取る前だから、
 * そして**タスク運用の無いリポジトリでも同じ形で動く**ようにするため（T-349 の決定4）。
 */
function worktreeNameCandidates(startedAt: Temporal.PlainDateTime): readonly string[] {
  const base = worktreeName(startedAt)
  const extra = Array.from(
    { length: MAX_WORKTREE_NAME_CANDIDATES - 1 },
    (_, index) => `${base}-${String(index + 2)}`,
  )
  return [base, ...extra]
}

/** `YYYYMMDD-HHMMSS`（区切りは日付と時刻の間の1つだけ。ディレクトリ名にもブランチ名にも使う）。 */
function worktreeName(startedAt: Temporal.PlainDateTime): string {
  const year = String(startedAt.year).padStart(4, "0")
  const date = `${year}${twoDigits(startedAt.month)}${twoDigits(startedAt.day)}`
  const time = `${twoDigits(startedAt.hour)}${twoDigits(startedAt.minute)}${twoDigits(startedAt.second)}`
  return `${date}-${time}`
}

/** `Temporal` の値は桁を揃えて返さないので、名前に使う前に2桁へ揃える。 */
function twoDigits(value: number): string {
  return String(value).padStart(2, "0")
}
