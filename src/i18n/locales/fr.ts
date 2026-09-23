import common from './fr/common';
import navigation from './fr/navigation';
import coaching from './fr/coaching';
import workout from './fr/workout';
import nutrition from './fr/nutrition';
import programs from './fr/programs';
import marketplace from './fr/marketplace';
import watch from './fr/watch';
import admin from './fr/admin';

const fr = {
  ...common,
  ...navigation,
  ...coaching,
  ...workout,
  ...nutrition,
  ...programs,
  ...marketplace,
  ...watch,
  ...admin,
} as const;

export default fr;
