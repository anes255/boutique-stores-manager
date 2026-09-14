import React from 'react';
import StockScreen from '../../src/screens/StockScreen';

export default function OwnerStock() {
  return <StockScreen owner basePath="/owner/stock" backTo="/owner" />;
}
