// メインビューに出す形（`MainViewEntry`）と、それを**やり取り（ターン）ごとにまとめる**
// 「決める」ロジック。**セッションの姿（`session-state.ts`）から導くだけ**で、状態は持たない。
//
// `groupIntoTurns` / `limitTurnEntries` はもとは1つのファイルにまとまっていた（移行の段6で
// HTML の組み立てが `src/browser/features/main-view/` へ移るのに合わせ、判断そのものはサーバ・ブラウザ
// どちらでも同じ結果になる `shared` へ残した。段の記録は
// `docs/history/decision.md`「design.md 12. 移行の段階」）。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { isBlankText } from "./blank-text.ts"
import { type RecordedPromptImage } from "./prompt-image.ts"
import { type Question, type QuestionAnswer } from "./question.ts"
import { tidyReportBody } from "./report-tidy.ts"
import {
  MAX_SESSION_STATE_TURNS,
  type SessionRecord,
  type SessionState,
  type ToolRunStatus,
} from "./session-state.ts"
import { splitIntoTurns, type TurnRest, turnIdOf } from "./turn.ts"

/**
 * 出すやり取りの数。札の頭（前後ボタン・一覧）で遡るので、横並びのタブの幅に収める制約は無い。
 *
 * **値は {@link MAX_SESSION_STATE_TURNS}.work から導く**（メインビューの窓が記録の窓を超える
 * ことは無い、という関係を導出で保つ。別々の定数として持つと、どちらかだけを直したときに
 * 関係が黙って崩れる）。
 */
export const MAX_MAIN_VIEW_TURNS = MAX_SESSION_STATE_TURNS.work

/**
 * 1つのやり取りの中で**画面に出す**記録の上限。超えた分は**古いほうから**落とし、件数だけを残す
 * （やり取りの境界を優先する）。
 *
 * **数えるのは実際に画面へ出るもの（レポートと質問の記録）だけ**（{@link shownEntryCount}）。
 * ツールの実行をメインビューから外したあとも、この上限だけはツールの記録を
 * 数え続けていた: 過去のやり取り720件で測ると22件（3.1%）が上限に当たり、うち16件は
 * **画面から何も消えていないのに**「これ以前の n 件は省略した」（最大62件）を出し、残り6件は
 * レポート1件を出してから消していた（実測）。画面に出るものだけを数えると1つの
 * やり取りの最大は6件（中位数1・p99で4件）で、この値には当たらない——**落とすための値ではなく、1つのやり取りが際限なく
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
  | {
      readonly kind: "request"
      /** そのターンの通し番号（`SessionState.nextTurnId` が振ったもの）。 */
      readonly turnId: number
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
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
      readonly status: ToolRunStatus
    }
  | { readonly kind: "detail"; readonly markdown: string }
  /**
   * `report` ツールで受け取ったレポート。引数はここで1つの本文に組んである
   * （{@link reportMarkdown}）。`detail` と分けてあるのは、このレポートがあるやり取りでは
   * 本文（`detail`）を出さないため（{@link selectToolReports}）。
   */
  | { readonly kind: "report"; readonly markdown: string }

export type MainViewToolRun = Extract<MainViewEntry, { readonly kind: "tool" }>
export type MainViewQuestion = Extract<MainViewEntry, { readonly kind: "question" }>

/** ステップの中で起きたこと。ツールの実行か、キャラクターからの質問。 */
export type MainViewAction = MainViewToolRun | MainViewQuestion

