# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- 雑談モードでキャラの文字列をコピーできないのでコピーできるようにしたい
- 雑談モードの要約以外の記憶領域(直近の会話の逐次文字列)を16KBから64KBにしたい
- 質問の並びがアルファベット順ではないときがある。上から順にアルファベット順で並べてほしい

## エージェントのドラフト

- **行頭マーカー（`speechMarker`）の経路を撤去する**（2026-09-21 の1問1答 Q8 でユーザーが決定。
  `docs/requirements.md` 4.2 に結論を書いた）。触るのは `src/shared/utterance.ts`・
  `session-state.ts` の畳み込み・`character.ts` / `character-definition.ts` の `speechMarker`・
  各 `character.json`・`characters/README.md`・対応するテスト。根拠は「同梱のどの `persona.md` も
  マーカーを使えと書いていない＝この経路は発火していない」
- **`docs/glossary.md`「output style」の注記が古い**。「SDK で効くかは未確認
  （`docs/requirements.md`「7. 未決事項」）」とあるが、2026-09-11 のスパイクで成立していて
  7章からは消えている。1行直すだけ
