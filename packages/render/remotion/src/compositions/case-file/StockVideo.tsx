import { AbsoluteFill, OffthreadVideo } from 'remotion';

import { PALETTE } from './palette';
import { resolveAsset } from '../resolve-asset';

type Props = {
  videoUrl: string;
  children?: React.ReactNode; // optional overlay (e.g. waveform graphic)
};

// Licensed B-roll (Pexels — free for commercial use, no attribution required) for the
// "Faceless Voiceover over Stock" format. Deliberately no Ken-Burns zoom math here
// (unlike DocumentHighlight) — that math depends on knowing the source's natural
// pixel dimensions, which is straightforward for a static image but not worth the
// complexity for a short muted B-roll clip; a plain cover-fit matches how this
// format is actually used elsewhere (unobtrusive background motion, not evidence to
// study). Muted — narration audio is a separate <Audio> track in the parent scene.
export const StockVideo: React.FC<Props> = ({ videoUrl, children }) => (
  <AbsoluteFill style={{ backgroundColor: PALETTE.background, overflow: 'hidden' }}>
    {videoUrl && (
      <OffthreadVideo
        src={resolveAsset(videoUrl)}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )}
    {children}
  </AbsoluteFill>
);
