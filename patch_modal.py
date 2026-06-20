import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. State
state_old = "const [logs, setLogs] = useState<AdminLog[]>([]);"
state_new = "const [logs, setLogs] = useState<AdminLog[]>([]);\n  const [selectedMonthStats, setSelectedMonthStats] = useState<{name: string, details: any[]} | null>(null);"
if state_old in content:
    content = content.replace(state_old, state_new)

# 2. Text
text_old = "Новые члены профсоюза за текущий год ({new Date().getFullYear()}). Наведите на месяц для деталей."
text_new = "Новые члены профсоюза за текущий год ({new Date().getFullYear()}). Нажмите на месяц для деталей."
if text_old in content:
    content = content.replace(text_old, text_new)

# 3. Card mapping
card_old = """                        return (
                          <div key={m.num} tabIndex={0} className="bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm hover:bg-white/20 transition cursor-pointer md:cursor-default relative group/month outline-none">
                            <span className="text-[10px] text-blue-200 font-bold mb-1 uppercase tracking-wider">{m.name}</span>
                            <span className={`text-xl md:text-2xl font-black ${stat.count > 0 ? 'text-white' : 'text-white/30'}`}>{stat.count}</span>
                            
                            {stat.details && stat.details.length > 0 && (
                              <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-gray-900 text-white text-xs rounded-xl p-3 opacity-0 invisible group-hover/month:opacity-100 group-hover/month:visible group-focus/month:opacity-100 group-focus/month:visible transition-all shadow-xl pointer-events-none">
                                <div className="font-black mb-2 text-blue-400 border-b border-gray-700 pb-1">Новые участники ({m.name})</div>
                                <div className="max-h-32 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-600">
                                  {stat.details.map((d, i) => (
                                    <div key={i} className="flex flex-col">
                                      <span className="font-bold">{d.name}</span>
                                      <span className="text-blue-300 font-black text-[10px]">{d.position}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                              </div>
                            )}
                          </div>
                        );"""

card_new = """                        return (
                          <div 
                            key={m.num} 
                            onClick={() => { if (stat.count > 0) setSelectedMonthStats({ name: m.name, details: stat.details }); }}
                            className={`bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm transition ${stat.count > 0 ? 'cursor-pointer hover:bg-white/20 hover:scale-105' : 'cursor-default opacity-50'}`}
                          >
                            <span className="text-[10px] text-blue-200 font-bold mb-1 uppercase tracking-wider">{m.name}</span>
                            <span className={`text-xl md:text-2xl font-black ${stat.count > 0 ? 'text-white' : 'text-white/30'}`}>{stat.count}</span>
                          </div>
                        );"""
if card_old in content:
    content = content.replace(card_old, card_new)

# 4. Modal component
modal_code = """
      {/* MODAL FOR MONTH STATS */}
      {selectedMonthStats && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="font-black text-xl">Новые участники</h3>
                <p className="text-blue-100 text-sm font-bold opacity-80">Месяц: {selectedMonthStats.name}</p>
              </div>
              <button onClick={() => setSelectedMonthStats(null)} className="text-white/50 hover:text-white bg-black/20 hover:bg-black/30 w-8 h-8 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {selectedMonthStats.details.map((d, i) => (
                <div key={i} className="flex flex-col bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <span className="font-black text-gray-900">{d.name}</span>
                  <span className="text-blue-500 font-bold text-xs mt-1">{d.position}</span>
                </div>
              ))}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0">
              <button onClick={() => setSelectedMonthStats(null)} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
"""

end_str = """        </div>
      </div>
    </div>
  );
}"""

if end_str in content:
    content = content.replace(end_str, modal_code + end_str)

with open(filepath, 'w') as f:
    f.write(content)
print("Updated page.tsx successfully.")
