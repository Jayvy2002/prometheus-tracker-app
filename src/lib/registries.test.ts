import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

describe('kokonut + bklit registries', () => {
  it('declares both registries in components.json', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'components.json'), 'utf8')) as {
      registries?: Record<string, string>;
    };
    assert.equal(config.registries?.['@kokonutui'], 'https://kokonutui.com/r/{name}.json');
    assert.equal(config.registries?.['@bklit'], 'https://ui.bklit.com/r/{name}.json');
  });

  it('ships Kokonut and Bklit source in the tree', () => {
    assert.ok(existsSync(resolve(root, 'src/components/kokonutui/particle-button.tsx')));
    assert.ok(existsSync(resolve(root, 'src/components/kokonutui/liquid-glass-card.tsx')));
    assert.ok(existsSync(resolve(root, 'src/components/kokonutui/gradient-button.tsx')));
    assert.ok(existsSync(resolve(root, 'src/components/charts/line-chart.tsx')));
    assert.ok(existsSync(resolve(root, 'src/components/charts/area-chart.tsx')));
    assert.ok(existsSync(resolve(root, 'src/components/charts/bar-chart.tsx')));
    assert.ok(existsSync(resolve(root, 'src/components/charts/BklitCharts.tsx')));
    assert.ok(!existsSync(resolve(root, 'src/components/charts/GymCharts.tsx')));
  });

  it('does not keep a GymCharts clone in chart consumers', () => {
    const files = [
      'src/components/coaching/ProgressCharts.tsx',
      'src/components/weight/WeightPage.tsx',
      'src/components/stats/StatsPage.tsx',
      'src/components/workout/ExerciseProgressPage.tsx',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(root, file), 'utf8');
      assert.doesNotMatch(src, /GymCharts/);
      assert.match(src, /BklitCharts/);
    }
  });
});
