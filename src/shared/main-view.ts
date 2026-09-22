// メインビューに出す形（`MainViewEntry`）と、それを**やり取り（ターン）ごとにまとめる**
// 「決める」ロジック。**セッションの姿（`session-state.ts`）から導くだけ**で、状態は持たない。
//
// `groupIntoTurns` / `limitTurnEntries` はもとは1つのファイルにまとまっていた（移行の段6で
// HTML の組み立てが `src/browser/features/main-view/` へ移るのに合わせ、判断そのものはサーバ・ブラウザ
// どちらでも同じ結果になる `shared` へ残した。段の記録は
// `docs/history/decision.md`「design.md 12. 移行の段階」）。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type Question, type QuestionAnswer } from "./question.ts"
import { type SessionRecord, type SessionState } from "./session-state.ts"

/**
 * 出すやり取りの数。もとは5だったが、ユーザーの指定
 * （「2つ前までで良さそう」）で3へ下げ、その後5へ戻した。
 */
export const MAX_MAIN_VIEW_TURNS = 5

/**
 * 依頼で始まっていないまとまりに振る番号。**実在のターンの番号（0以上）とぶつからない値**に
 * する。窓の外へ依頼が落ちたあとの記録・依頼より前に届いた記録が、ここへ入る。
 */
export const PRE_REQUEST_TURN_ID = -1

/**
 * 1つのやり取りの中で**画面に出す**記録の上限。超えた分は**古いほうから**落とし、件数だけを残す
 * （やり取りの境界を優先する）。
 *
 * **数えるのは実際に画面へ出るもの（レポートと質問の記録）だけ**（{@link shownEntryCount}）。
 * ツールの実行をメインビューから外したあとも、この上限だけはツールの記録を
 * 数え続けていた: 過去のやり取り720件で測ると22件（3.1%）が上限に当たり、うち16件は
 * **画面から何も消えていないのに**「これ以前の n 件は省略した」（最大62件）を出し、残り6件は
 * レポート1件を出してから消していた（実測）。画面に出るものだけを数えると1つの
 * やり取りの最大は6件（中位数1・p99で4件。実況を落とす {@link selectShownReports} が
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
  | {
      readonly kind: "request"
      /** そのターンの通し番号（`SessionState.nextTurnId` が振ったもの）。 */
      readonly turnId: number
      readonly text: string
      readonly images: readonly string[]
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
      /** まだ結果が届いていない（作業中の）ツールは undefined になる。 */
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }
  | { readonly kind: "detail"; readonly markdown: string }

export type MainViewToolRun = Extract<MainViewEntry, { readonly kind: "tool" }>
export type MainViewQuestion = Extract<MainViewEntry, { readonly kind: "question" }>

/** ステップの中で起きたこと。ツールの実行か、キャラクターからの質問。 */
export type MainViewAction = MainViewToolRun | MainViewQuestion

/**
 * 1ステップ＝レポート1件と、それに続く出来事。
 *
 * `interim` は、その本文が**中間レポート**（やり取りの締めではないが、まとまった資料なので
 * 残した本文。`selectShownReports`）かどうか。`report` が undefined のときは常に false。
 * 見分けを付けて描くのは `src/browser/features/main-view/turn.tsx` の仕事で、判定はここに置く。
 *
 * `superseded` は、**自分より後ろに `report` を持つステップがあるか**（`markSupersededSteps`）。
 * 中間レポートが何件も積むと見通しが悪い問題に対する材料で、
 * `interim && superseded` のときだけ `turn.tsx` が畳んで描く。`report` を持たないステップでも
 * 立つが、畳むかどうかの判定に使うのは中間レポートだけ。
 *
 * `final` は、その本文が**最終レポート**（そのやり取りで最後の、中間でない本文）かどうか
 * （`markFinalReport`）。ラベルを載せる印（`.main-step.is-final`）で、書き上げる演出を掛ける
 * 相手を選ぶのにも使う（`src/browser/features/main-view/turn.tsx`）。**ラベルを出すかどうかは
 * これだけでは決まらない**（`MainViewTurn.hasInterimReport` と組み合わせる）。
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
 * 別のステップへ乗り移って見える）。
 */
