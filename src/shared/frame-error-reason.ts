// コマンドを断るときの定型文の表。ほかのファイルを読まない。

/**
 * コマンドを受け付けられなかったときの理由。定型文だけを並べ、依頼の文面や届いた値を混ぜない。
 * 返るのは手続きの応答のエラー（`COMMAND_ERRORS` の `REFUSED`）で、画面は同じ文言を操作子を塞ぐときの説明にも使う。
 */
export const FRAME_ERROR_REASON = {
  unresolvedAnswer: "解決済み、または知らない答え待ち",
  driverFailed: "セッションドライバが受け付けなかった",
  sessionEnded: "会話が終了している",
  characterEditFailed: "キャラクターの見た目を変えられなかった",
  characterCreateFailed: "キャラクターを作れなかった",
  characterDeleteFailed: "キャラクターを消せなかった",
  characterGenerationFailed: "立ち絵から生成できなかった",
  itemEditFailed: "アイテムを変えられなかった",
  sessionDefaultFailed: "新しいセッションの既定を覚えられなかった",
  switchDuringTurn:
    "ターン進行中か委譲中はキャラクターを切り替えられない（中断するか委譲を止めると切り替えられる）",
  sessionSwitchDuringTurn:
    "ターン進行中か委譲中はセッションを切り替えられない（中断するか委譲を止めると切り替えられる）",
  sessionOccupied: "別のウィンドウで使用中のセッションには切り替えられない",
  chatModeSwitchDuringTurn:
    "ターン進行中か委譲中は仕事と雑談を切り替えられない（中断するか委譲を止めると切り替えられる）",
  nudgeDuringTurn: "ターン進行中は話しかけてもらえない（返事を待つ）",
  nudgeOutsideChat: "話しかけてもらえるのは雑談モードのときだけ",
  forgetRememberedLineFailed: "覚えたことを消せなかった",
  forgetRememberedLineOutsideChat: "覚えたことを消せるのは雑談モードのときだけ",
  usageProposalDismissFailed: "提案を見送れなかった",
  usageReviewRunning:
    "見直しか提案の実行が走っている最中は、ほかを始められない（終わるか止めると頼める）",
  usageProposalNotFound: "その提案が見つからない（見直しをやり直すと出てくる）",
  usageReviewInterruptFailed: "見直しを止められなかった",
  openFileFailed: "ファイルを開けなかった",
  achievementReflectionWriting:
    "いま日記を書いている最中は、ほかの日を振り返れない（書き終わると頼める）",
  achievementReflectionUnavailable: "その日の成果が読めない、または振り返る成果が無い",
  welcomeGreetingNotShown: "いま出している迎えの挨拶から組める文ではない",
} as const
