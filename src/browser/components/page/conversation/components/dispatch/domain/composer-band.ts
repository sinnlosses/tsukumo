// 入力欄の上の帯をどれにするかと、空の入力欄の ↑ で移る先を、入力欄の状態から決める。

/**
 * `<textarea>` の上の帯。接続が切れているあいだ・会話が終わったあと・`/clear` に続く文を止めたあと・答え待ち（お伺い）があるあいだ・見えていないお願いがあるあいだ・プロジェクトの設定を読まずに起きた代のあいだだけ出す（この順に先）。
 * お願いは、次の一手の並びが出ているあいだは帯にせず、並びの見出しが持つ。
 * プロジェクトの設定を読まなかった知らせは、狭い画面でもほかの帯が無ければ出す。
 * 答えはメインビューのお伺いのカードで選ぶ（質問ならここに書いて送ってもよい）。
 * `onJump` は「選択肢へ」の口で、お伺いのカードの最初の選択肢へフォーカスを移す。
 */
export type ComposerBand =
  | { readonly kind: "none" }
  | { readonly kind: "inquiry"; readonly text: string; readonly onJump: () => void }
  | {
      readonly kind: "favor"
      readonly text: string
      /** お願いの欄を見える範囲へ送る。 */
      readonly onJump: () => void
    }
  | { readonly kind: "disconnected"; readonly text: string }
  | { readonly kind: "clear-dropped"; readonly text: string }
  | { readonly kind: "ended"; readonly text: string; readonly onRestart: () => void }
  | { readonly kind: "project-settings-skipped"; readonly text: string }

/** 帯と ↑ の移る先を決める入力欄の状態。 */
export type ComposerBandState = {
  readonly linkLost: boolean
  readonly endedReason?: string
  /** `/clear` の続きがあって送らなかった文が、いまの下書きのままか。 */
  readonly clearDropped: boolean
  readonly phone: boolean
  readonly inquiry: "none" | "permission" | "denial" | "question"
  /** お伺いの帯の文言で、誰が聞いているかを言う主語（名前が無いパックでは空）。 */
  readonly askerSubject: string
  readonly favorShown: boolean
  readonly favorWaiting: boolean
  /** 次の一手の並びの元があり、依頼を送って外していないか（帯に譲るかは問わない）。 */
  readonly trayShown: boolean
  /** 次の一手の並びを畳んでいるか。 */
  readonly trayFolded: boolean
  /** いまの代が、作業ディレクトリを Claude Code が信頼していないためにプロジェクトの設定を読まずに起きたか。 */
  readonly projectSettingsSkipped: boolean
}

/** 帯の口が押されたときに呼ぶもの。 */
export type ComposerBandActions = {
  readonly onRestart: () => void
  readonly onInquiryJump: () => void
  readonly onFavorJump: () => void
}

export function composerBand(state: ComposerBandState, actions: ComposerBandActions): ComposerBand {
  if (state.linkLost) {
    return { kind: "disconnected", text: DISCONNECTED_BAND_TEXT }
  }
  if (state.endedReason !== undefined) {
    return {
      kind: "ended",
      text: `会話が終了しました（理由: ${state.endedReason}）。新しく始めると、また頼めます`,
      onRestart: actions.onRestart,
    }
  }
  if (state.inquiry !== "question" && state.clearDropped) {
    return { kind: "clear-dropped", text: CLEAR_DROPPED_BAND_TEXT }
  }
  if (state.phone) {
    return projectSettingsBand(state.projectSettingsSkipped)
  }
  if (state.inquiry !== "none") {
    return {
      kind: "inquiry",
      text: inquiryBandText(state.inquiry, state.askerSubject),
      onJump: actions.onInquiryJump,
    }
  }
  if (state.favorShown && !state.trayShown) {
    return { kind: "favor", text: FAVOR_BAND_TEXT, onJump: actions.onFavorJump }
  }
  return projectSettingsBand(state.projectSettingsSkipped)
}

/** 次の一手の並びを出すか。切断・終了・`/clear` の止め・お伺いの帯が出るあいだは帯に譲る。 */
export function nextStepTrayVisible(state: ComposerBandState): boolean {
  return (
    state.trayShown &&
    !state.linkLost &&
    state.endedReason === undefined &&
    !(state.inquiry !== "question" && state.clearDropped) &&
    state.inquiry === "none"
  )
}

/**
 * 入力欄が空のときの ↑ で移る先。お伺い → 次の一手の並び（開いているとき）→ お願い の順に、最初にあるもの。
 * つながりが切れている・会話が終わった・狭い画面では持たない。
 */
export function upwardTarget(state: ComposerBandState): "inquiry" | "tray" | "favor" | "none" {
  if (state.linkLost || state.endedReason !== undefined || state.phone) {
    return "none"
  }
  if (state.inquiry !== "none") {
    return "inquiry"
  }
  if (nextStepTrayVisible(state) && !state.trayFolded) {
    return "tray"
  }
  return state.favorWaiting ? "favor" : "none"
}

const DISCONNECTED_BAND_TEXT =
  "サーバとつながっていません。送れず、下書きは残してあります。サーバを起こし直したなら、ページを開き直してください"

const CLEAR_DROPPED_BAND_TEXT =
  "/clear のあとの文は捨てられるので、送っていません。/clear だけを送り、続きを書き直してください"

export const FAVOR_BAND_TEXT = "お願いが1件あります"

const PROJECT_SETTINGS_SKIPPED_BAND_TEXT =
  "このフォルダは Claude Code で信頼の確認が済んでいないため、プロジェクトの設定（.claude/ の settings.json・settings.local.json のフックと許可の規則、CLAUDE.md、スキル・サブエージェント・コマンド）を読まずに起動しました。読み込むには、このフォルダで claude を起動して信頼すると答えてから「新規」で始め直してください"

/** `<textarea>` の上の帯の文言。誰が聞いているかを名前で言い、名前が無いパックでは名前を使わずに書く。 */
function inquiryBandText(kind: "permission" | "denial" | "question", subject: string): string {
  switch (kind) {
    case "question":
      return `${subject}質問しています。選択肢から選ぶか、ここに書いて答えられます`
    case "permission":
      return `↓ ${subject}実行の許可を待っています`
    case "denial":
      return "↓ 自動判定が止めた操作があります"
  }
}

/** ほかの帯が無いときの帯。プロジェクトの設定を読まずに起きた代なら、その知らせ。 */
function projectSettingsBand(skipped: boolean): ComposerBand {
  return skipped
    ? { kind: "project-settings-skipped", text: PROJECT_SETTINGS_SKIPPED_BAND_TEXT }
    : { kind: "none" }
}