/**
 * 1ステップ＝レポート1件と、それに続く出来事。
 *
 * `body` は画面に出す本文（{@link MainViewStepBody}）。
 *
 * `interim` は、その本文が**中間レポート**（`report` ツールの最後でない呼び出し。
 * `selectToolReports`）かどうか。`body` が `none` のときは常に false。
 * 見分けを付けて描くのは `src/browser/features/main-view/turn.tsx` の仕事で、判定はここに置く。
 *
 * `superseded` は、**自分より後ろに本文を持つステップがあるか**（`markSupersededSteps`）。
 * 中間レポートが何件も積むと見通しが悪い問題に対する材料で、
 * `interim && superseded` のときだけ `turn.tsx` が畳んで描く。本文を持たないステップでも
 * 立つが、畳むかどうかの判定に使うのは中間レポートだけ。
 *
 * `final` は、その本文が**最終レポート**（そのやり取りで最後の、中間でない本文）かどうか
 * （`markFinalReport`）。ラベルを載せる印（`.main-step.is-final`）で、書き上げる演出を掛ける
 * 相手を選ぶのにも使う（`src/browser/features/main-view/turn.tsx`）。**ラベルを出すかどうかは
 * これだけでは決まらない**（`MainViewTurn.hasInterimReport` と組み合わせる）。
 *
 * `id` は**追加されても番号がずれない**ように、そのやり取りの中で作られた順に先頭から数えた
 * 通し番号（`MainViewTurn.id` と同じ考え方）。`limitTurnEntries` が上限を超えた分を古いほうから
 * 落としても、残ったステップの `id` は変わらない（`groupIntoSteps` で、`limitTurnEntries` より
 * 前に振る）。`src/browser/features/main-view/turn.tsx` の `<Step>` の `key` に使う。**配列の添字を `key` に
 * すると**、古いステップが落ちて残りの添字が1つずつ前へずれた瞬間に、React が別のステップの
 * DOM を使い回して描き直してしまう（`<details>` の `open` のような制御されていない DOM の状態が
 * 別のステップへ乗り移って見える）。
 */
export type MainViewStep = {
  readonly id: number
  readonly body: MainViewStepBody
  readonly interim: boolean
  readonly superseded: boolean
  readonly final: boolean
  readonly actions: readonly MainViewAction[]
}

/**
 * ステップの本文。本文が無い（レポートより前に起きたことをまとめたステップか、出さないと決めた
 * 本文）なら `none`。`firstLine` は `report` の先頭行で、畳んだときの `<summary>` に出す
 * （`extractFirstLine`）。
 */
export type MainViewStepBody =
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly report: string; readonly firstLine: string }

const NO_BODY = { kind: "none" } as const satisfies MainViewStepBody

/**
 * やり取りの頭に出す依頼。**文面と、添えた画像の控えで1つ**（`docs/requirements.md` 4.10。
 * 控えは見出しの下に並ぶ）。添えていなければ `images` は空。
 */
export type MainViewRequest = {
  readonly text: string
  readonly images: readonly RecordedPromptImage[]
}

/**
 * 利用者の依頼1件と、それ以降のステップ。`request` が undefined なのは、最初の依頼より前の記録
 * （セッションの途中から追い始めたときに起こる）。`id` は**追加されても番号がずれない**ように
 * 先頭から数えた通し番号で、タブの選択を保つのに使う（`src/browser/features/main-view/main-view.tsx`）。
 */
export type MainViewTurn = {
  readonly id: number
  readonly request: MainViewRequest | undefined
  readonly steps: readonly MainViewStep[]
  /**
   * このやり取りに中間レポートが1つ以上あるか（`markFinalReport`）。**最終レポートのラベルを
   * 出す条件**で、本文が1つしか無いやり取りでは「最終」が何も区別しないので出さない
   * （`src/browser/features/main-view/turn.tsx`）。
   */
  readonly hasInterimReport: boolean
  /** 上限を超えて落とした**画面に出す**記録の件数。0 のときは何も落としていない。 */
  readonly droppedCount: number
}

/**
 * メインビューに渡す記録。**書きかけの本文を末尾に足す**ので、`browser/main-view/` の部品はそのまま
 * リアルタイムの表示になる（完成した本文が来た時点で確定した記録の側へ移る）。
 *
 * **`tool` の記録も渡す**（ステップの `actions` に入る）が、`src/browser/features/main-view/turn.tsx` は
 * そこから描かない（`docs/display.md` 4.2）。帯の「いまの作業」は別に `src/shared/turn-step.ts` の
 * `currentTurnSteps` が同じ記録から直接導くので、ここで両方に配っても重複にはならない。
 */
export function mainViewEntries(state: SessionState): readonly MainViewEntry[] {
  const settled = state.records.flatMap(toMainViewEntries)
  return isBlankText(state.partialUtterance)
    ? settled
    : [...settled, { kind: "detail", markdown: state.partialUtterance }]
}

