# ツールの一歩に開始・終了の時刻を持たせ、検証の所要時間を tsukumo が機械で測る（T-725 から）

- 札: 正典の不備
- 根拠: T-725 では所要時間をモデルに測らせる条（`REPORT_NOTATION_PROMPT` の条1・`REPORT_CHECKS_DESCRIPTION`）だけを入れた。`tool-started` / `tool-finished`（`src/server/session-driver/core/sdk-message.ts`）はすべてのツール呼び出しを通るが、SDK のメッセージにも `SessionRecord` の `kind: "tool"` にも `TurnStep`（`src/shared/turn-step.ts`）にも時刻が無い。`docs/coding-standards.md`「仕組みをヒューリスティックより優先する」に照らすと機械で測るほうが本命だが、`session-event`・`session-state`・`sdk-message`・`turn-step` の4箇所に跨り1コミットに収まらなかった
- 出し先: 新しいタスク（サーバがツールの一歩の開始・終了を受け取った時刻を記録して `TurnStep` まで運び、サイドバーの一歩か `checks` の帯に所要時間を出す。入ったら条1 の「モデルが測る」を外す）
