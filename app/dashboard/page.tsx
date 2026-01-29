'use client';

import { useState, useEffect } from 'react';
import { auth, db, storage } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';
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
  delegatedFrom?: string[]; 
}

interface Conference { 
  id: string; 
  title: string; 
  date: string; 
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'news' | 'chat' | 'resources' | 'profile'>('news');

  // Данные
  const [news, setNews] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [nextConference, setNextConference] = useState<Conference | null>(null); // Ближайшая конференция

  // Формы
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // Редактирование профиля
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(''); 
  const [editPhone, setEditPhone] = useState(''); 
  const [editFile, setEditFile] = useState<File | null>(null); 
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // Делегирование
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [selectedDelegateId, setSelectedDelegateId] = useState('');
  const [delegateFile, setDelegateFile] = useState<File | null>(null);
  const [isSubmittingDelegation, setIsSubmittingDelegation] = useState(false);

  const router = useRouter();

  // --- ЗАГРУЗКА ДАННЫХ ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { router.push('/login'); return; }
      setUser(currentUser);

      try {
        // 1. Профиль пользователя
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          setUserData({ id: userDoc.id, ...data });
          setEditName(data.displayName || ''); 
          setEditPhone(data.phoneNumber || '');
        }

        // 2. Загрузка коллекций
        const [lSnap, tSnap, nSnap, uSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'links')),
          getDocs(collection(db, 'templates')),
          getDocs(collection(db, 'news')),
          getDocs(query(collection(db, 'users'), where('status', '==', 'approved'))),
          getDocs(collection(db, 'conferences')) // Загружаем конференции
        ]);

        setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const newsList = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        // @ts-ignore
        newsList.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setNews(newsList);

        // Список коллег (без себя)
        setColleagues(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)).filter(u => u.id !== currentUser.uid));

        // 3. Поиск ближайшей конференции
        const now = new Date();
        const confs = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Conference));
        // Сортируем по дате
        confs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Берем первую будущую конференцию
        const upcoming = confs.filter(c => new Date(c.date) > now);
        
        if (upcoming.length > 0) {
           setNextConference(upcoming[0]); 
        } else if (confs.length > 0) {
           // Или последнюю прошедшую (чтобы просто показать инфо)
           setNextConference(confs[confs.length - 1]);
        }

        // 4. Мои обращения
        const qReq = query(collection(db, 'requests'), where('userId', '==', currentUser.uid));
        const rSnap = await getDocs(qReq);
        const reqs = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        // @ts-ignore
        reqs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setMyRequests(reqs);

      } catch (e) { console.error(e); } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => { await signOut(auth); router.push('/'); };

  // --- ЛОГИКА ДАТЫ ДЕЛЕГИРОВАНИЯ ---
  const getDelegationState = () => {
    if (!nextConference) return { isOpen: false, message: 'Нет запланированных конференций' };
    
    const confDate = new Date(nextConference.date);
    const now = new Date();
    const openDate = new Date(confDate);
    openDate.setDate(confDate.getDate() - 30); // Открываем за 30 дней

    if (now > confDate) return { isOpen: false, message: 'Конференция уже началась или прошла' };
    if (now < openDate) return { isOpen: false, message: `Делегирование откроется ${openDate.toLocaleDateString()}` };
    
    return { isOpen: true, message: `Открыто до ${confDate.toLocaleDateString()}` };
  };

  const delegationState = getDelegationState();

  // --- ОТПРАВКА СООБЩЕНИЯ (ЧАТ) ---
  const sendRequest = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!message.trim() || !user) return; 
    setIsSending(true); 
    try { 
      const newReqData = { userId: user.uid, userEmail: user.email, text: message, status: 'new', createdAt: new Date().toISOString() }; 
      const docRef = await addDoc(collection(db, 'requests'), newReqData); 
      // ИСПРАВЛЕНИЕ ОШИБКИ ID:
      setMyRequests([ { ...newReqData, id: docRef.id }, ...myRequests ]); 
      setMessage(''); 
    } catch { alert('Ошибка'); } finally { setIsSending(false); } 
  };

  // --- СОХРАНЕНИЕ ПРОФИЛЯ ---
  const handleSaveProfile = async () => { 
    if (!user || !userData) return; 
    setIsSavingProfile(true); 
    try { 
      let photoUrl = userData.photoUrl; 
      if (editFile) { 
        const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`); 
        await uploadBytes(storageRef, editFile); 
        photoUrl = await getDownloadURL(storageRef); 
      } 
      await updateDoc(doc(db, 'users', user.uid), { displayName: editName, phoneNumber: editPhone, photoUrl }); 
      setUserData({ ...userData, displayName: editName, phoneNumber: editPhone, photoUrl }); 
      setIsEditing(false); setEditFile(null); 
    } catch { alert('Ошибка'); } finally { setIsSavingProfile(false); } 
  };

  // --- ОТПРАВКА ЗАЯВКИ НА ДЕЛЕГИРОВАНИЕ ---
  const handleSubmitDelegation = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!user || !selectedDelegateId) return; 
    setIsSubmittingDelegation(true); 
    try { 
      let docUrl = ''; 
      if (delegateFile) { 
        const docRef = ref(storage, `delegations/${user.uid}_${Date.now()}`); 
        await uploadBytes(docRef, delegateFile); 
        docUrl = await getDownloadURL(docRef); 
      } 
      const delegateUser = colleagues.find(c => c.id === selectedDelegateId); 
      
      await addDoc(collection(db, 'delegation_requests'), { 
        fromId: user.uid, 
        fromName: userData?.displayName, 
        toId: selectedDelegateId, 
        toName: delegateUser?.displayName, 
        docUrl, 
        createdAt: new Date().toISOString(), 
        status: 'pending' 
      }); 
      
      await updateDoc(doc(db, 'users', user.uid), { 
        delegationStatus: 'pending', 
        delegatedToName: delegateUser?.displayName 
      }); 
      
      setUserData(prev => prev ? ({ ...prev, delegationStatus: 'pending', delegatedToName: delegateUser?.displayName }) : null); 
      setShowDelegateModal(false); 
      alert('Заявка отправлена.'); 
    } catch (e) { alert('Ошибка'); } finally { setIsSubmittingDelegation(false); } 
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Загрузка...</div>;
  if (userData?.status === 'pending') return <div className="p-10 text-center">Ожидание подтверждения</div>;

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-black pb-24">
      {/* HEADER */}
      {activeTab !== 'profile' && <div className="bg-blue-700 text-white p-6 rounded-b-3xl shadow-lg mb-6 sticky top-0 z-40"><h1 className="text-2xl font-black">{activeTab === 'news' ? 'Новости' : activeTab === 'chat' ? 'Связь' : 'Ресурсы'}</h1></div>}
      
      <div className="max-w-xl mx-auto px-4 mt-6">
        
        {/* News Tab */}
        {activeTab === 'news' && <div className="space-y-4">{news.map(i=><div key={i.id} className="bg-white rounded-2xl shadow border overflow-hidden">{i.imageUrl && <img src={i.imageUrl} className="h-48 w-full object-cover"/>}<div className="p-4"><h3 className="font-bold text-lg">{i.title}</h3><p className="text-sm">{i.body}</p></div></div>)}</div>}

        {/* Chat Tab */}
        {activeTab === 'chat' && <div className="space-y-4"><div className="bg-white p-4 rounded-xl border border-green-200"><h2 className="font-bold">WhatsApp</h2><a href="https://wa.me/777" className="block text-center bg-green-500 text-white p-3 rounded font-bold mt-2">Написать</a></div><div className="bg-white p-4 rounded-xl"><h2 className="font-bold mb-2">Админу</h2><textarea className="w-full border p-2 rounded" rows={3} value={message} onChange={e=>setMessage(e.target.value)}/><button onClick={sendRequest} className="w-full bg-blue-600 text-white py-2 rounded font-bold mt-2">Отправить</button></div><div>{myRequests.map(r=><div key={r.id} className="bg-white p-3 mb-2 rounded shadow"><p className="text-sm font-bold">{r.text}</p>{r.response && <p className="text-sm text-green-600 bg-green-50 p-1 mt-1">Ответ: {r.response}</p>}</div>)}</div></div>}

        {/* Resources Tab */}
        {activeTab === 'resources' && <div className="space-y-4"><div><h2 className="font-bold text-lg">Шаблоны</h2>{templates.map(t=><div key={t.id} className="bg-white p-3 rounded shadow flex justify-between mb-2"><span>{t.title}</span><a href={t.fileUrl} className="text-blue-600 font-bold">Скачать</a></div>)}</div><div><h2 className="font-bold text-lg">Ссылки</h2>{links.map(l=><a key={l.id} href={l.url} target="_blank" className="block bg-white p-3 rounded shadow mb-2 text-blue-700 font-bold">{l.title}</a>)}</div></div>}

        {/* PROFILE TAB (С НОВОЙ ЛОГИКОЙ) */}
        {activeTab === 'profile' && userData && (
          <div className="space-y-6 pt-4">
             {/* Аватарка */}
             <div className="bg-white p-6 rounded-3xl shadow-sm border text-center relative">
               <div className="w-24 h-24 bg-gray-100 rounded-full mx-auto mb-4 overflow-hidden border-4 border-white shadow-lg relative">
                 {userData.photoUrl ? <img src={userData.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>}
                 {isEditing && <label className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer text-white text-xs">Фото <input type="file" className="hidden" onChange={e=>setEditFile(e.target.files?.[0] || null)}/></label>}
               </div>
               {!isEditing ? (
                 <>
                   <h2 className="font-black text-2xl">{userData.displayName}</h2>
                   <p className="text-gray-500 text-sm">{userData.position}</p>
                   <button onClick={()=>setIsEditing(true)} className="mt-4 bg-gray-100 px-4 py-2 rounded-lg text-sm font-bold text-gray-600">Редактировать</button>
                 </>
               ) : (
                 <div className="space-y-3"><input className="w-full border p-2 rounded" value={editName} onChange={e=>setEditName(e.target.value)}/><input className="w-full border p-2 rounded" value={editPhone} onChange={e=>setEditPhone(e.target.value)}/><div className="flex gap-2"><button onClick={()=>setIsEditing(false)} className="flex-1 bg-gray-200 py-2 rounded">Отмена</button><button onClick={handleSaveProfile} className="flex-1 bg-blue-600 text-white py-2 rounded">Сохранить</button></div></div>
               )}
             </div>

             {/* БЛОК ДЕЛЕГИРОВАНИЯ */}
             <div className="bg-white p-6 rounded-3xl shadow-sm border border-indigo-100 relative overflow-hidden">
               
               {/* Информация о ближайшей конференции */}
               {nextConference ? (
                 <div className="mb-4 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Ближайшее событие</p>
                    <p className="font-black text-indigo-900 leading-tight">{nextConference.title}</p>
                    <p className="text-xs font-bold text-indigo-600">{new Date(nextConference.date).toLocaleString()}</p>
                 </div>
               ) : (
                 <div className="mb-4 text-center">
                    <p className="text-xs text-gray-400">Нет запланированных конференций</p>
                 </div>
               )}

               <div className="flex justify-between items-center mb-4">
                 <h2 className="font-black text-xl text-indigo-900">Мой голос</h2>
                 <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-bold text-sm">Вес: {userData.voteWeight || 1}</span>
               </div>

               {/* Логика отображения кнопки */}
               {userData.delegatedTo ? (
                 <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-4">
                   <p className="text-xs font-bold text-yellow-800 uppercase">Голос передан</p>
                   <p className="font-black text-gray-900 text-lg">{userData.delegatedToName}</p>
                 </div>
               ) : userData.delegationStatus === 'pending' ? (
                 <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4">
                    <p className="font-bold text-blue-800 text-sm">⏳ Заявка рассматривается</p>
                 </div>
               ) : (
                 // ГЛАВНОЕ УСЛОВИЕ: Открыто ли делегирование по дате?
                 delegationState.isOpen ? (
                   <button 
                     onClick={() => setShowDelegateModal(true)}
                     className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
                   >
                     Делегировать голос
                   </button>
                 ) : (
                   <div className="bg-gray-100 p-4 rounded-xl border border-gray-200 text-center">
                     <p className="font-bold text-gray-400 text-sm">Делегирование недоступно</p>
                     <p className="text-xs text-gray-400 mt-1">{delegationState.message}</p>
                   </div>
                 )
               )}

               {userData.delegatedFrom && userData.delegatedFrom.length > 0 && (
                 <div className="mt-4 pt-4 border-t border-gray-100">
                   <p className="text-xs font-bold text-gray-400 uppercase mb-2">Вам доверили:</p>
                   <div className="flex flex-wrap gap-2">
                     {userData.delegatedFrom.map((name, idx) => (
                       <span key={idx} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">{name}</span>
                     ))}
                   </div>
                 </div>
               )}
             </div>

             <button onClick={handleLogout} className="w-full text-red-500 font-bold py-4">Выйти</button>
          </div>
        )}
      </div>

      {/* Модалка делегирования */}
      {showDelegateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="font-black text-xl mb-4">Передача голоса</h3>
            <p className="text-sm text-gray-500 mb-4">Выберите коллегу для голосования за вас.</p>
            <form onSubmit={handleSubmitDelegation} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Коллега</label>
                <select className="w-full p-3 border rounded-xl font-bold bg-gray-50 mt-1" value={selectedDelegateId} onChange={e => setSelectedDelegateId(e.target.value)} required>
                  <option value="">Выберите...</option>
                  {colleagues.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Скан (необязательно)</label>
                <input type="file" onChange={e => setDelegateFile(e.target.files?.[0] || null)} className="w-full text-sm mt-1"/>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDelegateModal(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600">Отмена</button>
                <button disabled={isSubmittingDelegation} className="flex-1 py-3 bg-indigo-600 rounded-xl font-bold text-white">{isSubmittingDelegation ? '...' : 'Отправить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-2 flex justify-between pb-safe z-40">
        <button onClick={()=>setActiveTab('news')} className={`w-1/4 flex flex-col items-center ${activeTab==='news'?'text-blue-600':''}`}><span>📰</span><span className="text-[10px]">Новости</span></button>
        <button onClick={()=>setActiveTab('chat')} className={`w-1/4 flex flex-col items-center ${activeTab==='chat'?'text-blue-600':''}`}><span>💬</span><span className="text-[10px]">Чат</span></button>
        <button onClick={()=>setActiveTab('resources')} className={`w-1/4 flex flex-col items-center ${activeTab==='resources'?'text-blue-600':''}`}><span>📂</span><span className="text-[10px]">Ресурсы</span></button>
        <button onClick={()=>setActiveTab('profile')} className={`w-1/4 flex flex-col items-center ${activeTab==='profile'?'text-blue-600':''}`}><span>👤</span><span className="text-[10px]">Профиль</span></button>
      </div>
    </div>
  );
}