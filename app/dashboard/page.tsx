'use client';

import { useState, useEffect, useRef } from 'react';
import { auth, db, storage } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, getDocs, query, where, updateDoc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// --- ТИПЫ ДАННЫХ ---
interface UserProfile { 
  id: string; 
  displayName: string; 
  email: string; 
  phoneNumber?: string; 
  position: string; 
  role: string; 
  status: string; 
  photoUrl?: string; 
  voteWeight?: number; 
  delegatedTo?: string; 
  delegatedToName?: string; 
  delegationStatus?: 'pending' | 'approved'; 
  delegationConferenceId?: string; // ID конференции, к которой привязано делегирование
  delegatedFrom?: string[]; 
}
interface Conference { id: string; title: string; date: string; }
interface NewsItem { id: string; title: string; body: string; imageUrl?: string; createdAt: string; }
interface TemplateItem { id: string; title: string; description?: string; fileUrl: string; }
interface LinkItem { id: string; title: string; url: string; }
interface RequestItem { id: string; text: string; response?: string; fileUrl?: string; createdAt: string; }

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'news' | 'chat' | 'resources' | 'profile'>('news');
  const router = useRouter();

  // Данные
  const [news, setNews] = useState<NewsItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [myRequests, setMyRequests] = useState<RequestItem[]>([]);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [nextConference, setNextConference] = useState<Conference | null>(null);

  // --- ЧАТ ---
  const [message, setMessage] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const chatFileRef = useRef<HTMLInputElement>(null);
  
  // --- ПРОФИЛЬ ---
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(''); 
  const [editPhone, setEditPhone] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null); 
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // --- ДЕЛЕГИРОВАНИЕ ---
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [selectedDelegateId, setSelectedDelegateId] = useState('');
  const [delegateFile, setDelegateFile] = useState<File | null>(null);
  const [isSubmittingDelegation, setIsSubmittingDelegation] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);


  // --- ЗАГРУЗКА ДАННЫХ ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { router.push('/login'); return; }
      setUser(currentUser);

      try {
        // 1. Профиль
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          setUserData({ id: userDoc.id, ...data });
          setEditName(data.displayName || ''); 
          setEditPhone(data.phoneNumber || '');
          setEditPosition(data.position || '');
        }

        // 2. Коллекции
        const [lSnap, tSnap, nSnap, uSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'links')),
          getDocs(collection(db, 'templates')),
          getDocs(collection(db, 'news')),
          getDocs(query(collection(db, 'users'), where('status', '==', 'approved'))),
          getDocs(collection(db, 'conferences'))
        ]);

        setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as LinkItem)));
        setTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TemplateItem)));
        
        const newsList = nSnap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem));
        newsList.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setNews(newsList);

        const usersList = uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)).filter(u => u.id !== currentUser.uid);
        usersList.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setColleagues(usersList);

        const now = new Date();
        const confs = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Conference));
        confs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const upcoming = confs.filter(c => new Date(c.date) > now);
        if (upcoming.length > 0) setNextConference(upcoming[0]); 
        else if (confs.length > 0) setNextConference(confs[confs.length - 1]);

        const qReq = query(collection(db, 'requests'), where('userId', '==', currentUser.uid));
        const rSnap = await getDocs(qReq);
        const myReqList = rSnap.docs.map(d => ({ id: d.id, ...d.data() } as RequestItem));
        myReqList.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setMyRequests(myReqList);

      } catch (e) { console.error(e); } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => { await signOut(auth); router.push('/'); };

  // Логика доступности делегирования
  const getDelegationState = () => {
    if (!nextConference) return { isOpen: false, message: 'Нет запланированных конференций' };
    const confDate = new Date(nextConference.date);
    const now = new Date();
    const openDate = new Date(confDate);
    openDate.setDate(confDate.getDate() - 30); 
    if (now > confDate) return { isOpen: false, message: 'Конференция уже началась или прошла' };
    if (now < openDate) return { isOpen: false, message: `Откроется ${openDate.toLocaleDateString()}` };
    return { isOpen: true, message: `До ${confDate.toLocaleDateString()}` };
  };
  const delegationState = getDelegationState();

  // --- ОТПРАВКА ДЕЛЕГИРОВАНИЯ (С ПРИВЯЗКОЙ К СОБЫТИЮ) ---
  const handleSubmitDelegation = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    // Если нет конференции, делегировать нельзя
    if (!nextConference) {
      alert('Нет активной конференции для делегирования');
      return;
    }
    if (!user || !selectedDelegateId) { alert('Выберите коллегу'); return; } 
    
    setIsSubmittingDelegation(true); 
    try { 
      let docUrl = ''; 
      if (delegateFile) { 
        const docRef = ref(storage, `delegations/${user.uid}_${Date.now()}`); 
        await uploadBytes(docRef, delegateFile); 
        docUrl = await getDownloadURL(docRef); 
      } 
      const delegateUser = colleagues.find(c => c.id === selectedDelegateId); 
      
      // 1. Создаем заявку с привязкой к ID конференции
      await addDoc(collection(db, 'delegation_requests'), { 
        fromId: user.uid, 
        fromName: userData?.displayName, 
        toId: selectedDelegateId, 
        toName: delegateUser?.displayName, 
        docUrl, 
        conferenceId: nextConference.id, // <--- ВАЖНО: ID события
        conferenceTitle: nextConference.title, // <--- Название (для истории)
        createdAt: new Date().toISOString(), 
        status: 'pending' 
      }); 
      
      // 2. Обновляем статус юзера
      await updateDoc(doc(db, 'users', user.uid), { 
        delegationStatus: 'pending', 
        delegatedToName: delegateUser?.displayName 
      }); 
      
      setUserData(prev => prev ? ({ ...prev, delegationStatus: 'pending', delegatedToName: delegateUser?.displayName }) : null); 
      setShowDelegateModal(false); 
      alert('Заявка отправлена.'); 
    } catch (e) { alert('Ошибка'); } finally { setIsSubmittingDelegation(false); } 
  };

  const sendRequest = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!message.trim() && !chatFile) return; 
    setIsSending(true); 
    try {
      let fileUrl = '';
      if (chatFile) {
        const storageRef = ref(storage, `requests_files/${user.uid}_${Date.now()}_${chatFile.name}`);
        await uploadBytes(storageRef, chatFile);
        fileUrl = await getDownloadURL(storageRef);
      }
      const newReqData = { userId: user?.uid, userEmail: user?.email, text: message, fileUrl: fileUrl || null, status: 'new', createdAt: new Date().toISOString() }; 
      const docRef = await addDoc(collection(db, 'requests'), newReqData); 
      // @ts-ignore
      setMyRequests(prev => [{ ...newReqData, id: docRef.id }, ...prev]); 
      setMessage(''); setChatFile(null); if(chatFileRef.current) chatFileRef.current.value = '';
    } catch { alert('Ошибка'); } finally { setIsSending(false); } 
  };

  const handleSaveProfile = async () => { if (!user || !userData) return; setIsSavingProfile(true); try { let photoUrl = userData.photoUrl; if (editFile) { const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`); await uploadBytes(storageRef, editFile); photoUrl = await getDownloadURL(storageRef); } await updateDoc(doc(db, 'users', user.uid), { displayName: editName, phoneNumber: editPhone, position: editPosition, photoUrl }); setUserData({ ...userData, displayName: editName, phoneNumber: editPhone, position: editPosition, photoUrl }); setIsEditing(false); setEditFile(null); } catch { alert('Ошибка'); } finally { setIsSavingProfile(false); } };
  const filteredColleagues = colleagues.filter(c => c.displayName.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500 animate-pulse">Загрузка...</div>;
  if (userData?.status === 'pending') return <div className="p-10 text-center font-bold text-gray-600">Ваш аккаунт ожидает подтверждения.</div>;

  // --- УМНАЯ ПРОВЕРКА ДЕЛЕГИРОВАНИЯ ---
  // Показываем, что голос передан, ТОЛЬКО если есть конференция И ID в профиле совпадает с ID текущей конференции
  const isDelegationActive = 
    userData?.delegatedTo && 
    nextConference && 
    userData?.delegationConferenceId === nextConference.id;

  // Если заявка висит (pending), мы показываем "Ожидание", но если конференция удалилась - лучше скрыть это?
  // Пока оставим pending как есть, но одобренное точно привязываем к ID.

  return (
    <div className="min-h-screen bg-[#F2F6FF] font-sans text-[#1A1A1A] pb-28">
      {/* HEADER */}
      {activeTab !== 'profile' && (
        <div className="bg-gradient-to-r from-blue-700 to-blue-600 text-white p-6 rounded-b-[2rem] shadow-lg shadow-blue-200/50 mb-6 sticky top-0 z-30">
          <h1 className="text-3xl font-black tracking-tight">{activeTab === 'news' ? 'Новости' : activeTab === 'chat' ? 'Центр связи' : 'База знаний'}</h1>
        </div>
      )}
      
      <div className="max-w-xl mx-auto px-5 mt-2">
        {/* НОВОСТИ */}
        {activeTab === 'news' && (
          <div className="space-y-6">
            {nextConference && (
               <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200/50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 opacity-10 text-[10rem] leading-none -mt-10 -mr-10 font-black">📅</div>
                  <div className="relative z-10">
                    <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3 backdrop-blur-sm">Ближайшее событие</div>
                    <h2 className="text-2xl font-black mb-2 leading-tight">{nextConference.title}</h2>
                    <p className="text-lg font-bold opacity-90">{new Date(nextConference.date).toLocaleString([], {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
               </div>
            )}
            <div className="space-y-6">{news.map(i => (<div key={i.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-300">{i.imageUrl && <div className="h-52 w-full bg-gray-200 relative"><img src={i.imageUrl} className="w-full h-full object-cover" /></div>}<div className="p-6"><h3 className="font-black text-xl mb-3 leading-tight">{i.title}</h3><p className="text-gray-600 text-sm leading-relaxed">{i.body}</p><p className="text-xs text-gray-400 font-bold mt-4">{new Date(i.createdAt).toLocaleDateString()}</p></div></div>))}{news.length === 0 && <p className="text-center text-gray-400 py-10 font-bold">Новостей пока нет</p>}</div>
          </div>
        )}

        {/* ЧАТ */}
        {activeTab === 'chat' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-green-200/50 flex items-center justify-between relative overflow-hidden">
               <div className="absolute right-0 bottom-0 opacity-10 text-8xl -mb-4 -mr-4 font-black">💬</div>
               <div className="relative z-10">
                 <h2 className="font-black text-xl mb-1">Юридическая помощь</h2>
                 <p className="text-green-100 text-sm font-bold">Чат с администрацией в WhatsApp</p>
               </div>
               <a href="https://wa.me/77772319992" target="_blank" className="relative z-10 bg-white text-green-600 px-6 py-3 rounded-xl font-black shadow-sm active:scale-95 transition-transform">
                 Написать
               </a>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
               <h2 className="font-black text-xl mb-4 text-gray-900">Написать в Совет</h2>
               <form onSubmit={sendRequest}>
                 <div className="relative mb-3">
                   <textarea 
                     className="w-full bg-gray-50 p-4 rounded-2xl border-0 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none font-medium text-sm min-h-[100px]" 
                     placeholder="Опишите ваш вопрос..."
                     value={message}
                     onChange={e=>setMessage(e.target.value)}
                   />
                   <div className="absolute bottom-3 right-3">
                      <input type="file" ref={chatFileRef} onChange={e => setChatFile(e.target.files?.[0] || null)} className="hidden" id="chat-file-upload" />
                      <label htmlFor="chat-file-upload" className={`p-2 rounded-full cursor-pointer transition-colors ${chatFile ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'} flex items-center justify-center`}>
                          <span className="text-lg">📎</span>
                      </label>
                   </div>
                 </div>
                 {chatFile && (
                   <div className="flex items-center justify-between bg-blue-50 p-2 px-4 rounded-xl mb-3 text-sm text-blue-700 font-bold">
                      <span className="truncate">{chatFile.name}</span>
                      <button type="button" onClick={() => {setChatFile(null); if(chatFileRef.current) chatFileRef.current.value = '';}} className="text-blue-400 hover:text-blue-600">✕</button>
                   </div>
                 )}
                 <button disabled={isSending || (!message.trim() && !chatFile)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-200">
                   {isSending ? 'Отправка...' : 'Отправить обращение'}
                 </button>
               </form>
            </div>

            {/* ИСТОРИЯ ЗАПРОСОВ */}
            <div className="space-y-4">
               <h3 className="font-bold text-gray-400 text-sm uppercase tracking-wider ml-2">История запросов</h3>
               {myRequests.length === 0 ? (
                 <p className="text-gray-400 text-center py-4 font-bold bg-white rounded-2xl border border-dashed border-gray-200">История пуста</p>
               ) : (
                 myRequests.map(r => (
                   <div key={r.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-50">
                     <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{new Date(r.createdAt).toLocaleDateString()}</span>
                      {r.response ? <span className="text-xs font-black text-green-600 bg-green-50 px-2 py-1 rounded-full">Ответ получен</span> : <span className="text-xs font-bold text-gray-400">На рассмотрении</span>}
                     </div>
                     <p className="font-bold text-gray-900 mb-2 whitespace-pre-wrap">{r.text}</p>
                     
                     {r.fileUrl && (
                       <a href={r.fileUrl} target="_blank" className="inline-flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-2 rounded-xl font-bold text-xs mb-2 hover:bg-blue-100 transition">
                         <span>📄</span> Прикрепленный файл
                       </a>
                     )}
                     
                     {r.response && (
                       <div className="mt-3 bg-green-50 p-4 rounded-xl border border-green-100">
                         <p className="text-xs font-black text-green-700 uppercase mb-1">Ответ Совета:</p>
                         <p className="text-sm text-green-900 font-bold leading-relaxed whitespace-pre-wrap">{r.response}</p>
                       </div>
                     )}
                   </div>
                 ))
               )}
            </div>
          </div>
        )}

        {/* РЕСУРСЫ */}
        {activeTab === 'resources' && (
          <div className="space-y-8">
             <div className="space-y-4">
               <h2 className="font-black text-xl px-2 flex items-center gap-2"><span className="text-2xl">📄</span> Шаблоны документов</h2>
               {templates.map(t => (
                 <div key={t.id} className="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
                   <div className="pr-4">
                     <p className="font-black text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{t.title}</p>
                     {t.description && <p className="text-sm font-bold text-gray-500 leading-snug">{t.description}</p>}
                   </div>
                   <a href={t.fileUrl} target="_blank" className="bg-blue-50 text-blue-600 p-3 rounded-xl font-black text-sm hover:bg-blue-100 transition-colors shrink-0">Скачать</a>
                 </div>
               ))}
               {templates.length === 0 && <p className="text-gray-400 text-center py-4 font-bold">Нет шаблонов</p>}
             </div>
             <div className="space-y-4">
               <h2 className="font-black text-xl px-2 flex items-center gap-2"><span className="text-2xl">🌍</span> Полезные ссылки</h2>
               {links.map(l => (
                 <a key={l.id} href={l.url} target="_blank" className="bg-white p-5 rounded-2xl block shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all group">
                    <p className="font-black text-blue-700 text-lg group-hover:underline">{l.title}</p>
                    <p className="text-xs font-bold text-gray-400 mt-1 truncate">{l.url}</p>
                 </a>
               ))}
               {links.length === 0 && <p className="text-gray-400 text-center py-4 font-bold">Нет ссылок</p>}
             </div>
          </div>
        )}

       {/* ПРОФИЛЬ */}
        {activeTab === 'profile' && userData && (
          <div className="space-y-6 pt-4">
            <div className="bg-white p-8 rounded-[2rem] shadow-lg shadow-gray-200/40 border border-gray-100 text-center relative overflow-hidden">
               <div className="relative z-10">
                  <div className="w-28 h-28 bg-gray-100 rounded-full mx-auto mb-5 overflow-hidden border-4 border-white shadow-xl relative group">
                    {userData.photoUrl ? <img src={userData.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400">👤</div>}
                    {isEditing && <label className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer text-white font-bold">📷 <input type="file" className="hidden" onChange={e=>setEditFile(e.target.files?.[0] || null)}/></label>}
                  </div>
                  {!isEditing ? (
                    <>
                      <h2 className="font-black text-3xl text-gray-900 mb-2">{userData.displayName}</h2>
                      <p className="text-blue-600 font-bold text-lg mb-1">{userData.position}</p>
                      <p className="text-gray-500 font-bold text-sm mb-6">{userData.phoneNumber}</p>
                      <button onClick={()=>setIsEditing(true)} className="bg-gray-100 text-gray-700 px-6 py-3 rounded-xl text-sm font-black">Редактировать профиль</button>
                    </>
                  ) : (
                    <div className="space-y-4 text-left max-w-sm mx-auto">
                      <input className="w-full p-4 bg-gray-50 rounded-2xl font-bold" value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Имя" />
                      <input className="w-full p-4 bg-gray-50 rounded-2xl font-bold" value={editPosition} onChange={e=>setEditPosition(e.target.value)} placeholder="Должность" />
                      <input className="w-full p-4 bg-gray-50 rounded-2xl font-bold" value={editPhone} onChange={e=>setEditPhone(e.target.value)} placeholder="Телефон" />
                      <div className="flex gap-3"><button onClick={()=>{setIsEditing(false); setEditFile(null);}} className="flex-1 bg-gray-200 py-4 rounded-2xl font-black">Отмена</button><button onClick={handleSaveProfile} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black">Сохранить</button></div>
                    </div>
                  )}
               </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-lg shadow-indigo-200/30 border border-indigo-50 relative overflow-hidden">
               {nextConference ? (
                 <div className="mb-6 bg-indigo-50 p-5 rounded-2xl border border-indigo-100 relative z-10">
                    <p className="text-xs font-black text-indigo-500 uppercase tracking-wider mb-1">Ближайшее собрание</p>
                    <p className="font-black text-indigo-900 text-xl leading-tight mb-2">{nextConference.title}</p>
                    <p className="text-sm font-bold text-indigo-700 flex items-center gap-2">🕒 {new Date(nextConference.date).toLocaleString([], {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</p>
                 </div>
               ) : <div className="mb-6 text-center py-4 bg-gray-50 rounded-2xl border border-gray-100"><p className="text-sm font-bold text-gray-400">Нет запланированных собраний</p></div>}
               
               <div className="flex justify-between items-center mb-6 relative z-10"><h2 className="font-black text-2xl text-gray-900">Мой голос</h2></div>
               
               <div className="relative z-10">
                {/* ПРОВЕРКА: Если делегирование АКТИВНО (совпадает ID конференции) */}
                {isDelegationActive ? (
                  <div className="bg-yellow-50 p-6 rounded-2xl border-2 border-yellow-300 mb-4 text-center">
                    <p className="text-sm font-black text-yellow-700 uppercase mb-2 tracking-wider">Голос передан</p>
                    <p className="font-black text-gray-900 text-2xl">{userData.delegatedToName}</p>
                    <p className="text-xs text-yellow-600 font-bold mt-2">Вы не можете голосовать лично.</p>
                  </div>
                ) : userData.delegationStatus === 'pending' ? (
                  <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-300 mb-4 text-center animate-pulse"><p className="text-2xl mb-2">⏳</p><p className="font-black text-blue-900 text-lg">Заявка на рассмотрении</p></div>
                ) : (
                  // Если конференции нет или старая прошла -> показываем кнопку делегирования (если доступно по дате)
                  delegationState.isOpen ? (
                    <button onClick={() => { setShowDelegateModal(true); setSearchTerm(''); setIsDropdownOpen(false); }} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-5 rounded-2xl font-black text-lg hover:from-indigo-700 hover:to-blue-700 transition-all shadow-xl shadow-indigo-300/50 active:scale-[0.98] relative overflow-hidden group"><span className="relative z-10 flex items-center justify-center gap-2">Делегировать голос ↗</span></button>
                  ) : (
                    <div className="bg-gray-100 p-6 rounded-2xl border border-gray-200 text-center"><p className="font-black text-gray-500 text-lg mb-1">Делегирование закрыто</p><p className="text-sm text-gray-400 font-bold">{delegationState.message}</p></div>
                  )
                )}
               </div>
               
               {userData.delegatedFrom && userData.delegatedFrom.length > 0 && (
                 <div className="mt-8 pt-6 border-t-2 border-gray-100 relative z-10">
                   <p className="text-xs font-black text-gray-400 uppercase mb-3 tracking-wider">Вам доверили голоса ({userData.delegatedFrom.length}):</p>
                   <div className="flex flex-wrap gap-2">{userData.delegatedFrom.map((name, idx) => <span key={idx} className="bg-green-100 text-green-800 px-3 py-1.5 rounded-xl text-xs font-black border border-green-200">{name}</span>)}</div>
                 </div>
               )}
            </div>
            <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 font-black py-5 rounded-2xl hover:bg-red-100 transition-colors text-sm uppercase tracking-wider">Выйти из аккаунта</button>
          </div>
        )}
      </div>

      {/* MODAL */}
      {showDelegateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-md transition-all">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <h3 className="font-black text-2xl mb-2 text-center">Передача голоса</h3>
            <p className="text-sm text-gray-500 mb-6 text-center font-bold">Найдите коллегу по имени</p>
            <form onSubmit={handleSubmitDelegation} className="space-y-5">
              <div className="relative">
                <input type="text" placeholder="Введите имя..." className="w-full p-4 border-0 rounded-2xl font-bold bg-gray-100 outline-none" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(true); setSelectedDelegateId(''); }} onFocus={() => setIsDropdownOpen(true)} />
                {isDropdownOpen && searchTerm && (
                  <div className="absolute z-20 w-full bg-white border border-gray-100 rounded-2xl mt-2 max-h-60 overflow-y-auto shadow-xl py-2">
                    {filteredColleagues.length > 0 ? filteredColleagues.map(c => (
                        <div key={c.id} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer" onClick={() => { setSelectedDelegateId(c.id); setSearchTerm(c.displayName); setIsDropdownOpen(false); }}>
                          <span className="font-black text-gray-900">{c.displayName}</span> <span className="text-xs text-indigo-500 font-bold">{c.position}</span>
                        </div>
                      )) : <div className="p-4 text-center text-gray-400 font-bold">Никого нет</div>}
                  </div>
                )}
                {selectedDelegateId && !isDropdownOpen && <div className="absolute right-4 top-4 text-green-500 text-xl">✓</div>}
              </div>
              <label className="flex items-center justify-center w-full p-4 bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer">
                  <span className="text-sm font-bold text-gray-500">{delegateFile ? delegateFile.name : '📎 Прикрепить файл'}</span>
                  <input type="file" onChange={e => setDelegateFile(e.target.files?.[0] || null)} className="hidden"/>
              </label>
              <div className="flex gap-3"><button type="button" onClick={() => setShowDelegateModal(false)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-black">Отмена</button><button disabled={isSubmittingDelegation || !selectedDelegateId} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black">{isSubmittingDelegation ? '...' : 'Отправить'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-white/20 p-2 flex justify-around items-center pb-safe z-40 shadow-lg rounded-t-[2rem] mx-2 mb-2">
        {[ { id: 'news', icon: '📰', label: 'Новости' }, { id: 'chat', icon: '💬', label: 'Чат' }, { id: 'resources', icon: '📂', label: 'Ресурсы' }, { id: 'profile', icon: '👤', label: 'Профиль' } ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 ${activeTab === tab.id ? 'bg-blue-50 text-blue-600 scale-110 shadow-sm' : 'text-gray-400'}`}>
            <span className="text-2xl mb-0.5">{tab.icon}</span><span className="text-[10px] font-black">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}