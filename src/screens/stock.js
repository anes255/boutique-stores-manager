import { useState } from 'react';
import { one, sql } from '../db';
import { useNav } from '../nav';
import {
  Btn, BtnRow, DateInput, ErrorText, Field, Hint, Loading, Screen, Select, Table, fmt, num, parseNum, today,
  toSqlDate, useLoad,
} from '../ui';

// Main warehouse: stock added minus goods sent to showrooms.
export const mainStockQuery = (mainId) =>
  sql(
    `select p.id, p.name, coalesce(i.q,0) - coalesce(t.q,0) qty
     from maarid.products p
     left join (select product_id, sum(qty) q from maarid.stock_in group by 1) i on i.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.transfers group by 1) t on t.product_id = p.id
     where p.main_id = $1 order by p.name`,
    [mainId]
  );

// Showroom stock: goods received minus goods sold.
export const subStockQuery = (subId, mainId) =>
  sql(
    `select p.id, p.name, p.price, coalesce(t.q,0) - coalesce(s.q,0) qty
     from maarid.products p
     left join (select product_id, sum(qty) q from maarid.transfers where sub_id=$1 group by 1) t on t.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.sales where sub_id=$1 group by 1) s on s.product_id = p.id
     where p.main_id = $2 order by p.name`,
    [subId, mainId]
  );

export function MainStock() {
  const nav = useNav();
  const mainId = nav.session.id;
  const { data, error, loading } = useLoad(() => mainStockQuery(mainId), [mainId]);
  const total = (data || []).reduce((a, r) => a + num(r.qty), 0);
  return (
    <Screen title="المخزون" date={today()}>
      {loading ? <Loading /> : (
        <Table
          columns={[
            { key: 'name', title: 'المنتج', flex: 2 },
            { key: 'qty', title: 'الكمية', render: (r) => fmt(r.qty) },
          ]}
          rows={data || []}
          totalLabel="المجموع الكلي"
          total={total}
        />
      )}
      <ErrorText>{error}</ErrorText>
      <BtnRow>
        <Btn title="اضافة كمية" onPress={() => nav.push('StockAdd')} />
        <Btn title="ارسال سلعة" onPress={() => nav.push('SendGoods')} />
      </BtnRow>
      <BtnRow>
        <Btn title="بحث بمدة"
          onPress={() => nav.push('RangeSearch', { title: 'بحث في السلع المرسلة', next: 'TransfersResult', nextParams: {} })} />
      </BtnRow>
    </Screen>
  );
}

