import common from './fr/common';
import navigation from './fr/navigation';
import coaching from './fr/coaching';
import workout from './fr/workout';
import nutrition from './fr/nutrition';
import programs from './fr/programs';
import marketplace from './fr/marketplace';
import watch from './fr/watch';

const fr = {
  ...common,
  ...navigation,
  ...coaching,
  ...workout,
  ...nutrition,
  ...programs,
  ...marketplace,
  ...watch,
} as const;

export default fr;