/**
 * 時系列の記録を、やり取り（ターン）ごとにまとめ、直近 {@link MAX_MAIN_VIEW_TURNS} 件へ絞る。
 * **昇順（古い→新しい）で返す**（並べ替え・タブのラベル付けは呼び出し側 `src/browser/features/main-view/` の仕事）。
 *
 * `turnUnsettled` は**いちばん新しいやり取りの締めの本文がまだ伸びうるか**で、確定していない
 * 本文を出さないために要る（{@link selectLastText} / {@link selectToolReports}）。**`SessionState.turn` が
 * `running` かどうかそのものではない**——背景の仕事を待って黙ると `turn-finished` が来て
 * `finished` に落ちるが、
 * 通知で再開したぶんの本文はそこから伸びる（作るのは `browser/stores/main-view-turn.ts`）。
 */
export function mainViewTurns(
  entries: readonly MainViewEntry[],
  turnUnsettled: boolean,
): readonly MainViewTurn[] {
  const turns = groupIntoTurns(entries).slice(-MAX_MAIN_VIEW_TURNS)
  return turns
    .map(({ turn, toolReportIds }, index) => {
      // 動いているのはいちばん新しいやり取りだけで、それ以外の本文はもう確定している。
      const settled = !turnUnsettled || index !== turns.length - 1
      return toolReportIds.length === 0
        ? selectLastText(turn, settled)
        : selectToolReports(turn, toolReportIds, settled)
    })
    .map((turn) => markSupersededSteps(turn))
    .map((turn) => markFinalReport(turn))
    .map((turn) => limitTurnEntries(turn))
}

/**
 * `SessionRecord` 1件をメインビューに出す形へ変える（出さないものは空で返す）。
 *
 * **`speech` は落とす**（セリフは吹き出しだけに出し、レポートに混ぜない。
 * docs/display.md 4.2）。ターンの通し番号は `request` の記録が持っているので、
 * 何を落としても番号はずれない。
 *
 * **`compact-boundary` も落とす**（`docs/chat-mode.md` 4.9「記憶の圧縮と忘却」）。
 * 圧縮の区切りは雑談のログ（`shared/chat-log.ts`）だけに出し、**仕事のメインビューには出さない**。
 *
 * **`tool` は `toolUseId` / `nested`（突き合わせにしか使わない内部の
 * 付随情報）を落とす**（メインビューの部品が見てよいのは名前・入力・結果だけ。境界で形を絞る。
 * docs/coding-standards.md「型を迂回するキャストを使わない」と同じ考えで、余分なフィールドを
 * 暗黙に持ち越さない）。
 */
function toMainViewEntries(record: SessionRecord): readonly MainViewEntry[] {
  if (record.kind === "speech" || record.kind === "compact-boundary") {
    return []
  }
  // `request` は時刻（雑談のログだけが読む）を落として通す。仕事のメインビューには時刻を出さない。
  if (record.kind === "request") {
    return [{ kind: "request", turnId: record.turnId, text: record.text, images: record.images }]
  }
  if (record.kind === "report") {
    return [{ kind: "report", markdown: reportMarkdown(record) }]
  }
  // `detail` / `question` は `MainViewEntry` と同じ形なのでそのまま通す。
  if (record.kind !== "tool") {
    return [record]
  }
  return [{ kind: "tool", name: record.name, input: record.input, status: record.status }]
}

/**
 * `report` の引数を、**`conclusion` → `body` → `favor` の順**に1つの本文へ組む
 * （`docs/glossary.md`「report ツール」）。`favor` はレポートの記法の「お願い」の塊で包むので、本文に書いた
 * お願いと同じ見た目になり、**サニタイズも記法の解釈もテキストの本文と同じ経路**を通る。
 * HTML の中に Markdown を入れるので、塊の内側の前後に空行を空ける（記法の規約と同じ）。
 * 空の `body` / `favor` は塊ごと置かない。
 *
 * **`body` はここで整形する**（{@link tidyReportBody}。記録は引数のまま持ち、描くたびに導く）。
 */
