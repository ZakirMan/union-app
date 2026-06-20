import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. State variables
state_injection = '''  const [newsTitle, setNewsTitle] = useState(''); const [newsBody, setNewsBody] = useState(''); const [newsFile, setNewsFile] = useState<File | null>(null); const [newsFileDoc, setNewsFileDoc] = useState<File | null>(null);
  
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [editNewsTitle, setEditNewsTitle] = useState('');
  const [editNewsBody, setEditNewsBody] = useState('');
  const [editNewsLink, setEditNewsLink] = useState('');
'''
content = content.replace("  const [newsTitle, setNewsTitle] = useState(''); const [newsBody, setNewsBody] = useState(''); const [newsFile, setNewsFile] = useState<File | null>(null); const [newsFileDoc, setNewsFileDoc] = useState<File | null>(null);", state_injection)


# 2. Save function
save_func = '''  const handleDeleteNews = async (id: string) => {
    if (confirm('Удалить новость?')) {
      await deleteDoc(doc(db, 'news', id));
      fetchData();
    }
  };

  const handleSaveNewsEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNews) return;
    try {
      await updateDoc(doc(db, 'news', editingNews.id), {
        title: editNewsTitle,
        body: editNewsBody,
        linkUrl: editNewsLink
      });
      setEditingNews(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Ошибка при сохранении новости');
    }
  };
'''
content = content.replace('''  const handleDeleteNews = async (id: string) => {
    if (confirm('Удалить новость?')) {
      await deleteDoc(doc(db, 'news', id));
      fetchData();
    }
  };''', save_func)


# 3. Edit button in UI
edit_button = '''<button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 font-black">✕</button>
<button onClick={() => {
  setEditingNews(n);
  setEditNewsTitle(n.title);
  setEditNewsBody(n.body);
  setEditNewsLink(n.linkUrl || '');
}} className="absolute top-4 right-10 text-blue-500 font-black hover:text-blue-700">✏️</button>'''
content = content.replace('''<button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 font-black">✕</button>''', edit_button)


# 4. Modal
modal_code = '''
      {/* MODAL FOR EDITING NEWS */}
      {editingNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setEditingNews(null)}>
          <div className="bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 w-full max-w-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditingNews(null)} className="absolute top-6 right-6 text-gray-400 hover:text-black font-black bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            <h2 className="text-2xl font-black mb-6">Редактирование новости</h2>
            <form onSubmit={handleSaveNewsEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Заголовок</label>
                <input required className="w-full bg-gray-50 p-4 rounded-xl font-bold border-0 outline-none" value={editNewsTitle} onChange={e => setEditNewsTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Текст</label>
                <textarea required className="w-full bg-gray-50 p-4 rounded-xl font-medium border-0 outline-none h-40" value={editNewsBody} onChange={e => setEditNewsBody(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Ссылка</label>
                <input className="w-full bg-gray-50 p-4 rounded-xl font-medium border-0 outline-none" value={editNewsLink} onChange={e => setEditNewsLink(e.target.value)} />
              </div>
              <div className="flex justify-end pt-4 gap-3">
                <button type="button" onClick={() => setEditingNews(null)} className="px-6 py-3 font-bold text-gray-500 hover:text-black">Отмена</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-600/30">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
'''
content = content.replace('''    </div>
  );
}''', modal_code)

with open(filepath, 'w') as f:
    f.write(content)

print("Patch applied successfully")
