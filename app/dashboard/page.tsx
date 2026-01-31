'use client';

import { useState, useEffect, useRef } from 'react';
// Добавили messaging
import { auth, db, storage, messaging } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, getDocs, query, where, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// Добавили получение токена
import { getToken } from 'firebase/messaging';

// --- ТИПЫ ДАННЫХ ---
interface UserProfile { 
  id: string; displayName: string; email: string; phoneNumber?: string; position: string; role: string; status: string; photoUrl?: string; voteWeight?: number; delegatedTo?: string; delegatedToName?: string; delegationStatus?: 'pending' | 'approved'; delegationConferenceId?: string; delegatedFrom?: string[]; 
}
interface Conference { id: string; title: string; date: string; }
interface NewsItem { id: string; title: string; body: string; imageUrl?: string; createdAt: string; }
interface TemplateItem { id: string; title: string; description?: string; fileUrl: string; }
interface LinkItem { id: string; title: string; url: string; }
interface RequestItem { id: string; text: string; response?: string; fileUrl?: string; createdAt: string; }

// Типы для Тестов
interface TestOption { id: string; text: string; isCorrect: boolean; }
interface TestQuestion { id: string; text: string; options: TestOption[]; }
interface Test { id: string; title: string; description: string; questions: TestQuestion[]; completedBy?: string[]; }

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'news' | 'chat' | 'resources' | 'learning' | 'profile'>('news');
  const router = useRouter();

  // Данные
  const [news, setNews] = useState<NewsItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [tests, setTests] = useState<Test[]>([]); 
  const [myRequests, setMyRequests] = useState<RequestItem[]>([]);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [nextConference, setNextConference] = useState<Conference | null>(null);

  // --- ЛОГИКА ПРОХОЖДЕНИЯ ТЕСТА ---
  const [activeTest, setActiveTest] = useState<Test | null>(null); 
  const [testStep, setTestStep] = useState<'start' | 'quiz' | 'result'>('start'); 
  const [currentQIndex, setCurrentQIndex] = useState(0); 
  const [score, setScore] = useState(0); 
  const [isAnswered, setIsAnswered] = useState(false); 
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null); 

  // Чат
  const [message, setMessage] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const chatFileRef = useRef<HTMLInputElement>(null);
  
  // Профиль
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(''); const [editPhone, setEditPhone] = useState(''); const [editPosition, setEditPosition] = useState(''); const [editFile, setEditFile] = useState<File | null>(null); const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // Делегирование
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [selectedDelegateId, setSelectedDelegateId] = useState('');
  const [delegateFile, setDelegateFile] = useState<File | null>(null);
  const [isSubmittingDelegation, setIsSubmittingDelegation] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // --- ЛОГИКА УВЕДОМЛЕНИЙ (FCM) ---
  const requestNotificationPermission = async (uid: string) => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return;

      const permission = await Notification.requestPermission();
      if (permission === 'granted' && messaging) {
        console.log('Уведомления разрешены.');
        
        // --- ВСТАВЬТЕ СЮДА ВАШ КЛЮЧ ИЗ FIREBASE CONSOLE ---
        const token = await getToken(messaging, { 
          vapidKey: "BN83lUJyga9MEurnzCEDvPpprD2qxsqmkTGWs0ZLC9osteGB0fEFtEevApmBgNZwcZ-gMr8vPHYCns3GsLGc4Xw" 
        });

        if (token) {
          console.log('Token:', token);
          // Сохраняем токен, не удаляя старые (для входа с разных устройств)
          await updateDoc(doc(db, 'users', uid), {
            fcmTokens: arrayUnion(token)
          });
        }
      }
    } catch (error) {
      console.error('Ошибка push-уведомлений:', error);
    }
  };

  // --- ЗАГРУЗКА ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { router.push('/login'); return; }
      setUser(currentUser);

      // Запрашиваем права на уведомления
      requestNotificationPermission(currentUser.uid);

      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          setUserData({ id: userDoc.id, ...data });
          setEditName(data.displayName || ''); setEditPhone(data.phoneNumber || ''); setEditPosition(data.position || '');
        }

        const [lSnap, tSnap, nSnap, uSnap, cSnap, testSnap] = await Promise.all([
          getDocs(collection(db, 'links')),
          getDocs(collection(db, 'templates')),
          getDocs(collection(db, 'news')),
          getDocs(query(collection(db, 'users'), where('status', '==', 'approved'))),
          getDocs(collection(db, 'conferences')),
          getDocs(collection(db, 'tests'))
        ]);

        setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as LinkItem)));
        setTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TemplateItem)));
        setTests(testSnap.docs.map(d => ({ id: d.id, ...d.data() } as Test)));

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

  // --- ФУНКЦИИ ТЕСТИРОВАНИЯ ---
  const startTest = (test: Test) => {
    setActiveTest(test);
    setTestStep('quiz');
    setCurrentQIndex(0);
    setScore(0);
    setIsAnswered(false);
    setSelectedOptionId(null);
  };

  const handleAnswer = (option: TestOption) => {
    if (isAnswered) return; 
    setIsAnswered(true);
    setSelectedOptionId(option.id);
    if (option.isCorrect) setScore(prev => prev + 1);
  };

  const nextQuestion = async () => {
    if (!activeTest) return;
    if (currentQIndex < activeTest.questions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setIsAnswered(false);
      setSelectedOptionId(null);
    } else {
      setTestStep('result');
      if (user && !activeTest.completedBy?.includes(user.uid)) {
        try {
          await updateDoc(doc(db, 'tests', activeTest.id), {
            completedBy: arrayUnion(user.uid)
          });
          setTests(prev => prev.map(t => t.id === activeTest.id ? { ...t, completedBy: [...(t.completedBy || []), user.uid] } : t));
        } catch (e) { console.error('Ошибка сохранения прогресса', e); }
      }
    }
  };

  const closeTest = () => {
    setActiveTest(null);
    setTestStep('start');
  };

  // --- ОСТАЛЬНЫЕ ФУНКЦИИ ---
  const getDelegationState = () => { if (!nextConference) return { isOpen: false, message: 'Нет запланированных конференций' }; const confDate = new Date(nextConference.date); const now = new Date(); const openDate = new Date(confDate); openDate.setDate(confDate.getDate() - 30); if (now > confDate) return { isOpen: false, message: 'Конференция уже началась или прошла' }; if (now < openDate) return { isOpen: false, message: `Откроется ${openDate.toLocaleDateString()}` }; return { isOpen: true, message: `До ${confDate.toLocaleDateString()}` }; };
  const delegationState = getDelegationState();
  const isDelegationActive = userData?.delegatedTo && nextConference && userData?.delegationConferenceId === nextConference.id;

  const sendRequest = async (e: React.FormEvent) => { e.preventDefault(); if (!message.trim() && !chatFile) return; setIsSending(true); try { let fileUrl = ''; if (chatFile) { const storageRef = ref(storage, `requests_files/${user?.uid}_${Date.now()}_${chatFile.name}`); await uploadBytes(storageRef, chatFile); fileUrl = await getDownloadURL(storageRef); } const newReqData = { userId: user?.uid, userEmail: user?.email, text: message, fileUrl: fileUrl || null, status: 'new', createdAt: new Date().toISOString() }; const docRef = await addDoc(collection(db, 'requests'), newReqData); setMyRequests(prev => [{ ...newReqData, id: docRef.id }, ...prev]); setMessage(''); setChatFile(null); if(chatFileRef.current) chatFileRef.current.value = ''; } catch { alert('Ошибка'); } finally { setIsSending(false); } };
  const handleSaveProfile = async () => { if (!user || !userData) return; setIsSavingProfile(true); try { let photoUrl = userData.photoUrl; if (editFile) { const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`); await uploadBytes(storageRef, editFile); photoUrl = await getDownloadURL(storageRef); } await updateDoc(doc(db, 'users', user.uid), { displayName: editName, phoneNumber: editPhone, position: editPosition, photoUrl }); setUserData({ ...userData, displayName: editName, phoneNumber: editPhone, position: editPosition, photoUrl }); setIsEditing(false); setEditFile(null); } catch { alert('Ошибка'); } finally { setIsSavingProfile(false); } };
  const handleSubmitDelegation = async (e: React.FormEvent) => { e.preventDefault(); if (!nextConference) { alert('Нет активной конференции'); return; } if (!user || !selectedDelegateId) { alert('Выберите коллегу'); return; } setIsSubmittingDelegation(true); try { let docUrl = ''; if (delegateFile) { const docRef = ref(storage, `delegations/${user.uid}_${Date.now()}`); await uploadBytes(docRef, delegateFile); docUrl = await getDownloadURL(docRef); } const delegateUser = colleagues.find(c => c.id === selectedDelegateId); await addDoc(collection(db, 'delegation_requests'), { fromId: user.uid, fromName: userData?.displayName, toId: selectedDelegateId, toName: delegateUser?.displayName, docUrl, conferenceId: nextConference.id, conferenceTitle: nextConference.title, createdAt: new Date().toISOString(), status: 'pending' }); await updateDoc(doc(db, 'users', user.uid), { delegationStatus: 'pending', delegatedToName: delegateUser?.displayName }); setUserData(prev => prev ? ({ ...prev, delegationStatus: 'pending', delegatedToName: delegateUser?.displayName }) : null); setShowDelegateModal(false); alert('Заявка отправлена.'); } catch (e) { alert('Ошибка'); } finally { setIsSubmittingDelegation(false); } };
  const filteredColleagues = colleagues.filter(c => c.displayName.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500 animate-pulse">Загрузка...</div>;
  if (userData?.status === 'pending') return <div className="p-10 text-center font-bold text-gray-600">Ваш аккаунт ожидает подтверждения.</div>;

  return (
    <div className="min-h-screen bg-[#F2F6FF] font-sans text-[#1A1A1A] pb-28">
      {activeTab !== 'profile' && (
        <div className="bg-gradient-to-r from-blue-700 to-blue-600 text-white p-6 rounded-b-[2rem] shadow-lg shadow-blue-200/50 mb-6 sticky top-0 z-30">
          <h1 className="text-3xl font-black tracking-tight">
            {activeTab === 'news' ? 'Новости' : activeTab === 'chat' ? 'Центр связи' : activeTab === 'learning' ? 'Обучение' : 'База знаний'}
          </h1>
        </div>
      )}
      
      <div className="max-w-xl mx-auto px-5 mt-2">
        
        {/* --- ВКЛАДКА ОБУЧЕНИЕ --- */}
        {activeTab === 'learning' && (
          <div className="space-y-6">
            {!activeTest && (
              <div className="grid gap-4">
                {tests.map(test => {
                  const isCompleted = user && test.completedBy?.includes(user.uid);
                  return (
                    <div key={test.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 relative overflow-hidden group">
                      {isCompleted && (
                        <div className="absolute top-0 right-0 bg-green-100 text-green-700 px-4 py-2 rounded-bl-2xl text-xs font-black">
                          ПРОЙДЕНО ✅
                        </div>
                      )}
                      <h3 className="font-black text-xl mb-2 pr-10">{test.title}</h3>
                      <p className="text-sm text-gray-500 mb-4 line-clamp-2">{test.description}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full">{test.questions.length} вопросов</span>
                        <button 
                          onClick={() => startTest(test)}
                          className={`px-6 py-3 rounded-xl font-black text-sm transition-transform active:scale-95 shadow-md ${isCompleted ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-90'}`}
                        >
                          {isCompleted ? 'Пройти снова' : 'Начать тест'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {tests.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-6xl mb-4">🎓</p>
                    <p className="text-gray-400 font-bold">Пока нет доступных тестов</p>
                  </div>
                )}
              </div>
            )}

            {/* ПРОЦЕСС ТЕСТИРОВАНИЯ */}
            {activeTest && testStep === 'quiz' && (
              <div className="animate-in slide-in-from-right duration-300">
                <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-indigo-50 min-h-[60vh] flex flex-col">
                  <div className="w-full bg-gray-100 h-2 rounded-full mb-6 overflow-hidden">
                    <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${((currentQIndex + 1) / activeTest.questions.length) * 100}%` }}></div>
                  </div>
                  <h2 className="text-2xl font-black text-gray-800 mb-6 flex-grow">
                    {activeTest.questions[currentQIndex].text}
                  </h2>
                  <div className="space-y-3 mb-6">
                    {activeTest.questions[currentQIndex].options.map(option => {
                      let btnClass = "bg-gray-50 text-gray-700 border-2 border-transparent hover:bg-gray-100";
                      if (isAnswered) {
                        if (option.isCorrect) {
                          btnClass = "bg-green-100 text-green-800 border-green-500";
                        } else if (selectedOptionId === option.id) {
                          btnClass = "bg-red-100 text-red-800 border-red-500";
                        } else {
                          btnClass = "bg-gray-50 text-gray-400 opacity-50";
                        }
                      }
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleAnswer(option)}
                          disabled={isAnswered}
                          className={`w-full p-4 rounded-2xl font-bold text-left transition-all active:scale-98 ${btnClass}`}
                        >
                          {option.text}
                        </button>
                      );
                    })}
                  </div>
                  {isAnswered && (
                    <button 
                      onClick={nextQuestion}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 animate-in fade-in slide-in-from-bottom-2"
                    >
                      {currentQIndex < activeTest.questions.length - 1 ? 'Следующий вопрос ➜' : 'Завершить тест 🎉'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* РЕЗУЛЬТАТ */}
            {activeTest && testStep === 'result' && (
              <div className="animate-in zoom-in duration-300 flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-[2rem] p-8 shadow-xl text-center">
                <div className="text-8xl mb-6">{score === activeTest.questions.length ? '🏆' : score > activeTest.questions.length / 2 ? '👍' : '📚'}</div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">Тест завершен!</h2>
                <p className="text-gray-500 font-bold mb-8">
                  Вы ответили верно на <span className="text-indigo-600 text-xl">{score}</span> из <span className="text-gray-900">{activeTest.questions.length}</span> вопросов
                </p>
                <button onClick={closeTest} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-lg hover:scale-105 transition-transform">
                  Вернуться к списку
                </button>
              </div>
            )}
          </div>
        )}

        {/* ВКЛАДКА НОВОСТИ */}
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
            <div className="space-y-6">
              {news.map(i => (
                <div key={i.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
                  {i.imageUrl && <div className="h-52 w-full bg-gray-200 relative"><img src={i.imageUrl} className="w-full h-full object-cover" /></div>}
                  <div className="p-6">
                    <h3 className="font-black text-xl mb-3 leading-tight">{i.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{i.body}</p>
                    <p className="text-xs text-gray-400 font-bold mt-4">{new Date(i.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {news.length === 0 && <p className="text-center text-gray-400 py-10 font-bold">Новостей пока нет</p>}
            </div>
          </div>
        )}

        {/* ВКЛАДКА ЧАТ */}
        {activeTab === 'chat' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-green-200/50 flex items-center justify-between relative overflow-hidden">
               <div className="relative z-10"><h2 className="font-black text-xl mb-1">Юридическая помощь</h2><p className="text-green-100 text-sm font-bold">WhatsApp</p></div>
               <a href="https://wa.me/77771234567" target="_blank" className="relative z-10 bg-white text-green-600 px-6 py-3 rounded-xl font-black">Написать</a>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
               <h2 className="font-black text-xl mb-4">Написать в Совет</h2>
               <form onSubmit={sendRequest}>
                 <div className="relative mb-3">
                   <textarea className="w-full bg-gray-50 p-4 rounded-2xl border-0 min-h-[100px]" placeholder="Ваш вопрос..." value={message} onChange={e=>setMessage(e.target.value)} />
                   <div className="absolute bottom-3 right-3">
                      <input type="file" ref={chatFileRef} onChange={e => setChatFile(e.target.files?.[0] || null)} className="hidden" id="chat-file-upload" />
                      <label htmlFor="chat-file-upload" className="p-2 rounded-full cursor-pointer bg-gray-200 text-lg">📎</label>
                   </div>
                 </div>
                 {chatFile && <div className="bg-blue-50 p-2 rounded-xl text-sm mb-3 font-bold text-blue-700">{chatFile.name}</div>}
                 <button disabled={isSending} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black">{isSending ? '...' : 'Отправить'}</button>
               </form>
            </div>
            <div className="space-y-4">
               {myRequests.map(r => (
                 <div key={r.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-50">
                   <p className="font-bold mb-2">{r.text}</p>
                   {r.response && <div className="bg-green-50 p-3 rounded-xl text-sm text-green-900 font-bold">{r.response}</div>}
                 </div>
               ))}
            </div>
          </div>
        )}

        {/* ВКЛАДКА РЕСУРСЫ */}
        {activeTab === 'resources' && (
          <div className="space-y-8">
             <div className="space-y-4">
               <h2 className="font-black text-xl flex items-center gap-2">📄 Шаблоны</h2>
               {templates.map(t => (
                 <div key={t.id} className="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border border-gray-100">
                   <div><p className="font-black">{t.title}</p>{t.description && <p className="text-sm text-gray-500">{t.description}</p>}</div>
                   <a href={t.fileUrl} className="text-blue-600 font-bold">Скачать</a>
                 </div>
               ))}
             </div>
             <div className="space-y-4">
               <h2 className="font-black text-xl flex items-center gap-2">🌍 Ссылки</h2>
               {links.map(l => (
                 <a key={l.id} href={l.url} className="bg-white p-5 rounded-2xl block shadow-sm border border-gray-100 font-black text-blue-700">{l.title}</a>
               ))}
             </div>
          </div>
        )}

        {/* ВКЛАДКА ПРОФИЛЬ */}
        {activeTab === 'profile' && userData && (
          <div className="space-y-6 pt-4">
            <div className="bg-white p-8 rounded-[2rem] shadow-lg shadow-gray-200/40 border border-gray-100 text-center relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-10"></div>
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
                 <div className="mb-6 bg-indigo-50 p-5 rounded-2xl border border-indigo-100 relative z-10"><p className="text-xs font-black text-indigo-500 uppercase tracking-wider mb-1">Ближайшее собрание</p><p className="font-black text-indigo-900 text-xl leading-tight mb-2">{nextConference.title}</p><p className="text-sm font-bold text-indigo-700 flex items-center gap-2">🕒 {new Date(nextConference.date).toLocaleString([], {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</p></div>
               ) : <div className="mb-6 text-center py-4 bg-gray-50 rounded-2xl border border-gray-100"><p className="text-sm font-bold text-gray-400">Нет запланированных собраний</p></div>}
               <div className="flex justify-between items-center mb-6 relative z-10"><h2 className="font-black text-2xl text-gray-900">Мой голос</h2></div>
               <div className="relative z-10">
                {isDelegationActive ? (
                  <div className="bg-yellow-50 p-6 rounded-2xl border-2 border-yellow-300 mb-4 text-center"><p className="text-sm font-black text-yellow-700 uppercase mb-2 tracking-wider">Голос передан</p><p className="font-black text-gray-900 text-2xl">{userData.delegatedToName}</p></div>
                ) : userData.delegationStatus === 'pending' ? (
                  <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-300 mb-4 text-center animate-pulse"><p className="text-2xl mb-2">⏳</p><p className="font-black text-blue-900 text-lg">Заявка на рассмотрении</p></div>
                ) : (
                  delegationState.isOpen ? (
                    <button onClick={() => { setShowDelegateModal(true); setSearchTerm(''); setIsDropdownOpen(false); }} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-5 rounded-2xl font-black text-lg hover:from-indigo-700 hover:to-blue-700 transition-all shadow-xl shadow-indigo-300/50 active:scale-[0.98] relative overflow-hidden group"><span className="relative z-10 flex items-center justify-center gap-2">Делегировать голос ↗</span></button>
                  ) : <div className="bg-gray-100 p-6 rounded-2xl border border-gray-200 text-center"><p className="font-black text-gray-500 text-lg mb-1">Делегирование закрыто</p><p className="text-sm text-gray-400 font-bold">{delegationState.message}</p></div>
                )}
               </div>
               {userData.delegatedFrom && userData.delegatedFrom.length > 0 && (<div className="mt-8 pt-6 border-t-2 border-gray-100 relative z-10"><p className="text-xs font-black text-gray-400 uppercase mb-3 tracking-wider">Вам доверили голоса ({userData.delegatedFrom.length}):</p><div className="flex flex-wrap gap-2">{userData.delegatedFrom.map((name, idx) => <span key={idx} className="bg-green-100 text-green-800 px-3 py-1.5 rounded-xl text-xs font-black border border-green-200">{name}</span>)}</div></div>)}
            </div>
            <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 font-black py-5 rounded-2xl hover:bg-red-100 transition-colors text-sm uppercase tracking-wider">Выйти из аккаунта</button>
          </div>
        )}
      </div>

      {/* MODAL ДЕЛЕГИРОВАНИЯ */}
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
        {[ 
          { id: 'news', icon: '📰', label: 'Новости' }, 
          { id: 'chat', icon: '💬', label: 'Чат' }, 
          { id: 'learning', icon: '🎓', label: 'Обучение' }, 
          { id: 'resources', icon: '📂', label: 'Ресурсы' }, 
          { id: 'profile', icon: '👤', label: 'Профиль' } 
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300 ${activeTab === tab.id ? 'bg-blue-50 text-blue-600 scale-110 shadow-sm' : 'text-gray-400'}`}>
            <span className="text-2xl mb-0.5">{tab.icon}</span><span className="text-[9px] font-black">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}