export type MainViewStep = {
  readonly id: number
  readonly report: string | undefined
  readonly interim: boolean
  readonly superseded: boolean
  readonly final: boolean
  readonly firstLine: string | undefined
  readonly actions: readonly MainViewAction[]
}

/**
 * やり取りの頭に出す依頼。**文面と、添えた画像の控えで1つ**（`docs/requirements.md` 4.10。
 * 控えは見出しの下に並ぶ）。添えていなければ `images` は空。
 */
export type MainViewRequest = {
  readonly text: string
  readonly images: readonly string[]
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
 * **`tool` の記録も渡す**（`docs/design.md` 6.1「`<Turn>` = `<RequestHeading>` +
 * `[<Report> | <QuestionRecord>]*`」）が、`src/browser/features/main-view/turn.tsx` はそこから描かない
 * （`docs/requirements.md` 4.2）。**{@link groupIntoTurns} /
 * {@link selectShownReports} が「そのステップにツール呼び出しが続いたか」の材料に使う**ので、
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
 * `turnUnsettled` は**いちばん新しいやり取りの締めの本文がまだ伸びうるか**で、確定していない
 * 本文を出さないために要る（{@link selectShownReports}）。**`SessionState.turnInProgress`
 * そのものではない**——背景の仕事を待って黙ると `turn-finished` が来てそのフィールドは落ちるが、
 * 通知で再開したぶんの本文はそこから伸びる（作るのは `browser/stores/main-view-turn.ts`）。
 */
export function mainViewTurns(
  entries: readonly MainViewEntry[],
  turnUnsettled: boolean,
): readonly MainViewTurn[] {
  const turns = groupIntoTurns(entries).slice(-MAX_MAIN_VIEW_TURNS)
  return (
    turns
      // 動いているのはいちばん新しいやり取りだけで、それ以外の本文はもう確定している。
      .map((turn, index) => selectShownReports(turn, !turnUnsettled || index !== turns.length - 1))
      .map((turn) => markSupersededSteps(turn))
      .map((turn) => markFinalReport(turn))
      .map((turn) => limitTurnEntries(turn))
  )
}

/**
 * `SessionRecord` 1件をメインビューに出す形へ変える（出さないものは空で返す）。
 *
 * **`speech` は落とす**（セリフは吹き出しだけに出し、レポートに混ぜない。
 * docs/requirements.md 4.2）。ターンの通し番号は `request` の記録が持っているので、
 * 何を落としても番号はずれない。
 *
 * **`compact-boundary` も落とす**（`docs/requirements.md` 4.9「記憶の圧縮と忘却」）。
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
  readonly request: MainViewRequest | undefined
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
        hasInterimReport: false,
        droppedCount: 0,
      })
    }
  }

  for (const entry of entries) {
    if (entry.kind === "request") {
      flush()
      current = {
        id: entry.turnId,
        request: { text: entry.text, images: entry.images },
        steps: [],
        nextStepId: 0,
      }
      continue
    }

    current ??= { id: PRE_REQUEST_TURN_ID, request: undefined, steps: [], nextStepId: 0 }
    if (entry.kind === "detail") {
      current.steps.push({
        id: current.nextStepId++,
        report: entry.markdown,
        interim: false,
        superseded: false,
        final: false,
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
              final: false,
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
 * **出す本文を選ぶ**（`docs/requirements.md` 4.2）。本文は3つに分かれ、残すのは前の2つ:
 *
 * - **最終レポート**: そのやり取りの**締めの本文**（最後のステップの本文で、あとにツールが
 *   続いていないもの）。**資料がほかに1つも無いときは中身を問わず残す**——短い返事だけの
 *   ターン（「直しておいたよ」）で本文が空になってしまうため。**資料があるときは実況と同じに
 *   落とし、最後の資料が最終レポートへ繰り上がる**（{@link promotedReportId}）
 * - **中間レポート**: それ以外の本文のうち、まとまった資料（{@link isInterimReport}）。
 *   `interim` を立てて残す
 * - **実況**: それ以外（構造の印が無いか、印があっても短い本文）。落とす。「まず読むね」
 *   「次はテスト」のような実況はツールを呼ぶ合図としてしか書かれておらず、レポートとして読む
 *   ものではない。**規約の条項（`src/server/core/report-notation.ts` の「前置きと締めを書かない」）
 *   では抑えきれなかった**ので、tsukumo の側で落とす（4.2「分離を文章の規約で表す案は
 *   採らない」と同じ立場）
 *
 * **実況かどうかに「あとにツールが続いたか」を使わない**（それまでは
 * ツールが続いた本文だけを落としていた）。`speak` は `speech` になって `tool` の記録にならないので、
 * **本文 → `speak` → 本文 → ツール**という規約どおりの並びでは1つめの実況にツールが1つも付かず、
 * 2つめの本文が始まって「最後のステップ」でなくなった瞬間に**露出したまま最後まで残っていた**
 * （実測。場面 `narration-stuck`）。判定を構造の印1つへ寄せると、この並びでも
 * 実況は一度も出ない。
 *
 * `settled` は**そのやり取りがもう動いていないか**（進行中なのはいちばん新しいやり取りだけ。
 * {@link mainViewTurns}）。**進行中のあいだ、締めの本文は出さない**（「まとまった資料なら
 * 流れている最中でも出す」という例外も外してある）: 書きかけ
 * （`partialUtterance`）は常に最後のステップへ積まれるので、締めの本文はまだ伸びる途中かも
 * しれない。出してしまうと **(1)** 前の中間レポートの `superseded`（{@link markSupersededSteps}）が
 * true→false へ反転して `<details>` が畳まれてから開き直し、**(2)** 書きかけのまま `final` が
 * 立つので、書き上げる演出（`src/browser/features/main-view/report-reveal.ts`）が**始めた時点の
 * DOM しか相手にしない**（実測で、演出が相手にしたのは開始した時点の 74 文字だけ。
 * 最終的な本文 1303 文字の 94% には筆が一度も通っていなかった）。確定してから出せば、一度出した
 * 本文は二度と消えず、囲いも演出の相手も最初から決まる。
 *
 * **締めかどうかは最後のステップだけを見れば決まる。** `tool` の記録は {@link groupIntoTurns} が
 * `current.steps.at(-1)` にしか足さないので、最後でないステップにはもうツールが続かない。
 *
 * 代わりに、**進行中の本文はどれも流れて見えない**（資料はツールが始まった時点で中間レポートと
 * して出て、締めの本文はターンが終わった時点で出る）。中間レポートは出た瞬間に `interim` が
 * 立つので、**囲いは最初から破線**で、あとから反転しない。
 */
function selectShownReports(turn: MainViewTurn, settled: boolean): MainViewTurn {
  const promotedId = settled ? promotedReportId(turn) : undefined
  return {
    ...turn,
    steps: turn.steps.map((step, index) => {
      if (step.report === undefined) {
        return step
      }
      // そのやり取りの締めの本文。終わっていれば最終レポート、動いている最中ならまだ伸びる。
      // **繰り上げが起きたときは実況として落とす**（{@link promotedReportId}）。
      if (index === turn.steps.length - 1 && !hasToolRun(step)) {
        return settled && promotedId === undefined ? step : { ...step, report: undefined }
      }
      // **ツールが続いていない資料は、まだ締めかどうかが決まっていない。** 次の本文が流れ始めた
      // だけで「最後のステップ」から外れるが、その本文が実況で終われば {@link promotedReportId}
      // がこの資料を締めへ繰り上げる。**進行中に中間レポートとして出してしまうと**、繰り上がった
      // 瞬間に「もう画面にある本文」が最終レポートになり、**マウントした時点でしか始まらない
      // 書き上げる演出**（`src/browser/features/main-view/report-reveal.ts`）が二度と掛からない
      // （実測: 資料が中間レポートとして出た 2.2 秒後に締めへ変わり、筆は一度も走らなかった）。
      if (!settled && !hasToolRun(step)) {
        return { ...step, report: undefined }
      }
      return isInterimReport(step.report)
        ? { ...step, interim: step.id !== promotedId }
        : { ...step, report: undefined }
    }),
  }
}

/**
 * 締めの本文が実況でしかないときに、代わりに最終レポートへ繰り上げる資料の id
 * （繰り上げないなら undefined）。
 *
 * **締めの本文を「中身を問わず残す」のは、資料が1つも無いやり取りで本文が空になるのを
 * 防ぐため**（{@link selectShownReports}）。資料がほかにあるなら、その理由は消える。
 * **資料 → `speak` → 「また呼んでください」** という並びで、挨拶のほうが
 * 位置だけで最終レポートの席を取り、中身のある資料が `<details>` に畳まれていた。規約
 * （`src/server/core/report-notation.ts` の「締めを書かない」）で抑えきれない点は、ほかの
 * 実況と同じ（`docs/requirements.md` 4.2「分離を文章の規約で表す案は採らない」）。
 *
 * **繰り上げるのは確定したやり取りだけ**（呼ぶ側が `settled` で絞る）。書きかけの本文は
 * 実況から資料へ育つ途中かもしれず、繰り上げが途中で外れると前の資料の `interim` が
 * true→false へ反転して `<details>` が開き直る。
 */
function promotedReportId(turn: MainViewTurn): number | undefined {
  const closing = turn.steps.at(-1)
  if (closing?.report === undefined || hasToolRun(closing) || isInterimReport(closing.report)) {
    return undefined
  }
  return turn.steps
    .slice(0, -1)
    .findLast((step) => step.report !== undefined && isInterimReport(step.report))?.id
}

/**
 * そのステップのあとにツールの実行が続いたか。**その本文がやり取りの締めかどうか**の判定に使う
 * （{@link selectShownReports}）——ツールが続いていれば、キャラクターはそのあとも作業をしている。
 *
 * **質問（`question`）はツールに数えない。** 質問は利用者が答える手前で止まる場所なので、
 * その直前に書いた本文は締めの本文として扱う（中間レポートにもしない）。
 */
function hasToolRun(step: MainViewStep): boolean {
  return step.actions.some((action) => action.kind === "tool")
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
 * 短ければ落とす）——実況が残るとチラつきの指摘がそのまま戻るのに対し、落としすぎても
 * **締めの本文は必ず残る**（{@link selectShownReports}）ので、やり取りの結論は画面から消えない。
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
 * `report` の先頭行（`firstLine`）を立てる。**`interim` の判定そのもの（`selectShownReports`）
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
 * **最終レポート**（そのやり取りで最後の、中間でない本文）に印を立て、同じやり取りに中間レポートが
 * あるかどうかを畳む。**引くのは1箇所だけ**にして、描く側（`src/browser/features/main-view/turn.tsx`）が
 * 「最後の、中間でない本文」の条件を持たずに済むようにする。
 *
 * 2つに分かれているのは、**地の段とラベルで条件が違う**ため（`docs/design.md` 13.2）:
 * 地は最終レポートなら常に1段上げ、ラベル（「最終レポート」）は中間レポートのあるやり取りだけに
 * 出す——本文が1つしか無いやり取りでは「最終」が何も区別せず、内容を持たない行になる。
 *
 * `interim` の判定（{@link selectShownReports}）も `superseded`（{@link markSupersededSteps}）も
 * 変えない。
 */
function markFinalReport(turn: MainViewTurn): MainViewTurn {
  const finalId = turn.steps.findLast((step) => step.report !== undefined && !step.interim)?.id
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
 * （メインビューに出ないため。`docs/requirements.md` 4.2）。
 */
function shownEntryCount(step: MainViewStep): number {
  return (
    (step.report === undefined ? 0 : 1) +
    step.actions.filter((action) => action.kind === "question").length
  )
}
