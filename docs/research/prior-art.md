# 先行事例の調査（2026-09-08）

`docs/requirements.md` 6章から移した（2026-09-21。正典には「空いている穴」だけを残す。移した
理由は同ファイル「正典に残すもの・`docs/history/` へ移すもの」）。**同じものを作らないため**の記録。

**2026-09-08 時点の調査なので、いまも同じとは限らない。**

- **`/buddy`** — Claude Code 本体の companion 機能。バイナリ v2.1.263 に `companion_intro`
  という内部リマインダ種別が実在するのを確認済み。入力欄の横に ASCII ペットが住み、
  10秒おきに吹き出しで喋る。18種、ユーザーIDから決定論的に生成される
- **claude-code-mascot-statusline**（TeXmeijin） — statusline に半角ブロックのピクセル絵
  マスコットを出す。11個の hook イベントで表情9状態、context 消費で毛色が赤くなる。
  **キャラパックが YAML/JSON で差し替え可能**。
  <https://github.com/TeXmeijin/claude-code-mascot-statusline>
- **VOICEVOX / ずんだもん hooks** — Stop hook で応答を読み上げる。音声のみで、絵は出ない

**どれも埋めていない穴**: 上の3つはいずれも**本体の出力に絵か音を添える**もので、出力そのものの
見せ方を組み替えてはいない。
