# 負荷の高いときだけ落ちる chat-restored-history の E2E を、期待値を撮る時点が落ち着いてから撮る形にする（振り返り: GH-586）

- 観点: 黄 機械の検査
- 根拠: GH-586 の `tw verify` で `test/e2e/chat-restored-history.test.ts` が全 E2E の並列実行のときだけ3回続けて落ち、負荷平均が約15から6.75に下がって通った（単独では4回通る）。差分は雑談のログ末尾で、発話の `aria-pressed` が `true` のはずが `false`、新しいセッションの最初のセリフと日付の行が余計に出ていた。落ちたログは `.tw/local/task-verify.failed-20261010T175300029733Z.log` ほか2件
- 出し先: `test/e2e/scenario-run.ts` の `settleAndMatch` が「落ち着いた」と判断する条件（ログの末尾の押された印・新しいセッションの行が揃うまで待つ）を調べて直すタスク。直せないなら、この場面の期待値の撮り方を負荷に依らない形にする
