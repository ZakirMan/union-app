import os

file_path = '/Users/zakir/union-app/app/dashboard/page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update UserProfile interface
content = content.replace(
    '  photoUrl?: string;',
    '  photoUrl?: string;\n  createdAt?: string;'
)

# 2. Update activeTab state
content = content.replace(
    "const [activeTab, setActiveTab] = useState<'news' | 'chat' | 'resources' | 'training' | 'profile' | 'polls' | 'reports'>('news');",
    "const [activeTab, setActiveTab] = useState<'home' | 'resources' | 'profile' | 'polls' | 'reports'>('home');"
)

content = content.replace(
    "if (tabParam && ['news', 'chat', 'resources', 'training', 'profile', 'polls', 'reports'].includes(tabParam)) {",
    "if (tabParam && ['home', 'resources', 'profile', 'polls', 'reports'].includes(tabParam)) {"
)

# 3. Add states for admin request modal and month offset
state_insert = """  const [showAdminRequestModal, setShowAdminRequestModal] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
"""
content = content.replace(
    "  const [showAidModal, setShowAidModal] = useState(false);",
    state_insert + "\n  const [showAidModal, setShowAidModal] = useState(false);"
)

# 4. Modify the bottom navigation
old_nav_block = """{['news', 'chat', 'training', 'polls', 'reports', 'resources', 'profile'].map((tab) => {
          const isActive = activeTab === tab;
          const icons: { [key: string]: string } = { news: '📰', chat: '💬', training: '🎓', polls: '📋', reports: '📈', resources: '📂', profile: '👤' };
          const labels: { [key: string]: string } = { news: 'Главная', chat: 'Чат', training: 'Учеба', polls: 'Опросы', reports: 'Отчеты', resources: 'Инфо', profile: 'Я' };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'news' | 'chat' | 'resources' | 'training' | 'profile' | 'polls' | 'reports')}
              className={`flex-1 flex flex-col items-center py-3 rounded-[1.5rem] transition-all duration-300 ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 transform -translate-y-2' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="text-xl mb-0.5">{icons[tab]}</span>
              {isActive && <span className="text-[9px] font-black uppercase tracking-wide">{labels[tab]}</span>}
            </button>
          );
        })}"""

new_nav_block = """{['resources', 'polls', 'home', 'reports', 'profile'].map((tab) => {
          const isActive = activeTab === tab;
          const icons: { [key: string]: string } = { home: '🏠', polls: '📋', reports: '📈', resources: '📂', profile: '👤' };
          const labels: { [key: string]: string } = { home: 'Главная', polls: 'Опросы', reports: 'Отчеты', resources: 'Инфо', profile: 'Я' };
          
          if (tab === 'home') {
            return (
              <button
                key={tab}
                onClick={() => setActiveTab('home')}
                className={`relative -top-5 w-14 h-14 rounded-full flex items-center justify-center border-[4px] border-white shadow-xl transition-all duration-300 shrink-0 z-50 ${isActive ? 'bg-indigo-600 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
              >
                <span className="text-2xl">🏠</span>
              </button>
            );
          }
          
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 flex flex-col items-center py-3 rounded-[1.5rem] transition-all duration-300 ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 transform -translate-y-2' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="text-xl mb-0.5">{icons[tab]}</span>
              {isActive && <span className="text-[9px] font-black uppercase tracking-wide">{labels[tab]}</span>}
            </button>
          );
        })}"""

content = content.replace(old_nav_block, new_nav_block)

# 5. Extract components using clear splits
# We know the structure:
#         {activeTab === 'news' && (
# ...
#         {activeTab === 'chat' && (
# ...
#         {activeTab === 'resources' && (
# ...
#         {activeTab === 'training' && (
# ...
#         {activeTab === 'polls' && (

part1, rest = content.split("        {activeTab === 'news' && (", 1)
_, rest2 = rest.split("        {activeTab === 'resources' && (", 1)

# Now we have everything before news in part1.
# Everything from resources to end in rest2.
# But we also need to remove 'training' which is inside rest2.
part2_1, rest3 = rest2.split("        {activeTab === 'training' && (", 1)
_, part2_2 = rest3.split("        {activeTab === 'polls' && (", 1)

# Now we construct the new content.
month_names = "['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']"

