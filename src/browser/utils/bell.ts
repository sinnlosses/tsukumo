// 鈴の音（`Bell`）。音声ファイルを持たず、`BELL_TONE` の倍音を Web Audio で合成して1回鳴らす。どのキャラクターでも同じ音。
// `AudioContext` は利用者の操作の中で作って `resume()` しないと鳴らない（`primeBell`）。作る前の `ringBell` は何もしない。

type BellPartial = {
  readonly frequency: number
  readonly gain: number
  readonly decaySeconds: number
}

/** 鈴の倍音。周波数（Hz）・強さ（0〜1）・消えるまでの秒。 */
const BELL_TONE = [
  { frequency: 1046.5, gain: 0.5, decaySeconds: 1.6 },
  { frequency: 2093, gain: 0.22, decaySeconds: 1.1 },
  { frequency: 2888, gain: 0.14, decaySeconds: 0.8 },
  { frequency: 5651, gain: 0.06, decaySeconds: 0.4 },
] as const satisfies readonly BellPartial[]

/** 全体の音量。通知の音として控えめにする。 */
const BELL_VOLUME = 0.25

/** 指数で減らす先。0 には指数で近づけないので、聞こえない小ささで止める。 */
const SILENT_GAIN = 0.0001

type BellContext =
  | { readonly kind: "none" }
  | { readonly kind: "ready"; readonly audio: AudioContext }

const held: { context: BellContext } = { context: { kind: "none" } }

/** `AudioContext` を作って `resume()` する。利用者の操作の中で呼ぶ。`AudioContext` が無いブラウザでは何もしない。 */
export function primeBell(): void {
  if (typeof AudioContext === "undefined") {
    return
  }
  if (held.context.kind === "none") {
    held.context = { kind: "ready", audio: new AudioContext() }
  }
  void held.context.audio.resume().catch(() => {
    // 許されない場面で呼ばれただけなので、次の操作でまた試す。
  })
}

/**
 * 鈴を1回鳴らす。{@link primeBell} の前は鳴らない。
 * 作った直後の `AudioContext` はまだ `suspended` のことがあるので、`resume()` が済んでから鳴らす（許されなければ鳴らさない）。
 */
export function ringBell(): void {
  if (held.context.kind === "none") {
    return
  }
  const audio = held.context.audio
  void audio
    .resume()
    .then(() => {
      playTone(audio)
    })
    .catch(() => {
      // 音を出せない場面なので、鳴らさずに続ける。
    })
}

function playTone(audio: AudioContext): void {
  const start = audio.currentTime
  for (const partial of BELL_TONE) {
    const oscillator = audio.createOscillator()
    const envelope = audio.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = partial.frequency
    envelope.gain.setValueAtTime(partial.gain * BELL_VOLUME, start)
    envelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + partial.decaySeconds)
    oscillator.connect(envelope).connect(audio.destination)
    oscillator.start(start)
    oscillator.stop(start + partial.decaySeconds)
  }
}
