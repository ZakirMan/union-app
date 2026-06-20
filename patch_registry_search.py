import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. State variable
state_str = "  const [registryFilter, setRegistryFilter] = useState<'all' | 'unregistered'>('all');"
new_state_str = "  const [registryFilter, setRegistryFilter] = useState<'all' | 'unregistered'>('all');\n  const [registrySearch, setRegistrySearch] = useState('');"
content = content.replace(state_str, new_state_str)

# 2. UI search input
ui_search_old = '''<div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                      <button onClick={() => setRegistryFilter('all')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'all' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Все ({registries[registryMonth]?.length || 0})</button>
                      <button onClick={() => setRegistryFilter('unregistered')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'unregistered' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>Незарег.</button>
                    </div>'''

ui_search_new = '''<div className="flex gap-2 w-full sm:w-auto flex-col sm:flex-row">
                      <input
                        type="text"
                        placeholder="Поиск по реестру..."
                        value={registrySearch}
                        onChange={(e) => setRegistrySearch(e.target.value)}
                        className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-indigo-500 text-sm font-bold w-full sm:w-64"
                      />
                      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                        <button onClick={() => setRegistryFilter('all')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'all' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Все ({registries[registryMonth]?.length || 0})</button>
                        <button onClick={() => setRegistryFilter('unregistered')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'unregistered' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>Незарег.</button>
                      </div>
                    </div>'''
content = content.replace(ui_search_old, ui_search_new)

# 3. Filtering the table
table_map_old = '''                      <tbody className="divide-y divide-gray-100">
                        {registries[registryMonth] && [...registries[registryMonth]]
                          .sort((a, b) => b.amount - a.amount)
                          .map((record, i) => {'''
                          
table_map_old2 = '''                      <tbody className="divide-y divide-gray-100">
                        {[...registries[registryMonth]]
                          .sort((a, b) => b.amount - a.amount)
                          .map(record => {'''
                          
table_map_old3 = '''                      <tbody className="divide-y divide-gray-100">
                        {(registries[registryMonth] || []).map((record, i) => {'''

table_map_new = '''                      <tbody className="divide-y divide-gray-100">
                        {[...(registries[registryMonth] || [])]
                          .sort((a, b) => b.amount - a.amount)
                          .filter(record => 
                            !registrySearch || record.name.toLowerCase().includes(registrySearch.toLowerCase())
                          )
                          .map((record, i) => {'''

if table_map_old in content:
    content = content.replace(table_map_old, table_map_new)
elif table_map_old2 in content:
    content = content.replace(table_map_old2, table_map_new)
elif table_map_old3 in content:
    content = content.replace(table_map_old3, table_map_new)
else:
    print("Could not find table map string!")

with open(filepath, 'w') as f:
    f.write(content)

print("Patch applied")
