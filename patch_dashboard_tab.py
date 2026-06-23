import sys

filepath = 'app/dashboard/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

old_use_effect = '''  // --- ЗАГРУЗКА ДАННЫХ ---
  useEffect(() => {
    if (activeTab === 'reports' && !unionStats && !isStatsLoading && user) {'''

new_use_effect = '''  // --- ЗАГРУЗКА ДАННЫХ ---
  useEffect(() => {
    // Проверка URL параметра для открытия нужной вкладки при переходе из пуш-уведомления
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['news', 'chat', 'resources', 'training', 'profile', 'polls', 'reports'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'reports' && !unionStats && !isStatsLoading && user) {'''
content = content.replace(old_use_effect, new_use_effect)

with open(filepath, 'w') as f:
    f.write(content)

print("Dashboard page patched")