function reportMarkdown(report: Extract<SessionRecord, { readonly kind: "report" }>): string {
  return [
    report.conclusion,
    tidyReportBody(report),
    isBlankText(report.favor) ? "" : `<div class="note note-favor">\n\n${report.favor}\n\n</div>`,
  ]
    .filter((part) => !isBlankText(part))
    .join("\n\n")
}

/**
 * まとめたやり取りと、その中で `report` ツールから来たステップの id（呼ばれた順）。**id の並びは
 * 描く側へ渡さない**（どの本文を出すかを決めるまでの材料で、決めたあとは本文の有無と印に畳まれる）。
 */
type GroupedTurn = {
  readonly turn: MainViewTurn
  readonly toolReportIds: readonly number[]
}

/**
 * 時系列に積まれた記録を、利用者の依頼を境目にしてやり取りごとへまとめる（割るのは
 * `shared/turn.ts` の {@link splitIntoTurns}）。**割るのは表示の形に変えたあと**なので、
 * 依頼より前のまとまりは、メインビューに出す記録（セリフと圧縮の区切りを落としたあと）が
 * 1件でもあるときだけできる。
 */
function groupIntoTurns(entries: readonly MainViewEntry[]): readonly GroupedTurn[] {
  return splitIntoTurns(entries).map((turn) => {
    const { steps, toolReportIds } = groupIntoSteps(turn.records)
    return {
      turn: {
        id: turnIdOf(turn),
        request:
          turn.kind === "pre-request"
            ? undefined
            : { text: turn.request.text, images: turn.request.images },
        steps,
        hasInterimReport: false,
        droppedCount: 0,
      },
      toolReportIds,
    }
  })
}

/**
 * 1つのやり取りの中のステップと、`report` ツールから来たステップの id（{@link GroupedTurn}）。
 * **ステップの id は作られた順の通し番号**（`MainViewStep.id`。`limitTurnEntries` で古い
 * ステップを落とす前に振り切る。落としたあとに振り直すと「番号がずれない」約束を満たせなくなる）。
 */
type GroupedSteps = {
  readonly steps: readonly MainViewStep[]
  readonly toolReportIds: readonly number[]
}

/** やり取り1つぶんの記録（依頼の後ろ）を、本文1件ごとのステップにまとめる。 */
function groupIntoSteps(entries: readonly TurnRest<MainViewEntry>[]): GroupedSteps {
  return entries.reduce<GroupedSteps>(
    ({ steps, toolReportIds }, entry) => {
      const id = steps.length
      if (entry.kind === "detail" || entry.kind === "report") {
        const body = {
          kind: "text",
          report: entry.markdown,
          firstLine: extractFirstLine(entry.markdown),
        } as const satisfies MainViewStepBody
        return {
          steps: [...steps, newStep(id, body, [])],
          toolReportIds: entry.kind === "report" ? [...toolReportIds, id] : toolReportIds,
        }
      }

      const step = steps.at(-1)
      // レポートより前に起きたことは、レポートを持たないステップにまとめる。
      return {
        steps:
          step === undefined
            ? [newStep(id, NO_BODY, [entry])]
            : [...steps.slice(0, -1), { ...step, actions: [...step.actions, entry] }],
        toolReportIds,
      }
    },
    { steps: [], toolReportIds: [] },
  )
}

/** 作ったばかりのステップ。印（`interim` / `superseded` / `final`）はあとのパスが立てる。 */
function newStep(
  id: number,
  body: MainViewStepBody,
  actions: readonly MainViewAction[],
): MainViewStep {
  return { id, body, interim: false, superseded: false, final: false, actions }
}

/**
 * **`report` ツールが1回も呼ばれなかったやり取りの本文を選ぶ**（`docs/display.md` 4.2）。出すのは
 * 最後の本文（空白だけのものは除く）1つだけで、それが最終レポートになる。それより前の本文は、
 * 資料らしい形をしていても出さない（中間レポートは `report` ツールからしか生まれない）。
 *
 * `settled` でないあいだは何も出さない。書きかけは最後のステップへ積まれるので、最後の本文は
 * まだ伸びる途中か、次の本文に席を譲るかもしれない——出してから変わると、書き上げる演出
 * （マウントした時点でしか始まらない。`src/browser/features/main-view/reveal/use-report-reveal.ts`）が
 * 確定した本文に掛からない。
 */
