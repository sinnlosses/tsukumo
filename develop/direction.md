# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **並行の作業ツリーを前提に「## タスク運用」節の記述を見直す**（振り返り: T-371, T-372, T-381）
  - 根拠: (1) CLAUDE.md 278行目は「どちらのマージも fast-forward になり merge commit は出ない」と書いているが、この範囲の40コミットのうち11件が `Merge branch 'main' into tsukumo-2` / `into tsukumo-3` のマージコミット。1本の作業ツリーでしか成り立たない前提で、相手が先に `main` を進めると手順1の取り込みがそのまま `main` に乗る。(2) CLAUDE.md 292行目は「検証コマンドは並行して打ってよい（自分の作業ツリーで走るので、相手の作業中の変更を拾わない）」と書いているが、**ポートは作業ツリーで分かれない**。T-372 を合流したあとの `bun run check` で `test/cli.test.ts` の「既定ポートから上限まで全部塞がっていると、試した範囲を伝えて終了コード1で終わる」が20秒で時間切れ（`result.status` が 1 でなく 0 = CLI がポートを掴めてしまった）。単体で走らせると4 pass、全体を再実行すると 1369 pass で、作業ツリーは3本動いていた
  - 出し先: CLAUDE.md「## タスク運用」の「1サイクルの形」（マージコミットが出る前提に書き換えるか、手順1を rebase に変えるかの判断）と、その下の並行の箇条書き（ポートは分かれないという例外を足す）。テスト側を直すなら「`test/cli.test.ts` が掴むポート帯を `TSUKUMO_VIEW_PORT` 起点にずらせるようにする」タスク

- **docs/design.md 5章に残る型の写しを、4章と同じ形（型定義への参照）にする**（振り返り: T-372）
  - 根拠: T-372 で4章の写しを外したとき、腐っていた写しが4つ出た（実物に無い `new-session` と `session-started`、旧名の `MAX_SESSION_VIEW_TURNS` と `MAX_DISPATCH_TEXT_LENGTH`）。同じ形の写しが5章に3つ残っていて、うち「server.ts と session-socket.ts（adapter）」の経路の表は**すでにドリフトしている**（`GET /token-usage?t=<起動トークン>&days=<日数>` が実装にあるのに表に無い）。残る2つは `SessionHost` のコードブロックと `config.ts` の環境変数の表で、後者だけは `config.ts` 側が design.md を正典と明記しているので向きが逆
  - 出し先: タスク（5章の「session-manager.ts（core）」と「server.ts と session-socket.ts（adapter）」を参照に置き換える。`config.ts` の表は正典の向きを決めてから）。あわせて、`protocolVersion` が違えばブラウザが「ページを読み込み直してください」を出すという記述が design.md 4.4 と `src/shared/frame.ts` の両方にあるのに、`src/browser/` は `PROTOCOL_VERSION` を一度も読んでいない（実装が無い）ので、これは別のタスク
