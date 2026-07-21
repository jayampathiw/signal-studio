import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));

export const SERIF_FONT = resolve(dir, '../../assets/fonts/DejaVuSerif.ttf');
export const BEBAS_FONT = resolve(dir, '../../assets/fonts/BebasNeue-Regular.ttf');
