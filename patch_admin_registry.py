import re

with open('app/admin/page.tsx', 'r') as f:
    content = f.read()

# 1. State changes
state_old = "const [registryNames, setRegistryNames] = useState<string[]>([]);\n  const [registryInput, setRegistryInput] = useState('');\n  const [isSavingRegistry, setIsSavingRegistry] = useState(false);\n  const [registryFilter, setRegistryFilter] = useState<'all' | 'unregistered'>('all');"

state_new = """const [registryMonth, setRegistryMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [registries, setRegistries] = useState<Record<string, {name: string, amount: number}[]>>({});
  const [registryInput, setRegistryInput] = useState('');
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);
  const [registryFilter, setRegistryFilter] = useState<'all' | 'unregistered'>('all');"""

if state_old in content:
    content = content.replace(state_old, state_new)
else:
    print("State old not found")

# 2. fetchData changes
fetch_old = """      const registryDoc = await getDoc(doc(db, 'admin', 'registry'));
      if (registryDoc.exists()) setRegistryNames(registryDoc.data().names || []);"""

fetch_new = """      const regSnap = await getDocs(collection(db, 'registries'));
      const regs: Record<string, {name: string, amount: number}[]> = {};
      regSnap.forEach(doc => { regs[doc.id] = doc.data().records || []; });
      setRegistries(regs);"""

if fetch_old in content:
    content = content.replace(fetch_old, fetch_new)
else:
    print("Fetch old not found")

# 3. handleSaveRegistry changes
save_old = """  const handleSaveRegistry = async () => {
    setIsSavingRegistry(true);
    try {
      const names = registryInput.split('\\n').map(n => n.trim()).filter(n => n.length > 0);
      await updateDoc(doc(db, 'admin', 'registry'), { names }).catch(async () => {
        await setDoc(doc(db, 'admin', 'registry'), { names });
      });
      setRegistryNames(names);
      await logAction('update_registry', 'system', `Обновлен реестр бухгалтерии (записей: ${names.length})`);
      alert('Реестр успешно сохранен!');
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении реестра.');
    } finally {
      setIsSavingRegistry(false);
    }
  };"""

save_new = """  const handleSaveRegistry = async () => {
    if (!registryMonth) { alert('Выберите месяц'); return; }
    setIsSavingRegistry(true);
    try {
      const lines = registryInput.split('\\n').map(n => n.trim()).filter(n => n.length > 0);
      const records: {name: string, amount: number}[] = [];
      lines.forEach(line => {
        const parts = line.split('\\t');
        if (parts.length >= 2) {
          let amountStr = parts[parts.length - 1].replace(/,/g, '.').replace(/[^\\d.-]/g, '');
          let nameStr = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
          let amount = parseFloat(amountStr);
          if (!isNaN(amount) && nameStr.trim().length > 3 && !/^\\d+$/.test(nameStr)) {
            records.push({ name: nameStr.trim(), amount });
          }
        }
      });
      
      if (records.length === 0 && lines.length > 0) {
        alert('Не удалось распознать ФИО и суммы. Убедитесь, что скопировали таблицу с колонками ФИО и Сумма (через табуляцию).');
        setIsSavingRegistry(false);
        return;
      }

      await setDoc(doc(db, 'registries', registryMonth), { 
        month: registryMonth,
        records: records,
        updatedAt: new Date().toISOString()
      });
      
      setRegistries(prev => ({ ...prev, [registryMonth]: records }));
      await logAction('update_registry', 'system', `Загружен реестр за ${registryMonth} (записей: ${records.length})`);
      setRegistryInput('');
      alert('Реестр успешно загружен!');
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении реестра.');
    } finally {
      setIsSavingRegistry(false);
    }
  };"""

if save_old in content:
    content = content.replace(save_old, save_new)
else:
    print("Save old not found")

# 4. Tab UI replacement
tab_regex = re.compile(r'\{activeTab === \'registry\' && \((.*?)\)\}', re.DOTALL)
match = tab_regex.search(content)

