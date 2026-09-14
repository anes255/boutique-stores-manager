import React from 'react';
import { useStoreRouteId, useBranch } from '../../../src/store-route';
import SalesScreen from '../../../src/screens/SalesScreen';

export default function BranchSales() {
  const storeId = useStoreRouteId();
  const branch = useBranch();
  return (
    <SalesScreen storeId={storeId} branchName={branch.name}
      basePath={`/store/${storeId}/sales`} backTo={`/store/${storeId}`} />
  );
}
