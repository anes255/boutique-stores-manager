import { Login, Register, Welcome } from './auth';
import { Cash, CashForm } from './cash';
import { RangeSearch } from './common';
import { ExpenseForm, Expenses, ExpensesResult } from './expenses';
import { MainHome, ShowroomHome, Showrooms, SubHome } from './home';
import { ProductForm, Products } from './products';
import { SaleForm, Sales, SalesResult } from './sales';
import { MainStock, SendGoods, StockAdd, SubStock, TransfersResult } from './stock';

export const SCREENS = {
  Welcome, Login, Register,
  MainHome, SubHome, Showrooms, ShowroomHome,
  Products, ProductForm,
  MainStock, StockAdd, SendGoods, SubStock, TransfersResult,
  Sales, SaleForm, SalesResult,
  Expenses, ExpenseForm, ExpensesResult,
  Cash, CashForm,
  RangeSearch,
};

export const PUBLIC_SCREENS = ['Welcome', 'Login', 'Register'];
