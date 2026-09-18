import { Composition } from 'remotion';

import { Compilation } from './compositions/Compilation';
import { Post } from './compositions/Post';
import {
  totalPostFrames,
  totalCompilationFrames,
  type PostProps,
  type CompilationProps,
} from './props';
import { sampleCompilationProps } from './sample-compilation-props';
import { sampleProps } from './sample-props';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Post"
      component={Post}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={async ({ props }) => ({
        durationInFrames: totalPostFrames(props as PostProps, 30),
      })}
      defaultProps={sampleProps satisfies PostProps}
    />
    <Composition
      id="Compilation"
      component={Compilation}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={async ({ props }) => ({
        durationInFrames: totalCompilationFrames(props as CompilationProps, 30),
      })}
      defaultProps={sampleCompilationProps satisfies CompilationProps}
    />
  </>
);
