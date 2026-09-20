// メインビューに出す形（`MainViewEntry`）と、それを**やり取り（ターン）ごとにまとめる**
// 「決める」ロジック。**セッションの姿（`session-state.ts`）から導くだけ**で、状態は持たない。
//
// `groupIntoTurns` / `limitTurnEntries` はもとは1つのファイルにまとまっていた（移行の段6で
// HTML の組み立てが `src/browser/features/main-view/` へ移るのに合わせ、判断そのものはサーバ・ブラウザ
// どちらでも同じ結果になる `shared` へ残した。docs/design.md 12章 段6）。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type Question, type QuestionAnswer } from "./question.ts"
import { type SessionRecord, type SessionState } from "./session-state.ts"

/**
 * 出すやり取りの数。もとは5だったが、2026-09-10 にユーザーの指定
 * （「2つ前までで良さそう」）で3へ下げた。2026-09-14 の指示で5へ戻した。
 */
export const MAX_MAIN_VIEW_TURNS = 5

/**
 * 1つのやり取りの中で**画面に出す**記録の上限。超えた分は**古いほうから**落とし、件数だけを残す
 * （やり取りの境界を優先する。ユーザーの決定 2026-09-10）。
 *
 * **数えるのは実際に画面へ出るもの（レポートと質問の記録）だけ**（{@link shownEntryCount}）。
 * 2026-09-16 にツールの実行をメインビューから外したあとも、この上限だけはツールの記録を
 * 数え続けていた: 過去のやり取り720件で測ると22件（3.1%）が上限に当たり、うち16件は
 * **画面から何も消えていないのに**「これ以前の n 件は省略した」（最大62件）を出し、残り6件は
 * レポート1件を出してから消していた（2026-09-17 実測）。画面に出るものだけを数えると1つの
 * やり取りの最大は6件（中位数1・p99で4件。実況を落とす {@link keepOnlyInterimReports} が
 * 効くため）で、この値には当たらない——**落とすための値ではなく、1つのやり取りが際限なく
 * 伸びたときの止め**（`src/browser/features/main-view/turn.tsx` の `MAX_REQUEST_HEADING_TEXT_LENGTH`
 * と同じ立場。常駐プロセスの持ち物の上限は `MAX_SESSION_STATE_TURNS` /
 * {@link MAX_MAIN_VIEW_TURNS} が別に持つ）。
 */
const MAX_MAIN_VIEW_ENTRIES = 40

/**
 * メインビューに時系列で流す1件分の記録。**利用者の依頼**（やり取りの境界）・ツールの実行・
 * 発話の詳細の3種類。**描く側（`src/browser/features/main-view/`）が読むだけの形**で、ここが決めた結果を渡す
 * （{@link mainViewEntries}）。
 */
