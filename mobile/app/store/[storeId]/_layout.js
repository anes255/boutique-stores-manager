import React, { useRef } from 'react';
import { Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';

import { useAuth } from '../../../src/auth';
import { StoreRouteContext, asUuid } from '../../../src/store-route';
import { colors, spacing, type } from '../../../src/theme';
import { Button, Loader } from '../../../src/components/ui';

/**
 * كل محل له مكدّس شاشات خاص به: التبويبات، ثم النماذج فوقها.
 *
 * هذا التخطيط هو المكان الوحيد الذي يحدد معرّف المحل، ثم يمرره لكل الشاشات
 * تحته. المصدر الأول معامل هذا المسار نفسه (هو صاحب الجزء [storeId])،
 * والاحتياطي هو العنوان الحالي /store/<id>/... . القيمة تُثبَّت عند أول قراءة
 * صالحة، حتى لا يأخذ محل مفتوح في الخلفية معرّف المحل الظاهر فوقه.
 */
export default function StoreStack() {
  const params = useLocalSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user, booting } = useAuth();
  const latched = useRef(null);

  const fromParam = asUuid(params.storeId);
  const fromPath = asUuid(((pathname || '').match(/^\/store\/([^/?#]+)/) || [])[1]);
  if (fromParam) latched.current = fromParam;
  else if (!latched.current && fromPath) latched.current = fromPath;
  const storeId = latched.current;

  if (booting) return <Loader />;
  if (!user) return <Redirect href="/login" />;

  if (!storeId) {
    // أفضل من إرسال قيمة غير صالحة للخادم
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.lg, gap: 14 }}>
        <Text style={[type.section, { textAlign: 'center' }]}>تعذّر تحديد المحل</Text>
        <Text style={[type.tiny, { textAlign: 'center' }]}>
          {`القيمة المستلمة: ${String(params.storeId)} · ${pathname}`}
        </Text>
        <Button title="الرجوع" icon="chevron-right" variant="soft"
          onPress={() => router.replace(user.role === 'admin' ? '/admin/stores' : '/')} />
      </View>
    );
  }

  // حساب المحل لا يفتح إلا محله
  if (user.role !== 'admin' && user.store_id !== storeId) {
    return <Redirect href={`/store/${user.store_id}`} />;
  }

  return (
    <StoreRouteContext.Provider value={storeId}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_bottom',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      </Stack>
    </StoreRouteContext.Provider>
  );
}
