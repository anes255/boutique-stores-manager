import React from 'react';
import { useAuth } from '../../../src/auth';
import { useStoreRouteId, useBranch } from '../../../src/store-route';
import StockScreen from '../../../src/screens/StockScreen';

export default function BranchStock() {
  const storeId = useStoreRouteId();
  const branch = useBranch();
  const { isAdmin } = useAuth();
  return (
    <StockScreen storeId={storeId} branchName={branch.name} owner={isAdmin}
      basePath={`/store/${storeId}/stock`} backTo={`/store/${storeId}`} />
  );
}
