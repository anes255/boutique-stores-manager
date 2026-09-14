/** كلمة سر سهلة القراءة: كلمة + 4 أرقام (مثال: ward5476) */
export function suggestPassword() {
  const words = ['nour', 'amal', 'ward', 'fajr', 'rima', 'sama', 'hana', 'nada'];
  return words[Math.floor(Math.random() * words.length)] + Math.floor(1000 + Math.random() * 9000);
}
