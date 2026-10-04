# 診断ログの流れの形を zod の schema の1か所で持ち、`DiagnosticEntry` の型をそこから導いて、流れを1つ足すたびに型と schema の2か所を直さなくて済むようにする（振り返り: GH-335）

- 札: 黄 構造の重さ（2回目）
- 根: diagnostic-entry-dual-definition
- 根拠: GH-335 は `swallowed-failure` の流れを1つ足すのに、`src/shared/diagnostic/diagnostic-record.ts` の `DiagnosticEntry` の合併と `src/server/diagnostic/adapter/diagnostic-log.ts` の `diagnosticRecordSchema` の両方に同じ鍵を書いた（タスクの `## 注意` も「両方に足す」と指示していた）。同じ日の GH-336 も `browser-error` を同じ2か所に足し、2つを並べて取り込むとこの2ファイルとその往復テストで衝突して、メインが手で解いた
- 出し先: 流れごとの schema を `shared` 側に1つずつ置き、`DiagnosticEntry` を `z.infer` で導いて、adapter はそれに `v` を足すだけにするタスク。次に流れを足すときは schema の1か所と `scripts/diagnostic.ts` の1行の形だけで済む。2回目の札なので、`docs/coding-standards.md` の外部由来の値を検証する節に「同じ形を型と schema で二重に書かない」を足すことも同じタスクで検討する
