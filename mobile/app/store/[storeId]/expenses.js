import React from 'react';
import { useStoreRouteId, useBranch } from '../../../src/store-route';
import ExpensesScreen from '../../../src/screens/ExpensesScreen';

export default function BranchExpenses() {
  const storeId = useStoreRouteId();
  const branch = useBranch();
  return (
    <ExpensesScreen storeId={storeId} branchName={branch.name}
      basePath={`/store/${storeId}/expenses`} backTo={`/store/${storeId}`} />
  );
}