tab_new_content = """
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">Реестр бухгалтерии</h2>
                  <p className="text-gray-500 font-medium mt-2">Умный импорт таблиц по месяцам для сверки взносов</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                  <span className="font-bold text-gray-500 pl-2">Месяц:</span>
                  <input 
                    type="month" 
                    value={registryMonth} 
                    onChange={(e) => setRegistryMonth(e.target.value)}
                    className="bg-gray-50 border-none outline-none font-black text-indigo-600 px-4 py-2 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Левая колонка - Вставка */}
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col">
                  <h3 className="font-black text-xl mb-2 flex items-center gap-2"><span className="text-2xl">📋</span> Импорт из Excel</h3>
                  <p className="text-sm text-gray-500 mb-4">Скопируйте колонки <b>ФИО</b> и <b>Сумма взноса</b> из Excel или Google Sheets и вставьте в поле ниже.</p>
                  <textarea
                    value={registryInput}
                    onChange={(e) => setRegistryInput(e.target.value)}
                    placeholder="Абайылданова Эльмира...&#9;3331.36&#10;Абдигалиева Жанар...&#9;3012.92"
                    className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none focus:ring-2 focus:ring-indigo-200 h-64 resize-none mb-4 whitespace-pre"
                  />
                  <button
                    onClick={handleSaveRegistry}
                    disabled={isSavingRegistry}
                    className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition disabled:opacity-50 mt-auto"
                  >
                    {isSavingRegistry ? 'Сохранение...' : 'Обновить реестр'}
                  </button>
                </div>

                {/* Правая колонка - Аналитика и текущий месяц */}
                <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <h3 className="font-black text-xl">Данные за {registryMonth}</h3>
                    <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                      <button onClick={() => setRegistryFilter('all')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'all' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Все ({registries[registryMonth]?.length || 0})</button>
                      <button onClick={() => setRegistryFilter('unregistered')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'unregistered' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>Незарег.</button>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead className="bg-gray-50/50 text-gray-400 text-xs uppercase tracking-wider font-bold">
                        <tr>
                          <th className="p-4 pl-6">ФИО сотрудника</th>
                          <th className="p-4 text-right">Сумма взноса</th>
                          <th className="p-4 text-center">Статус в приложении</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(registries[registryMonth] || []).map((record, i) => {
                          const isRegistered = users.some(u => 
                            u.status === 'approved' && 
                            (u.displayName.toLowerCase().includes(record.name.toLowerCase()) || record.name.toLowerCase().includes(u.displayName.toLowerCase()))
                          );
                          if (registryFilter === 'unregistered' && isRegistered) return null;
                          
                          return (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="p-4 pl-6 font-bold text-sm">{record.name}</td>
                              <td className="p-4 text-right font-black text-indigo-600">{record.amount.toLocaleString('ru-RU')} ₸</td>
                              <td className="p-4 text-center">
                                {isRegistered ? (
                                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 uppercase tracking-wider">✅ Да</span>
                                ) : (
                                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 uppercase tracking-wider">❌ Нет</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {(!registries[registryMonth] || registries[registryMonth].length === 0) && (
                          <tr><td colSpan={3} className="p-8 text-center text-gray-400 font-bold">Нет данных за этот месяц</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {registries[registryMonth] && registries[registryMonth].length > 0 && (
                     <div className="mt-4 text-right pr-4">
                       <span className="text-gray-500 font-bold text-sm">Итого за месяц: </span>
                       <span className="text-2xl font-black text-green-600 ml-2">
                         {registries[registryMonth].reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('ru-RU')} ₸
                       </span>
                     </div>
                  )}
                </div>
              </div>

              {/* ДИНАМИКА И ОТВАЛИВШИЕСЯ */}
              {registries[registryMonth] && registries[registryMonth].length > 0 && (
                <div className="grid lg:grid-cols-2 gap-6 mt-8">
                  {/* Кандидаты на заморозку */}
                  <div className="bg-white p-6 rounded-[2rem] border border-orange-100 shadow-sm flex flex-col h-full">
                    <div className="flex flex-col mb-6 gap-2">
                      <h3 className="font-black text-xl text-orange-900">Кандидаты на заморозку</h3>
                      <div className="text-xs text-gray-500 font-bold leading-relaxed">
                        Участники со статусом "Активный" в приложении, которых <b>нет</b> в загруженном реестре за {registryMonth}
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white flex-1">
                      <table className="w-full text-left border-collapse min-w-[400px]">
                        <thead className="bg-orange-50/50 text-orange-800 text-[10px] uppercase tracking-wider font-black">
                          <tr>
                            <th className="p-3 pl-4">Сотрудник</th>
                            <th className="p-3 text-right">Действие</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {users.filter(u => {
                            if (u.status !== 'approved') return false;
                            const inRegistry = registries[registryMonth].some(r => 
                              u.displayName.toLowerCase().includes(r.name.toLowerCase()) || 
                              r.name.toLowerCase().includes(u.displayName.toLowerCase())
                            );
                            return !inRegistry;
                          }).map(u => (
                            <tr key={u.id} className="hover:bg-orange-50/30 transition-colors">
                              <td className="p-3 pl-4 font-bold text-sm">
                                <div>{u.displayName}</div>
                                <div className="text-[10px] text-gray-400 font-normal">{u.position}</div>
                              </td>
                              <td className="p-3 text-right">
                                <button onClick={() => handleFreezeUser(u)} className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded-lg text-xs font-black transition-colors whitespace-nowrap">
                                  ❄️ Заморозить
                                </button>
                              </td>
                            </tr>
                          ))}
                          {users.filter(u => u.status === 'approved' && !registries[registryMonth].some(r => u.displayName.toLowerCase().includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(u.displayName.toLowerCase()))).length === 0 && (
                            <tr><td colSpan={2} className="p-8 text-center text-gray-400 font-bold">Все текущие участники найдены в реестре ✅</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Сравнение с прошлым месяцем */}
                  <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm flex flex-col h-full">
                    <div className="flex flex-col mb-6 gap-2">
                      <h3 className="font-black text-xl text-blue-900">Сравнение с прошлым месяцем</h3>
                      <div className="text-xs text-gray-500 font-bold leading-relaxed">
                        Анализ изменений между реестрами
                      </div>
                    </div>

                    <div className="space-y-4 flex-1">
                      {(() => {
                        const [year, month] = registryMonth.split('-');
                        let prevDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                        prevDate.setMonth(prevDate.getMonth() - 1);
                        const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
                        
                        const currentReg = registries[registryMonth] || [];
                        const prevReg = registries[prevMonthStr];

                        if (!prevReg || prevReg.length === 0) {
                          return <div className="p-8 text-center text-gray-400 font-bold bg-gray-50 rounded-2xl border border-gray-100">Нет данных за предыдущий месяц ({prevMonthStr}) для сравнения</div>;
                        }

                        // Кто был в прошлом, но нет в этом
                        const dropOffs = prevReg.filter(p => !currentReg.some(c => c.name.toLowerCase() === p.name.toLowerCase()));
                        // Кто есть в этом, но не было в прошлом
                        const newAdditions = currentReg.filter(c => !prevReg.some(p => p.name.toLowerCase() === c.name.toLowerCase()));

                        return (
                          <div className="grid grid-cols-1 gap-4">
                            <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                              <h4 className="font-black text-red-800 text-sm mb-2">🔴 Перестали платить ({dropOffs.length})</h4>
                              <div className="max-h-32 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-red-200">
                                {dropOffs.length === 0 ? <div className="text-xs text-gray-500 font-medium">Нет отвалившихся</div> : dropOffs.map((d, i) => (
                                  <div key={i} className="text-xs font-bold text-red-900 mb-1 border-b border-red-100/50 pb-1">{d.name} <span className="text-red-400 float-right">{d.amount} ₸</span></div>
                                ))}
                              </div>
                            </div>
                            <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                              <h4 className="font-black text-green-800 text-sm mb-2">🟢 Новые плательщики ({newAdditions.length})</h4>
                              <div className="max-h-32 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-green-200">
                                {newAdditions.length === 0 ? <div className="text-xs text-gray-500 font-medium">Нет новых</div> : newAdditions.map((d, i) => (
                                  <div key={i} className="text-xs font-bold text-green-900 mb-1 border-b border-green-100/50 pb-1">{d.name} <span className="text-green-500 float-right">+{d.amount} ₸</span></div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
"""

if match:
    content = content[:match.start()] + "{activeTab === 'registry' && (" + tab_new_content + ")}" + content[match.end():]
else:
    print("Tab UI old not found")


with open('app/admin/page.tsx', 'w') as f:
    f.write(content)

print("Patching done")
