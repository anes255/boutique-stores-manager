import { useState } from 'react';
import { View } from 'react-native';
import { one, sql } from '../db';
import { useNav } from '../nav';
import {
  Btn, BtnRow, DateInput, DeleteBtn, ErrorText, Field, Loading, Screen, Table, fmt, num, parseNum, today,
  toSqlDate, useLoad,
} from '../ui';

// owner: { mainId } for the main user's own expenses, { subId } for a showroom's
const ownerCol = (owner) => (owner.subId ? 'sub_id' : 'main_id');
const ownerId = (owner) => owner.subId || owner.mainId;

const expensesQuery = (owner, from, to) =>
  sql(
    `select id, name, amount, to_char(day,'YYYY/MM/DD') as day from maarid.expenses
     where ${ownerCol(owner)} = $1 and day between $2 and $3 order by day, id`,
    [ownerId(owner), toSqlDate(from), toSqlDate(to)]
  );

const sumAmount = (rows) => (rows || []).reduce((a, r) => a + num(r.amount), 0);

export function Expenses({ owner, readOnly, name }) {
  const nav = useNav();
  const [day, setDay] = useState(today());
  const [sel, setSel] = useState(null);
  const { data, error, loading, reload } = useLoad(() => expensesQuery(owner, day, day), [day]);
  const selected = data?.find((r) => r.id === sel);
  return (
    <Screen title={name ? `المصاريف - ${name}` : 'المصاريف'} date={today()}>
      <DateInput value={day} onChange={(d) => { setDay(d); setSel(null); }} />
      <View style={{ height: 10 }} />
      {loading ? <Loading /> : (
        <Table
          columns={[
            { key: 'name', title: 'اسم المصروف', flex: 2 },
            { key: 'amount', title: 'القيمة', render: (r) => fmt(r.amount) },
          ]}
          rows={data || []}
          selectedId={readOnly ? undefined : sel}
          onSelect={readOnly ? undefined : setSel}
          totalLabel="المجموع الكلي"
          total={sumAmount(data)}
        />
      )}
      <ErrorText>{error}</ErrorText>
      {!readOnly && (
        <BtnRow>
          <Btn title="اضافة" onPress={() => nav.push('ExpenseForm', { owner, day })} />
          <Btn title="تعديل" disabled={!selected} onPress={() => nav.push('ExpenseForm', { owner, expense: selected })} />
          <DeleteBtn disabled={!selected} confirmTitle="حذف مصروف"
            message={selected && `حذف المصروف "${selected.name}"؟`}
            onConfirm={async () => {
              await sql(`delete from maarid.expenses where id=$1 and ${ownerCol(owner)}=$2`, [selected.id, ownerId(owner)]);
              setSel(null);
              reload();
            }} />
        </BtnRow>
      )}
      <BtnRow>
        <Btn title="بحث بمدة"
          onPress={() => nav.push('RangeSearch', {
            title: 'بحث في المصاريف', next: 'ExpensesResult', nextParams: { owner },
          })} />
      </BtnRow>
    </Screen>
  );
}

export function ExpensesResult({ owner, from, to }) {
  const { data, error, loading } = useLoad(() => expensesQuery(owner, from, to), [from, to]);
  return (
    <Screen title={`المصاريف من يوم ${from} الى يوم ${to}`}>
      {loading ? <Loading /> : (
        <Table
          columns={[
            { key: 'day', title: 'التاريخ', flex: 1.3 },
            { key: 'name', title: 'اسم المصروف', flex: 2 },
            { key: 'amount', title: 'القيمة', render: (r) => fmt(r.amount) },
          ]}
          rows={data || []}
          totalLabel="المجموع الكلي"
          total={sumAmount(data)}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

export function ExpenseForm({ owner, expense, day: initialDay }) {
  const nav = useNav();
  const [name, setName] = useState(expense?.name || '');
  const [amount, setAmount] = useState(expense ? fmt(expense.amount) : '');
  const [day, setDay] = useState(expense?.day || initialDay || today());
  const [error, setError] = useState('');
  const save = async () => {
    const a = parseNum(amount);
    if (!name.trim()) return setError('ادخل اسم المصروف');
    if (!(a > 0)) return setError('القيمة غير صحيحة');
    try {
      if (expense) {
        await one(
          `update maarid.expenses set name=$1, amount=$2, day=$3 where id=$4 and ${ownerCol(owner)}=$5`,
          [name.trim(), a, toSqlDate(day), expense.id, ownerId(owner)]
        );
      } else {
        await one('insert into maarid.expenses(main_id, sub_id, name, amount, day) values ($1,$2,$3,$4,$5)', [
          owner.mainId || null, owner.subId || null, name.trim(), a, toSqlDate(day),
        ]);
      }
      nav.back();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Screen title={expense ? 'تعديل مصروف' : 'اضافة مصروف'}>
      <Field label="اسم المصروف" value={name} onChangeText={setName} />
      <Field label="القيمة" value={amount} onChangeText={setAmount} numeric />
      <DateInput label="التاريخ" value={day} onChange={setDay} />
      <ErrorText>{error}</ErrorText>
      <Btn title={expense ? 'حفظ' : 'اضافة'} variant="primary" onPress={save} />
    </Screen>
  );
}
