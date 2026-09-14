import React from 'react';
import ExpensesScreen from '../../src/screens/ExpensesScreen';

export default function OwnerExpenses() {
  return <ExpensesScreen basePath="/owner/expenses" backTo="/owner" />;
}
