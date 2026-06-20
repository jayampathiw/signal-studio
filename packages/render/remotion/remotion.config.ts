import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// First composition: NewsCard — proves the render contract with one template.
// Add more compositions in src/Root.tsx as they're built.
