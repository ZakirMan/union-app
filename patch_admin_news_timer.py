import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update NewsItem interface
old_news_int = "interface NewsItem { id: string; title: string; body: string; imageUrl?: string; fileUrl?: string; linkUrl?: string; createdAt: string; }"
new_news_int = "interface NewsItem { id: string; title: string; body: string; imageUrl?: string; fileUrl?: string; linkUrl?: string; createdAt: string; requiresResponse?: boolean; responseDeadlineDays?: number; isResponseReceived?: boolean; }"
content = content.replace(old_news_int, new_news_int)

# 2. Add state
old_state = "const [newsLink, setNewsLink] = useState('');"
new_state = "const [newsLink, setNewsLink] = useState(''); const [newsRequiresResponse, setNewsRequiresResponse] = useState(false); const [newsResponseDeadlineDays, setNewsResponseDeadlineDays] = useState(15);"
content = content.replace(old_state, new_state)

# 3. Update addDoc in handlePublishNews
old_add_doc = "await addDoc(collection(db, 'news'), { title: newsTitle, body: newsBody, imageUrl, fileUrl, linkUrl: newsLink, createdAt: new Date().toISOString() });"
new_add_doc = "await addDoc(collection(db, 'news'), { title: newsTitle, body: newsBody, imageUrl, fileUrl, linkUrl: newsLink, requiresResponse: newsRequiresResponse, responseDeadlineDays: newsRequiresResponse ? newsResponseDeadlineDays : null, isResponseReceived: false, createdAt: new Date().toISOString() });"
content = content.replace(old_add_doc, new_add_doc)

# 4. Clear state in handlePublishNews
old_clear = "setNewsTitle(''); setNewsBody(''); setNewsFile(null); setNewsFileDoc(null); setNewsLink(''); fetchData();"
new_clear = "setNewsTitle(''); setNewsBody(''); setNewsFile(null); setNewsFileDoc(null); setNewsLink(''); setNewsRequiresResponse(false); setNewsResponseDeadlineDays(15); fetchData();"
content = content.replace(old_clear, new_clear)

# 5. Add toggle function
old_delete_func = "const handleDeleteNews = async (id: string) => { if (confirm('Del?')) await deleteDoc(doc(db, 'news', id)); await logAction('delete_news', 'news', `Удалена новость: ${id}`); fetchData(); };"
new_delete_func = "const handleDeleteNews = async (id: string) => { if (confirm('Del?')) await deleteDoc(doc(db, 'news', id)); await logAction('delete_news', 'news', `Удалена новость: ${id}`); fetchData(); }; const handleToggleResponseReceived = async (id: string, received: boolean) => { try { await updateDoc(doc(db, 'news', id), { isResponseReceived: received }); fetchData(); } catch { alert('Ошибка сохранения'); } };"
content = content.replace(old_delete_func, new_delete_func)

# 6. UI Form
old_ui_link = '<input className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none" placeholder="Внешняя ссылка (опционально)" value={newsLink} onChange={e => setNewsLink(e.target.value)} />'
new_ui_link = '''<input className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none" placeholder="Внешняя ссылка (опционально)" value={newsLink} onChange={e => setNewsLink(e.target.value)} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="reqResp" checked={newsRequiresResponse} onChange={e => setNewsRequiresResponse(e.target.checked)} className="w-5 h-5" />
                  <label htmlFor="reqResp" className="font-bold text-gray-700">Требует ответа работодателя</label>
                </div>
                {newsRequiresResponse && (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">Срок ответа (рабочих дней):</span>
                    <input type="number" min="1" className="bg-gray-50 p-2 rounded-xl font-bold border-0 outline-none w-24 text-center" value={newsResponseDeadlineDays} onChange={e => setNewsResponseDeadlineDays(parseInt(e.target.value) || 1)} />
                  </div>
                )}'''
content = content.replace(old_ui_link, new_ui_link)

# 7. UI Card
old_ui_card = '<button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 font-black">✕</button>'
new_ui_card = '''<button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 font-black">✕</button>
                      {n.requiresResponse && (
                        <div className="mt-3 bg-gray-50 p-3 rounded-xl flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-600">Ответ получен?</span>
                          <input 
                            type="checkbox" 
                            checked={n.isResponseReceived || false} 
                            onChange={(e) => handleToggleResponseReceived(n.id, e.target.checked)}
                            className="w-5 h-5"
                          />
                        </div>
                      )}'''
content = content.replace(old_ui_card, new_ui_card)


with open(filepath, 'w') as f:
    f.write(content)

print("Admin page patched")
