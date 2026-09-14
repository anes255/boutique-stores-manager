import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';

import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { onDataChanged } from '../../../src/events';
import { StoreRouteContext, BranchContext, asUuid } from '../../../src/store-route';
import { colors, spacing, type } from '../../../src/theme';
import { Button, Loader } from '../../../src/components/ui';

/**
 * كل صفحات الفرع: الرئيسية، بيع منتج، عمليات البيع، المخزون، المصاريف، الصندوق، الحسابات.
 *
 * هذا التخطيط هو المكان الوحيد الذي يحدد معرّف الفرع، ثم يمرره لكل الصفحات تحته.
 * المصدر الأول معامل هذا المسار نفسه، والاحتياطي هو العنوان الحالي /store/<id>/... .
 * القيمة تُثبَّت عند أول قراءة صالحة.
 */
export default function BranchStack() {
  const params = useLocalSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user, booting } = useAuth();
  const latched = useRef(null);
  const [name, setName] = useState(null);

  const fromParam = asUuid(params.storeId);
  const fromPath = asUuid(((pathname || '').match(/^\/store\/([^/?#]+)/) || [])[1]);
  if (fromParam) latched.current = fromParam;
  else if (!latched.current && fromPath) latched.current = fromPath;
  const storeId = latched.current;

  // اسم الفرع مرة واحدة لكل الصفحات (ويتحدث إذا غيّره المستخدم الرئيسي)
  useEffect(() => {
    if (!storeId || !user) return undefined;
    let alive = true;
    const load = () => api.get(`/api/stores/${storeId}`)
      .then((d) => { if (alive) setName(d.store?.name || null); })
      .catch(() => {});
    load();
    const off = onDataChanged(load);
    return () => { alive = false; off(); };
  }, [storeId, user]);

  const branch = useMemo(() => ({ id: storeId, name }), [storeId, name]);

  if (booting) return <Loader />;
  if (!user) return <Redirect href="/" />;

  if (!storeId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.lg, gap: 14 }}>
        <Text style={[type.section, { textAlign: 'center' }]}>تعذّر تحديد الفرع</Text>
        <Button title="الرجوع" icon="chevron-right" variant="soft"
          onPress={() => router.replace(user.role === 'admin' ? '/owner' : '/')} />
      </View>
    );
  }

  // المستخدم الفرعي لا يفتح إلا فرعه
  if (user.role !== 'admin' && user.store_id !== storeId) {
    return <Redirect href={`/store/${user.store_id}`} />;
  }

  return (
    <StoreRouteContext.Provider value={storeId}>
      <BranchContext.Provider value={branch}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_left',
          }}
        />
      </BranchContext.Provider>
    </StoreRouteContext.Provider>
  );
}
