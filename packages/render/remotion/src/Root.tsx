import { Composition } from 'remotion';
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
    {/* Add: DocumentaryScene, ReelTemplate, etc. as built */}
  </>
);
