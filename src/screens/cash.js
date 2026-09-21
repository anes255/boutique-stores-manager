import { useState } from 'react';
import { one, sql } from '../db';
import { useNav } from '../nav';
import {
  Btn, BtnRow, DateInput, DeleteBtn, ErrorText, Field, Loading, Screen, StatBox, StatRow, Table, fmt, num,
  parseNum, today, toSqlDate, useLoad,
} from '../ui';

const KIND = { pay: 'دفع', return: 'ارجاع' };

// "الصندوق": money paid by the showroom to the main user, and money returned.
export function Cash({ subId, readOnly, name }) {
  const nav = useNav();
  const [sel, setSel] = useState(null);
  const { data, error, loading, reload } = useLoad(
    () =>
      sql(
        `select id, kind, amount, to_char(day,'YYYY/MM/DD') as day from maarid.cash_moves
         where sub_id=$1 order by day desc, id desc`,
        [subId]
      ),
    [subId]
  );
  const rows = data || [];
  const paid = rows.filter((r) => r.kind === 'pay').reduce((a, r) => a + num(r.amount), 0);
  const returned = rows.filter((r) => r.kind === 'return').reduce((a, r) => a + num(r.amount), 0);
  const selected = rows.find((r) => r.id === sel);
  return (
    <Screen title={name ? `الصندوق - ${name}` : 'الصندوق'} date={today()}>
      <StatRow>
        <StatBox label="المدفوع" value={data ? paid : null} />
        <StatBox label="المرجع" value={data ? returned : null} />
        <StatBox label="الرصيد" value={data ? paid - returned : null} />
      </StatRow>
      {loading ? <Loading /> : (
        <Table
          columns={[
            { key: 'kind', title: 'النوع', render: (r) => KIND[r.kind] },
            { key: 'day', title: 'التاريخ', flex: 1.4 },
            { key: 'amount', title: 'المبلغ', render: (r) => fmt(r.amount) },
          ]}
          rows={rows}
          selectedId={readOnly ? undefined : sel}
          onSelect={readOnly ? undefined : setSel}
          emptyText="لا توجد عمليات دفع او ارجاع"
        />
      )}
      <ErrorText>{error}</ErrorText>
      {!readOnly && (
        <>
          <BtnRow>
            <Btn title="دفع مبلغ جديد" onPress={() => nav.push('CashForm', { subId, kind: 'pay' })} />
            <Btn title="ارجاع مبلغ" onPress={() => nav.push('CashForm', { subId, kind: 'return' })} />
          </BtnRow>
          {selected && (
            <BtnRow>
              <DeleteBtn confirmTitle="حذف عملية"
                message={`حذف عملية ${KIND[selected.kind]} بمبلغ ${fmt(selected.amount)}؟`}
                onConfirm={async () => {
                  await sql('delete from maarid.cash_moves where id=$1 and sub_id=$2', [selected.id, subId]);
                  setSel(null);
                  reload();
                }} />
            </BtnRow>
          )}
        </>
      )}
    </Screen>
  );
}

export function CashForm({ subId, kind }) {
  const nav = useNav();
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(today());
  const [error, setError] = useState('');
  const save = async () => {
    const a = parseNum(amount);
    if (!(a > 0)) return setError('المبلغ غير صحيح');
    try {
      await one('insert into maarid.cash_moves(sub_id, kind, amount, day) values ($1,$2,$3,$4)', [
        subId, kind, a, toSqlDate(day),
      ]);
      nav.back();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Screen title={kind === 'pay' ? 'دفع مبلغ جديد' : 'ارجاع مبلغ'}>
      <Field label="المبلغ" value={amount} onChangeText={setAmount} numeric />
      <DateInput label="التاريخ" value={day} onChange={setDay} />
      <ErrorText>{error}</ErrorText>
      <Btn title={KIND[kind]} variant="primary" onPress={save} />
    </Screen>
  );
}
