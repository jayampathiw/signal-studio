import { Composition } from 'remotion';

import { CarouselSlide } from './compositions/carousel/CarouselSlide';
import {
  CaseFile,
  totalCaseFileFrames,
  type CaseFileProps,
} from './compositions/case-file/CaseFile';
import {
  ClipsOverlay,
  totalClipsOverlayFrames,
  type ClipsOverlayProps,
} from './compositions/clips-overlay/ClipsOverlay';
import {
  Compilation,
  totalCompilationFrames,
  type CompilationProps,
} from './compositions/compilation/Compilation';
import { NewsCard } from './compositions/NewsCard';

// Register all Remotion compositions here.
// Each composition corresponds to one content format / template.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="NewsCard"
      component={NewsCard}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        headline: 'Placeholder headline',
        source: 'Source Name',
        imageUrl: '',
        watermarkUrl: '',
      }}
    />
    <Composition
      id="CaseFile"
      component={CaseFile}
      fps={30}
      width={1920}
      height={1080}
      // Episode length varies per case — derive total frames from the scenes
      // passed in at render time instead of a fixed durationInFrames.
      calculateMetadata={async ({ props }) => ({
        durationInFrames: totalCaseFileFrames(
          (props as CaseFileProps).scenes ?? [],
          30,
          (props as CaseFileProps).caseMeta?.showOutro ?? true,
        ),
      })}
      defaultProps={
        {
          caseMeta: null,
          watermarkUrl: '',
          scenes: [],
        } satisfies CaseFileProps
      }
    />
    <Composition
      id="CaseFileVertical"
      component={CaseFile}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={async ({ props }) => ({
        durationInFrames: totalCaseFileFrames(
          (props as CaseFileProps).scenes ?? [],
          30,
          (props as CaseFileProps).caseMeta?.showOutro ?? true,
        ),
      })}
      defaultProps={
        {
          caseMeta: null,
          watermarkUrl: '',
          scenes: [],
        } satisfies CaseFileProps
      }
    />
    <Composition
      id="CarouselSlide"
      component={CarouselSlide}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1350}
      defaultProps={{
        slideNumber: 1,
        totalSlides: 7,
        headline: 'Placeholder headline',
        body: '',
        watermarkUrl: '',
        showFolder: false,
      }}
    />
    <Composition
      id="ClipsOverlay"
      component={ClipsOverlay}
      fps={30}
      width={1080}
      height={1920}
      // Variable length: total shot screen-time + end-card duration.
      calculateMetadata={async ({ props }) => ({
        durationInFrames: totalClipsOverlayFrames(props as ClipsOverlayProps, 30),
      })}
      defaultProps={
        {
          scenes: [],
          musicGainDb: -18,
          musicDuck: true,
          musicFadeOutSecs: 1.5,
        } satisfies ClipsOverlayProps
      }
    />
    <Composition
      id="Compilation"
      component={Compilation}
      fps={30}
      width={1080}
      height={1920}
      // Variable length: sum of crossfade-adjusted episode spans + end card.
      calculateMetadata={async ({ props }) => ({
        durationInFrames: totalCompilationFrames(props as CompilationProps, 30),
      })}
      defaultProps={
        {
          scenes: [],
          musicGainDb: -18,
          musicDuck: true,
          musicFadeOutSecs: 1.5,
        } satisfies CompilationProps
      }
    />
    {/* Add: DocumentaryScene, ReelTemplate, etc. as built */}
  </>
);
