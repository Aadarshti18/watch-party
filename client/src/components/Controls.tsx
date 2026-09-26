import { useEffect, useState } from 'react';
import { Film, Info, Pause, Play } from 'lucide-react';
import type { PlaybackState } from '../types';
import { formatTime, extractYouTubeVideoId } from '../utils';

interface ControlsProps {
  playback: PlaybackState;
  canControl: boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  onTogglePlayPause: (currentTime: number) => void;
  onSeekCommit: (time: number) => void;
  onChangeVideo: (videoId: string) => void;
}

export default function Controls({
  playback,
  canControl,
  getCurrentTime,
  getDuration,
  onTogglePlayPause,
  onSeekCommit,
  onChangeVideo,
}: ControlsProps) {
  const [liveTime, setLiveTime] = useState(playback.currentTime);
  const [duration, setDuration] = useState(0);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [videoInput, setVideoInput] = useState('');
  const [videoInputError, setVideoInputError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(getDuration());
      if (dragTime === null) {
        setLiveTime(playback.playState === 'playing' ? getCurrentTime() : playback.currentTime);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 500);
    return () => clearInterval(interval);
  }, [playback, dragTime, getCurrentTime, getDuration]);

  const displayTime = dragTime ?? liveTime;

  function handleVideoSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = extractYouTubeVideoId(videoInput);
    if (!id) {
      setVideoInputError('Paste a valid YouTube link or video ID.');
      return;
    }
    setVideoInputError(null);
    onChangeVideo(id);
    setVideoInput('');
  }

  return (
    <>
      <div className="controls-bar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onTogglePlayPause(getCurrentTime())}
          aria-label={playback.playState === 'playing' ? 'Pause' : 'Play'}
          title={canControl ? undefined : 'Request control to use this'}
        >
          {playback.playState === 'playing' ? (
            <Pause size={16} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={16} fill="currentColor" aria-hidden="true" />
          )}
        </button>

        <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 42 }}>{formatTime(displayTime)}</span>

        <input
          className="seek"
          type="range"
          min={0}
          max={Math.max(duration, displayTime, 1)}
          step={0.5}
          value={displayTime}
          onChange={(e) => setDragTime(Number(e.target.value))}
          onMouseUp={() => {
            if (dragTime !== null) onSeekCommit(dragTime);
            setDragTime(null);
          }}
          onTouchEnd={() => {
            if (dragTime !== null) onSeekCommit(dragTime);
            setDragTime(null);
          }}
          aria-label="Seek"
          title={canControl ? undefined : 'Request control to use this'}
        />

        <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 42 }}>
          {duration ? formatTime(duration) : '–:–'}
        </span>
      </div>

      <form className="change-video-row" onSubmit={handleVideoSubmit}>
        <input
          value={videoInput}
          onChange={(e) => setVideoInput(e.target.value)}
          placeholder="Paste a YouTube link to change the video"
        />
        <button type="submit" className="btn btn-secondary btn-small">
          <Film size={14} aria-hidden="true" />
          {canControl ? 'Change video' : 'Request change'}
        </button>
      </form>
      {videoInputError && <p className="form-error">{videoInputError}</p>}

      {!canControl && (
        <p className="control-notice">
          <Info size={14} aria-hidden="true" />
          You're watching only. Using a control above sends a request to the host or a moderator.
        </p>
      )}
    </>
  );
}