import { useState } from 'react';
import { one, sql } from '../db';
import { useNav } from '../nav';
import {
  Btn, BtnRow, DeleteBtn, ErrorText, Hint, Loading, MenuBtn, Screen, StatBox, StatRow, Table, today, toSqlDate, useLoad,
} from '../ui';

// Today's sales + expenses for one showroom (or all showrooms of a main user).
async function dayStats({ subId, mainId }) {
  const d = toSqlDate(today());
  if (subId) {
    return one(
      `select
         (select coalesce(sum(qty*price),0) from maarid.sales where sub_id=$1 and day=$2) sales,
         (select coalesce(sum(amount),0) from maarid.expenses where sub_id=$1 and day=$2) expenses,
         (select coalesce(sum(case when kind='pay' then amount else -amount end),0) from maarid.cash_moves where sub_id=$1) cash`,
      [subId, d]
    );
  }
  return one(
    `select
       (select coalesce(sum(s.qty*s.price),0) from maarid.sales s join maarid.sub_users u on u.id=s.sub_id
         where u.main_id=$1 and s.day=$2) sales,
       (select coalesce(sum(amount),0) from maarid.expenses where main_id=$1 and day=$2) expenses`,
    [mainId, d]
  );
}

export function MainHome() {
  const nav = useNav();
  const { session } = nav;
  const { data } = useLoad(() => dayStats({ mainId: session.id }), [session.id]);
  return (
    <Screen title={session.username} date={today()}>
      <StatRow>
        <StatBox label="مبيعات اليوم" value={data?.sales} />
        <StatBox label="مصاريف اليوم" value={data?.expenses} />
      </StatRow>
      <MenuBtn title="المعارض" onPress={() => nav.push('Showrooms')} />
      <MenuBtn title="المنتجات" onPress={() => nav.push('Products')} />
      <MenuBtn title="المخزون" onPress={() => nav.push('MainStock')} />
      <MenuBtn title="عمليات البيع" onPress={() => nav.push('Sales', { scope: { mainId: session.id }, readOnly: true })} />
      <MenuBtn title="المصاريف" onPress={() => nav.push('Expenses', { owner: { mainId: session.id } })} />
      <MenuBtn title="تسجيل الخروج" onPress={nav.logout} />
    </Screen>
  );
}

export function SubHome() {
  const nav = useNav();
  const { session } = nav;
  const scope = { subId: session.id, mainId: session.mainId };
  const { data } = useLoad(() => dayStats(scope), [session.id]);
  return (
    <Screen title={session.username} date={today()}>
      <StatRow>
        <StatBox label="مبيعات اليوم" value={data?.sales} />
        <StatBox label="مصاريف اليوم" value={data?.expenses} />
      </StatRow>
      <MenuBtn title="بيع منتج" onPress={() => nav.push('SaleForm', { scope })} />
      <MenuBtn title="عمليات البيع" onPress={() => nav.push('Sales', { scope })} />
      <MenuBtn title="المخزون" onPress={() => nav.push('SubStock', { scope })} />
      <MenuBtn title="المصاريف" onPress={() => nav.push('Expenses', { owner: { subId: session.id } })} />
      <MenuBtn title="الصندوق" onPress={() => nav.push('Cash', { subId: session.id })} />
      <MenuBtn title="تسجيل الخروج" onPress={nav.logout} />
    </Screen>
  );
}

// "المعارض": list of showrooms (sub users) of the main user
export function Showrooms() {
  const nav = useNav();
  const mainId = nav.session.id;
  const [sel, setSel] = useState(null);
  const { data, error, loading, reload } = useLoad(
    () =>
      sql(
        `select u.id, u.username,
           coalesce((select sum(qty*price) from maarid.sales where sub_id=u.id),0) total
         from maarid.sub_users u where u.main_id=$1 order by u.id`,
        [mainId]
      ),
    [mainId]
  );
  const selected = data?.find((r) => r.id === sel);
  return (
    <Screen title="المعارض" date={today()}>
      <Hint>كل مستخدم فرعي يسجل باسمك يظهر هنا كمعرض.</Hint>
      {loading ? <Loading /> : (
        <Table
          columns={[{ key: 'username', title: 'المعرض', flex: 2 }]}
          rows={data || []}
          selectedId={sel}
          onSelect={setSel}
          emptyText="لا توجد معارض بعد"
        />
      )}
      <ErrorText>{error}</ErrorText>
      <BtnRow>
        <Btn title="فتح" disabled={!selected}
          onPress={() => nav.push('ShowroomHome', { subId: selected.id, name: selected.username })} />
        <DeleteBtn disabled={!selected} confirmTitle="حذف معرض"
          message={selected && `حذف المعرض "${selected.username}" وكل عملياته؟`}
          onConfirm={async () => {
            await sql('delete from maarid.sub_users where id=$1 and main_id=$2', [selected.id, mainId]);
            setSel(null);
            reload();
          }} />
      </BtnRow>
    </Screen>
  );
}

// Main user's view of one showroom ("معرض 1")
export function ShowroomHome({ subId, name }) {
  const nav = useNav();
  const scope = { subId, mainId: nav.session.id };
  const { data } = useLoad(() => dayStats(scope), [subId]);
  return (
    <Screen title={name} date={today()}>
      <StatRow>
        <StatBox label="مبيعات اليوم" value={data?.sales} />
        <StatBox label="مصاريف اليوم" value={data?.expenses} />
      </StatRow>
      <StatRow>
        <StatBox label="رصيد الصندوق" value={data?.cash} />
      </StatRow>
      <MenuBtn title="المخزون" onPress={() => nav.push('SubStock', { scope, name })} />
      <MenuBtn title="عمليات البيع" onPress={() => nav.push('Sales', { scope, readOnly: true, name })} />
      <MenuBtn title="المصاريف" onPress={() => nav.push('Expenses', { owner: { subId }, readOnly: true, name })} />
      <MenuBtn title="الصندوق" onPress={() => nav.push('Cash', { subId, readOnly: true, name })} />
    </Screen>
  );
}
