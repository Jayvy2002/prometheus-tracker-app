import common from './en/common';
import navigation from './en/navigation';
import coaching from './en/coaching';
import workout from './en/workout';
import nutrition from './en/nutrition';
import programs from './en/programs';
import marketplace from './en/marketplace';
import watch from './en/watch';
import admin from './en/admin';

const en = {
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

export default en;
