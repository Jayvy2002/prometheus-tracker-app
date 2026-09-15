import common from './en/common';
import navigation from './en/navigation';
import coaching from './en/coaching';
import workout from './en/workout';
import nutrition from './en/nutrition';
import programs from './en/programs';
import marketplace from './en/marketplace';

const en = {
  ...common,
  ...navigation,
  ...coaching,
  ...workout,
  ...nutrition,
  ...programs,
  ...marketplace,
} as const;

export default en;
