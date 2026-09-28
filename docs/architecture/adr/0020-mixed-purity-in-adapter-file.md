# 境界のファイルの中に、外の世界に触らない関数が混じっていてよい

**境界のファイルの中に、外の世界に触らない関数が混じっていてよい**（2026-09-16 決定）。層は
「外の世界に触るか」で決め、**ファイルの中身の純度で割り直さない**。`adapter/character-pack.ts` の
`characterChangedEvent` はほとんど fs を読まない（読むのは一覧の1件ごとの「変えられるか」を決める
起動先の `characters/local` の有無だけ）が `core` へは出さない。
呼び出し側が配線層だけで、パックの供給元も fs の1つしかないので、割っても「型1つ + 一行関数」の
浅いモジュールが増え、同じ名前のファイルが2つの層に並ぶだけになる
（`docs/research/architecture-proposal.md` 7章が仮定として置いていた分岐は、これで確定）。
**`core` からパックの判断が要るようになったら、層を写した `core/character-pack.ts` ではなく概念で切る**
（同 3章の `core/character-selection.ts`）。

**同じ段落で、`systemPrompt` の append の組み立ては 2026-09-23 に
`system-prompt/core/system-prompt.ts`（`takeSystemPromptAppend`）へ移した。** 当時 `character-pack.ts` に
置いたままでよかったのは、並べるものが人格と規約の2つだけで、呼ぶ側が配線層1つだったから。
その後 `core` 側に規約の選び方（雑談か仕事か）と雑談の記憶の読み戻しが増え、**並びの持ち主が
配線層・`core`・`adapter` の3つに割れて、何がどの順で載るかを1ファイルで読めなくなった**。
これは上の「概念で切る」に当たる分岐で、層を写した `core/character-pack.ts` ではなく
**「`systemPrompt` を組む」という概念**でファイルを切った。`persona.md` の文面は adapter が
fs から読んだ**文字列**で渡すので、`core → adapter` の辺は増えない（パックの型も `core` へ
出ていない）。