export function StockAdd() {
  const nav = useNav();
  const mainId = nav.session.id;
  const { data } = useLoad(() => mainStockQuery(mainId), [mainId]);
  const [productId, setProductId] = useState(null);
  const [qty, setQty] = useState('');
  const [day, setDay] = useState(today());
  const [error, setError] = useState('');
  const save = async () => {
    const q = parseNum(qty);
    if (!productId) return setError('اختر المنتج');
    if (!(q > 0)) return setError('الكمية غير صحيحة');
    try {
      await one('insert into maarid.stock_in(main_id, product_id, qty, day) values ($1,$2,$3,$4)', [
        mainId, productId, q, toSqlDate(day),
      ]);
      nav.back();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Screen title="اضافة كمية للمخزون">
      <Select label="المنتج" value={productId} onChange={setProductId}
        options={(data || []).map((p) => ({ value: p.id, label: `${p.name}  (${fmt(p.qty)})` }))} />
      <Field label="الكمية" value={qty} onChangeText={setQty} numeric />
      <DateInput label="التاريخ" value={day} onChange={setDay} />
      <ErrorText>{error}</ErrorText>
      <Btn title="اضافة" variant="primary" onPress={save} />
    </Screen>
  );
}

// Send goods from main stock to a showroom.
export function SendGoods({ subId: presetSub }) {
  const nav = useNav();
  const mainId = nav.session.id;
  const { data } = useLoad(
    async () => ({
      stock: await mainStockQuery(mainId),
      subs: await sql('select id, username from maarid.sub_users where main_id=$1 order by id', [mainId]),
    }),
    [mainId]
  );
  const [subId, setSubId] = useState(presetSub || null);
  const [productId, setProductId] = useState(null);
  const [qty, setQty] = useState('');
  const [day, setDay] = useState(today());
  const [error, setError] = useState('');
  const product = data?.stock.find((p) => p.id === productId);
  const save = async () => {
    const q = parseNum(qty);
    if (!subId) return setError('اختر المعرض');
    if (!productId) return setError('اختر المنتج');
    if (!(q > 0)) return setError('الكمية غير صحيحة');
    try {
      const row = await one(
        `insert into maarid.transfers(main_id, sub_id, product_id, qty, day)
         select $1::int, $2::int, $3::int, $4::numeric, $5::date
         where (select coalesce(sum(qty),0) from maarid.stock_in where product_id=$3::int)
             - (select coalesce(sum(qty),0) from maarid.transfers where product_id=$3::int) >= $4::numeric
         returning id`,
        [mainId, subId, productId, q, toSqlDate(day)]
      );
      if (!row) return setError(`الكمية غير متوفرة في المخزون (المتوفر: ${fmt(product?.qty)})`);
      nav.back();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Screen title="ارسال سلعة">
      <Select label="المعرض" value={subId} onChange={setSubId}
        options={(data?.subs || []).map((u) => ({ value: u.id, label: u.username }))} />
      <Select label="المنتج" value={productId} onChange={setProductId}
        options={(data?.stock || []).map((p) => ({ value: p.id, label: `${p.name}  (${fmt(p.qty)})` }))} />
      <Field label="الكمية" value={qty} onChangeText={setQty} numeric />
      <DateInput label="التاريخ" value={day} onChange={setDay} />
      <ErrorText>{error}</ErrorText>
      <Btn title="ارسال" variant="primary" onPress={save} />
    </Screen>
  );
}

export function TransfersResult({ from, to, subId }) {
  const nav = useNav();
  const { data, error, loading } = useLoad(
    () =>
      sql(
        `select t.id, u.username showroom, p.name product, t.qty, to_char(t.day,'YYYY/MM/DD') as day
         from maarid.transfers t
         join maarid.products p on p.id = t.product_id
         join maarid.sub_users u on u.id = t.sub_id
         where t.main_id = $1 and t.day between $2 and $3 and ($4::int is null or t.sub_id = $4)
         order by t.day, t.id`,
        [nav.session.mainId, toSqlDate(from), toSqlDate(to), subId || null]
      ),
    [from, to, subId]
  );
  const total = (data || []).reduce((a, r) => a + num(r.qty), 0);
  return (
    <Screen title={`السلع المرسلة من يوم ${from} الى يوم ${to}`}>
      {loading ? <Loading /> : (
        <Table
          columns={[
            { key: 'day', title: 'التاريخ', flex: 1.3 },
            { key: 'showroom', title: 'المعرض', flex: 1.2 },
            { key: 'product', title: 'المنتج', flex: 1.3 },
            { key: 'qty', title: 'الكمية', render: (r) => fmt(r.qty) },
          ]}
          rows={data || []}
          totalLabel="المجموع الكلي"
          total={total}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

// Showroom stock (sub user, or main user viewing a showroom).
export function SubStock({ scope, name }) {
  const nav = useNav();
  const isMain = nav.session.role === 'main';
  const { data, error, loading } = useLoad(() => subStockQuery(scope.subId, scope.mainId), [scope.subId]);
  const rows = (data || []).filter((r) => num(r.qty) !== 0);
  const total = rows.reduce((a, r) => a + num(r.qty), 0);
  return (
    <Screen title={name ? `المخزون - ${name}` : 'المخزون'} date={today()}>
      {loading ? <Loading /> : (
        <Table
          columns={[
            { key: 'name', title: 'المنتج', flex: 2 },
            { key: 'qty', title: 'الكمية المتوفرة', render: (r) => fmt(r.qty) },
          ]}
          rows={rows}
          totalLabel="المجموع الكلي"
          total={total}
          emptyText="لا توجد سلع في المعرض"
        />
      )}
      <ErrorText>{error}</ErrorText>
      {isMain ? (
        <BtnRow>
          <Btn title="ارسال سلعة" onPress={() => nav.push('SendGoods', { subId: scope.subId })} />
          <Btn title="بحث بمدة"
            onPress={() => nav.push('RangeSearch', {
              title: 'بحث في السلع المرسلة', next: 'TransfersResult', nextParams: { subId: scope.subId },
            })} />
        </BtnRow>
      ) : (
        <Hint>السلع تصل الى المعرض عن طريق المستخدم الرئيسي.</Hint>
      )}
    </Screen>
  );
}
