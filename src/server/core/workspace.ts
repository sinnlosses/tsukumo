// セッションをどこで動かすかの**判断**（`docs/architecture.md`「worktree でセッションを分ける」）。
// **切るかどうか・どの名前で切るか・使い終えたものを畳むかどうか**をここが決め、実際に git を
// 起こして切る・畳むのは `src/server/adapter/worktree.ts`（原則3。`core → adapter` は禁止）。
//
// 時計もファイルも読まない。**「いま何時か」は引数で受け取る**（`startedAt`）——OS の
// タイムゾーンに依るので、読むのは adapter の側。

import { type Workdir, type Workspace } from "../../shared/workspace.ts"

/**
 * 同じ秒に起きたときに試す名前の数。**ディレクトリの作成が成功したほうが勝つ**ので、負けた側が
 * `-2`, `-3` と足して試す（同節の決定4）。ここまで全部負けたら諦めて起動を止める
 * （同じ秒に10個の tsukumo が起きる状況は、切る前に別の何かが壊れている）。
 */
const MAX_WORKTREE_NAME_CANDIDATES = 10

/** 切った worktree のブランチの前置き。`tsukumo/<名前>` の形になる（同節の決定4）。 */
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
 * **1つ目のセッションも切る**（本体で作業するセッションを作らない。同節の決定1）ので、
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
  /** 成果が残っているので消さない。**1行だけ知らせる**（同節の決定4）。 */
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

/** 本体へマージする前に分かっていること（調べるのは adapter）。 */
export type WorktreeMergeState = {
  /** 切り出し元の作業ツリーに未コミットの変更があるか。 */
  readonly originChanged: boolean
  /** 切り出し元へ入っていないコミットがあるか。 */
  readonly unmerged: boolean
}

/** 本体へマージしてよいか。**入れられないときは理由を必ず持つ**（`WorktreeFold` と同じ形）。 */
export type WorktreeMergePlan =
  /** 入れる。 */
  | { readonly kind: "merge" }
  /** 入れるものが無い（コミットが1つも増えていない）。**何も知らせない**（正常な姿）。 */
  | { readonly kind: "skip" }
  /** 入れられない。**止めて知らせる。** */
  | { readonly kind: "blocked"; readonly reason: "origin-changed" }

/**
 * 1タスクぶんの成果を本体へ入れてよいかを決める。
 *
 * **入れるものが無いかを先に見る**——本体が汚れていても、入れるものが無いなら知らせることは
 * 何も無い（起こすたびに同じ知らせが出るのを防ぐ）。
 *
 * **本体が汚れていたら入れない**。重ならないファイルなら `git merge` は
 * 通るが、通ったあとで衝突して `merge --abort` したときに、**マージ前からあった未コミットの
 * 変更を git が復元しきれないことがある**（`git merge --abort` の但し書き）。本体は誰も
 * 書かない場所という前提が崩れているので、**黙って進めずに人へ返す**。
 */
export function decideWorktreeMerge(state: WorktreeMergeState): WorktreeMergePlan {
  if (!state.unmerged) {
    return { kind: "skip" }
  }
  return state.originChanged ? { kind: "blocked", reason: "origin-changed" } : { kind: "merge" }
}

/**
 * マージが止まった理由。**adapter は git の返事を写すだけ**で、画面に出す文面を組むのはここ
 * （`docs/architecture.md`「worktree でセッションを分ける」の決定3）。
 */
export type WorktreeMergeStop =
  /** 本体に未コミットの変更がある（マージを始めてもいない）。 */
  | { readonly kind: "origin-changed"; readonly origin: string }
  /** 衝突した。**本体は `merge --abort` で戻してある。** */
  | { readonly kind: "conflict"; readonly files: readonly string[] }
  /** 衝突以外で通らなかった（git が書いた行をそのまま持つ）。 */
  | { readonly kind: "failed"; readonly reason: string }

