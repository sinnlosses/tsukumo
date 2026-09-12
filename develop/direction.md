# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

T-086（層をディレクトリで表す `src/` の移動）で `docs/architecture.md` の `src/*.ts` パスは
直したが、`docs/requirements.md`（4.2 のレポート記法まわり・4.1 の session-driver 言及・
4.3 の expression.ts 言及など）と `docs/glossary.md`（ホストのポート／アダプタの節）にも
移動前のパス（`src/report-html.ts` / `src/report-notation.ts` / `src/session-driver.ts` /
`src/expression.ts` / `src/host.ts` / `src/orca-host.ts` など）がそのまま残っている。
T-086 の指示は `docs/architecture.md` のパス修正だけを求めていたため対象外にしたが、
本来は同じ理由で直すべきなので、別タスクとして拾ってほしい。
