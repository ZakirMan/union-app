import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. State
state_target = "const [userSortMode, setUserSortMode] = useState<'alpha' | 'date'>('alpha');"
state_replacement = "const [userSortMode, setUserSortMode] = useState<'alpha' | 'date'>('alpha');\n  const [userStatusFilter, setUserStatusFilter] = useState<'approved' | 'frozen' | 'all'>('approved');"
content = content.replace(state_target, state_replacement)

# 2. Handlers
handlers_target = """      await deleteDoc(doc(db, 'users', id)); 
      await logAction('reject_user', 'user', `Участник удален/отклонен: ${id}`); 
      fetchData(); 
    } 
  };"""
handlers_replacement = """      await deleteDoc(doc(db, 'users', id)); 
      await logAction('reject_user', 'user', `Участник удален/отклонен: ${id}`); 
      fetchData(); 
    } 
  };

  const handleFreezeUser = async (u: UserData) => {
    if (confirm(`Заморозить аккаунт ${u.displayName}?`)) {
      await updateDoc(doc(db, 'users', u.id), { status: 'frozen' });
      await logAction('freeze_user', 'user', `Участник заморожен: ${u.id}`);
      fetchData();
    }
  };

  const handleUnfreezeUser = async (u: UserData) => {
    if (confirm(`Разморозить аккаунт ${u.displayName}?`)) {
      await updateDoc(doc(db, 'users', u.id), { status: 'approved' });
      await logAction('unfreeze_user', 'user', `Участник разморожен: ${u.id}`);
      fetchData();
    }
  };"""
content = content.replace(handlers_target, handlers_replacement)

# 3. Filter
filter_target = """  const filteredApprovedUsers = users
    .filter(u => 
      u.status === 'approved' && 
      (userCategoryFilter === '' || """
filter_replacement = """  const filteredApprovedUsers = users
    .filter(u => 
      (userStatusFilter === 'all' ? (u.status === 'approved' || u.status === 'frozen') : u.status === userStatusFilter) && 
      (userCategoryFilter === '' || """
content = content.replace(filter_target, filter_replacement)

# 4. Filter dropdown in users tab
dropdown_target = """                    <select
                      className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500 text-sm font-bold bg-white"
                      value={userCategoryFilter}"""
dropdown_replacement = """                    <select
                      className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500 text-sm font-bold bg-white"
                      value={userStatusFilter}
                      onChange={(e) => {
                        setUserStatusFilter(e.target.value as any);
                        setCurrentPage(1);
                      }}
                    >
                      <option value="approved">Активные</option>
                      <option value="frozen">Замороженные</option>
                      <option value="all">Все</option>
                    </select>
                    <select
                      className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500 text-sm font-bold bg-white"
                      value={userCategoryFilter}"""
content = content.replace(dropdown_target, dropdown_replacement)

# 5. Buttons in User Tab row
row_target = """<button onClick={(e) => { e.stopPropagation(); handleRejectUser(u.id, u.statementUrl, u.idCardUrl, u.deductionUrl); }} className="text-red-300 hover:text-red-500 font-bold px-2">✕</button></td></tr>"""
row_replacement = """{u.status === 'frozen' ? (
  <button onClick={(e) => { e.stopPropagation(); handleUnfreezeUser(u); }} className="text-blue-500 hover:text-blue-700 font-bold px-2 whitespace-nowrap text-xs">Разморозить</button>
) : (
  <button onClick={(e) => { e.stopPropagation(); handleFreezeUser(u); }} className="text-orange-300 hover:text-orange-500 font-bold px-2 whitespace-nowrap text-xs">❄️ Заморозить</button>
)}
<button onClick={(e) => { e.stopPropagation(); handleRejectUser(u.id, u.statementUrl, u.idCardUrl, u.deductionUrl); }} className="text-red-300 hover:text-red-500 font-bold px-2">✕</button></td></tr>"""
content = content.replace(row_target, row_replacement)

# 5.b Add frozen badge to user name display
badge_target = """<div className="text-xs font-bold text-gray-500">{u.position}</div>"""
badge_replacement = """<div className="text-xs font-bold text-gray-500">{u.position}</div>{u.status === 'frozen' && <div className="text-[10px] text-orange-600 font-bold mt-0.5 bg-orange-100 px-2 py-0.5 rounded-md inline-block">❄️ Заморожен</div>}"""
content = content.replace(badge_target, badge_replacement)

# 6. Registry Analysis section
registry_target = """                        {registryNames.length === 0 && (
                          <tr><td colSpan={2} className="p-8 text-center text-gray-400 font-bold">Реестр пуст</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>"""

registry_replacement = """                        {registryNames.length === 0 && (
                          <tr><td colSpan={2} className="p-8 text-center text-gray-400 font-bold">Реестр пуст</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* АНАЛИЗ ОТВАЛИВШИХСЯ */}
              {registryNames.length > 0 && (
                <div className="mt-8 bg-white p-6 rounded-[2rem] border border-orange-100 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <h3 className="font-black text-xl text-orange-900">Кандидаты на заморозку (Отвалившиеся)</h3>
                    <div className="text-sm text-gray-500 font-bold">
                      Участники, которых нет в текущем загруженном реестре
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead className="bg-orange-50/50 text-orange-800 text-xs uppercase tracking-wider font-bold">
                        <tr>
                          <th className="p-4 pl-6">Сотрудник</th>
                          <th className="p-4">Категория / Должность</th>
                          <th className="p-4 text-right">Действие</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {users.filter(u => {
                          if (u.status !== 'approved') return false;
                          const inRegistry = registryNames.some(name => 
                            u.displayName.toLowerCase().includes(name.toLowerCase()) || 
                            name.toLowerCase().includes(u.displayName.toLowerCase())
                          );
                          return !inRegistry;
                        }).map(u => (
                          <tr key={u.id} className="hover:bg-orange-50/30 transition-colors">
                            <td className="p-4 pl-6 font-bold">
                              <div>{u.displayName}</div>
                              <div className="text-xs text-gray-400 font-normal">{u.email}</div>
                            </td>
                            <td className="p-4">
                              <div className="text-sm">{u.category || 'Без категории'}</div>
                              <div className="text-xs text-gray-400">{u.position}</div>
                            </td>
                            <td className="p-4 text-right">
                              <button onClick={() => handleFreezeUser(u)} className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-4 py-2 rounded-xl text-sm font-black transition-colors">
                                ❄️ Заморозить
                              </button>
                            </td>
                          </tr>
                        ))}
                        {users.filter(u => u.status === 'approved' && !registryNames.some(name => u.displayName.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(u.displayName.toLowerCase()))).length === 0 && (
                          <tr><td colSpan={3} className="p-8 text-center text-gray-400 font-bold">Все текущие участники найдены в реестре ✅</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}"""
content = content.replace(registry_target, registry_replacement)


with open(filepath, 'w') as f:
    f.write(content)
print("Updated successfully")