/**
 * 止まったときに画面へ出す文面。**ブランチ名・worktree の絶対パス・止まった事情・次の手**を
 * 必ず並べる（`docs/architecture.md`「worktree でセッションを分ける」の決定3）。これだけで人が続きを引き取れる形にする。
 *
 * **会話の内容は混ざらない**——載るのは git の返事とパスだけ（`docs/coding-standards.md`
 * 「会話内容の扱い」）。
 */
export function worktreeMergeStopNotice(
  stop: WorktreeMergeStop,
  workdir: { readonly branch: string; readonly path: string },
): string {
  return [
    mergeStopHeadline(stop),
    `ブランチ: ${workdir.branch}`,
    `worktree: ${workdir.path}`,
    ...mergeStopDetail(stop),
    `次の手: ${mergeStopNextStep(stop)}`,
  ].join("\n")
}

/**
 * 1タスクぶんの成果を本体へ入れた結果（git を起こすのは `src/server/adapter/worktree.ts` の
 * `mergeWorkspace`）。**止まったときは理由を必ず持つ**ので、受け取った側は知らせ漏れなく
 * 画面へ出せる（`docs/architecture.md`「worktree でセッションを分ける」の決定3）。
 */
export type WorkspaceMerge =
  /** 本体へ入った。`notices` は**畳めなかったときだけ**の1行（畳めたときは空）。 */
  | { readonly kind: "merged"; readonly notices: readonly string[] }
  /** 入れるものが無かった（切っていない・コミットが増えていない）。 */
  | { readonly kind: "skipped" }
  /** 止まった。**そのセッションは次のタスクへ進まない**（判断は呼び出し側）。 */
  | { readonly kind: "stopped"; readonly notice: string }

/**
 * 入れた結果を、**タスクを終えたモデルへ返す文面**にする（`finish` ツールの戻り値。
 * `src/server/core/session-driver.ts` の `TaskWorkflow`）。
 *
 * 止まった回にそのまま {@link worktreeMergeStopNotice} の文面を返すのは、**次の手まで書いてある
 * のがそれ1つ**だから——画面（`workspaceNotices`）と同じ文面を読ませることで、人と claude が
 * 別々のことを知っている状態を作らない。**会話の内容は混ざらない**（載るのは git の返事とパス
 * だけ）。
 */
export function workspaceMergeNotice(merge: WorkspaceMerge): string {
  switch (merge.kind) {
    case "merged":
      return ["成果を本体へ入れた", ...merge.notices].join("\n")
    case "skipped":
      return "本体へ入れるものは無かった（このセッションのコミットが増えていない）"
    case "stopped":
      return merge.notice
  }
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
 * そして**タスク運用の無いリポジトリでも同じ形で動く**ようにするため（同節の決定4）。
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

/** 止まった事情を1行で言い切る見出し。**本体を戻したかどうかまでここで言う。** */
function mergeStopHeadline(stop: WorktreeMergeStop): string {
  switch (stop.kind) {
    case "origin-changed":
      return "本体に未コミットの変更があるのでマージしなかった"
    case "conflict":
      return "マージが衝突したので止めた（本体は元に戻した）"
    case "failed":
      return "マージが通らなかったので止めた（本体は元に戻した）"
  }
}

/** 見出しと次の手の間に挟む、事情ごとの中身（無い事情もある）。 */
function mergeStopDetail(stop: WorktreeMergeStop): readonly string[] {
  switch (stop.kind) {
    case "origin-changed":
      return [`本体: ${stop.origin}`]
    case "conflict":
      return [`衝突したファイル: ${stop.files.join(" ")}`]
    case "failed":
      return stop.reason.split("\n").map((line) => `git: ${line}`)
  }
}

/**
 * 次の手。**衝突は worktree の側で解く**（本体を解決の場にしない。解くのに要る材料は
 * worktree にしか無い）。
 */
function mergeStopNextStep(stop: WorktreeMergeStop): string {
  return stop.kind === "origin-changed"
    ? "本体の変更をコミットするか退避してから、もう一度マージを頼む"
    : "worktree で git merge main して解き、もう一度マージを頼む"
}
