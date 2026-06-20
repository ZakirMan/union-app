import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. State variable
state_str = "  const [isCreatingPoll, setIsCreatingPoll] = useState(false);"
new_state_str = "  const [isCreatingPoll, setIsCreatingPoll] = useState(false);\n  const [pollCategoryFilter, setPollCategoryFilter] = useState('all');"
content = content.replace(state_str, new_state_str)

# 2. UI filter dropdown and mapping
ui_polls_old = '''              <div className="grid md:grid-cols-2 gap-4">
                {polls.map(poll => (
                  <div key={poll.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-black text-lg">{poll.question}</h3>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${poll.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{poll.isActive ? 'Активен' : 'Завершен'}</span>
                    </div>'''

ui_polls_new = '''              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                <h2 className="font-black text-xl">Все опросы</h2>
                <select 
                  className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-green-500 text-sm font-bold bg-white"
                  value={pollCategoryFilter}
                  onChange={(e) => setPollCategoryFilter(e.target.value)}
                >
                  <option value="all">Все категории</option>
                  <option value="Все">Для всех (Общие)</option>
                  <option value="Бортпроводник">Бортпроводник</option>
                  <option value="Пилот">Пилот</option>
                  <option value="Наземка">Наземка</option>
                  <option value="Перрон">Перрон</option>
                  <option value="Инженеры">Инженеры</option>
                  <option value="Руководитель">Руководитель</option>
                  <option value="Офис">Офис</option>
                  <option value="Авиационная безопасность">Авиационная безопасность</option>
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {polls.filter(p => pollCategoryFilter === 'all' || p.targetCategory === pollCategoryFilter || (!p.targetCategory && pollCategoryFilter === 'Все')).map(poll => (
                  <div key={poll.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-black text-lg leading-tight pr-2">{poll.question}</h3>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase whitespace-nowrap ${poll.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{poll.isActive ? 'Активен' : 'Завершен'}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">🎯 {poll.targetCategory || 'Для всех'}</span>
                      <span className="text-[10px] font-bold text-gray-400">📅 {new Date(poll.createdAt).toLocaleDateString('ru-RU')}</span>
                    </div>'''

if ui_polls_old in content:
    content = content.replace(ui_polls_old, ui_polls_new)
else:
    print("Could not find polls UI string!")

with open(filepath, 'w') as f:
    f.write(content)

print("Patch applied")
