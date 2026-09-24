import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(process.cwd(), 'src/components/marketplace/MarketplacePage.tsx');
const UI_DIR = resolve(process.cwd(), 'src/components/marketplace');

/** Page + ses vues : les verrous source lisent l'écran marketplace entier. */
export function marketplaceUiSource(): string {
  const views = readdirSync(UI_DIR)
    .filter((name) => /\.tsx?$/.test(name) && name !== 'MarketplacePage.tsx')
    .sort()
    .map((name) => readFileSync(resolve(UI_DIR, name), 'utf8'));
  return [readFileSync(PAGE, 'utf8'), ...views].join('\n');
}
