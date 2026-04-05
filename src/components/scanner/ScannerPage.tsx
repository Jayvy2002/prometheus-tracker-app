import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { todayStr } from '../../lib/utils';
import type { FoodProduct } from '../../lib/types';
import FoodForm from '../nutrition/FoodForm';
import UnifiedScanner from './UnifiedScanner';
import FullPageLayout from '../layout/FullPageLayout';

/**
 * Route: /scanner
 * Thin wrapper: shows UnifiedScanner → on product found, shows FoodForm pre-filled.
 */
export default function ScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [foundProduct, setFoundProduct] = useState<FoodProduct | null>(null);

  const category = searchParams.get('category') ?? 'snack';
  const date = searchParams.get('date') ?? todayStr();

  if (foundProduct) {
    return (
      <FullPageLayout>
        <FoodForm
          category={category}
          date={date}
          onClose={() => navigate('/nutrition')}
          prefill={foundProduct}
        />
      </FullPageLayout>
    );
  }

  return (
    <FullPageLayout>
      <UnifiedScanner
        onResult={setFoundProduct}
        onClose={() => navigate('/nutrition')}
        showRecent
      />
    </FullPageLayout>
  );
}
