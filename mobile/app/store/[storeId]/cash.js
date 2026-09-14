import React from 'react';
import { useStoreRouteId, useBranch } from '../../../src/store-route';
import CashScreen from '../../../src/screens/CashScreen';

export default function BranchCash() {
  const storeId = useStoreRouteId();
  const branch = useBranch();
  return <CashScreen storeId={storeId} branchName={branch.name} backTo={`/store/${storeId}`} />;
}
