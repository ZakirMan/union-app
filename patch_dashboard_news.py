import sys

filepath = 'app/dashboard/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update NewsItem
old_news_int = "interface NewsItem { id: string; title: string; body: string; imageUrl?: string; fileUrl?: string; linkUrl?: string; createdAt: string; }"
new_news_int = "interface NewsItem { id: string; title: string; body: string; imageUrl?: string; fileUrl?: string; linkUrl?: string; createdAt: string; requiresResponse?: boolean; responseDeadlineDays?: number; isResponseReceived?: boolean; }"
content = content.replace(old_news_int, new_news_int)

# 2. Add import for holidays
old_import = "import { auth, db } from '@/lib/firebase';"
new_import = "import { auth, db } from '@/lib/firebase';\\nimport { getWorkingDaysLeft } from '@/lib/holidays';"
content = content.replace(old_import, new_import)

# 3. Add UI in news map
old_ui_news = '''                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 leading-tight pr-4">{n.title}</h2>
                    <span className="text-xs font-bold text-gray-400 whitespace-nowrap bg-gray-50 px-3 py-1 rounded-full">
                      {new Date(n.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>'''

new_ui_news = '''                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 leading-tight pr-4">{n.title}</h2>
                    <span className="text-xs font-bold text-gray-400 whitespace-nowrap bg-gray-50 px-3 py-1 rounded-full">
                      {new Date(n.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  {n.requiresResponse && n.responseDeadlineDays && (
                    <div className="mb-4">
                      {n.isResponseReceived ? (
                        <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1.5 rounded-xl text-xs font-black">
                          ✅ Ответ от работодателя получен
                        </div>
                      ) : getWorkingDaysLeft(n.createdAt, n.responseDeadlineDays) < 0 ? (
                        <div className="inline-flex items-center gap-2 bg-red-100 text-red-600 px-3 py-1.5 rounded-xl text-xs font-black">
                          ⚠️ Срок ответа истек
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl text-xs font-black">
                          ⏳ До ответа осталось: {getWorkingDaysLeft(n.createdAt, n.responseDeadlineDays)} рабочих дней
                        </div>
                      )}
                    </div>
                  )}'''
content = content.replace(old_ui_news, new_ui_news)

with open(filepath, 'w') as f:
    f.write(content)

print("Dashboard patched")
