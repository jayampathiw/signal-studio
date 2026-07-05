import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));

export const SERIF_FONT = resolve(dir, '../../assets/fonts/DejaVuSerif.ttf');
