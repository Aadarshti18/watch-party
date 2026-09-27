import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PlaybackState } from '../types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayerHandle {
  getCurrentTime: () => number;
  getDuration: () => number;
  /** Reconciles the player with the server's playback state. This is the
   * ONLY way playback state changes - it runs for the person who triggered
   * the action too, once their own event round-trips through the server.
   * That keeps "what the video is doing" driven by a single source of
   * truth instead of duplicating logic for local vs. remote updates. */
  applyRemoteState: (state: PlaybackState) => void;
}

const DRIFT_TOLERANCE_SECONDS = 1.5;

const YouTubePlayer = forwardRef<YouTubePlayerHandle>(function YouTubePlayer(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const pendingStateRef = useRef<PlaybackState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function createPlayer() {
      if (cancelled || !containerRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '100%',
        width: '100%',
        playerVars: { autoplay: 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            setReady(true);
            if (pendingStateRef.current) {
              reconcile(pendingStateRef.current);
              pendingStateRef.current = null;
            }
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // player may already be torn down by the IFrame API itself
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reconcile(state: PlaybackState) {
    const player = playerRef.current;
    if (!player) return;

    if (!state.videoId) return;

    if (state.videoId !== loadedVideoIdRef.current) {
      loadedVideoIdRef.current = state.videoId;
      if (state.playState === 'playing') {
        player.loadVideoById(state.videoId, state.currentTime || 0);
      } else {
        // cueVideoById shows the thumbnail/first frame and gets the player
        // ready without autoplaying - correct for a room's starting video,
        // or any video change that lands on a paused state.
        player.cueVideoById(state.videoId, state.currentTime || 0);
      }
      return;
    }

    const current = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
    if (Math.abs(current - state.currentTime) > DRIFT_TOLERANCE_SECONDS) {
      player.seekTo(state.currentTime, true);
    }

    if (state.playState === 'playing') player.playVideo?.();
    else player.pauseVideo?.();
  }

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => {
        try {
          return playerRef.current?.getCurrentTime?.() ?? 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          return playerRef.current?.getDuration?.() ?? 0;
        } catch {
          return 0;
        }
      },
      applyRemoteState: (state: PlaybackState) => {
        if (!ready) {
          pendingStateRef.current = state;
          return;
        }
        reconcile(state);
      },
    }),
    [ready]
  );

  return <div ref={containerRef} className="yt-player-target" />;
});

export default YouTubePlayer;