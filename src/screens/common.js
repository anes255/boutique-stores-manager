import { useState } from 'react';
import { View } from 'react-native';
import { useNav } from '../nav';
import { Btn, DateInput, ErrorText, Screen, today } from '../ui';

// "من [date] الى [date]" then "بحث" -> opens result screen with {from, to}
export function RangeSearch({ title, next, nextParams }) {
  const nav = useNav();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [error, setError] = useState('');
  return (
    <Screen title={title || 'بحث بمدة'}>
      <DateInput label="من" value={from} onChange={setFrom} />
      <DateInput label="الى" value={to} onChange={setTo} />
      <ErrorText>{error}</ErrorText>
      <View style={{ marginTop: 8 }}>
        <Btn
          title="بحث"
          variant="primary"
          onPress={() => {
            if (from > to) return setError('تاريخ البداية بعد تاريخ النهاية');
            nav.push(next, { ...nextParams, from, to });
          }}
        />
      </View>
    </Screen>
  );
}
