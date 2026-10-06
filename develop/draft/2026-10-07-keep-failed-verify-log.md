# `tw verify` が落ちた回のログを、打ち直しで上書きせずに残す（振り返り: GH-421）

- 札: 黄 揺れ（15回目）
- 根: verify-log-overwritten
- 根拠: GH-421 の段3で `tw verify` が `markdown-mark-concealment.test.ts` の1件で落ち、3回目の打ち直しで通った。ログは `.tw/task-verify.log` の1本だけで打つたびに上書きされるため、受け入れの時点では落ちた回の失敗の文が残っておらず、揺れの原因を調べられなかった（同じ札は過去14回）
- 出し先: claude-skills の `tw verify` を、落ちた回のログを `.tw/task-verify.failed-<時刻>.log` のように別名で残す形にするタスク（直近の数本だけ残す）。揺れの札を書くときに、そのログの失敗の行を根拠に引けるようにする