export type MainViewEntry =
  | { readonly kind: "request"; readonly text: string }
  /**
   * キャラクターからの質問（AskUserQuestion）と、それに対する答え。`answers[i]` は
   * `questions[i]` に対して選んだ答えの並び（{@link QuestionAnswer}。選ばなかった質問は空）。
   */
  | {
      readonly kind: "question"
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  | {
      readonly kind: "tool"
      readonly name: string
      readonly input: unknown
      /** まだ結果が届いていない（作業中の）ツールは undefined になる。 */
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }
  | { readonly kind: "detail"; readonly markdown: string }

export type MainViewToolRun = Extract<MainViewEntry, { readonly kind: "tool" }>
export type MainViewQuestion = Extract<MainViewEntry, { readonly kind: "question" }>

/** ステップの中で起きたこと。ツールの実行か、キャラクターからの質問。 */
export type MainViewAction = MainViewToolRun | MainViewQuestion

/**
 * 1ステップ＝レポート1件と、それに続く出来事（ユーザーの決定 2026-09-10）。
 *
 * `interim` は、その本文が**中間レポート**（あとにツールが続いたが、まとまった資料なので
 * 残した本文。`keepOnlyInterimReports`）かどうか。`report` が undefined のときは常に false。
 * 見分けを付けて描くのは `src/browser/features/main-view/turn.tsx` の仕事で、判定はここに置く。
 *
 * `superseded` は、**自分より後ろに `report` を持つステップがあるか**（`markSupersededSteps`）。
 * 中間レポートが何件も積むと見通しが悪い問題（2026-09-16 の指摘）に対する材料で、
 * `interim && superseded` のときだけ `turn.tsx` が畳んで描く。`report` を持たないステップでも
 * 立つが、畳むかどうかの判定に使うのは中間レポートだけ。
 *
 * `firstLine` は `report` の先頭行（`report` が undefined なら undefined）。畳んだときの
 * `<summary>` に出す（`extractFirstLine`）。
 *
 * `id` は**追加されても番号がずれない**ように、そのやり取りの中で作られた順に先頭から数えた
 * 通し番号（`MainViewTurn.id` と同じ考え方）。`limitTurnEntries` が上限を超えた分を古いほうから
 * 落としても、残ったステップの `id` は変わらない（`groupIntoTurns` で、`limitTurnEntries` より
 * 前に振る）。`src/browser/features/main-view/turn.tsx` の `<Step>` の `key` に使う。**配列の添字を `key` に
 * すると**、古いステップが落ちて残りの添字が1つずつ前へずれた瞬間に、React が別のステップの
 * DOM を使い回して描き直してしまう（`<details>` の `open` のような制御されていない DOM の状態が
 * 別のステップへ乗り移って見える。2026-09-16 の指摘）。
 */
export type MainViewStep = {
  readonly id: number
  readonly report: string | undefined
  readonly interim: boolean
  readonly superseded: boolean
  readonly firstLine: string | undefined
  readonly actions: readonly MainViewAction[]
}

/**
 * 利用者の依頼1件と、それ以降のステップ。`request` が undefined なのは、最初の依頼より前の記録
 * （セッションの途中から追い始めたときに起こる）。`id` は**追加されても番号がずれない**ように
 * 先頭から数えた通し番号で、タブの選択を保つのに使う（`src/browser/features/main-view/main-view.tsx`）。
 */
export type MainViewTurn = {
  readonly id: number
  readonly request: string | undefined
  readonly steps: readonly MainViewStep[]
  /** 上限を超えて落とした**画面に出す**記録の件数。0 のときは何も落としていない。 */
  readonly droppedCount: number
}

/**
 * メインビューに渡す記録。**書きかけの本文を末尾に足す**ので、`browser/main-view/` の部品はそのまま
 * リアルタイムの表示になる（完成した本文が来た時点で確定した記録の側へ移る）。
 *
 * **`tool` の記録も渡す**（`docs/design.md` 6.1「`<Turn>` = `<RequestHeading>` +
 * `[<Report> | <QuestionRecord>]*`」）が、`src/browser/features/main-view/turn.tsx` はそこから描かない
 * （2026-09-16 決定。`docs/requirements.md` 4.2）。**{@link groupIntoTurns} /
 * {@link keepOnlyInterimReports} が「そのステップにツール呼び出しが続いたか」の材料に使う**ので、
 * `tool` の記録自体は残す。サイドバーの「いま何をしているか」は別に `runningTools` /
 * `finishedTools` を直接読むので、ここで両方に配っても重複にはならない。
 */
export function mainViewEntries(state: SessionState): readonly MainViewEntry[] {
  const settled = state.records.flatMap(toMainViewEntries)
  return state.partialUtterance === ""
    ? settled
    : [...settled, { kind: "detail", markdown: state.partialUtterance }]
}

/**
 * 時系列の記録を、やり取り（ターン）ごとにまとめ、直近 {@link MAX_MAIN_VIEW_TURNS} 件へ絞る。
 * **昇順（古い→新しい）で返す**（並べ替え・タブのラベル付けは呼び出し側 `src/browser/features/main-view/` の仕事）。
 *
 * `turnInProgress` はそのときの `SessionState` の同名のフィールドで、**確定していない本文を
 * 出さない**ために要る（{@link hideUnsettledReport}）。
 */
export function mainViewTurns(
  entries: readonly MainViewEntry[],
  turnInProgress: boolean,
): readonly MainViewTurn[] {
  const turns = groupIntoTurns(entries).slice(-MAX_MAIN_VIEW_TURNS)
  return turns
    .map((turn, index) =>
      turnInProgress && index === turns.length - 1 ? hideUnsettledReport(turn) : turn,
    )
    .map((turn) => keepOnlyInterimReports(turn))
    .map((turn) => markSupersededSteps(turn))
    .map((turn) => limitTurnEntries(turn))
}

/**
 * `SessionRecord` 1件をメインビューに出す形へ変える（出さないものは空で返す）。
 *
 * **`speech` は落とす**（セリフは吹き出しだけに出し、レポートに混ぜない。
 * docs/requirements.md 4.2）。落としても `request` の数と順番は変わらないので、
 * {@link groupIntoTurns} が振るターンの通し番号はずれない。
 *
 * **`tool` は `toolUseId` / `nested`（突き合わせにしか使わない内部の
 * 付随情報）を落とす**（メインビューの部品が見てよいのは名前・入力・結果だけ。境界で形を絞る。
 * docs/coding-standards.md「型を迂回するキャストを使わない」と同じ考えで、余分なフィールドを
 * 暗黙に持ち越さない）。
 */
function toMainViewEntries(record: SessionRecord): readonly MainViewEntry[] {
  if (record.kind === "speech") {
    return []
  }
  // `request` / `detail` / `question` は `MainViewEntry` と同じ形なのでそのまま通す。
  if (record.kind !== "tool") {
    return [record]
  }
  return [{ kind: "tool", name: record.name, input: record.input, result: record.result }]
}

/**
 * 組み立て中のやり取り。`nextStepId` は、そのやり取りの中で次に作るステップへ振る番号
 * （`limitTurnEntries` で古いステップを落とす前に、作られた順で振り切る。落としたあとに
 * 振り直すと `MainViewStep.id` が「番号がずれない」約束を満たせなくなる）。
 */
type PendingTurn = {
  readonly id: number
  readonly request: string | undefined
  steps: MainViewStep[]
  nextStepId: number
}

/** 時系列に積まれた記録を、利用者の依頼を境目にしてやり取りごとへまとめる。 */
function groupIntoTurns(entries: readonly MainViewEntry[]): readonly MainViewTurn[] {
  const turns: MainViewTurn[] = []
  let current: PendingTurn | undefined = undefined

  const flush = () => {
    if (current !== undefined) {
      turns.push({
        id: current.id,
        request: current.request,
        steps: current.steps,
        droppedCount: 0,
      })
    }
  }

  for (const entry of entries) {
    if (entry.kind === "request") {
      flush()
      current = { id: turns.length, request: entry.text, steps: [], nextStepId: 0 }
      continue
    }

    current ??= { id: 0, request: undefined, steps: [], nextStepId: 0 }
    if (entry.kind === "detail") {
      current.steps.push({
        id: current.nextStepId++,
        report: entry.markdown,
        interim: false,
        superseded: false,
        firstLine: undefined,
        actions: [],
      })
      continue
    }

    const step = current.steps.at(-1)
    // レポートより前に起きたことは、レポートを持たないステップにまとめる。
    current.steps =
      step === undefined
        ? [
            {
              id: current.nextStepId++,
              report: undefined,
              interim: false,
              superseded: false,
              firstLine: undefined,
              actions: [entry],
            },
          ]
        : [...current.steps.slice(0, -1), { ...step, actions: [...step.actions, entry] }]
  }
  flush()

  return turns
}

/**
 * **ターンが進行中のあいだ、いちばん新しいやり取りの最後のステップの本文は、まとまった資料
 * （{@link isInterimReport}）と判定できたときだけ出す**（`docs/requirements.md` 4.2。
 * 2026-09-20 決定。それまでの「出してから消す」を覆したもの）。
 *
 * 実況か資料かは「あとにツールが続くか」で決まるので、**流れている時点では確定しない**。
 * 確定しないものを出してから消すと、前の中間レポートの `superseded`（{@link markSupersededSteps}）が
 * true→false へ反転し、`<details>` が畳まれてから開き直してチラつく（2026-09-20 の指摘）。
 * 確定するまで出さなければ、**一度出した本文は二度と消えない**ので反転も起きない。
 *
 * **最後のステップだけを見れば足りる。** `tool` の記録は `groupIntoTurns` が
 * `current.steps.at(-1)` にしか足さないので、最後でないステップは二度と `tool` を得ず、
 * {@link keepOnlyInterimReports} に本文を落とされることがない——つまり**最後以外の本文は
 * もう確定している**。
 *
 * 代わりに、構造の印が無く短い**最終レポート**はターンが終わるまで出ない（終わった瞬間に出る）。
 * 流れて見える感じを失うのはその範囲だけで、長い本文・構造を持つ本文は今までどおり閾値を
 * 越えた時点から流れる。
 */
function hideUnsettledReport(turn: MainViewTurn): MainViewTurn {
  const last = turn.steps.at(-1)
  if (last === undefined || last.report === undefined || isInterimReport(last.report)) {
    return turn
  }
  return { ...turn, steps: [...turn.steps.slice(0, -1), { ...last, report: undefined }] }
}

/**
 * **あとにツール呼び出しが続いた本文のうち、実況だけを落とす**（`docs/requirements.md` 4.2。
 * 2026-09-16 決定）。「まず読むね」「次はテスト」のような実況は、ツールを呼ぶ合図としてしか
 * 書かれておらず、レポートとして読むものではない。**規約の条項（`src/server/core/report-notation.ts` の
 * 「前置きと締めを書かない」）では抑えきれなかった**ので、tsukumo の側で落とす
 * （4.2「なぜテキストの規約をやめたか」と同じ立場）。
 *
 * **まとまった資料（{@link isInterimReport}）は中間レポートとして残す**（同日にユーザーの指摘
 * 「枠組みされたまとまった資料がたまに出てくる」で、判定の材料を「ツールが続いたか」だけから
 * 「ツールが続いた**かつ**まとまっていない」の2条件へ狭めた）。
 *
 * **質問（`question`）はツールに数えない。** 質問は利用者が答える手前で止まる場所なので、
 * その直前に書いた本文は読むためのレポートとして残す（中間レポートにもしない）。
 *
 * **ツールを1つも呼ばないターンでは何も落ちない**（どのステップにも `tool` が続かない）。
 * 書きかけ（`partialUtterance`）は常に最後のステップなので、ここには掛からない——**出すか
 * どうかは先に {@link hideUnsettledReport} が決めている**（2026-09-20 に「出してから消す」＝
 * 2026-09-16 決定を覆した）。
 */
function keepOnlyInterimReports(turn: MainViewTurn): MainViewTurn {
  return {
    ...turn,
    steps: turn.steps.map((step) => {
      if (step.report === undefined || !step.actions.some((action) => action.kind === "tool")) {
        return step
      }
      return isInterimReport(step.report)
        ? { ...step, interim: true }
        : { ...step, report: undefined }
    }),
  }
}

/**
 * まとまった資料の印。**行頭に現れるブロックの記法だけ**を見る（見出し・表の行・箇条書き・
 * 番号付き・コードフェンス・引用・行頭の HTML タグ）。インラインの記法（`` `code` `` や
 * `**強調**`）を印にしないのは、実況もふつうにファイル名を `` ` `` で囲んで書くため。
 */
const STRUCTURE_MARK = /^\s*(?:#{1,6}\s|\||[-*+]\s|\d+[.)]\s|```|~~~|>|<[a-zA-Z/])/

/**
 * 中間レポートと認める下限。印が1つ付いただけの1〜2行（「- まず読むね」）は資料ではないので、
 * **行数か文字数のどちらか**を満たすことも求める。文字数のほうは、見出し1行＋長い段落のように
 * 行数が伸びない資料を拾うためにある。
 */
const MIN_INTERIM_REPORT_LINES = 3
const MIN_INTERIM_REPORT_LENGTH = 200

/**
 * 「まとまった資料」か（＝中間レポートとして残すか）。**構造の印を持ち、かつ短くない**ものだけを
 * 資料と見なす。**迷ったら落とす側に倒してある**（印が無ければ長くても落とし、印があっても
 * 短ければ落とす）: 実況が残るとチラつきの指摘がそのまま戻るのに対し、これまでは同じ本文を
 * すべて落としていたので、残す側を絞っても以前より悪くはならない。
 */
function isInterimReport(markdown: string): boolean {
  const lines = markdown.split("\n").filter((line) => line.trim() !== "")
  return (
    lines.some((line) => STRUCTURE_MARK.test(line)) &&
    (lines.length >= MIN_INTERIM_REPORT_LINES ||
      markdown.trim().length >= MIN_INTERIM_REPORT_LENGTH)
  )
}

/**
 * 各ステップに「自分より後ろに `report` を持つステップがあるか」（`superseded`）と、
 * `report` の先頭行（`firstLine`）を立てる。**`interim` の判定そのもの（`keepOnlyInterimReports`）
 * は変えない**——このタスク（2026-09-16）で足すのは「畳むかどうか」の材料だけ。
 * `interim` かどうかを問わず全ステップに立てるのは、位置関係だけで決まる値なので
 * 中間レポート限定にする理由が無いため（畳むかどうかの判定側で `interim` と組み合わせる。
 * `src/browser/features/main-view/turn.tsx`）。
 */
function markSupersededSteps(turn: MainViewTurn): MainViewTurn {
  const { steps } = turn.steps.reduceRight<{
    steps: readonly MainViewStep[]
    followedByReport: boolean
  }>(
    (acc, step) => ({
      steps: [
        {
          ...step,
          superseded: acc.followedByReport,
          firstLine: step.report === undefined ? undefined : extractFirstLine(step.report),
        },
        ...acc.steps,
      ],
      followedByReport: acc.followedByReport || step.report !== undefined,
    }),
    { steps: [], followedByReport: false },
  )
  return { ...turn, steps }
}

// 畳んだ `<summary>` に出す先頭行の長さの上限。「中間レポート」のラベルと並べる短い添え書きなので、
// `summarizeToolInput` の1行要約（120字）より短く抑える。
const MAX_STEP_SUMMARY_LENGTH = 40

/**
 * 本文の先頭行。空行は読み飛ばす。**見出し（`# `〜`###### `）ならマークを落としてその語だけ**を
 * 返す（複数畳まれたときに「## 調べた結果」ではなく「調べた結果」の方が読みやすいため）。
 * 見出し以外の行（表・箇条書き・引用・行頭の HTML タグなど）は**マークを落とさずそのまま**返す
 * ——「見出しならその語」以上の踏み込みはせず、迷ったところは変えない側に倒す。
 */
function extractFirstLine(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((raw) => raw.trim())
    .find((trimmed) => trimmed !== "")
  if (line === undefined) {
    return ""
  }

  const heading = /^#{1,6}\s+(.*)$/.exec(line)
  const text = heading?.[1] === undefined ? line : heading[1].trim()
  return text.length <= MAX_STEP_SUMMARY_LENGTH
    ? text
    : `${text.slice(0, MAX_STEP_SUMMARY_LENGTH)}…`
}

/**
 * 1つのやり取りが**画面に出す**記録を上限まで切り詰める。落とすのは**古いほう**
 * （今回の続きを残す）。数えるのは画面に出るものだけなので、**ツールを何十件呼んでも
 * 落ちない**（2026-09-17。{@link MAX_MAIN_VIEW_ENTRIES}）。
 */
function limitTurnEntries(turn: MainViewTurn): MainViewTurn {
  const counts = turn.steps.map(shownEntryCount)
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (total <= MAX_MAIN_VIEW_ENTRIES) {
    return turn
  }

  const kept: MainViewStep[] = []
  let remaining = MAX_MAIN_VIEW_ENTRIES
  for (const [index, step] of [...turn.steps].reverse().entries()) {
    const count = counts[counts.length - 1 - index] ?? 0
    if (count > remaining) {
      break
    }
    kept.unshift(step)
    remaining -= count
  }

  return { ...turn, steps: kept, droppedCount: total - (MAX_MAIN_VIEW_ENTRIES - remaining) }
}

/**
 * そのステップが画面に出す記録の件数。**`src/browser/features/main-view/turn.tsx` が描くもの**
 * （レポートと質問の記録）だけを数え、**ツールの実行は数えない**
 * （メインビューに出ないため。2026-09-16 決定。`docs/requirements.md` 4.2）。
 */
function shownEntryCount(step: MainViewStep): number {
  return (
    (step.report === undefined ? 0 : 1) +
    step.actions.filter((action) => action.kind === "question").length
  )
}
