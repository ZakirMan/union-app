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
  voteWeight?: number;        // Вес голоса
  delegatedTo?: string;       // Кому передал
  delegatedToName?: string;   // Имя кому передал
  delegatedFrom?: string[];   // От кого получил
  delegationStatus?: string;  // Статус делегирования
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
}

interface NewsItem { 
  id: string; 
  title: string; 
  body: string; 
  imageUrl?: string; 
  createdAt: string; 
}

interface TeamMember { 
  id: string; 
  name: string; 
  role: string; 
  photoUrl: string; 
}

interface RequestData { 
  id: string; 
  userEmail: string; 
  text: string; 
  createdAt: string; 
  response?: string; 
}

interface LinkItem { 
  id: string; 
  title: string; 
  url: string; 
}

interface DocTemplate { 
  id: string; 
  title: string; 
  description?: string; 
  fileUrl: string; 
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'delegations' | 'news' | 'requests' | 'resources' | 'team'>('users');

  // --- ДАННЫЕ ---
  const [users, setUsers] = useState<UserData[]>([]);
  const [delegations, setDelegations] = useState<DelegationRequest[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);

  // --- ФОРМЫ ---
  // Новости
  const [newsTitle, setNewsTitle] = useState(''); 
  const [newsBody, setNewsBody] = useState(''); 
  const [newsFile, setNewsFile] = useState<File | null>(null);

  // Совет
  const [memberName, setMemberName] = useState(''); 
  const [memberRole, setMemberRole] = useState(''); 
  const [memberFile, setMemberFile] = useState<File | null>(null);

