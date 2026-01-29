'use client';

import { useEffect, useState } from 'react';
import { db, auth, storage } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, deleteDoc, getDoc, increment, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';

// --- ТИПЫ ДАННЫХ ---
interface UserData { 
  id: string; 
  displayName: string; 
  email: string; 
  phoneNumber?: string; 
  position: string; 
  role: string; 
  status: string;
  voteWeight?: number; 
  delegatedTo?: string; 
  delegatedToName?: string; 
  delegatedFrom?: string[]; 
  delegationStatus?: string;
  delegationConferenceId?: string; // ID события, к которому привязано делегирование
}

interface DelegationRequest {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  docUrl?: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  conferenceId?: string;    // ID события из заявки
  conferenceTitle?: string; // Название события из заявки
}

interface Conference {
  id: string;
  title: string;
  date: string;
  createdAt: string;
}

interface NewsItem { id: string; title: string; body: string; imageUrl?: string; createdAt: string; }
interface TeamMember { id: string; name: string; role: string; photoUrl: string; }
interface RequestData { id: string; userEmail: string; text: string; createdAt: string; response?: string; }
interface LinkItem { id: string; title: string; url: string; }
interface DocTemplate { id: string; title: string; description?: string; fileUrl: string; }

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'delegations' | 'conferences' | 'news' | 'requests' | 'resources' | 'team'>('users');

  // Данные
  const [users, setUsers] = useState<UserData[]>([]);
  const [delegations, setDelegations] = useState<DelegationRequest[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);

  // Формы
  const [confTitle, setConfTitle] = useState(''); const [confDate, setConfDate] = useState('');
  const [newsTitle, setNewsTitle] = useState(''); const [newsBody, setNewsBody] = useState(''); const [newsFile, setNewsFile] = useState<File | null>(null);
  const [memberName, setMemberName] = useState(''); const [memberRole, setMemberRole] = useState(''); const [memberFile, setMemberFile] = useState<File | null>(null);
  const [linkTitle, setLinkTitle] = useState(''); const [linkUrl, setLinkUrl] = useState('');
  const [tplTitle, setTplTitle] = useState(''); const [tplDesc, setTplDesc] = useState(''); const [tplFile, setTplFile] = useState<File | null>(null);
  const [replyText, setReplyText] = useState<{[key: string]: string}>({});
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') fetchData();
          else router.push('/dashboard');
        } catch { router.push('/dashboard'); }
      } else router.push('/login');
    });
    return () => unsubscribe();
  }, [router]);

  const fetchData = async () => {
    try {
      const uSnap = await getDocs(collection(db, 'users')); 
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));

      const dSnap = await getDocs(collection(db, 'delegation_requests'));
      setDelegations(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as DelegationRequest)).sort((a,b) => a.createdAt < b.createdAt ? 1 : -1));

      const cSnap = await getDocs(collection(db, 'conferences'));
      setConferences(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Conference)).sort((a,b) => a.date > b.date ? 1 : -1));

      const nSnap = await getDocs(collection(db, 'news')); 
      setNews(nSnap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)).sort((a,b) => a.createdAt < b.createdAt ? 1 : -1));

      const tSnap = await getDocs(collection(db, 'team')); 
      setTeam(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamMember)));

      const rSnap = await getDocs(collection(db, 'requests')); 
      setRequests(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as RequestData)).sort((a,b) => a.createdAt < b.createdAt ? 1 : -1));

      const lSnap = await getDocs(collection(db, 'links')); 
      setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as LinkItem)));

      const tplSnap = await getDocs(collection(db, 'templates')); 
      setTemplates(tplSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocTemplate)));
      
      setLoading(false);
    } catch (e) { console.error(e); setLoading(false); }
  };

  const uploadImage = async (file: File, folder: string) => {
    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  // --- ACTIONS ---

  // 1. КОНФЕРЕНЦИИ
  const handleCreateConference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confTitle || !confDate) return;
    try {
      await addDoc(collection(db, 'conferences'), {
        title: confTitle,
        date: confDate,
        createdAt: new Date().toISOString()
      });
      setConfTitle(''); setConfDate(''); fetchData();
      alert('Конференция создана');
    } catch { alert('Ошибка при создании'); }
  };

  const handleDeleteConference = async (id: string) => {
    if(confirm('Удалить конференцию? Это может повлиять на активные делегирования.')) { 
      await deleteDoc(doc(db, 'conferences', id)); 
      fetchData(); 
    }
  };

  // 2. ДЕЛЕГИРОВАНИЕ (ОБНОВЛЕНО)
  const handleApproveDelegation = async (req: DelegationRequest) => {
    if (!confirm(`Передать голос от ${req.fromName} к ${req.toName}?`)) return;
    try {
      // А. Обновляем статус заявки
      await updateDoc(doc(db, 'delegation_requests', req.id), { status: 'approved' });

      // Б. Доверитель: Вес=0, Статус=approved, ID события записываем в профиль!
      await updateDoc(doc(db, 'users', req.fromId), {
        voteWeight: 0,
        delegationStatus: 'approved',
        delegatedTo: req.toId,
        delegatedToName: req.toName,
        delegationConferenceId: req.conferenceId || null // <--- ПРИВЯЗКА К СОБЫТИЮ
      });

      // В. Делегат: Вес+1
      await updateDoc(doc(db, 'users', req.toId), {
        voteWeight: increment(1),
        delegatedFrom: arrayUnion(req.fromName)
      });

      alert('Делегирование успешно проведено!');
      fetchData();
    } catch (e) { console.error(e); alert('Ошибка'); }
  };

  const handleRejectDelegation = async (reqId: string, fromId: string) => {
    if (!confirm('Отклонить заявку?')) return;
    try {
      await deleteDoc(doc(db, 'delegation_requests', reqId));
      await updateDoc(doc(db, 'users', fromId), { 
        delegationStatus: null, 
        delegatedToName: null 
      });
      fetchData();
    } catch { alert('Ошибка'); }
  };

  // 3. ПОЛЬЗОВАТЕЛИ
  const handleApproveUser = async (id: string) => { 
    if(confirm('Подтвердить сотрудника?')) { 
      await updateDoc(doc(db, 'users', id), { status: 'approved', voteWeight: 1 }); 
      fetchData(); 
    }
  };
  const handleRejectUser = async (id: string) => { 
    if(confirm('Удалить пользователя?')) { 
      await deleteDoc(doc(db, 'users', id)); 
      fetchData(); 
    }
  };

  // 4. НОВОСТИ
  const handlePublishNews = async (e: React.FormEvent) => { 
    e.preventDefault(); setIsUploading(true); 
    try { 
      let imageUrl = ''; 
      if(newsFile) imageUrl = await uploadImage(newsFile, 'news'); 
      await addDoc(collection(db, 'news'), { 
        title: newsTitle, body: newsBody, imageUrl, createdAt: new Date().toISOString() 
      }); 
      setNewsTitle(''); setNewsBody(''); setNewsFile(null); fetchData(); 
    } catch { alert('Ошибка'); } finally { setIsUploading(false); }
  };
  const handleDeleteNews = async (id: string) => { 
    if(confirm('Удалить новость?')) { await deleteDoc(doc(db, 'news', id)); fetchData(); }
  };

  // 5. СОВЕТ
  const handleAddMember = async (e: React.FormEvent) => { 
    e.preventDefault(); setIsUploading(true); 
    try { 
      let photoUrl = ''; 
      if(memberFile) photoUrl = await uploadImage(memberFile, 'team'); 
      await addDoc(collection(db, 'team'), { 
        name: memberName, role: memberRole, photoUrl 
      }); 
      setMemberName(''); setMemberRole(''); setMemberFile(null); fetchData(); 
    } catch { alert('Ошибка'); } finally { setIsUploading(false); }
  };
  const handleDeleteMember = async (id: string) => { 
    if(confirm('Удалить участника?')) { await deleteDoc(doc(db, 'team', id)); fetchData(); }
  };

  // 6. РЕСУРСЫ
  const handleAddLink = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    try { 
      await addDoc(collection(db, 'links'), { title: linkTitle, url: linkUrl }); 
      setLinkTitle(''); setLinkUrl(''); fetchData(); 
    } catch { alert('Ошибка'); }
  };
  const handleDeleteLink = async (id: string) => { 
    if(confirm('Удалить ссылку?')) { await deleteDoc(doc(db, 'links', id)); fetchData(); }
  };
  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault(); setIsUploading(true);
    try {
      if (!tplFile) return;
      const fileUrl = await uploadImage(tplFile, 'templates');
      await addDoc(collection(db, 'templates'), { 
        title: tplTitle, description: tplDesc, fileUrl 
      });
      setTplTitle(''); setTplDesc(''); setTplFile(null); fetchData();
    } catch { alert('Ошибка'); } finally { setIsUploading(false); }
  };
  const handleDeleteTemplate = async (id: string) => { 
    if(confirm('Удалить шаблон?')) { await deleteDoc(doc(db, 'templates', id)); fetchData(); }
  };

  // 7. ОБРАЩЕНИЯ
  const handleReplyRequest = async (reqId: string) => {
    const text = replyText[reqId];
    if (!text) return;
    try {
      await updateDoc(doc(db, 'requests', reqId), {
        response: text,
        responseAt: new Date().toISOString()
      });
      alert('Ответ отправлен');
      fetchData();
    } catch { alert('Ошибка'); }
  };


  if (loading) return <div className="p-20 text-center font-bold text-black">Загрузка панели...</div>;

  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeRequests = requests.filter(r => !r.response).length;
  const pendingDelegations = delegations.filter(d => d.status === 'pending');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-black">
      
      {/* --- HEADER --- */}
      <div className="bg-white shadow z-10 sticky top-0 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight">Админ-панель v2.1 (Event Lock)</h1>
          <button onClick={() => router.push('/dashboard')} className="text-blue-700 font-bold hover:underline text-sm">
            ← В приложение
          </button>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {[
            { id: 'conferences', label: '📅 События', count: 0, color: '' },
            { id: 'delegations', label: 'Делегирование', count: pendingDelegations.length, color: 'bg-purple-600' },
            { id: 'users', label: 'Участники', count: pendingUsers.length, color: 'bg-red-600' },
            { id: 'requests', label: 'Обращения', count: activeRequests, color: 'bg-blue-600' },
            { id: 'news', label: 'Новости' },
            { id: 'resources', label: 'Ресурсы' },
            { id: 'team', label: 'Совет' },
          ].map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap flex items-center gap-2 transition text-sm
                ${activeTab === tab.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {tab.label} 
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`${tab.color || 'bg-gray-500'} text-white text-[10px] px-2 py-0.5 rounded-full`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="flex-grow p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          
          {/* 1. КОНФЕРЕНЦИИ */}
          {activeTab === 'conferences' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border-t-4 border-indigo-500 shadow">
                <h2 className="font-black text-xl mb-4">Назначить конференцию</h2>
                <form onSubmit={handleCreateConference} className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="w-full">
                    <label className="text-xs font-bold text-gray-500 uppercase">Название события</label>
                    <input className="w-full border p-3 rounded-lg font-bold outline-none" placeholder="Отчетная конференция..." value={confTitle} onChange={e=>setConfTitle(e.target.value)} required />
                  </div>
                  <div className="w-full">
                    <label className="text-xs font-bold text-gray-500 uppercase">Дата и Время</label>
                    <input type="datetime-local" className="w-full border p-3 rounded-lg outline-none" value={confDate} onChange={e=>setConfDate(e.target.value)} required />
                  </div>
                  <button className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold w-full md:w-auto">Создать</button>
                </form>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-gray-500 uppercase text-xs">Список событий</h3>
                {conferences.map(conf => {
                  const isPast = new Date(conf.date) < new Date();
                  return (
                    <div key={conf.id} className={`p-4 rounded-xl border flex justify-between items-center ${isPast ? 'bg-gray-100 opacity-70' : 'bg-white shadow-sm border-indigo-100'}`}>
                      <div>
                        <h4 className="font-black text-lg">{conf.title}</h4>
                        <p className={`font-bold text-sm ${isPast ? 'text-gray-500' : 'text-green-600'}`}>
                          {new Date(conf.date).toLocaleString()} {isPast ? '(Завершена)' : '(Активна)'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">ID: {conf.id}</p>
                      </div>
                      <button onClick={()=>handleDeleteConference(conf.id)} className="text-red-500 font-bold px-3 py-1 bg-red-50 rounded text-xs uppercase hover:bg-red-100">Удалить</button>
                    </div>
                  )
                })}
                {conferences.length === 0 && <p className="text-gray-400 italic p-4 text-center">Нет событий.</p>}
              </div>
            </div>
          )}

          {/* 2. ДЕЛЕГИРОВАНИЕ */}
          {activeTab === 'delegations' && (
            <div className="space-y-6">
              <h2 className="font-black text-2xl mb-4">Управление голосами</h2>
              
              {pendingDelegations.length === 0 ? (
                <div className="bg-gray-100 p-8 rounded-xl text-center text-gray-500 font-bold border border-dashed border-gray-300">Нет новых заявок</div>
              ) : (
                <div className="grid gap-4">
                  {pendingDelegations.map(req => (
                    <div key={req.id} className="bg-white p-6 rounded-xl border-l-4 border-indigo-600 shadow-md flex flex-col lg:flex-row justify-between items-start gap-6">
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                           <span className="font-black text-lg bg-gray-100 px-2 py-1 rounded">{req.fromName}</span>
                           <span className="text-gray-400 font-bold text-xl">➝</span>
                           <span className="font-black text-lg bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-200">{req.toName}</span>
                        </div>
                        {req.conferenceTitle && (
                          <div className="inline-block bg-indigo-50 text-indigo-800 text-xs font-black px-2 py-1 rounded mb-2 border border-indigo-100">
                            Событие: {req.conferenceTitle}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 font-bold mb-3">{new Date(req.createdAt).toLocaleString()}</p>
                        {req.docUrl && <a href={req.docUrl} target="_blank" className="text-blue-600 font-bold text-sm bg-blue-50 px-3 py-2 rounded">📄 Доверенность</a>}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={()=>handleApproveDelegation(req)} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700">Одобрить</button>
                        <button onClick={()=>handleRejectDelegation(req.id, req.fromId)} className="bg-white text-red-600 border-2 border-red-100 px-6 py-3 rounded-xl font-bold">Отклонить</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {delegations.some(d => d.status === 'approved') && (
                <div className="mt-10 pt-8 border-t border-gray-200">
                  <h3 className="font-bold text-gray-400 uppercase text-xs mb-4 tracking-wider">История (Для протокола)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 opacity-70">
                    {delegations.filter(d => d.status === 'approved').map(d => (
                      <div key={d.id} className="flex flex-col bg-white p-3 rounded border text-sm">
                        <div className="flex justify-between items-center mb-1">
                           <span className="font-medium">{d.fromName} ➝ {d.toName}</span>
                           <span className="text-green-600 font-black text-xs uppercase bg-green-50 px-2 py-1 rounded">Выполнено</span>
                        </div>
                        {d.conferenceTitle && <div className="text-[10px] text-gray-500 font-bold">Соб: {d.conferenceTitle}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. УЧАСТНИКИ */}
          {activeTab === 'users' && (
             <div className="space-y-6">
               {pendingUsers.length > 0 && (
                 <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 shadow-sm">
                   <h2 className="font-black text-lg mb-4 text-yellow-900">🔔 Новые заявки ({pendingUsers.length})</h2>
                   {pendingUsers.map(u => (
                     <div key={u.id} className="flex justify-between items-center bg-white p-3 rounded mb-2 border border-yellow-100">
                       <span className="font-bold">{u.displayName} ({u.position})</span>
                       <div className="flex gap-2"><button onClick={() => handleApproveUser(u.id)} className="text-green-600 font-bold border px-3 rounded hover:bg-green-50">Принять</button><button onClick={() => handleRejectUser(u.id)} className="text-red-600 font-bold border px-3 rounded hover:bg-red-50">Откл.</button></div>
                     </div>
                   ))}
                 </div>
               )}
               <div className="bg-white p-6 rounded-xl border shadow-sm">
                 <h2 className="font-black text-xl mb-4">Участники</h2>
                 <table className="w-full text-left text-sm">
                   <thead className="bg-gray-100 font-bold"><tr><th className="p-3">Имя</th><th className="p-3">Вес</th><th className="p-3">Действия</th></tr></thead>
                   <tbody>
                     {users.filter(u => u.status === 'approved').map(u => (
                       <tr key={u.id} className="border-b hover:bg-gray-50">
                         <td className="p-3">
                           <div className="font-bold">{u.displayName}</div>
                           {u.delegatedFrom && u.delegatedFrom.length > 0 && <div className="text-[10px] text-green-600 font-bold">+ {u.delegatedFrom.join(', ')}</div>}
                           {u.delegatedTo && <div className="text-[10px] text-red-500 font-bold">Голос передан</div>}
                         </td>
                         <td className="p-3"><span className="bg-gray-200 px-2 py-1 rounded font-bold">{u.voteWeight || 1}</span></td>
                         <td className="p-3"><button onClick={() => handleRejectUser(u.id)} className="text-red-500 font-bold text-xs hover:underline">Удалить</button></td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          )}

          {/* 4. ОБРАЩЕНИЯ */}
          {activeTab === 'requests' && (
            <div className="bg-white p-6 rounded-xl border-t-4 border-blue-600 shadow space-y-4">
              <h2 className="font-black text-xl">Входящие вопросы</h2>
              {requests.map(req => (
                <div key={req.id} className="p-5 border rounded bg-white shadow-sm">
                  <p className="text-xs text-gray-500 font-bold mb-1">{req.userEmail} | {new Date(req.createdAt).toLocaleString()}</p>
                  <p className="font-bold text-gray-900">{req.text}</p>
                  {req.response ? (
                    <div className="mt-3 bg-green-50 p-3 rounded-lg text-sm font-bold text-green-900 border border-green-100">Ответ: {req.response}</div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <input className="border p-2 w-full rounded font-medium" placeholder="Напишите ответ..." onChange={(e) => setReplyText({...replyText, [req.id]: e.target.value})} />
                      <button onClick={() => handleReplyRequest(req.id)} className="bg-blue-600 text-white px-4 rounded font-bold hover:bg-blue-700">OK</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 5. НОВОСТИ */}
          {activeTab === 'news' && (
            <div className="bg-white p-6 rounded-xl border-t-4 border-indigo-600 shadow">
              <h2 className="font-black text-xl mb-4">Новости</h2>
              <form onSubmit={handlePublishNews} className="space-y-3 mb-6 bg-gray-50 p-4 rounded-lg">
                <input className="w-full border p-3 rounded font-bold" placeholder="Заголовок" value={newsTitle} onChange={e => setNewsTitle(e.target.value)} />
                <textarea className="w-full border p-3 rounded font-medium" placeholder="Текст..." value={newsBody} onChange={e => setNewsBody(e.target.value)} />
                <div className="flex justify-between items-center">
                   <input type="file" onChange={e => setNewsFile(e.target.files?.[0] || null)} className="text-sm" />
                   <button className="bg-black text-white px-6 py-2 rounded font-bold hover:bg-gray-800">{isUploading ? '...' : 'Опубликовать'}</button>
                </div>
              </form>
              <div className="space-y-2">
                {news.map(n => (
                  <div key={n.id} className="border p-3 rounded flex justify-between items-center bg-white">
                    <div><span className="font-bold">{n.title}</span><span className="text-xs text-gray-400 ml-2">{new Date(n.createdAt).toLocaleDateString()}</span></div>
                    <button onClick={() => handleDeleteNews(n.id)} className="text-red-500 font-bold px-2">X</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. РЕСУРСЫ */}
          {activeTab === 'resources' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white p-6 border-t-4 border-teal-500 shadow rounded-xl">
                <h3 className="font-black text-lg mb-4">Ссылки</h3>
                <form onSubmit={handleAddLink} className="flex gap-2 mb-4"><input className="border p-2 w-full rounded" placeholder="Название" value={linkTitle} onChange={e=>setLinkTitle(e.target.value)}/><input className="border p-2 w-full rounded" placeholder="URL" value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}/><button className="bg-teal-600 text-white px-3 rounded font-bold">Add</button></form>
                {links.map(l=><div key={l.id} className="flex justify-between border-b p-2"><span>{l.title}</span><button onClick={()=>handleDeleteLink(l.id)} className="text-red-500 font-bold">X</button></div>)}
              </div>
              <div className="bg-white p-6 border-t-4 border-orange-500 shadow rounded-xl">
                <h3 className="font-black text-lg mb-4">Шаблоны</h3>
                <form onSubmit={handleAddTemplate} className="flex gap-2 mb-4 flex-wrap"><input className="border p-2 w-full rounded" placeholder="Название" value={tplTitle} onChange={e=>setTplTitle(e.target.value)}/><input className="border p-2 w-full rounded" placeholder="Описание" value={tplDesc} onChange={e=>setTplDesc(e.target.value)}/><input type="file" onChange={e=>setTplFile(e.target.files?.[0] || null)} className="text-xs"/><button className="bg-orange-600 text-white px-3 rounded font-bold w-full">Загрузить</button></form>
                {templates.map(t=><div key={t.id} className="flex justify-between border-b p-2"><span>{t.title}</span><button onClick={()=>handleDeleteTemplate(t.id)} className="text-red-500 font-bold">X</button></div>)}
              </div>
            </div>
          )}

          {/* 7. СОВЕТ */}
          {activeTab === 'team' && (
            <div className="bg-white p-6 border-t-4 border-green-600 shadow rounded-xl">
              <h2 className="font-black text-xl mb-4">Совет Профсоюза</h2>
              <form onSubmit={handleAddMember} className="flex flex-col md:flex-row gap-2 mb-6 bg-gray-50 p-4 rounded">
                 <input className="border p-2 rounded font-bold w-full" placeholder="ФИО" value={memberName} onChange={e=>setMemberName(e.target.value)}/>
                 <input className="border p-2 rounded font-bold w-full" placeholder="Должность" value={memberRole} onChange={e=>setMemberRole(e.target.value)}/>
                 <input type="file" onChange={e=>setMemberFile(e.target.files?.[0] || null)} className="text-sm"/>
                 <button className="bg-green-600 text-white px-6 rounded font-bold">Добавить</button>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {team.map(m => (
                  <div key={m.id} className="border p-3 rounded flex items-center justify-between bg-white shadow-sm">
                    <div className="flex items-center gap-3">
                       <img src={m.photoUrl || '/default-avatar.png'} className="w-10 h-10 rounded-full object-cover"/>
                       <div><p className="font-bold text-sm">{m.name}</p><p className="text-xs text-gray-500">{m.role}</p></div>
                    </div>
                    <button onClick={() => handleDeleteMember(m.id)} className="text-red-400 hover:text-red-600 font-bold">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}