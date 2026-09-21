import { useState } from 'react';
import { View } from 'react-native';
import { one } from '../db';
import { useNav } from '../nav';
import { Btn, ErrorText, Field, MenuBtn, Screen } from '../ui';

const TABLE = { main: 'maarid.main_users', sub: 'maarid.sub_users' };

// "الدخول": مستخدم رئيسي / مستخدم فرعي
export function Welcome() {
  const nav = useNav();
  return (
    <Screen title="الدخول">
      <View style={{ marginTop: 30 }}>
        <MenuBtn title="مستخدم رئيسي" onPress={() => nav.push('Login', { role: 'main' })} />
        <MenuBtn title="مستخدم فرعي" onPress={() => nav.push('Login', { role: 'sub' })} />
      </View>
    </Screen>
  );
}

export function Login({ role }) {
  const nav = useNav();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) return setError('ادخل اسم المستخدم وكلمة السر');
    try {
      const cols = role === 'sub' ? 'id, username, main_id' : 'id, username';
      const user = await one(
        `select ${cols} from ${TABLE[role]} where username = $1 and password_hash = crypt($2, password_hash)`,
        [username.trim(), password]
      );
      if (!user) return setError('اسم المستخدم او كلمة السر خطأ');
      nav.login({ role, id: user.id, username: user.username, mainId: role === 'sub' ? user.main_id : user.id });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Screen title={role === 'main' ? 'تسجيل دخول رئيسي' : 'تسجيل دخول فرعي'}>
      <Field label="اسم المستخدم" value={username} onChangeText={setUsername} />
      <Field label="كلمة السر" value={password} onChangeText={setPassword} secure />
      <ErrorText>{error}</ErrorText>
      <Btn title="دخول" variant="primary" onPress={submit} />
      <View style={{ marginTop: 22 }}>
        <Btn
          title={role === 'main' ? 'انشاء مستخدم رئيسي جديد' : 'انشاء مستخدم فرعي جديد'}
          onPress={() => nav.push('Register', { role })}
        />
      </View>
    </Screen>
  );
}

export function Register({ role }) {
  const nav = useNav();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mainName, setMainName] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    const name = username.trim();
    if (!name || !password) return setError('املأ كل الخانات');
    if (password.length < 4) return setError('كلمة السر قصيرة (4 احرف على الاقل)');
    if (password !== confirm) return setError('كلمتا السر غير متطابقتين');
    try {
      if (role === 'main') {
        const u = await one(
          `insert into maarid.main_users(username, password_hash) values ($1, crypt($2, gen_salt('bf'))) returning id, username`,
          [name, password]
        );
        nav.login({ role: 'main', id: u.id, username: u.username, mainId: u.id });
      } else {
        if (!mainName.trim()) return setError('ادخل اسم المستخدم الرئيسي');
        const u = await one(
          `insert into maarid.sub_users(main_id, username, password_hash)
           select id, $2, crypt($3, gen_salt('bf')) from maarid.main_users where username = $1
           returning id, username, main_id`,
          [mainName.trim(), name, password]
        );
        if (!u) return setError('المستخدم الرئيسي غير موجود');
        nav.login({ role: 'sub', id: u.id, username: u.username, mainId: u.main_id });
      }
    } catch (e) {
      setError(e.code === '23505' ? 'اسم المستخدم موجود من قبل' : e.message);
    }
  };

  return (
    <Screen title={role === 'main' ? 'انشاء مستخدم رئيسي جديد' : 'انشاء مستخدم فرعي جديد'}>
      <Field label="اسم المستخدم" value={username} onChangeText={setUsername} />
      <Field label="كلمة السر" value={password} onChangeText={setPassword} secure />
      <Field label="تأكيد كلمة السر" value={confirm} onChangeText={setConfirm} secure />
      {role === 'sub' && (
        <Field label="اسم المستخدم الرئيسي" value={mainName} onChangeText={setMainName} />
      )}
      <ErrorText>{error}</ErrorText>
      <Btn title="انشاء" variant="primary" onPress={submit} />
    </Screen>
  );
}
