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
  delegationConferenceId?: string;
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
  conferenceId?: string;    
  conferenceTitle?: string; 
}

interface Conference { id: string; title: string; date: string; createdAt: string; }
interface NewsItem { id: string; title: string; body: string; imageUrl?: string; createdAt: string; }
interface TeamMember { id: string; name: string; role: string; photoUrl: string; }
interface RequestData { id: string; userEmail: string; text: string; createdAt: string; response?: string; }
interface LinkItem { id: string; title: string; url: string; }
interface DocTemplate { id: string; title: string; description?: string; fileUrl: string; }

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'delegations' | 'conferences' | 'news' | 'requests' | 'resources' | 'team'>('conferences');

  // Данные
  const [users, setUsers] = useState<UserData[]>([]);
  const [delegations, setDelegations] = useState<DelegationRequest[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);

  // Состояние для Модалки Участника (Досье)
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

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
  const handleCreateConference = async (e: React.FormEvent) => { e.preventDefault(); if (!confTitle || !confDate) return; await addDoc(collection(db, 'conferences'), { title: confTitle, date: confDate, createdAt: new Date().toISOString() }); setConfTitle(''); setConfDate(''); fetchData(); alert('Конференция создана'); };
  const handleDeleteConference = async (id: string) => { if(confirm('Удалить конференцию?')) { await deleteDoc(doc(db, 'conferences', id)); fetchData(); } };

  const handleApproveDelegation = async (req: DelegationRequest) => {
    if (!confirm(`Одобрить: ${req.fromName} -> ${req.toName}?`)) return;
    try {
      await updateDoc(doc(db, 'delegation_requests', req.id), { status: 'approved' });
      await updateDoc(doc(db, 'users', req.fromId), { 
        voteWeight: 0, 
        delegationStatus: 'approved', 
        delegatedTo: req.toId, 
        delegatedToName: req.toName,
        delegationConferenceId: req.conferenceId || null 
      });
      await updateDoc(doc(db, 'users', req.toId), { 
        voteWeight: increment(1), 
        delegatedFrom: arrayUnion(req.fromName) 
      });
      alert('Успешно'); fetchData();
    } catch (e) { console.error(e); alert('Ошибка'); }
  };

  const handleRejectDelegation = async (reqId: string, fromId: string) => { if (!confirm('Отклонить?')) return; try { await deleteDoc(doc(db, 'delegation_requests', reqId)); await updateDoc(doc(db, 'users', fromId), { delegationStatus: null, delegatedToName: null }); fetchData(); } catch { alert('Ошибка'); } };
  const handleApproveUser = async (id: string) => { if(confirm('Подтвердить?')) { await updateDoc(doc(db, 'users', id), { status: 'approved', voteWeight: 1 }); fetchData(); } };
  const handleRejectUser = async (id: string) => { if(confirm('Удалить?')) { await deleteDoc(doc(db, 'users', id)); fetchData(); } };
  const handlePublishNews = async (e: React.FormEvent) => { e.preventDefault(); setIsUploading(true); let imageUrl = ''; if(newsFile) imageUrl = await uploadImage(newsFile, 'news'); await addDoc(collection(db, 'news'), { title: newsTitle, body: newsBody, imageUrl, createdAt: new Date().toISOString() }); setNewsTitle(''); setNewsBody(''); setNewsFile(null); fetchData(); setIsUploading(false); };
  const handleDeleteNews = async (id: string) => { if(confirm('Del?')) await deleteDoc(doc(db, 'news', id)); fetchData(); };
  const handleAddMember = async (e: React.FormEvent) => { e.preventDefault(); setIsUploading(true); let photoUrl = ''; if(memberFile) photoUrl = await uploadImage(memberFile, 'team'); await addDoc(collection(db, 'team'), { name: memberName, role: memberRole, photoUrl }); setMemberName(''); setMemberRole(''); setMemberFile(null); fetchData(); setIsUploading(false); };
  const handleDeleteMember = async (id: string) => { if(confirm('Del?')) await deleteDoc(doc(db, 'team', id)); fetchData(); };
  const handleAddLink = async (e: React.FormEvent) => { e.preventDefault(); await addDoc(collection(db, 'links'), { title: linkTitle, url: linkUrl }); setLinkTitle(''); setLinkUrl(''); fetchData(); };
  const handleDeleteLink = async (id: string) => { if(confirm('Del?')) await deleteDoc(doc(db, 'links', id)); fetchData(); };
  const handleAddTemplate = async (e: React.FormEvent) => { e.preventDefault(); setIsUploading(true); if (!tplFile) return; const fileUrl = await uploadImage(tplFile, 'templates'); await addDoc(collection(db, 'templates'), { title: tplTitle, description: tplDesc, fileUrl }); setTplTitle(''); setTplDesc(''); setTplFile(null); fetchData(); setIsUploading(false); };
  const handleDeleteTemplate = async (id: string) => { if(confirm('Del?')) await deleteDoc(doc(db, 'templates', id)); fetchData(); };
  const handleReplyRequest = async (id: string) => { if(replyText[id]) { await updateDoc(doc(db, 'requests', id), { response: replyText[id], responseAt: new Date().toISOString() }); fetchData(); }};

  if (loading) return <div className="min-h-screen bg-[#F2F6FF] flex items-center justify-center font-black text-blue-900 animate-pulse">Загрузка данных...</div>;

  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeRequests = requests.filter(r => !r.response).length;
  const pendingDelegations = delegations.filter(d => d.status === 'pending');

  return (
    <div className="min-h-screen bg-[#F2F6FF] flex flex-col font-sans text-[#1A1A1A]">
      
      {/* --- HEADER --- */}
      <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white shadow-xl z-20 sticky top-0 rounded-b-[1.5rem] mb-4">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wide">Админ-Панель</h1>
            <p className="text-xs text-blue-200 font-bold opacity-70">Профсоюз Авиаработников v3.0</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold transition-all">
            ← В приложение
          </button>
        </div>
        
        {/* TABS */}
        <div className="max-w-7xl mx-auto px-4 flex gap-3 overflow-x-auto pb-4 no-scrollbar">
          {[
            { id: 'conferences', label: 'События', icon: '📅' },
            { id: 'users', label: 'Участники', icon: '👥', count: pendingUsers.length, color: 'bg-red-500' },
            { id: 'delegations', label: 'Голоса', icon: '🗳️', count: pendingDelegations.length, color: 'bg-indigo-500' },
            { id: 'requests', label: 'Вопросы', icon: '💬', count: activeRequests, color: 'bg-blue-500' },
            { id: 'news', label: 'Новости', icon: '📰' },
            { id: 'resources', label: 'Ресурсы', icon: '📂' },
            { id: 'team', label: 'Совет', icon: '👔' },
          ].map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`px-5 py-3 rounded-2xl font-bold whitespace-nowrap flex items-center gap-2 transition-all duration-300 shadow-sm
                ${activeTab === tab.id 
                  ? 'bg-white text-blue-900 shadow-lg scale-105' 
                  : 'bg-blue-900/40 text-blue-100 hover:bg-blue-800/50'}`}
            >
              <span className="text-lg">{tab.icon}</span> {tab.label} 
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`${tab.color || 'bg-gray-500'} text-white text-[10px] px-2 py-0.5 rounded-full shadow-md`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="flex-grow p-4 md:p-6 pb-20">
        <div className="max-w-7xl mx-auto">
          
          {/* 1. СОБЫТИЯ */}
          {activeTab === 'conferences' && (
            <div className="space-y-6">
              {/* Карточка создания */}
              <div className="bg-white p-8 rounded-[2rem] shadow-lg shadow-indigo-200/40 border border-white">
                <h2 className="font-black text-2xl mb-6 text-gray-800">Назначить новое событие</h2>
                <form onSubmit={handleCreateConference} className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="w-full">
                    <label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">Название события</label>
                    <input className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Например: Отчетная конференция" value={confTitle} onChange={e=>setConfTitle(e.target.value)} required />
                  </div>
                  <div className="w-full">
                    <label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">Дата начала</label>
                    <input type="datetime-local" className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition" value={confDate} onChange={e=>setConfDate(e.target.value)} required />
                  </div>
                  <button className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-transform active:scale-95 w-full md:w-auto">Создать</button>
                </form>
              </div>

              <h3 className="font-black text-gray-400 uppercase text-sm tracking-wider ml-2">Список событий</h3>
              <div className="grid gap-4">
                {conferences.map(conf => {
                  const isPast = new Date(conf.date) < new Date();
                  return (
                    <div key={conf.id} className={`p-6 rounded-[2rem] flex justify-between items-center transition-all ${isPast ? 'bg-gray-100 opacity-70 border border-gray-200' : 'bg-white shadow-md border border-indigo-50 hover:shadow-lg'}`}>
                      <div>
                        <h4 className="font-black text-xl text-gray-900">{conf.title}</h4>
                        <p className={`font-bold text-sm flex items-center gap-2 mt-1 ${isPast ? 'text-gray-500' : 'text-green-600'}`}>
                          {isPast ? '🏁 Завершено' : '🟢 Активно'} — {new Date(conf.date).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono mt-1 select-all">ID: {conf.id}</p>
                      </div>
                      <button onClick={()=>handleDeleteConference(conf.id)} className="text-red-500 bg-red-50 px-4 py-2 rounded-xl font-bold text-xs uppercase hover:bg-red-100 transition">Удалить</button>
                    </div>
                  )
                })}
                {conferences.length === 0 && <div className="text-center py-12 bg-white rounded-[2rem] border-2 border-dashed border-gray-200"><p className="text-gray-400 font-bold">Событий пока не запланировано</p></div>}
              </div>
            </div>
          )}

          {/* 2. УЧАСТНИКИ (НОВЫЙ ДИЗАЙН) */}
          {activeTab === 'users' && (
             <div className="space-y-6">
               {/* Алерт для новых */}
               {pendingUsers.length > 0 && (
                 <div className="bg-gradient-to-r from-yellow-100 to-orange-100 p-6 rounded-[2rem] border border-yellow-200 shadow-lg">
                   <h2 className="font-black text-xl mb-4 text-yellow-900 flex items-center gap-2">🔔 Ожидают доступа ({pendingUsers.length})</h2>
                   <div className="grid gap-3">
                     {pendingUsers.map(u => (
                       <div key={u.id} className="flex flex-col md:flex-row justify-between items-center bg-white/80 backdrop-blur p-4 rounded-2xl shadow-sm">
                         <div>
                            <span className="font-black text-lg block">{u.displayName}</span>
                            <span className="text-sm font-bold text-gray-500">{u.position} • {u.email}</span>
                         </div>
                         <div className="flex gap-2 mt-2 md:mt-0">
                           <button onClick={() => handleApproveUser(u.id)} className="bg-green-500 text-white px-5 py-2 rounded-xl font-bold shadow-green-200 shadow-md hover:bg-green-600">Принять</button>
                           <button onClick={() => handleRejectUser(u.id)} className="bg-red-100 text-red-500 px-5 py-2 rounded-xl font-bold hover:bg-red-200">Отклонить</button>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 overflow-hidden border border-gray-100">
                 <div className="p-8 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="font-black text-2xl text-gray-800">Реестр участников</h2>
                    <p className="text-sm text-gray-500 font-bold mt-1">Всего активных: {users.filter(u=>u.status==='approved').length}</p>
                 </div>
                 
                 <div className="overflow-x-auto">
                   <table className="w-full text-left">
                     <thead className="bg-gray-100 text-gray-400 uppercase text-xs font-black tracking-wider">
                       <tr>
                         <th className="p-6">Сотрудник</th>
                         <th className="p-6">Контакты</th>
                         <th className="p-6 text-center">Статус</th>
                         <th className="p-6 text-right">Действия</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                       {users.filter(u => u.status === 'approved').map(u => (
                         <tr 
                           key={u.id} 
                           className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                           onClick={() => setSelectedUser(u)} // ОТКРЫТИЕ МОДАЛКИ
                         >
                           <td className="p-6">
                             <div className="flex items-center gap-4">
                               <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-xl overflow-hidden border-2 border-white shadow-sm">
                                  {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover"/> : '👤'}
                               </div>
                               <div>
                                 <div className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{u.displayName}</div>
                                 <div className="text-xs font-bold text-gray-500">{u.position || 'Должность не указана'}</div>
                               </div>
                             </div>
                           </td>
                           <td className="p-6">
                             <div className="text-sm font-bold text-gray-700">{u.phoneNumber || '—'}</div>
                             <div className="text-xs text-gray-400 font-medium">{u.email}</div>
                           </td>
                           <td className="p-6 text-center">
                             {u.delegatedTo ? (
                               <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-black">
                                 ↪ Голос передан
                               </span>
                             ) : u.delegatedFrom && u.delegatedFrom.length > 0 ? (
                               <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black">
                                 ★ Делегат (+{u.delegatedFrom.length})
                               </span>
                             ) : (
                               <span className="text-gray-400 font-bold text-xs">—</span>
                             )}
                           </td>
                           <td className="p-6 text-right">
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleRejectUser(u.id); }} 
                               className="text-red-400 hover:text-red-600 font-bold text-xs px-3 py-2 hover:bg-red-50 rounded-lg transition"
                             >
                               Удалить
                             </button>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             </div>
          )}

          {/* 3. ДЕЛЕГИРОВАНИЕ */}
          {activeTab === 'delegations' && (
            <div className="space-y-6">
              {pendingDelegations.length === 0 ? (
                <div className="bg-white p-10 rounded-[2rem] text-center text-gray-400 font-bold border-2 border-dashed border-gray-200">✅ Нет новых заявок на рассмотрении</div>
              ) : (
                <div className="grid gap-4">
                  {pendingDelegations.map(req => (
                    <div key={req.id} className="bg-white p-6 rounded-[2rem] border border-indigo-100 shadow-xl shadow-indigo-100/50 flex flex-col lg:flex-row justify-between items-start gap-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
                      <div className="flex-grow pl-4">
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                           <span className="font-black text-lg bg-gray-100 px-3 py-1 rounded-xl text-gray-700">{req.fromName}</span>
                           <span className="text-indigo-300 font-black text-2xl">➝</span>
                           <span className="font-black text-lg bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl border border-indigo-200">{req.toName}</span>
                        </div>
                        {req.conferenceTitle && (
                          <div className="inline-flex items-center gap-2 bg-yellow-50 text-yellow-800 text-xs font-black px-3 py-1.5 rounded-lg mb-3">
                            📅 Событие: {req.conferenceTitle}
                          </div>
                        )}
                        <div className="flex gap-4 text-xs font-bold text-gray-400">
                          <span>🕒 {new Date(req.createdAt).toLocaleString()}</span>
                          {req.docUrl && <a href={req.docUrl} target="_blank" className="text-blue-600 underline hover:text-blue-800">📄 Смотреть документ</a>}
                        </div>
                      </div>
                      <div className="flex gap-2 w-full lg:w-auto pl-4 lg:pl-0">
                        <button onClick={()=>handleApproveDelegation(req)} className="flex-1 bg-green-500 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-green-200 hover:bg-green-600">Одобрить</button>
                        <button onClick={()=>handleRejectDelegation(req.id, req.fromId)} className="flex-1 bg-gray-100 text-red-500 border border-gray-200 px-6 py-3 rounded-xl font-black hover:bg-red-50">Отказать</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. ОБРАЩЕНИЯ */}
          {activeTab === 'requests' && (
            <div className="grid gap-4">
              {requests.map(req => (
                <div key={req.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-3">
                     <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-black">{req.userEmail}</span>
                     <span className="text-xs font-bold text-gray-400">{new Date(req.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="font-bold text-gray-800 text-lg mb-4 leading-relaxed">"{req.text}"</p>
                  
                  {req.response ? (
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100 relative">
                      <div className="text-[10px] uppercase font-black text-green-600 mb-1">Ответ отправлен:</div>
                      <p className="text-sm font-bold text-green-900">{req.response}</p>
                    </div>
                  ) : (
                    <div className="flex gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-200 focus-within:ring-2 ring-blue-500/20 transition">
                      <input className="bg-transparent p-2 w-full font-medium outline-none text-sm" placeholder="Введите ответ..." onChange={(e) => setReplyText({...replyText, [req.id]: e.target.value})} />
                      <button onClick={() => handleReplyRequest(req.id)} className="bg-blue-600 text-white px-5 rounded-xl font-black text-sm hover:bg-blue-700">Отправить</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 5. НОВОСТИ, РЕСУРСЫ, СОВЕТ - Стилизованные карточки */}
          {activeTab === 'news' && (
            <div className="space-y-6">
               <div className="bg-white p-6 rounded-[2rem] shadow-lg shadow-indigo-100/50">
                  <h2 className="font-black text-xl mb-4">Опубликовать новость</h2>
                  <form onSubmit={handlePublishNews} className="space-y-3">
                     <input className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none" placeholder="Заголовок" value={newsTitle} onChange={e => setNewsTitle(e.target.value)} />
                     <textarea className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none h-32 resize-none" placeholder="Текст новости..." value={newsBody} onChange={e => setNewsBody(e.target.value)} />
                     <div className="flex justify-between items-center">
                        <input type="file" onChange={e => setNewsFile(e.target.files?.[0] || null)} className="text-xs font-bold text-gray-500"/>
                        <button className="bg-black text-white px-8 py-3 rounded-xl font-black hover:scale-105 transition-transform">{isUploading ? '...' : 'Опубликовать'}</button>
                     </div>
                  </form>
               </div>
               <div className="grid md:grid-cols-2 gap-4">
                  {news.map(n => (
                     <div key={n.id} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm relative group overflow-hidden">
                        <div className="relative z-10">
                           <h3 className="font-black text-lg leading-tight mb-2">{n.title}</h3>
                           <p className="text-xs text-gray-400 font-bold">{new Date(n.createdAt).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 hover:text-red-500 font-black z-20">✕</button>
                     </div>
                  ))}
               </div>
            </div>
          )}

          {/* Ресурсы и Совет оставил в простом гриде, но с новыми стилями */}
          {activeTab === 'resources' && <div className="grid md:grid-cols-2 gap-6"><div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-lg"><h3 className="font-black text-xl mb-4 text-teal-600">🔗 Ссылки</h3><form onSubmit={handleAddLink} className="flex flex-col gap-3 mb-6"><input className="bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="Название" value={linkTitle} onChange={e=>setLinkTitle(e.target.value)}/><input className="bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="URL" value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}/><button className="bg-teal-600 text-white py-3 rounded-xl font-black">Добавить</button></form>{links.map(l=><div key={l.id} className="flex justify-between py-2 border-b border-gray-50"><span className="font-bold text-gray-700 text-sm">{l.title}</span><button onClick={()=>handleDeleteLink(l.id)} className="text-red-400 font-bold">✕</button></div>)}</div><div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-lg"><h3 className="font-black text-xl mb-4 text-orange-500">📄 Шаблоны</h3><form onSubmit={handleAddTemplate} className="flex flex-col gap-3 mb-6"><input className="bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="Название" value={tplTitle} onChange={e=>setTplTitle(e.target.value)}/><input className="bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="Описание" value={tplDesc} onChange={e=>setTplDesc(e.target.value)}/><input type="file" onChange={e=>setTplFile(e.target.files?.[0] || null)} className="text-xs font-bold"/><button className="bg-orange-500 text-white py-3 rounded-xl font-black">Загрузить</button></form>{templates.map(t=><div key={t.id} className="flex justify-between py-2 border-b border-gray-50"><span className="font-bold text-gray-700 text-sm">{t.title}</span><button onClick={()=>handleDeleteTemplate(t.id)} className="text-red-400 font-bold">✕</button></div>)}</div></div>}
          
          {activeTab === 'team' && <div className="bg-white p-8 rounded-[2rem] shadow-xl"><h2 className="font-black text-2xl mb-6">Совет Профсоюза</h2><form onSubmit={handleAddMember} className="bg-gray-50 p-6 rounded-2xl mb-8 flex flex-col gap-4"><input className="p-3 rounded-xl font-bold border-0" placeholder="ФИО" value={memberName} onChange={e=>setMemberName(e.target.value)}/><input className="p-3 rounded-xl font-bold border-0" placeholder="Должность" value={memberRole} onChange={e=>setMemberRole(e.target.value)}/><input type="file" onChange={e=>setMemberFile(e.target.files?.[0] || null)} className="text-xs font-bold"/><button className="bg-black text-white py-3 rounded-xl font-black">Добавить участника</button></form><div className="grid md:grid-cols-3 gap-4">{team.map(m=><div key={m.id} className="border border-gray-100 p-4 rounded-2xl flex items-center gap-4 bg-white hover:shadow-lg transition-shadow"><img src={m.photoUrl || '/default-avatar.png'} className="w-12 h-12 rounded-full object-cover"/><div className="flex-grow"><p className="font-black text-sm">{m.name}</p><p className="text-xs font-bold text-gray-400">{m.role}</p></div><button onClick={()=>handleDeleteMember(m.id)} className="text-red-400 font-black px-2">✕</button></div>)}</div></div>}

        </div>
      </div>

      {/* --- МОДАЛКА УЧАСТНИКА (ДОСЬЕ) --- */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setSelectedUser(null)}>
           <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white relative">
                 <button onClick={() => setSelectedUser(null)} className="absolute top-6 right-6 bg-white/20 hover:bg-white/30 p-2 rounded-full backdrop-blur transition">✕</button>
                 <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-white rounded-full border-4 border-white/30 shadow-lg overflow-hidden flex items-center justify-center text-4xl text-gray-300">
                       {selectedUser.photoUrl ? <img src={selectedUser.photoUrl} className="w-full h-full object-cover"/> : '👤'}
                    </div>
                    <div>
                       <h2 className="text-3xl font-black">{selectedUser.displayName}</h2>
                       <p className="font-bold text-blue-100 text-lg opacity-90">{selectedUser.position}</p>
                    </div>
                 </div>
                 <div className="mt-6 flex gap-6 text-sm font-bold opacity-80">
                    <span>📞 {selectedUser.phoneNumber || 'Нет телефона'}</span>
                    <span>✉️ {selectedUser.email}</span>
                 </div>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto bg-gray-50">
                 <div className="grid md:grid-cols-2 gap-8">
                    {/* КТО ДОВЕРИЛ ЕМУ */}
                    <div>
                       <h3 className="font-black text-gray-400 uppercase text-xs tracking-wider mb-4 border-b pb-2">Ему доверили голоса ({delegations.filter(d => d.toId === selectedUser.id && d.status === 'approved').length})</h3>
                       <div className="space-y-3">
                          {delegations.filter(d => d.toId === selectedUser.id && d.status === 'approved').map(d => (
                             <div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="font-black text-gray-800">{d.fromName}</p>
                                <p className="text-xs font-bold text-indigo-500 mt-1 bg-indigo-50 inline-block px-2 py-0.5 rounded">
                                   {d.conferenceTitle || 'Событие не указано'}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-1">{new Date(d.createdAt).toLocaleDateString()}</p>
                             </div>
                          ))}
                          {delegations.filter(d => d.toId === selectedUser.id && d.status === 'approved').length === 0 && <p className="text-gray-400 text-sm font-bold italic">Нет активных доверенностей</p>}
                       </div>
                    </div>

                    {/* КОМУ ОН ДОВЕРИЛ */}
                    <div>
                       <h3 className="font-black text-gray-400 uppercase text-xs tracking-wider mb-4 border-b pb-2">Он доверил голос</h3>
                       <div className="space-y-3">
                          {delegations.filter(d => d.fromId === selectedUser.id && d.status === 'approved').map(d => (
                             <div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border border-yellow-100">
                                <p className="text-xs text-gray-400 font-bold mb-1">Передано:</p>
                                <p className="font-black text-gray-800 text-lg">{d.toName}</p>
                                <p className="text-xs font-bold text-gray-500 mt-1">
                                   Соб: {d.conferenceTitle || '—'}
                                </p>
                             </div>
                          ))}
                          {delegations.filter(d => d.fromId === selectedUser.id && d.status === 'approved').length === 0 && <p className="text-gray-400 text-sm font-bold italic">Голосует сам</p>}
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}