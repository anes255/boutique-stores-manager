import { useState } from 'react';
import { one, sql } from '../db';
import { useNav } from '../nav';
import { Btn, BtnRow, DeleteBtn, ErrorText, Field, Loading, Screen, Table, fmt, parseNum, today, useLoad } from '../ui';

export function Products() {
  const nav = useNav();
  const mainId = nav.session.id;
  const [sel, setSel] = useState(null);
  const { data, error, loading, reload } = useLoad(
    () => sql('select id, name, price from maarid.products where main_id=$1 order by name', [mainId]),
    [mainId]
  );
  const selected = data?.find((r) => r.id === sel);
  return (
    <Screen title="المنتجات" date={today()}>
      {loading ? <Loading /> : (
        <Table
          columns={[
            { key: 'name', title: 'المنتج', flex: 2 },
            { key: 'price', title: 'السعر', render: (r) => fmt(r.price) },
          ]}
          rows={data || []}
          selectedId={sel}
          onSelect={setSel}
        />
      )}
      <ErrorText>{error}</ErrorText>
      <BtnRow>
        <Btn title="اضافة" onPress={() => nav.push('ProductForm')} />
        <Btn title="تعديل" disabled={!selected} onPress={() => nav.push('ProductForm', { product: selected })} />
        <DeleteBtn disabled={!selected} confirmTitle="حذف منتج"
          message={selected && `حذف المنتج "${selected.name}"؟`}
          onConfirm={async () => {
            await sql('delete from maarid.products where id=$1 and main_id=$2', [selected.id, mainId]);
            setSel(null);
            reload();
          }} />
      </BtnRow>
    </Screen>
  );
}

export function ProductForm({ product }) {
  const nav = useNav();
  const [name, setName] = useState(product?.name || '');
  const [price, setPrice] = useState(product ? fmt(product.price) : '');
  const [error, setError] = useState('');
  const save = async () => {
    const p = parseNum(price);
    if (!name.trim()) return setError('ادخل اسم المنتج');
    if (!(p >= 0)) return setError('السعر غير صحيح');
    try {
      if (product) {
        await one('update maarid.products set name=$1, price=$2 where id=$3', [name.trim(), p, product.id]);
      } else {
        await one('insert into maarid.products(main_id, name, price) values ($1,$2,$3)', [nav.session.id, name.trim(), p]);
      }
      nav.back();
    } catch (e) {
      setError(e.code === '23505' ? 'المنتج موجود من قبل' : e.message);
    }
  };
  return (
    <Screen title={product ? 'تعديل منتج' : 'اضافة منتج'}>
      <Field label="اسم المنتج" value={name} onChangeText={setName} />
      <Field label="السعر" value={price} onChangeText={setPrice} numeric />
      <ErrorText>{error}</ErrorText>
      <Btn title={product ? 'حفظ' : 'اضافة'} variant="primary" onPress={save} />
    </Screen>
  );
}