  // Ресурсы
  const [linkTitle, setLinkTitle] = useState(''); 
  const [linkUrl, setLinkUrl] = useState('');
  const [tplTitle, setTplTitle] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplFile, setTplFile] = useState<File | null>(null);

  // Ответы
  const [replyText, setReplyText] = useState<{[key: string]: string}>({});

  const [isUploading, setIsUploading] = useState(false);

  // --- 1. ПРОВЕРКА ПРАВ И ЗАГРУЗКА ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') {
            fetchData();
          } else {
            router.push('/dashboard');
          }
        } catch { router.push('/dashboard'); }
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchData = async () => {
    try {
      // Пользователи
      const uSnap = await getDocs(collection(db, 'users')); 
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));

      // Делегирование
      const dSnap = await getDocs(collection(db, 'delegation_requests'));
      setDelegations(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as DelegationRequest)).sort((a,b) => a.createdAt < b.createdAt ? 1 : -1));

      // Новости
      const nSnap = await getDocs(collection(db, 'news')); 
      setNews(nSnap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)).sort((a,b) => a.createdAt < b.createdAt ? 1 : -1));

      // Совет
      const tSnap = await getDocs(collection(db, 'team')); 
      setTeam(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamMember)));

      // Обращения
      const rSnap = await getDocs(collection(db, 'requests')); 
      setRequests(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as RequestData)).sort((a,b) => a.createdAt < b.createdAt ? 1 : -1));

      // Ссылки и Шаблоны
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

  // --- ДЕЙСТВИЯ (ACTIONS) ---

  // 1. ДЕЛЕГИРОВАНИЕ
  const handleApproveDelegation = async (req: DelegationRequest) => {
    if (!confirm(`Передать голос от ${req.fromName} к ${req.toName}?`)) return;
    try {
      // А. Обновляем статус заявки
      await updateDoc(doc(db, 'delegation_requests', req.id), { status: 'approved' });

      // Б. Доверитель (Тот, кто отдает голос): Вес = 0, Статус = одобрено
      await updateDoc(doc(db, 'users', req.fromId), {
        voteWeight: 0,
        delegationStatus: 'approved',
        delegatedTo: req.toId,
        delegatedToName: req.toName
      });

      // В. Делегат (Тот, кто получает): Вес + 1, Добавляем имя в список
      await updateDoc(doc(db, 'users', req.toId), {
        voteWeight: increment(1),
        delegatedFrom: arrayUnion(req.fromName)
      });

      alert('Делегирование успешно проведено!');
      fetchData();
    } catch (e) {
      console.error(e);
      alert('Ошибка при обновлении базы данных');
    }
  };

  const handleRejectDelegation = async (reqId: string, fromId: string) => {
    if (!confirm('Отклонить заявку и удалить её?')) return;
    try {
      await deleteDoc(doc(db, 'delegation_requests', reqId));
      // Сбрасываем статус у пользователя, чтобы он мог подать новую заявку
      await updateDoc(doc(db, 'users', fromId), { 
        delegationStatus: null, 
        delegatedToName: null 
      });
      fetchData();
    } catch (e) { alert('Ошибка удаления'); }
  };

  // 2. ПОЛЬЗОВАТЕЛИ
  const handleApproveUser = async (id: string) => { 
    if(confirm('Подтвердить сотрудника?')) { 
      // При одобрении даем 1 голос по умолчанию
      await updateDoc(doc(db, 'users', id), { status: 'approved', voteWeight: 1 }); 
      fetchData(); 
    }
  };
  const handleRejectUser = async (id: string, name?: string) => { 
    if(confirm(`Удалить пользователя ${name || ''}?`)) { 
      await deleteDoc(doc(db, 'users', id)); 
      fetchData(); 
    }
  };

  // 3. НОВОСТИ
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

  // 4. СОВЕТ
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

  // 5. РЕСУРСЫ (Ссылки и Шаблоны)
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

  // 6. ОБРАЩЕНИЯ
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
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight">Админ-панель</h1>
          <button onClick={() => router.push('/dashboard')} className="text-blue-700 font-bold hover:underline text-sm">
            ← В приложение
          </button>
        </div>
        
        {/* НАВИГАЦИЯ (TABS) */}
        <div className="max-w-7xl mx-auto px-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {[
            { id: 'users', label: 'Участники', count: pendingUsers.length, color: 'bg-red-600' },
            { id: 'delegations', label: 'Делегирование', count: pendingDelegations.length, color: 'bg-purple-600' },
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
          
          {/* 1. УЧАСТНИКИ */}
          {activeTab === 'users' && (
             <div className="space-y-6">
               {/* Ожидают подтверждения */}
               {pendingUsers.length > 0 && (
                 <div className="bg-white p-6 rounded-xl border-2 border-yellow-400 shadow-lg animate-in fade-in slide-in-from-top-4">
                   <h2 className="font-black text-xl mb-4 text-yellow-900">🔔 Новые заявки ({pendingUsers.length})</h2>
                   <div className="grid gap-3">
                     {pendingUsers.map(u => (
                       <div key={u.id} className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                         <div>
                           <p className="font-bold text-lg">{u.displayName}</p>
                           <p className="font-medium">{u.position}</p>
                           <p className="text-sm font-bold text-gray-800">{u.phoneNumber || 'Нет телефона'}</p>
                           <p className="text-sm text-gray-600">{u.email}</p>
                         </div>
                         <div className="flex gap-2 w-full md:w-auto">
                           <button onClick={() => handleApproveUser(u.id)} className="flex-1 md:flex-none bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700">
                             Принять
                           </button>
                           <button onClick={() => handleRejectUser(u.id, u.displayName)} className="flex-1 md:flex-none bg-red-600 text-white px-4 py-2 rounded font-bold hover:bg-red-700">
                             Отклонить
                           </button>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               {/* Список всех */}
               <div className="bg-white p-6 rounded-xl border shadow-sm">
                 <h2 className="font-black text-xl mb-4">База участников</h2>
                 <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm">
                     <thead className="bg-gray-100 border-b-2 border-gray-300 font-bold text-gray-600 uppercase">
                       <tr>
                         <th className="p-3">ФИО / Статус</th>
                         <th className="p-3">Вес голоса</th>
                         <th className="p-3">Должность</th>
                         <th className="p-3">Контакты</th>
                         <th className="p-3">Действия</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y">
                       {users.filter(u => u.status === 'approved').map(u => (
                         <tr key={u.id} className="hover:bg-gray-50 transition">
                           <td className="p-3 align-top">
                             <div className="font-bold text-gray-900">{u.displayName}</div>
                             {/* Индикаторы делегирования */}
                             {u.delegatedFrom && u.delegatedFrom.length > 0 && (
                               <div className="text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded inline-block mt-1 mr-1">
                                 + от: {u.delegatedFrom.join(', ')}
                               </div>
                             )}
                             {u.delegatedTo && (
                               <div className="text-[10px] text-red-700 bg-red-100 px-2 py-0.5 rounded inline-block mt-1">
                                 Голос передан ➝ {u.delegatedToName}
                               </div>
                             )}
                           </td>
                           <td className="p-3 align-top">
                             <span className={`px-3 py-1 rounded-full font-black text-sm ${(u.voteWeight || 1) > 1 ? 'bg-indigo-600 text-white' : (u.voteWeight === 0 ? 'bg-gray-200 text-gray-400' : 'bg-gray-200 text-gray-800')}`}>
                               {u.voteWeight !== undefined ? u.voteWeight : 1}
                             </span>
                           </td>
                           <td className="p-3 align-top text-gray-600">{u.position}</td>
                           <td className="p-3 align-top">
                             <div className="font-mono text-xs">{u.phoneNumber}</div>
                             <div className="text-xs text-gray-400">{u.email}</div>
                           </td>
                           <td className="p-3 align-top">
                             {u.role !== 'admin' && (
                               <button onClick={() => handleRejectUser(u.id, u.displayName)} className="text-red-600 font-bold hover:bg-red-50 px-2 py-1 rounded text-xs border border-transparent hover:border-red-200">
                                 Удалить
                               </button>
                             )}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             </div>
          )}

          {/* 2. ДЕЛЕГИРОВАНИЕ (НОВАЯ ВКЛАДКА) */}
          {activeTab === 'delegations' && (
            <div className="space-y-6">
              <h2 className="font-black text-2xl mb-4">Управление голосами</h2>
              
              {/* Новые заявки */}
              {pendingDelegations.length === 0 ? (
                <div className="bg-gray-100 p-8 rounded-xl text-center text-gray-500 font-bold border border-dashed border-gray-300">
                  Нет новых заявок на делегирование.
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingDelegations.map(req => (
                    <div key={req.id} className="bg-white p-6 rounded-xl border-l-4 border-indigo-600 shadow-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                           <span className="font-black text-lg bg-gray-100 px-2 py-1 rounded">{req.fromName}</span>
                           <span className="text-gray-400 font-bold text-xl">➝</span>
                           <span className="font-black text-lg bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-200">{req.toName}</span>
                        </div>
                        <p className="text-xs text-gray-500 font-bold mb-3">Создано: {new Date(req.createdAt).toLocaleString()}</p>
                        
                        {req.docUrl ? (
                          <a href={req.docUrl} target="_blank" className="inline-flex items-center gap-2 text-blue-600 font-bold text-sm bg-blue-50 px-3 py-2 rounded hover:bg-blue-100 transition">
                            <span>📄</span> Скачать/Открыть доверенность
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Документ не приложен (устная договоренность)</span>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <button onClick={()=>handleApproveDelegation(req)} className="flex-1 bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-200 transition">
                          Одобрить передачу
                        </button>
                        <button onClick={()=>handleRejectDelegation(req.id, req.fromId)} className="flex-1 bg-white text-red-600 border-2 border-red-100 px-6 py-3 rounded-xl font-bold hover:bg-red-50 transition">
                          Отклонить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* История */}
              {delegations.some(d => d.status === 'approved') && (
                <div className="mt-10 pt-8 border-t border-gray-200">
                  <h3 className="font-bold text-gray-400 uppercase text-xs mb-4 tracking-wider">История одобренных заявок</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 opacity-70">
                    {delegations.filter(d => d.status === 'approved').map(d => (
                      <div key={d.id} className="flex justify-between items-center text-sm bg-white p-3 rounded border">
                        <span className="font-medium">{d.fromName} ➝ {d.toName}</span>
                        <span className="text-green-600 font-black text-xs uppercase bg-green-50 px-2 py-1 rounded">Выполнено</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. ОБРАЩЕНИЯ */}
          {activeTab === 'requests' && (
            <div className="bg-white p-6 rounded-xl border-t-4 border-blue-600 shadow space-y-6">
              <h2 className="font-black text-xl">Входящие вопросы</h2>
              {requests.length === 0 && <p className="text-gray-500">Сообщений нет.</p>}
              
              {requests.map(req => (
                <div key={req.id} className={`p-5 rounded-lg border ${req.response ? 'bg-gray-50 border-gray-200' : 'bg-white border-blue-300 shadow-md'}`}>
                  <div className="flex justify-between mb-3 items-start">
                    <span className="font-bold text-blue-900 bg-blue-100 px-2 py-1 rounded text-xs">
                      {req.userEmail}
                    </span>
                    <span className="text-xs font-bold text-gray-500">
                      {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <p className="font-bold text-gray-900 mb-4 whitespace-pre-wrap">{req.text}</p>
                  
                  {req.response ? (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <p className="text-xs text-green-700 font-black mb-1 uppercase">Ваш ответ:</p>
                      <p className="text-sm text-gray-900 font-medium">{req.response}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row gap-2 mt-4 pt-4 border-t border-gray-100">
                      <input 
                        className="flex-grow border border-gray-300 rounded px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" 
                        placeholder="Напишите ответ..." 
                        value={replyText[req.id] || ''}
                        onChange={(e) => setReplyText({...replyText, [req.id]: e.target.value})}
                      />
                      <button 
                        onClick={() => handleReplyRequest(req.id)} 
                        className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700"
                      >
                        Ответить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 4. НОВОСТИ */}
          {activeTab === 'news' && (
            <div className="bg-white p-6 rounded-xl border-t-4 border-indigo-600 shadow">
              <h2 className="text-xl font-black mb-6">Публикация новостей</h2>
              <form onSubmit={handlePublishNews} className="space-y-4 mb-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
                <input className="w-full p-3 border border-gray-300 rounded text-lg font-black" placeholder="Заголовок новости" value={newsTitle} onChange={e => setNewsTitle(e.target.value)} required />
                <textarea className="w-full p-3 border border-gray-300 rounded h-32 text-sm font-medium" placeholder="Текст новости..." value={newsBody} onChange={e => setNewsBody(e.target.value)} required />
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <input type="file" onChange={e => setNewsFile(e.target.files?.[0] || null)} className="text-sm font-bold text-gray-500 w-full" />
                  <button disabled={isUploading} className="bg-indigo-600 text-white px-8 py-2 rounded font-bold w-full md:w-auto hover:bg-indigo-700">
                    {isUploading ? '...' : 'Опубликовать'}
                  </button>
                </div>
              </form>
              <div className="space-y-4">
                {news.map(item => (
                  <div key={item.id} className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg hover:bg-gray-50 items-start">
                    {item.imageUrl && <img src={item.imageUrl} className="w-full md:w-32 h-32 md:h-20 object-cover rounded border" />}
                    <div className="flex-grow">
                      <h3 className="font-black text-lg">{item.title}</h3>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-1">{item.body}</p>
                      <p className="text-xs text-gray-400 font-bold">{new Date(item.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => handleDeleteNews(item.id)} className="text-red-600 font-bold border border-red-200 px-3 py-1 rounded text-xs hover:bg-red-50">
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. РЕСУРСЫ */}
          {activeTab === 'resources' && (
            <div className="grid md:grid-cols-2 gap-8">
              {/* Ссылки */}
              <div className="bg-white p-6 rounded-xl border-t-4 border-teal-500 shadow">
                <h3 className="font-black text-lg mb-4">🔗 Полезные ссылки</h3>
                <form onSubmit={handleAddLink} className="flex flex-col gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
                  <input className="border p-2 rounded font-bold text-sm" placeholder="Название" value={linkTitle} onChange={e=>setLinkTitle(e.target.value)} required />
                  <input className="border p-2 rounded text-sm" placeholder="URL (https://...)" value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} required />
                  <button className="bg-teal-600 text-white py-2 rounded font-bold hover:bg-teal-700">Добавить ссылку</button>
                </form>
                <div className="space-y-2">
                  {links.map(l => (
                    <div key={l.id} className="flex justify-between items-center border p-3 rounded hover:bg-gray-50">
                      <a href={l.url} target="_blank" className="font-bold text-blue-700 truncate mr-2 text-sm">{l.title}</a>
                      <button onClick={()=>handleDeleteLink(l.id)} className="text-red-500 font-bold px-2">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Шаблоны */}
              <div className="bg-white p-6 rounded-xl border-t-4 border-orange-500 shadow">
                <h3 className="font-black text-lg mb-4">📄 Шаблоны документов</h3>
                <form onSubmit={handleAddTemplate} className="flex flex-col gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
                  <input className="border p-2 rounded font-bold text-sm" placeholder="Название файла" value={tplTitle} onChange={e=>setTplTitle(e.target.value)} required />
                  <input className="border p-2 rounded text-sm" placeholder="Описание" value={tplDesc} onChange={e=>setTplDesc(e.target.value)} />
                  <input type="file" onChange={e=>setTplFile(e.target.files?.[0] || null)} className="text-sm font-bold text-gray-500" required />
                  <button disabled={isUploading} className="bg-orange-600 text-white py-2 rounded font-bold hover:bg-orange-700">
                    {isUploading ? 'Загрузка...' : 'Загрузить файл'}
                  </button>
                </form>
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="flex justify-between border p-3 rounded hover:bg-gray-50 items-center">
                      <div className="overflow-hidden">
                        <p className="font-bold text-sm truncate">{t.title}</p>
                        {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
                      </div>
                      <button onClick={()=>handleDeleteTemplate(t.id)} className="text-red-500 font-bold px-2 ml-2">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 6. СОВЕТ */}
          {activeTab === 'team' && (
            <div className="bg-white p-6 rounded-xl border-t-4 border-green-600 shadow">
              <h2 className="text-xl font-black mb-6">Совет Профсоюза</h2>
              <form onSubmit={handleAddMember} className="bg-gray-100 p-4 rounded-lg mb-8 flex flex-col md:flex-row gap-4 items-end border border-gray-200">
                <div className="w-full"><label className="text-xs font-bold uppercase text-gray-500">ФИО</label><input className="w-full p-2 border border-gray-300 rounded font-bold" value={memberName} onChange={e => setMemberName(e.target.value)} required /></div>
                <div className="w-full"><label className="text-xs font-bold uppercase text-gray-500">Должность</label><input className="w-full p-2 border border-gray-300 rounded font-bold" value={memberRole} onChange={e => setMemberRole(e.target.value)} required /></div>
                <div className="w-full"><label className="text-xs font-bold uppercase text-gray-500">Фото</label><input type="file" onChange={e => setMemberFile(e.target.files?.[0] || null)} className="w-full text-xs font-bold" /></div>
                <button disabled={isUploading} className="w-full md:w-auto bg-green-600 text-white px-6 py-2 rounded font-bold h-[42px] hover:bg-green-700">
                  {isUploading ? '...' : 'Добавить'}
                </button>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {team.map(member => (
                  <div key={member.id} className="relative border rounded-lg p-4 flex items-center gap-4 bg-white shadow-sm">
                    <img src={member.photoUrl || '/default-avatar.png'} className="w-16 h-16 rounded-full object-cover border-2 border-gray-100" />
                    <div>
                      <p className="font-black">{member.name}</p>
                      <p className="text-sm font-bold text-blue-700">{member.role}</p>
                    </div>
                    <button onClick={() => handleDeleteMember(member.id)} className="absolute top-2 right-2 text-red-400 font-bold hover:text-red-600">
                      ✕
                    </button>
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
