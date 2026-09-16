import { AbsoluteFill, Audio, Img, Sequence, useVideoConfig } from 'remotion';
import { IntroOutroCard } from './IntroOutroCard';
import { DocumentHighlight } from './DocumentHighlight';
import { StockVideo } from './StockVideo';
import { CaptionLayer } from './CaptionLayer';
import { resolveAsset } from '../resolve-asset';
import { AnimatedCounter, type CounterVisual } from './charts/AnimatedCounter';
import { BarChart, type BarChartVisual } from './charts/BarChart';
import { MechanismScene, type MechanismVisual } from './charts/MechanismScene';
import { ResolutionScene, type ResolutionVisual } from './charts/ResolutionScene';
import { SpeechBubbles, type SpeechBubblesVisual } from './charts/SpeechBubbles';
import { WaveformOverlay } from './charts/WaveformOverlay';
import { PointerCard, type PointerCardVisual } from './charts/PointerCard';
import { PALETTE } from './palette';
import type { CaptionWord, HighlightBox, ZoomRegion } from '@signal-studio/types/timeline';

export const OUTRO_FRAMES = 75; // 2.5s @ 30fps
const FULL_PAGE: ZoomRegion = { x: 0, y: 0, width: 1, height: 1 };
const isVideoAsset = (url: string) => /\.(mp4|mov|webm)$/i.test(url);

type SceneVisual = CounterVisual | BarChartVisual | MechanismVisual | ResolutionVisual | SpeechBubblesVisual | PointerCardVisual;

export type CaseFileScene = {
  id: string;
  durationSecs: number;
  imageUrl?: string;
  captionText?: string;
  highlights?: HighlightBox[] | null;
  zoomFrom?: ZoomRegion | null;
  zoomTo?: ZoomRegion | null;
  visual?: SceneVisual | null;
  waveformOverlay?: boolean; // overlay an animated waveform graphic on a stock-video scene
  words?: CaptionWord[] | null; // per-word timing for the Highlighter Sweep caption style
  narrationUrl?: string;
};

export type CaseFileProps = {
  caseMeta?: { caseId: string; sourceCitation?: string; specimen?: boolean; showOutro?: boolean } | null;
  watermarkUrl?: string;
  scenes: CaseFileScene[];
};

function renderVisual(visual: SceneVisual) {
  switch (visual.kind) {
    case 'counter':
      return <AnimatedCounter visual={visual} />;
    case 'barChart':
      return (
        <AbsoluteFill style={{ backgroundColor: PALETTE.background, justifyContent: 'center', alignItems: 'center' }}>
          <BarChart visual={visual} />
        </AbsoluteFill>
      );
    case 'mechanism':
      return <MechanismScene visual={visual} />;
    case 'resolution':
      return <ResolutionScene visual={visual} />;
    case 'speechBubbles':
      return <SpeechBubbles visual={visual} />;
    case 'pointerCard':
      return <PointerCard visual={visual} />;
  }
}

// Scene sequencer for the locked content structure: hook -> evidence reveal ->
// narration body -> mechanism -> resolution. Scene order/content encodes that
// structure at authoring time (case.json) — this component just lays each scene
// out on the timeline in order, it doesn't enforce the beat structure itself.
//
// A scene renders either a document (imageUrl/highlight/zoom) or a `visual` (a
// data-viz chart/graphic — counter, bar chart, mechanism, resolution). Document
// continuity: a document scene with no imageUrl of its own carries forward the
// previous *document* scene's image (never renders blank; visual scenes don't
// interrupt this), and a scene with no explicit zoomFrom picks up where the
// previous scene's camera move on the same document left off.
export const CaseFile: React.FC<CaseFileProps> = ({ scenes, watermarkUrl, caseMeta }) => {
  const { fps } = useVideoConfig();
  // Data Visualization format drops the outro brand card — feedback found a static
  // card disrupts pacing on a short-form (55-65s) video; source citation moves to
  // the video description instead (register-case.mjs already reads case.json's
  // sourceCitation independently of what's shown on screen). Documentary/Case-File
  // keeps the outro by default.
  const showOutro = caseMeta?.showOutro ?? true;

  let cursor = 0;
  let lastImageUrl = '';
  let lastZoomTo: ZoomRegion = FULL_PAGE;
  const placedScenes = scenes.map((scene) => {
    const durationInFrames = Math.max(1, Math.round(scene.durationSecs * fps));
    const from = cursor;
    cursor += durationInFrames;

    if (scene.visual) {
      return { scene, from, durationInFrames, imageUrl: '', zoomFrom: FULL_PAGE, zoomTo: FULL_PAGE };
    }

    const imageUrl = scene.imageUrl || lastImageUrl;
    const sameDocument = imageUrl === lastImageUrl && imageUrl !== '';
    const zoomFrom = scene.zoomFrom ?? (sameDocument ? lastZoomTo : FULL_PAGE);
    const zoomTo = scene.zoomTo ?? zoomFrom;
    lastImageUrl = imageUrl;
    lastZoomTo = zoomTo;

    return { scene, imageUrl, zoomFrom, zoomTo, from, durationInFrames };
  });
  const outroFrom = cursor;

  return (
    <AbsoluteFill>
      {placedScenes.map(({ scene, imageUrl, zoomFrom, zoomTo, from, durationInFrames }) => (
        <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
          {scene.visual ? renderVisual(scene.visual) : isVideoAsset(imageUrl) ? (
            <StockVideo videoUrl={imageUrl}>{scene.waveformOverlay && <WaveformOverlay />}</StockVideo>
          ) : (
            <DocumentHighlight imageUrl={imageUrl} highlights={scene.highlights} zoomFrom={zoomFrom} zoomTo={zoomTo} />
          )}
          <CaptionLayer text={scene.captionText} words={scene.words} />
          {scene.narrationUrl && <Audio src={resolveAsset(scene.narrationUrl)} />}
        </Sequence>
      ))}

      {showOutro && (
        <Sequence from={outroFrom} durationInFrames={OUTRO_FRAMES}>
          <IntroOutroCard />
        </Sequence>
      )}

      {watermarkUrl && (
        <Img
          src={resolveAsset(watermarkUrl)}
          style={{ position: 'absolute', bottom: 32, right: 32, width: 160, opacity: 0.9 }}
        />
      )}
      {caseMeta?.specimen && (
        <div style={{
          position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
          background: PALETTE.highlight, color: PALETTE.background,
          fontWeight: 700, fontSize: 20, letterSpacing: 1.5,
          padding: '8px 20px', borderRadius: 6,
        }}>
          SPECIMEN — NOT A REAL CASE
        </div>
      )}
      {caseMeta?.sourceCitation && (
        <div style={{ position: 'absolute', bottom: 16, left: 32, color: 'rgba(244,239,230,0.6)', fontSize: 16 }}>
          {caseMeta.sourceCitation}
        </div>
      )}
    </AbsoluteFill>
  );
};

export function totalCaseFileFrames(scenes: CaseFileScene[], fps: number, showOutro = true): number {
  const scenesFrames = scenes.reduce((sum, s) => sum + Math.max(1, Math.round(s.durationSecs * fps)), 0);
  return (showOutro ? OUTRO_FRAMES : 0) + scenesFrames;
}
