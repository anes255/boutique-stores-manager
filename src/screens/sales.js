import { useState } from 'react';
import { Text } from 'react-native';
import { one, sql } from '../db';
import { useNav } from '../nav';
import {
  Btn, BtnRow, C, DateInput, DeleteBtn, ErrorText, Field, Loading, Screen, Select, Table, fmt, num, parseNum,
  today, toSqlDate, useLoad,
} from '../ui';
import { subStockQuery } from './stock';

// scope: { subId, mainId } for one showroom, or { mainId } for all showrooms of a main user
function salesQuery(scope, from, to) {
  const where = scope.subId ? 's.sub_id = $1' : 'u.main_id = $1';
  return sql(
    `select s.id, s.product_id, p.name product, u.username showroom, s.qty, s.price, s.qty*s.price total,
       to_char(s.day,'YYYY/MM/DD') as day
     from maarid.sales s
     join maarid.products p on p.id = s.product_id
     join maarid.sub_users u on u.id = s.sub_id
     where ${where} and s.day between $2 and $3
     order by s.day, s.id`,
    [scope.subId || scope.mainId, toSqlDate(from), toSqlDate(to)]
  );
}

function salesColumns(scope, withDay) {
  return [
    withDay && { key: 'day', title: 'التاريخ', flex: 1.3 },
    !scope.subId && { key: 'showroom', title: 'المعرض', flex: 1.2 },
    { key: 'product', title: 'المنتج', flex: 1.5 },
    { key: 'qty', title: 'الكمية', render: (r) => fmt(r.qty) },
    { key: 'price', title: 'السعر', render: (r) => fmt(r.price) },
    { key: 'total', title: 'المجموع', render: (r) => fmt(r.total) },
  ].filter(Boolean);
}

const sumTotal = (rows) => (rows || []).reduce((a, r) => a + num(r.total), 0);

export function Sales({ scope, readOnly, name }) {
  const nav = useNav();
  const [day, setDay] = useState(today());
  const [sel, setSel] = useState(null);
  const { data, error, loading, reload } = useLoad(() => salesQuery(scope, day, day), [day]);
  const selected = data?.find((r) => r.id === sel);
  return (
    <Screen title={name ? `عمليات البيع - ${name}` : 'عمليات البيع'} date={today()}>
      <DateInput value={day} onChange={(d) => { setDay(d); setSel(null); }} />
      <Text style={{ height: 10 }} />
      {loading ? <Loading /> : (
        <Table
          columns={salesColumns(scope, false)}
          rows={data || []}
          selectedId={readOnly ? undefined : sel}
          onSelect={readOnly ? undefined : setSel}
          totalLabel="المجموع الكلي"
          total={sumTotal(data)}
        />
      )}
      <ErrorText>{error}</ErrorText>
      {!readOnly && (
        <BtnRow>
          <Btn title="اضافة" onPress={() => nav.push('SaleForm', { scope, day, title: 'اضافة عملية بيع' })} />
          <Btn title="تعديل" disabled={!selected} onPress={() => nav.push('SaleForm', { scope, sale: selected })} />
          <DeleteBtn disabled={!selected} confirmTitle="حذف عملية بيع"
            message={selected && `حذف بيع ${fmt(selected.qty)} × ${selected.product}؟`}
            onConfirm={async () => {
              await sql('delete from maarid.sales where id=$1 and sub_id=$2', [selected.id, scope.subId]);
              setSel(null);
              reload();
            }} />
        </BtnRow>
      )}
      <BtnRow>
        <Btn title="بحث بمدة"
          onPress={() => nav.push('RangeSearch', {
            title: 'بحث في عمليات البيع', next: 'SalesResult', nextParams: { scope, name },
          })} />
      </BtnRow>
    </Screen>
  );
}

export function SalesResult({ scope, from, to }) {
  const { data, error, loading } = useLoad(() => salesQuery(scope, from, to), [from, to]);
  return (
    <Screen title={`عمليات البيع من يوم ${from} الى يوم ${to}`}>
      {loading ? <Loading /> : (
        <Table columns={salesColumns(scope, true)} rows={data || []} totalLabel="المجموع الكلي" total={sumTotal(data)} />
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

// available = received - sold (excluding the sale being edited)
const STOCK_OK = `(select coalesce(sum(qty),0) from maarid.transfers where sub_id=$1::int and product_id=$2::int)
  - (select coalesce(sum(qty),0) from maarid.sales where sub_id=$1::int and product_id=$2::int and id <> $6::int) >= $3::numeric`;

// "بيع منتج" / "اضافة عملية بيع" / "تعديل عملية بيع"
export function SaleForm({ scope, sale, day: initialDay, title }) {
  const nav = useNav();
  const { data: stock } = useLoad(() => subStockQuery(scope.subId, scope.mainId), [scope.subId]);
  const [productId, setProductId] = useState(sale?.product_id ?? null);
  const [qty, setQty] = useState(sale ? fmt(sale.qty) : '');
  const [price, setPrice] = useState(sale ? fmt(sale.price) : '');
  const [day, setDay] = useState(sale?.day || initialDay || today());
  const [error, setError] = useState('');

  const available = (p) => num(p.qty) + (sale && sale.product_id === p.id ? num(sale.qty) : 0);
  const options = (stock || [])
    .filter((p) => available(p) > 0 || p.id === productId)
    .map((p) => ({ value: p.id, label: `${p.name}  (المتوفر: ${fmt(available(p))})` }));
  const product = stock?.find((p) => p.id === productId);

  const pick = (id) => {
    setProductId(id);
    const p = stock.find((x) => x.id === id);
    if (p) setPrice(fmt(p.price));
  };

  const save = async () => {
    setError('');
    const q = parseNum(qty);
    const pr = parseNum(price);
    if (!productId) return setError('اختر المنتج');
    if (!(q > 0)) return setError('الكمية غير صحيحة');
    if (!(pr >= 0)) return setError('السعر غير صحيح');
    const params = [scope.subId, productId, q, pr, toSqlDate(day), sale?.id ?? 0];
    try {
      const row = sale
        ? await one(
            `update maarid.sales set product_id=$2::int, qty=$3::numeric, price=$4::numeric, day=$5::date
             where id=$6::int and sub_id=$1::int and ${STOCK_OK} returning id`,
            params
          )
        : await one(
            `insert into maarid.sales(sub_id, product_id, qty, price, day)
             select $1::int, $2::int, $3::numeric, $4::numeric, $5::date where ${STOCK_OK} returning id`,
            params
          );
      if (!row) return setError(`الكمية غير متوفرة (المتوفر: ${fmt(product ? available(product) : 0)})`);
      nav.back();
    } catch (e) {
      setError(e.message);
    }
  };

  const total = parseNum(qty) * parseNum(price);
  return (
    <Screen title={sale ? 'تعديل عملية بيع' : title || 'بيع منتج'}>
      <Select label="المنتج" value={productId} onChange={pick} options={options} placeholder="اختر المنتج" />
      {stock && options.length === 0 && <ErrorText>لا توجد سلع متوفرة في المعرض</ErrorText>}
      <Field label="الكمية" value={qty} onChangeText={setQty} numeric />
      <Field label="السعر" value={price} onChangeText={setPrice} numeric />
      <DateInput label="التاريخ" value={day} onChange={setDay} />
      <Text style={{ textAlign: 'right', color: C.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
        المجموع: {Number.isFinite(total) ? fmt(total) : '-'}
      </Text>
      <ErrorText>{error}</ErrorText>
      <Btn title={sale ? 'حفظ' : 'بيع'} variant="primary" onPress={save} />
    </Screen>
  );
}
