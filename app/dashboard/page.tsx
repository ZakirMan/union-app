'use client';

import { useState, useEffect } from 'react';
import { auth, db, storage } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  position: string;
  role: string;
  status: string;
  photoUrl?: string;
  voteWeight?: number;       // Вес голоса
  delegatedTo?: string;      // ID кому отдал голос
  delegatedToName?: string;  // Имя кому отдал
  delegationStatus?: 'pending' | 'approved'; // Статус заявки
  delegatedFrom?: string[];  // Массив имен тех, кто доверил мне
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'news' | 'chat' | 'resources' | 'profile'>('news');

  // Данные
  const [links, setLinks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]); // Список для выбора делегата

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
        }

        // 2. Списки данных
        const [lSnap, tSnap, nSnap, uSnap] = await Promise.all([
          getDocs(collection(db, 'links')),
          getDocs(collection(db, 'templates')),
          getDocs(collection(db, 'news')),
          getDocs(query(collection(db, 'users'), where('status', '==', 'approved')))
        ]);

        setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const newsList = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        // @ts-ignore
        newsList.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setNews(newsList);

        // Список коллег (исключая себя) для делегирования
        const usersList = uSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as UserProfile))
          .filter(u => u.id !== currentUser.uid);
        setColleagues(usersList);

        // Мои обращения
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

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault(); if (!message.trim() || !user) return;
    setIsSending(true);
    try {
      const newReq = { userId: user.uid, userEmail: user.email, text: message, status: 'new', createdAt: new Date().toISOString() };
      const docRef = await addDoc(collection(db, 'requests'), newReq);
      setMyRequests([ { id: docRef.id, ...newReq }, ...myRequests ]); 
      setMessage('');
    } catch { alert('Ошибка'); } finally { setIsSending(false); }
  };

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
    } catch { alert('Ошибка сохранения'); } finally { setIsSavingProfile(false); }
  };

  // --- ФУНКЦИЯ ДЕЛЕГИРОВАНИЯ ---
  const handleSubmitDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDelegateId) return;
    setIsSubmittingDelegation(true);

    try {
      // 1. Загружаем фото доверенности (если есть)
      let docUrl = '';
      if (delegateFile) {
        const docRef = ref(storage, `delegations/${user.uid}_${Date.now()}`);
        await uploadBytes(docRef, delegateFile);
        docUrl = await getDownloadURL(docRef);
      }

      const delegateUser = colleagues.find(c => c.id === selectedDelegateId);

      // 2. Создаем заявку в отдельной коллекции (чтобы админ видел)
      await addDoc(collection(db, 'delegation_requests'), {
        fromId: user.uid,
        fromName: userData?.displayName,
        toId: selectedDelegateId,
        toName: delegateUser?.displayName,
        docUrl,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      // 3. Обновляем статус в профиле пользователя (визуально)
      await updateDoc(doc(db, 'users', user.uid), {
        delegationStatus: 'pending',
        delegatedToName: delegateUser?.displayName
      });

      // Обновляем локальный стейт
      setUserData(prev => prev ? ({
        ...prev,
        delegationStatus: 'pending',
        delegatedToName: delegateUser?.displayName
      }) : null);

      setShowDelegateModal(false);
      alert('Заявка на делегирование отправлена администратору.');
    } catch (e) {
      console.error(e);
      alert('Ошибка при отправке заявки');
    } finally {
      setIsSubmittingDelegation(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Загрузка...</div>;
  if (userData?.status === 'pending') return <div className="p-10 text-center">Ваш аккаунт проверяется администратором.</div>;

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-black pb-24">
      {/* HEADER */}
      {activeTab !== 'profile' && (
        <div className="bg-blue-700 text-white p-6 rounded-b-3xl shadow-lg mb-6 sticky top-0 z-40">
           <h1 className="text-2xl font-black">
             {activeTab === 'news' ? 'Новости' : activeTab === 'chat' ? 'Помощь' : 'Документы'}
           </h1>
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 mt-6">
        
        {/* --- TABS --- */}
        {activeTab === 'news' && (
           <div className="space-y-4">
             {news.map(item => (
               <div key={item.id} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                 {item.imageUrl && <img src={item.imageUrl} className="h-48 w-full object-cover" />}
                 <div className="p-4">
                   <h3 className="font-black text-xl mb-2">{item.title}</h3>
                   <p className="text-sm text-gray-600">{item.body}</p>
                 </div>
               </div>
             ))}
             {news.length === 0 && <p className="text-center text-gray-400">Нет новостей</p>}
           </div>
        )}

        {activeTab === 'chat' && (
          <div className="space-y-6">
             <div className="bg-white p-5 rounded-2xl shadow-sm border border-green-100">
               <h2 className="font-black text-lg mb-2">Юрист (WhatsApp)</h2>
               <a href="https://wa.me/77771234567" target="_blank" className="block bg-green-500 text-white p-3 rounded-xl text-center font-bold">Написать юристу</a>
             </div>
             <div className="bg-white p-5 rounded-2xl shadow-sm">
               <h2 className="font-black text-lg mb-2">Написать Админу</h2>
               <form onSubmit={sendRequest}>
                 <textarea className="w-full bg-gray-50 p-3 rounded-xl border mb-3" rows={3} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ваш вопрос..."/>
                 <button disabled={isSending} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">{isSending ? '...' : 'Отправить'}</button>
               </form>
             </div>
             <div>
               <h2 className="font-bold mb-2">История</h2>
               {myRequests.map(req => (
                 <div key={req.id} className="bg-white p-4 mb-2 rounded-xl shadow-sm border">
                   <p className="text-xs text-gray-400 mb-1">{new Date(req.createdAt).toLocaleDateString()}</p>
                   <p className="font-bold text-sm">{req.text}</p>
                   {req.response && <p className="mt-2 text-sm text-blue-700 bg-blue-50 p-2 rounded">Ответ: {req.response}</p>}
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-6">
             <div className="space-y-2">
               <h2 className="font-black text-lg">Шаблоны</h2>
               {templates.map(t => (
                 <div key={t.id} className="bg-white p-4 rounded-xl flex justify-between items-center shadow-sm">
                   <div><p className="font-bold text-sm">{t.title}</p><p className="text-xs text-gray-500">{t.description}</p></div>
                   <a href={t.fileUrl} target="_blank" className="text-blue-600 font-bold text-xs">Скачать</a>
                 </div>
               ))}
             </div>
             <div className="space-y-2">
               <h2 className="font-black text-lg">Ссылки</h2>
               {links.map(l => (
                 <a key={l.id} href={l.url} target="_blank" className="bg-white p-4 rounded-xl block font-bold text-blue-700 shadow-sm">🌍 {l.title}</a>
               ))}
             </div>
          </div>
        )}

        {/* --- PROFILE TAB (ОБНОВЛЕННЫЙ) --- */}
        {activeTab === 'profile' && userData && (
          <div className="space-y-6 pt-4">
            
            {/* Карточка профиля */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border text-center relative">
               <div className="w-24 h-24 bg-gray-100 rounded-full mx-auto mb-4 overflow-hidden border-4 border-white shadow-lg relative">
                 {userData.photoUrl ? <img src={userData.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>}
                 {isEditing && (
                    <label className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer text-white text-xs">
                      Фото <input type="file" className="hidden" onChange={e=>setEditFile(e.target.files?.[0] || null)}/>
                    </label>
                 )}
               </div>

               {!isEditing ? (
                 <>
                   <h2 className="font-black text-2xl">{userData.displayName}</h2>
                   <p className="text-gray-500 text-sm mb-4">{userData.position}</p>
                   <p className="text-gray-800 font-bold mb-4">{userData.phoneNumber}</p>
                   <button onClick={()=>setIsEditing(true)} className="bg-gray-100 px-4 py-2 rounded-lg text-sm font-bold text-gray-600">Редактировать</button>
                 </>
               ) : (
                 <div className="space-y-3 text-left">
                   <input className="w-full p-2 border rounded font-bold" value={editName} onChange={e=>setEditName(e.target.value)} />
                   <input className="w-full p-2 border rounded font-bold" value={editPhone} onChange={e=>setEditPhone(e.target.value)} />
                   <div className="flex gap-2">
                     <button onClick={()=>setIsEditing(false)} className="flex-1 bg-gray-200 py-2 rounded font-bold">Отмена</button>
                     <button onClick={handleSaveProfile} disabled={isSavingProfile} className="flex-1 bg-blue-600 text-white py-2 rounded font-bold">Сохранить</button>
                   </div>
                 </div>
               )}
            </div>

            {/* --- БЛОК ГОЛОСОВАНИЯ (НОВЫЙ) --- */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-indigo-100">
               <div className="flex justify-between items-center mb-4">
                 <h2 className="font-black text-xl text-indigo-900">Мой голос</h2>
                 <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-bold text-sm">
                   Вес: {userData.voteWeight || 1}
                 </span>
               </div>

               {/* Статус: Я делегировал */}
               {userData.delegatedTo ? (
                 <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-4">
                   <p className="text-xs font-bold text-yellow-800 uppercase mb-1">Голос передан</p>
                   <p className="font-black text-gray-900 text-lg">{userData.delegatedToName}</p>
                   <p className="text-xs text-gray-500 mt-1">Вы не можете голосовать, пока действует делегирование.</p>
                 </div>
               ) : userData.delegationStatus === 'pending' ? (
                 <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4">
                    <p className="font-bold text-blue-800 text-sm">⏳ Заявка на делегирование отправлена</p>
                    <p className="text-xs text-gray-600 mt-1">Ожидает подтверждения администратором.</p>
                 </div>
               ) : (
                 <button 
                   onClick={() => setShowDelegateModal(true)}
                   className="w-full bg-white border-2 border-indigo-600 text-indigo-600 py-3 rounded-xl font-black hover:bg-indigo-50 transition mb-4"
                 >
                   Делегировать голос
                 </button>
               )}

               {/* Статус: Мне делегировали */}
               {userData.delegatedFrom && userData.delegatedFrom.length > 0 && (
                 <div className="mt-4 pt-4 border-t border-gray-100">
                   <p className="text-xs font-bold text-gray-400 uppercase mb-2">Вам доверили голоса:</p>
                   <div className="flex flex-wrap gap-2">
                     {userData.delegatedFrom.map((name, idx) => (
                       <span key={idx} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">
                         {name}
                       </span>
                     ))}
                   </div>
                 </div>
               )}
            </div>

            <button onClick={handleLogout} className="w-full text-red-500 font-bold text-sm py-4">Выйти из аккаунта</button>
          </div>
        )}
      </div>

      {/* --- MODAL DELEGATION --- */}
      {showDelegateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="font-black text-xl mb-4">Передача голоса</h3>
            <p className="text-sm text-gray-500 mb-4">Выберите коллегу, которому доверяете голосовать за вас на собрании.</p>
            
            <form onSubmit={handleSubmitDelegation} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Коллега</label>
                <select 
                  className="w-full p-3 border rounded-xl font-bold mt-1 bg-gray-50"
                  value={selectedDelegateId}
                  onChange={e => setSelectedDelegateId(e.target.value)}
                  required
                >
                  <option value="">Выберите из списка...</option>
                  {colleagues.map(c => (
                    <option key={c.id} value={c.id}>{c.displayName} ({c.position})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Доверенность (фото/скан)</label>
                <input 
                  type="file" 
                  onChange={e => setDelegateFile(e.target.files?.[0] || null)}
                  className="w-full text-sm mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <p className="text-[10px] text-gray-400 mt-1">* Необязательно, если есть договоренность</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDelegateModal(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600">Отмена</button>
                <button disabled={isSubmittingDelegation} className="flex-1 py-3 bg-indigo-600 rounded-xl font-bold text-white">
                  {isSubmittingDelegation ? '...' : 'Отправить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-2 flex justify-between pb-safe z-40">
        <button onClick={()=>setActiveTab('news')} className={`w-1/4 flex flex-col items-center ${activeTab==='news'?'text-blue-600':''}`}><span className="text-2xl">📰</span><span className="text-[10px] font-bold">Новости</span></button>
        <button onClick={()=>setActiveTab('chat')} className={`w-1/4 flex flex-col items-center ${activeTab==='chat'?'text-blue-600':''}`}><span className="text-2xl">💬</span><span className="text-[10px] font-bold">Чат</span></button>
        <button onClick={()=>setActiveTab('resources')} className={`w-1/4 flex flex-col items-center ${activeTab==='resources'?'text-blue-600':''}`}><span className="text-2xl">📂</span><span className="text-[10px] font-bold">Ресурсы</span></button>
        <button onClick={()=>setActiveTab('profile')} className={`w-1/4 flex flex-col items-center ${activeTab==='profile'?'text-blue-600':''}`}><span className="text-2xl">👤</span><span className="text-[10px] font-bold">Профиль</span></button>
      </div>
    </div>
  );
}