import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { catalogHasExecutionMedia, findCatalogExercise } from './exerciseCatalog';
import {
  fillForTone,
  MANNEQUIN_PRIMARY,
  MANNEQUIN_SECONDARY,
  MANNEQUIN_IDLE,
  mannequinShouldShowBack,
  mannequinShouldShowFront,
  muscleTone,
} from './exerciseMannequin';
import { exerciseVideoKind, youtubeEmbedUrl, youtubeIdFromUrl } from './exerciseVideo';
import type { Exercise } from '../../../lib/types';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function sample(partial: Partial<Exercise> & { name: string }): Exercise {
  return {
    id: partial.id ?? '1',
    name: partial.name,
    name_fr: partial.name_fr ?? partial.name,
    primary_muscles: partial.primary_muscles ?? ['chest'],
    secondary_muscles: partial.secondary_muscles ?? ['triceps'],
    category: 'compound',
    equipment: 'barbell',
    instructions: '',
    tips: '',
    difficulty: 'beginner',
    verified: true,
    created_by: null,
    created_at: '',
    video_url: partial.video_url ?? 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
  };
}

test('youtube ids parse from watch, short, embed and bare id', () => {
  assert.equal(youtubeIdFromUrl('https://www.youtube.com/watch?v=rT7DgCr-3pg'), 'rT7DgCr-3pg');
  assert.equal(youtubeIdFromUrl('https://youtu.be/rT7DgCr-3pg'), 'rT7DgCr-3pg');
  assert.equal(youtubeIdFromUrl('https://www.youtube-nocookie.com/embed/rT7DgCr-3pg'), 'rT7DgCr-3pg');
  assert.equal(youtubeIdFromUrl('rT7DgCr-3pg'), 'rT7DgCr-3pg');
  assert.equal(youtubeIdFromUrl(''), null);
  assert.equal(exerciseVideoKind('https://cdn.example/squat.mp4'), 'file');
  assert.equal(youtubeEmbedUrl('https://youtu.be/rT7DgCr-3pg'), 'https://www.youtube-nocookie.com/embed/rT7DgCr-3pg');
});

test('mannequin paints primary red and secondary lighter red', () => {
  assert.equal(muscleTone('chest', ['chest'], ['triceps']), 'primary');
  assert.equal(muscleTone('triceps', ['chest'], ['triceps']), 'secondary');
  assert.equal(muscleTone('calves', ['chest'], ['triceps']), 'idle');
  assert.equal(fillForTone('primary'), MANNEQUIN_PRIMARY);
  assert.equal(fillForTone('secondary'), MANNEQUIN_SECONDARY);
  assert.equal(fillForTone('idle'), MANNEQUIN_IDLE);
  assert.equal(MANNEQUIN_PRIMARY, '#ef4444');
});

test('deadlift shows the back view; bench the front (and back if triceps are secondary)', () => {
  assert.equal(mannequinShouldShowBack(['hamstrings', 'glutes', 'lower_back'], ['quadriceps']), true);
  assert.equal(mannequinShouldShowFront(['chest'], ['triceps']), true);
  assert.equal(mannequinShouldShowBack(['chest'], ['triceps', 'front_delts']), true);
  assert.equal(mannequinShouldShowBack(['chest'], ['front_delts']), false);
});

test('catalog match is name or name_fr; media requires video + primary muscles', () => {
  const bench = sample({ name: 'Bench Press', name_fr: 'Developpe couche' });
  assert.equal(findCatalogExercise([bench], 'developpe couche')?.name, 'Bench Press');
  assert.equal(catalogHasExecutionMedia(bench), true);
  assert.equal(catalogHasExecutionMedia({ ...bench, video_url: null }), false);
});

test('seed migration covers the 31 catalogue names with a youtube url', () => {
  const sql = src('supabase/migrations/20260824233544_add_exercises_database.sql');
  const names = [...sql.matchAll(/\('([^']+)', '/g)].map(m => m[1]);
  assert.equal(names.length, 31, `expected 31 seed names, got ${names.length}`);
  const videoSql = src('supabase/migrations/20260915180000_exercise_video_url.sql');
  assert.match(videoSql, /ADD COLUMN IF NOT EXISTS video_url text/);
  for (const name of names) {
    assert.match(videoSql, new RegExp(`WHERE name = '${name.replace(/'/g, "\\'")}'`));
  }
  const youtubeRows = [...videoSql.matchAll(/youtube\.com\/watch\?v=/g)];
  assert.equal(youtubeRows.length, 31);
});

test('picker and session card mount ExerciseMedia', () => {
  const picker = src('src/components/workout/ExercisePicker.tsx');
  assert.match(picker, /ExerciseMedia/);
  assert.match(picker, /setDetail\(ex\)/);
  assert.doesNotMatch(picker, /\(ex\.instructions \|\| ex\.tips\) && \(/);
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /ExerciseMedia/);
  assert.match(card, /findCatalogExercise/);
  const media = src('src/components/workout/ExerciseMedia.tsx');
  assert.match(media, /ExerciseMuscleMannequin/);
  assert.match(media, /youtubeEmbedUrl/);
  const video = src('src/features/workout/domain/exerciseVideo.ts');
  assert.match(video, /youtube-nocookie/);
  const mannequin = src('src/components/workout/ExerciseMuscleMannequin.tsx');
  assert.match(mannequin, /data-muscle-id/);
  assert.match(mannequin, /fillForTone/);
});
