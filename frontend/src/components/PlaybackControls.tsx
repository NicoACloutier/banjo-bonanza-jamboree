/**
 * Playback control bar: play/stop, adjustable tempo (BPM), transposition
 * (in semitones/frets), and auto-scroll toggle with adjustable speed.
 */
interface PlaybackControlsProps {
  tempoBpm: number;
  onTempoChange: (bpm: number) => void;
  transposeSemitones: number;
  onTransposeChange: (semitones: number) => void;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  autoScroll: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
  scrollSpeed: number;
  onScrollSpeedChange: (speed: number) => void;
}

export function PlaybackControls({
  tempoBpm,
  onTempoChange,
  transposeSemitones,
  onTransposeChange,
  isPlaying,
  onPlay,
  onStop,
  autoScroll,
  onAutoScrollChange,
  scrollSpeed,
  onScrollSpeedChange,
}: PlaybackControlsProps) {
  return (
    <div className="toolbar" role="group" aria-label="Playback controls">
      <button onClick={isPlaying ? onStop : onPlay}>{isPlaying ? "⏹ Stop" : "▶ Play"}</button>

      <label>
        Tempo: {tempoBpm} BPM
        <input
          type="range"
          min={40}
          max={240}
          value={tempoBpm}
          onChange={(e) => onTempoChange(Number(e.target.value))}
          aria-label="Tempo in beats per minute"
        />
      </label>

      <label>
        Transpose: {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones} fret
        {Math.abs(transposeSemitones) === 1 ? "" : "s"}
        <input
          type="range"
          min={-12}
          max={12}
          value={transposeSemitones}
          onChange={(e) => onTransposeChange(Number(e.target.value))}
          aria-label="Transpose in semitones"
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={autoScroll}
          onChange={(e) => onAutoScrollChange(e.target.checked)}
        />
        Auto-scroll
      </label>

      <label>
        Scroll speed
        <input
          type="range"
          min={1}
          max={10}
          value={scrollSpeed}
          disabled={!autoScroll}
          onChange={(e) => onScrollSpeedChange(Number(e.target.value))}
          aria-label="Auto-scroll speed"
        />
      </label>
    </div>
  );
}
