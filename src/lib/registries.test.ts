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

describe('kokonut + bklit visible wiring', () => {
  it('turns LiquidGlass on in Card and does not hide ParticleButton svg', () => {
    const card = readFileSync(resolve(root, 'src/components/ui/Card.tsx'), 'utf8');
    assert.match(card, /glassEffect/);
    assert.doesNotMatch(card, /glassEffect=\{false\}/);
    assert.match(card, /LiquidGlassCard/);

    const button = readFileSync(resolve(root, 'src/components/ui/Button.tsx'), 'utf8');
    assert.match(button, /AttractButton/);
    assert.match(button, /GradientButton/);
    assert.match(button, /HoldButton/);
    assert.match(button, /ParticleButton/);
    assert.doesNotMatch(button, /\[&>svg:last-of-type\]:hidden/);

    const particle = readFileSync(resolve(root, 'src/components/kokonutui/particle-button.tsx'), 'utf8');
    assert.match(particle, /MousePointerClick/);
    assert.doesNotMatch(particle, /hidden/);
  });

  it('uses Bklit enter/loading (status, shimmer, sweep, pathLength)', () => {
    const charts = readFileSync(resolve(root, 'src/components/charts/BklitCharts.tsx'), 'utf8');
    assert.match(charts, /status=\{status\}/);
    assert.match(charts, /useBklitStatus/);
    assert.match(charts, /shimmer/);
    assert.match(charts, /loadingStyle="sweep"/);
    assert.match(charts, /animationDuration=\{ENTER_MS\}/);
  });

  it('runs PageTransition + AnimatedList on dashboard, roster, 360 and séance', () => {
    const files = [
      'src/components/dashboard/Dashboard.tsx',
      'src/components/coaching/CoachDashboard.tsx',
      'src/components/coaching/ClientsPage.tsx',
      'src/components/coaching/ClientDetailPage.tsx',
      'src/components/workout/WorkoutPage.tsx',
      'src/components/checkin/CheckInPage.tsx',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(root, file), 'utf8');
      assert.match(src, /PageTransition/, file);
      assert.match(src, /AnimatedList/, file);
    }
  });

  it('uses GymLoader / Kokonut loader on coach and client waits', () => {
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
    assert.match(app, /GymLoader/);
    assert.match(app, /from '\.\/components\/ui\/Button'/);
    const loader = readFileSync(resolve(root, 'src/components/ui/GymLoader.tsx'), 'utf8');
    assert.match(loader, /kokonutui\/loader/);
    const coach = readFileSync(resolve(root, 'src/components/coaching/CoachDashboard.tsx'), 'utf8');
    assert.match(coach, /GymLoader/);
    const clients = readFileSync(resolve(root, 'src/components/coaching/ClientsPage.tsx'), 'utf8');
    assert.match(clients, /GymLoader/);
  });

  it('wires FileUpload on progress photos and gym CTA on Accueil', () => {
    const photos = readFileSync(resolve(root, 'src/components/coaching/ClientPhotosPage.tsx'), 'utf8');
    assert.match(photos, /FileUpload/);
    assert.match(photos, /kokonutui\/file-upload/);
    const gym = readFileSync(resolve(root, 'src/components/dashboard/ClientGymCard.tsx'), 'utf8');
    assert.match(gym, /<Card/);
    assert.match(gym, /onClick=\{onStart\}/);
  });

  it('keeps coach mobile avatar and existing-client intake gate', () => {
    const layout = readFileSync(resolve(root, 'src/components/layout/AppLayout.tsx'), 'utf8');
    assert.match(layout, /CoachProfileButton/);
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
    assert.match(app, /shouldForceKinesiologyIntake/);
  });
});
