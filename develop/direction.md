# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **`components/page/` の下へファイルを移すタスクは、移し先をページの形（`docs/design.md` 2章「ページの形」の
  `domain/`・`hooks/`・`components/<部品>/`）に割った形で本文に書く。** T-693 は「6ファイルを
  `conversation-layout/` へ移す」とだけ書いたため、`split.ts` と `layout-resizer.tsx` を直下に置いて
  `test/architecture.test.ts`「components/page/ の形」に落とされ、下ろし直しで同じファイルを6回直した。
  置き先は `docs/workflow.md`「タスクを書くとき・受け入れるとき」の1項（振り返り: T-693）
- **`report` の本文を型付きの塊で受ける（T-679 の提案 `docs/research/report-block.md` を実装に分けた案。
  承認されたら上から順に登録する）**
  1. **塊の形と組み立てを入れる（見た目は変えない）**（difficulty: opus）。`src/shared/report-block.ts` に
     節と塊の zod の形（提案書4章）と「塊 → Markdown」の組み立て（5章の逃がし方）を置き、記録
     （`session-state.ts`）と `SessionEvent` の `report` を `body` から `sections` に替える。ツールの引数は
     まだ `body` の文字列のままで、`sdk-message.ts` の `reportEvents` が逃げ道の塊1つに畳む（7章）。
     完了条件: 過去のレポートの見た目が変わらないことを E2E と目視で確かめる・`docs/glossary.md` に
     「節」「塊」を足す・`bun run check`
  2. **`report` の引数を `sections` に切り替える**（difficulty: opus。1 に依存）。ツールの schema と各塊の
     説明、検査の入れ替え（8章。型で消える3つを外し、表の行の長さ・節の見出し・逃げ道の中の記法を足す）、
     整形を塊ごとに掛け直す、`REPORT_NOTATION_PROMPT` の表から塊になった行を落とす。MCP に渡る
     `inputSchema` の字数と、文面の縮んだ字数を実物で測って `docs/display.md` 4.2 に書く。完了条件に
     「切り替えの前後で差し戻しの回数と逃げ道の割合を数える（集計値だけ）」を入れる
  3. **塊の使われ方を数える**（difficulty: sonnet。2 に依存）。描くたびに塊の種類ごとの数と逃げ道の中の
     記法の数だけを `$TSUKUMO_HOME` に記録し、集計するスクリプトを置く。足す基準（逃げ道の中の同じ記法が
     直近2週間のレポートの3%以上）と外す基準（4週間0回）を `docs/display.md` に書く（提案書6章）
  4. **T-678（進み具合の印）の `dependencies` に 2 を足す**。本文は T-679 で `progress` の塊として作る形に
     直してある