function selectLastText(turn: MainViewTurn, settled: boolean): MainViewTurn {
  const lastId = settled
    ? turn.steps.findLast((step) => step.body.kind === "text" && !isBlankText(step.body.report))?.id
    : undefined
  return {
    ...turn,
    steps: turn.steps.map((step) =>
      step.id === lastId || step.body.kind === "none" ? step : { ...step, body: NO_BODY },
    ),
  }
}

/**
 * **`report` ツールが呼ばれたやり取りの本文を選ぶ**（`docs/glossary.md`「report ツール」）。出すのは `report`
 * から来たステップだけで、**ツールの外に書いた本文は1つも出さない**（推測の
 * {@link selectLastText} は通さない）。**最後の呼び出しが最終レポート、それより前は中間
 * レポート**で、あとに作業が続いたかどうかは見ない。
 *
 * `settled` でないあいだ、**いちばん新しい `report` は出さない**。次の `report` が来れば中間
 * レポートに、来なければ最終レポートになるので、まだ決まっていない——先に出すと、あとから
 * 中間へ変わったときに囲いが反転し、最終へ残ったときも書き上げる演出（マウントした時点でしか
 * 始まらない）が掛からない。{@link selectLastText} が確定まで何も出さないのと同じ理由。
 */
function selectToolReports(
  turn: MainViewTurn,
  toolReportIds: readonly number[],
  settled: boolean,
): MainViewTurn {
  const lastId = toolReportIds.at(-1)
  return {
    ...turn,
    steps: turn.steps.map((step) => {
      if (!toolReportIds.includes(step.id)) {
        return step.body.kind === "none" ? step : { ...step, body: NO_BODY }
      }
      if (step.id !== lastId) {
        return { ...step, interim: true }
      }
      return settled ? step : { ...step, body: NO_BODY }
    }),
  }
}

/**
 * 各ステップに「自分より後ろに本文を持つステップがあるか」（`superseded`）を立てる。**`interim` の判定そのもの（`selectToolReports`）
 * は変えない**——ここで足すのは「畳むかどうか」の材料だけ。
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
      steps: [{ ...step, superseded: acc.followedByReport }, ...acc.steps],
      followedByReport: acc.followedByReport || step.body.kind === "text",
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
 * **最終レポート**（そのやり取りで最後の、中間でない本文）に印を立て、同じやり取りに中間レポートが
 * あるかどうかを畳む。**引くのは1箇所だけ**にして、描く側（`src/browser/features/main-view/turn.tsx`）が
 * 「最後の、中間でない本文」の条件を持たずに済むようにする。
 *
 * 2つに分かれているのは、**地の段とラベルで条件が違う**ため（`docs/screen-design.md` 13.2）:
 * 地は最終レポートなら常に1段上げ、ラベル（「最終レポート」）は中間レポートのあるやり取りだけに
 * 出す——本文が1つしか無いやり取りでは「最終」が何も区別せず、内容を持たない行になる。
 *
 * `interim` の判定（{@link selectToolReports}）も `superseded`（{@link markSupersededSteps}）も
 * 変えない。
 */
function markFinalReport(turn: MainViewTurn): MainViewTurn {
  const finalId = turn.steps.findLast((step) => step.body.kind === "text" && !step.interim)?.id
  return {
    ...turn,
    steps: turn.steps.map((step) => ({ ...step, final: step.id === finalId })),
    hasInterimReport: turn.steps.some((step) => step.interim),
  }
}

/**
 * 1つのやり取りが**画面に出す**記録を上限まで切り詰める。落とすのは**古いほう**
 * （今回の続きを残す）。数えるのは画面に出るものだけなので、**ツールを何十件呼んでも
 * 落ちない**（{@link MAX_MAIN_VIEW_ENTRIES}）。
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
 * （メインビューに出ないため。`docs/display.md` 4.2）。
 */
function shownEntryCount(step: MainViewStep): number {
  return (
    (step.body.kind === "none" ? 0 : 1) +
    step.actions.filter((action) => action.kind === "question").length
  )
}
