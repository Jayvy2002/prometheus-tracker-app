import common from './fr/common';
import navigation from './fr/navigation';
import coaching from './fr/coaching';
import workout from './fr/workout';
import nutrition from './fr/nutrition';
import programs from './fr/programs';
import marketplace from './fr/marketplace';

const fr = {
  ...common,
  ...navigation,
  ...coaching,
  ...workout,
  ...nutrition,
  ...programs,
  ...marketplace,
} as const;

export default fr;