home_tab_code = f"""
        {{activeTab === 'home' && (
          <div className="space-y-6 pb-24 animate-fade-in-up">
            
            {{/* Top Widgets */}}
            <div className="grid grid-cols-2 gap-4">
              <button onClick={{() => setShowAidModal(true)}} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center hover:shadow-md transition">
                <div className="w-16 h-16 bg-yellow-50 rounded-2xl flex items-center justify-center text-3xl mb-3 shadow-inner">
                  🏠
                </div>
                <span className="font-black text-gray-800 text-sm">Подать мат помощь</span>
              </button>
              
              <button onClick={{() => setShowAdminRequestModal(true)}} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center hover:shadow-md transition">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl mb-3 shadow-inner">
                  🏗️
                </div>
                <span className="font-black text-gray-800 text-sm">Обращение к админу</span>
              </button>
            </div>
            
            {{/* Statistics Widget */}}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-gray-800">Новые участники</h3>
                <div className="flex bg-gray-100 rounded-full p-1 gap-1">
                  <button onClick={{() => setMonthOffset(p => p - 1)}} className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm text-gray-600 font-bold hover:bg-gray-50 transition">&lt;</button>
                  <button onClick={{() => setMonthOffset(p => p + 1)}} className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm text-gray-600 font-bold hover:bg-gray-50 transition" disabled={{monthOffset >= 0}}>&gt;</button>
                </div>
              </div>
              
              {{(() => {{
                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + monthOffset);
                const targetMonth = targetDate.getMonth();
                const targetYear = targetDate.getFullYear();
                
                const mNames = {month_names};
                const monthName = mNames[targetMonth];
                
                let joinedCount = 0;
                colleagues.forEach(c => {{
                  if (c.createdAt) {{
                    const d = new Date(c.createdAt);
                    if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) joinedCount++;
                  }}
                }});
                if (userData?.createdAt) {{
                   const d = new Date(userData.createdAt);
                   if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) joinedCount++;
                }}
                
                return (
                  <div className="flex items-end justify-between bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
                    <div>
                      <div className="text-sm font-bold text-blue-100 mb-1">{{monthName}} {{targetYear}}</div>
                      <div className="text-3xl font-black">{{joinedCount}} чел.</div>
                    </div>
                    <div className="text-4xl opacity-50">🤝</div>
                  </div>
                );
              }})()}}
            </div>

            {{/* News Feed inside Home */}}
            <div>
              <h2 className="text-xl font-black text-gray-800 mb-4 px-2">Новости Профсоюза</h2>
              {{news.length === 0 ? (
                <div className="bg-white p-8 rounded-3xl text-center border border-dashed border-gray-200">
                  <p className="text-gray-400 font-bold">Нет новостей</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {{news.map((item) => (
                    <div key={{item.id}} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                      {{item.imageUrl && (
                        <div className="w-full h-48 bg-gray-100 rounded-2xl mb-4 overflow-hidden relative">
                          <Image src={{item.imageUrl}} alt={{item.title}} fill className="object-cover" />
                        </div>
                      )}}
                      <h3 className="font-black text-gray-900 text-lg mb-2">{{item.title}}</h3>
                      <p className="text-gray-600 text-sm mb-4 line-clamp-3 whitespace-pre-wrap">{{renderFormattedText(item.body)}}</p>
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-gray-400">{{new Date(item.createdAt).toLocaleDateString('ru-RU')}}</span>
                        {{item.fileUrl && (
                          <a href={{item.fileUrl}} target="_blank" rel="noopener noreferrer" className="text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition">
                            📄 Вложение
                          </a>
                        )}}
                        {{item.linkUrl && (
                          <a href={{item.linkUrl}} target="_blank" rel="noopener noreferrer" className="text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
                            🔗 Ссылка
                          </a>
                        )}}
                      </div>
                    </div>
                  ))}}
                </div>
              )}}
            </div>
          </div>
        )}}
        
        {{activeTab === 'resources' && (
"""

admin_modal_code = """
      {showAdminRequestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-up">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex justify-between items-center text-white shrink-0">
              <h3 className="font-black text-xl">Обращение к админу</h3>
              <button onClick={() => setShowAdminRequestModal(false)} className="text-white/50 hover:text-white bg-black/20 hover:bg-black/30 w-8 h-8 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <form onSubmit={sendRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Опишите ваш вопрос</label>
                  <textarea
                    value={message} onChange={e => setMessage(e.target.value)}
                    placeholder="Напишите сообщение администратору..."
                    className="w-full border border-gray-200 p-4 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all resize-none h-32"
                  ></textarea>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Прикрепить файл (необязательно)</label>
                  <input
                    type="file" onChange={e => setChatFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer"
                  />
                  {chatFile && <p className="text-xs text-green-600 mt-2 font-bold">Выбран файл: {chatFile.name}</p>}
                </div>
                
                <button type="submit" disabled={isSending || (!message.trim() && !chatFile)} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition shadow-lg shadow-blue-200 mt-4">
                  {isSending ? 'Отправка...' : 'Отправить'}
                </button>
              </form>
              
              <div className="mt-8 border-t border-gray-100 pt-6">
                <h4 className="font-black text-gray-800 mb-4">История ваших обращений</h4>
                {myRequests.length === 0 ? (
                  <p className="text-gray-400 text-sm font-medium text-center">Вы еще не отправляли обращений</p>
                ) : (
                  <div className="space-y-3">
                    {myRequests.map(req => (
                      <div key={req.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-sm relative group">
                        <button onClick={() => handleDeleteRequest(req.id)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        <div className="font-bold text-gray-800 mb-1 pr-6">{req.text}</div>
                        {req.fileUrl && (
                           <a href={req.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs font-bold mb-2 inline-block">📄 Вложение</a>
                        )}
                        <div className="text-xs text-gray-500 mb-2">{new Date(req.createdAt).toLocaleString('ru-RU')}</div>
                        {req.response ? (
                          <div className="bg-blue-50 text-blue-800 p-3 rounded-xl mt-2 border border-blue-100">
                            <span className="font-black text-[10px] uppercase text-blue-500 block mb-1">Ответ админа:</span>
                            {renderFormattedText(req.response)}
                          </div>
                        ) : (
                          <div className="text-orange-500 font-bold text-xs">Ожидает ответа...</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
"""

content = part1 + home_tab_code + part2_1 + "        {activeTab === 'polls' && (" + part2_2

# Add admin modal at the end before last </div >
last_div = content.rfind('</div >')
if last_div == -1:
    last_div = content.rfind('</div>')
content = content[:last_div] + admin_modal_code + content[last_div:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully replaced.")
