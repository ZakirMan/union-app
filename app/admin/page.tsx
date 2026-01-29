'use client';

import { useEffect, useState } from 'react';
import { db, auth, storage } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, deleteDoc, getDoc, increment, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';

// --- ТИПЫ ДАННЫХ ---
interface UserData { 
  id: string; displayName: string; email: string; phoneNumber?: string; position: string; role: string; status: string;
  voteWeight?: number; delegatedTo?: string; delegatedToName?: string; delegatedFrom?: string[]; 
  delegationStatus?: string; delegationConferenceId?: string;
}

// Тесты
interface TestOption { id: string; text: string; isCorrect: boolean; }
interface TestQuestion { id: string; text: string; options: TestOption[]; }
interface Test { 
  id: string; title: string; description: string; questions: TestQuestion[]; 
  createdAt: string; completedBy?: string[]; // ID пользователей, кто прошел
}

interface DelegationRequest {
  id: string; fromId: string; fromName: string; toId: string; toName: string; docUrl?: string; createdAt: string; 
  status: 'pending' | 'approved' | 'rejected'; conferenceId?: string; conferenceTitle?: string; 
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
  const [activeTab, setActiveTab] = useState<'events' | 'delegations' | 'users' | 'news' | 'requests' | 'resources' | 'team'>('events');
  const [eventSubTab, setEventSubTab] = useState<'conferences' | 'tests'>('conferences'); 

  // Данные (инициализируем пустыми массивами, чтобы не было ошибок)
  const [users, setUsers] = useState<UserData[]>([]);
  const [delegations, setDelegations] = useState<DelegationRequest[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [tests, setTests] = useState<Test[]>([]); 
  const [news, setNews] = useState<NewsItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);

  // Состояние для просмотра результатов теста
  const [selectedTestStats, setSelectedTestStats] = useState<Test | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  // Конструктор теста
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [testTitle, setTestTitle] = useState('');
  const [testDesc, setTestDesc] = useState('');
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([{ id: 'q1', text: '', options: [{ id: 'o1', text: '', isCorrect: true }] }]);

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
      const uSnap = await getDocs(collection(db, 'users')); setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
      const dSnap = await getDocs(collection(db, 'delegation_requests')); setDelegations(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as DelegationRequest)).sort((a,b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
      const cSnap = await getDocs(collection(db, 'conferences')); setConferences(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Conference)).sort((a,b) => (a.date || '') > (b.date || '') ? 1 : -1));
      
      // Загрузка тестов (с проверкой)
      const tSnap = await getDocs(collection(db, 'tests')); 
      setTests(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as Test)).sort((a,b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));

      const nSnap = await getDocs(collection(db, 'news')); setNews(nSnap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)).sort((a,b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
      const tmSnap = await getDocs(collection(db, 'team')); setTeam(tmSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamMember)));
      const rSnap = await getDocs(collection(db, 'requests')); setRequests(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as RequestData)).sort((a,b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
      const lSnap = await getDocs(collection(db, 'links')); setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as LinkItem)));
      const tplSnap = await getDocs(collection(db, 'templates')); setTemplates(tplSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocTemplate)));
      
      setLoading(false);
    } catch (e) { 
      console.error(e); 
      setLoading(false); 
      // Не блокируем UI при ошибке загрузки, просто покажем пустые списки
    }
  };

  const uploadImage = async (file: File, folder: string) => {
    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  // --- ЛОГИКА ТЕСТОВ ---
  const handleAddQuestion = () => {
    setTestQuestions([...testQuestions, { id: `q${Date.now()}`, text: '', options: [{ id: `o${Date.now()}`, text: '', isCorrect: true }] }]);
  };
  const handleUpdateQuestion = (qIdx: number, text: string) => {
    const newQ = [...testQuestions]; newQ[qIdx].text = text; setTestQuestions(newQ);
  };
  const handleAddOption = (qIdx: number) => {
    const newQ = [...testQuestions]; newQ[qIdx].options.push({ id: `o${Date.now()}`, text: '', isCorrect: false }); setTestQuestions(newQ);
  };
  const handleUpdateOption = (qIdx: number, oIdx: number, text: string) => {
    const newQ = [...testQuestions]; newQ[qIdx].options[oIdx].text = text; setTestQuestions(newQ);
  };
  const handleSetCorrectOption = (qIdx: number, oIdx: number) => {
    const newQ = [...testQuestions]; 
    newQ[qIdx].options.forEach((o, i) => o.isCorrect = i === oIdx);
    setTestQuestions(newQ);
  };
  const handleRemoveQuestion = (qIdx: number) => {
    const newQ = [...testQuestions]; newQ.splice(qIdx, 1); setTestQuestions(newQ);
  };

  const handleCreateTest = async () => {
    if (!testTitle || testQuestions.some(q => !q.text || q.options.some(o => !o.text))) { alert('Заполните все поля'); return; }
    try {
      await addDoc(collection(db, 'tests'), {
        title: testTitle,
        description: testDesc,
        questions: testQuestions,
        createdAt: new Date().toISOString(),
        completedBy: []
      });
      setTestTitle(''); setTestDesc(''); setTestQuestions([{ id: 'q1', text: '', options: [{ id: 'o1', text: '', isCorrect: true }] }]);
      setIsCreatingTest(false);
      fetchData();
      alert('Тест создан!');
    } catch { alert('Ошибка'); }
  };
  const handleDeleteTest = async (id: string) => {
    if(confirm('Удалить тест?')) { await deleteDoc(doc(db, 'tests', id)); fetchData(); }
  };

  // --- ACTIONS ---
  const handleCreateConference = async (e: React.FormEvent) => { e.preventDefault(); if (!confTitle || !confDate) return; await addDoc(collection(db, 'conferences'), { title: confTitle, date: confDate, createdAt: new Date().toISOString() }); setConfTitle(''); setConfDate(''); fetchData(); alert('Конференция создана'); };
  const handleDeleteConference = async (id: string) => { if(confirm('Удалить конференцию?')) { await deleteDoc(doc(db, 'conferences', id)); fetchData(); } };
  const handleApproveDelegation = async (req: DelegationRequest) => { if (!confirm(`Одобрить?`)) return; await updateDoc(doc(db, 'delegation_requests', req.id), { status: 'approved' }); await updateDoc(doc(db, 'users', req.fromId), { voteWeight: 0, delegationStatus: 'approved', delegatedTo: req.toId, delegatedToName: req.toName, delegationConferenceId: req.conferenceId || null }); await updateDoc(doc(db, 'users', req.toId), { voteWeight: increment(1), delegatedFrom: arrayUnion(req.fromName) }); fetchData(); };
  const handleRejectDelegation = async (reqId: string, fromId: string) => { if (!confirm('Отклонить?')) return; await deleteDoc(doc(db, 'delegation_requests', reqId)); await updateDoc(doc(db, 'users', fromId), { delegationStatus: null, delegatedToName: null }); fetchData(); };
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
      
      {/* HEADER */}
      <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white shadow-xl z-20 sticky top-0 rounded-b-[1.5rem] mb-4">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div><h1 className="text-2xl font-black uppercase tracking-wide">Админ-Панель</h1><p className="text-xs text-blue-200 font-bold opacity-70">Профсоюз Авиаработников</p></div>
          <button onClick={() => router.push('/dashboard')} className="bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold transition-all">← В приложение</button>
        </div>
        <div className="max-w-7xl mx-auto px-4 flex gap-3 overflow-x-auto pb-4 no-scrollbar">
          {[ { id: 'events', label: 'События & Обучение', icon: '🎓' }, { id: 'users', label: 'Участники', icon: '👥', count: pendingUsers.length, color: 'bg-red-500' }, { id: 'delegations', label: 'Голоса', icon: '🗳️', count: pendingDelegations.length, color: 'bg-indigo-500' }, { id: 'requests', label: 'Вопросы', icon: '💬', count: activeRequests, color: 'bg-blue-500' }, { id: 'news', label: 'Новости', icon: '📰' }, { id: 'resources', label: 'Ресурсы', icon: '📂' }, { id: 'team', label: 'Совет', icon: '👔' } ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-5 py-3 rounded-2xl font-bold whitespace-nowrap flex items-center gap-2 transition-all duration-300 shadow-sm ${activeTab === tab.id ? 'bg-white text-blue-900 shadow-lg scale-105' : 'bg-blue-900/40 text-blue-100 hover:bg-blue-800/50'}`}><span className="text-lg">{tab.icon}</span> {tab.label} {tab.count !== undefined && tab.count > 0 && (<span className={`${tab.color || 'bg-gray-500'} text-white text-[10px] px-2 py-0.5 rounded-full shadow-md`}>{tab.count}</span>)}</button>
          ))}
        </div>
      </div>

      <div className="flex-grow p-4 md:p-6 pb-20">
        <div className="max-w-7xl mx-auto">
          
          {/* 1. СОБЫТИЯ И ОБУЧЕНИЕ */}
          {activeTab === 'events' && (
            <div className="space-y-6">
              <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-200 w-fit mx-auto mb-6">
                <button onClick={()=>setEventSubTab('conferences')} className={`px-6 py-2 rounded-xl font-bold transition-all ${eventSubTab==='conferences' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>📅 Собрания</button>
                <button onClick={()=>setEventSubTab('tests')} className={`px-6 py-2 rounded-xl font-bold transition-all ${eventSubTab==='tests' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>🎓 Тесты</button>
              </div>

              {/* КОНФЕРЕНЦИИ */}
              {eventSubTab === 'conferences' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-white p-8 rounded-[2rem] shadow-lg shadow-indigo-200/40 border border-white">
                    <h2 className="font-black text-2xl mb-6 text-gray-800">Назначить событие</h2>
                    <form onSubmit={handleCreateConference} className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="w-full"><label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">Название</label><input className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold outline-none" value={confTitle} onChange={e=>setConfTitle(e.target.value)} required /></div>
                      <div className="w-full"><label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">Дата</label><input type="datetime-local" className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold outline-none" value={confDate} onChange={e=>setConfDate(e.target.value)} required /></div>
                      <button className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black w-full md:w-auto">Создать</button>
                    </form>
                  </div>
                  <div className="grid gap-4">
                    {conferences.map(conf => {
                      // БЕЗОПАСНАЯ ПРОВЕРКА ДАТЫ
                      const d = conf.date ? new Date(conf.date) : new Date();
                      const isPast = d < new Date();
                      return (<div key={conf.id} className={`p-6 rounded-[2rem] flex justify-between items-center transition-all ${isPast ? 'bg-gray-100 opacity-70 border border-gray-200' : 'bg-white shadow-md border border-indigo-50 hover:shadow-lg'}`}><div><h4 className="font-black text-xl text-gray-900">{conf.title}</h4><p className={`font-bold text-sm flex items-center gap-2 mt-1 ${isPast ? 'text-gray-500' : 'text-green-600'}`}>{isPast ? '🏁 Завершено' : '🟢 Активно'} — {d.toLocaleString()}</p></div><button onClick={()=>handleDeleteConference(conf.id)} className="text-red-500 bg-red-50 px-4 py-2 rounded-xl font-bold text-xs uppercase hover:bg-red-100 transition">Удалить</button></div>)
                    })}
                  </div>
                </div>
              )}

              {/* ТЕСТЫ */}
              {eventSubTab === 'tests' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  {!isCreatingTest ? (
                    <button onClick={() => setIsCreatingTest(true)} className="w-full py-6 rounded-[2rem] border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-600 font-black text-xl hover:bg-indigo-100 transition-colors">
                      + Создать новый обучающий тест
                    </button>
                  ) : (
                    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-indigo-100">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="font-black text-2xl text-gray-800">Конструктор теста</h2>
                        <button onClick={() => setIsCreatingTest(false)} className="bg-gray-100 text-gray-500 px-4 py-2 rounded-xl font-bold text-sm">Отмена</button>
                      </div>
                      <div className="space-y-6">
                        <div><label className="text-xs font-black text-gray-400 uppercase ml-2 block">Тема теста</label><input className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition" value={testTitle} onChange={e=>setTestTitle(e.target.value)} placeholder="Например: Техника безопасности" /></div>
                        <div><label className="text-xs font-black text-gray-400 uppercase ml-2 block">Описание</label><input className="w-full p-4 bg-gray-50 rounded-2xl font-medium outline-none" value={testDesc} onChange={e=>setTestDesc(e.target.value)} placeholder="Краткое описание" /></div>
                        <div className="space-y-4">
                          {testQuestions.map((q, qIdx) => (
                            <div key={q.id} className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 relative">
                               <button onClick={() => handleRemoveQuestion(qIdx)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 font-bold">✕</button>
                               <label className="text-xs font-black text-indigo-400 uppercase ml-2 mb-1 block">Вопрос {qIdx + 1}</label>
                               <input className="w-full p-3 bg-white rounded-xl font-bold border border-indigo-100 mb-4 outline-none" value={q.text} onChange={e => handleUpdateQuestion(qIdx, e.target.value)} placeholder="Текст вопроса..." />
                               <div className="space-y-2 pl-4 border-l-2 border-indigo-200">
                                 {q.options.map((opt, oIdx) => (
                                   <div key={opt.id} className="flex items-center gap-3">
                                     <input type="radio" name={`correct-${q.id}`} checked={opt.isCorrect} onChange={() => handleSetCorrectOption(qIdx, oIdx)} className="w-5 h-5 accent-green-600 cursor-pointer" />
                                     <input className={`flex-grow p-2 rounded-lg text-sm font-medium outline-none ${opt.isCorrect ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-white border border-gray-200'}`} value={opt.text} onChange={e => handleUpdateOption(qIdx, oIdx, e.target.value)} placeholder={`Вариант ${oIdx + 1}`} />
                                   </div>
                                 ))}
                                 <button onClick={() => handleAddOption(qIdx)} className="text-xs font-bold text-indigo-600 hover:underline mt-2">+ Добавить вариант</button>
                               </div>
                            </div>
                          ))}
                          <button onClick={handleAddQuestion} className="w-full py-3 bg-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-gray-200">+ Добавить вопрос</button>
                        </div>
                        <button onClick={handleCreateTest} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-transform active:scale-95">Сохранить и Опубликовать</button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4">
                    {tests.map(test => (
                      <div key={test.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-black text-xl text-gray-900">{test.title}</h3>
                            <p className="text-gray-500 text-sm font-medium">{test.description}</p>
                            {/* БЕЗОПАСНЫЙ ДОСТУП К ВОПРОСАМ */}
                            <div className="mt-2 text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded inline-block">Вопросов: {test.questions?.length || 0}</div>
                          </div>
                          <button onClick={() => handleDeleteTest(test.id)} className="text-red-400 hover:text-red-600 font-bold p-2">🗑</button>
                        </div>
                        <div className="bg-gray-100 rounded-full h-4 w-full overflow-hidden relative cursor-pointer group" onClick={() => setSelectedTestStats(test)}>
                           {/* БЕЗОПАСНАЯ АРИФМЕТИКА */}
                           <div className="bg-green-500 h-full transition-all duration-1000" style={{ width: `${((test.completedBy?.length || 0) / (users.filter(u=>u.status==='approved').length || 1)) * 100}%` }}></div>
                           <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-gray-600 group-hover:text-black">
                             Прошли: {test.completedBy?.length || 0} из {users.filter(u=>u.status==='approved').length} (Нажмите для деталей)
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* УЧАСТНИКИ */}
          {activeTab === 'users' && (
             <div className="space-y-6">
               {pendingUsers.length > 0 && (
                 <div className="bg-gradient-to-r from-yellow-100 to-orange-100 p-6 rounded-[2rem] border border-yellow-200 shadow-lg">
                   <h2 className="font-black text-xl mb-4 text-yellow-900">🔔 Ожидают доступа</h2>
                   <div className="grid gap-3">{pendingUsers.map(u => (<div key={u.id} className="flex justify-between items-center bg-white/80 p-4 rounded-2xl"><div><span className="font-black block">{u.displayName}</span><span className="text-sm text-gray-500">{u.position}</span></div><div className="flex gap-2"><button onClick={() => handleApproveUser(u.id)} className="bg-green-500 text-white px-4 py-2 rounded-xl font-bold">Принять</button><button onClick={() => handleRejectUser(u.id)} className="bg-red-100 text-red-500 px-4 py-2 rounded-xl font-bold">Откл</button></div></div>))}</div>
                 </div>
               )}
               <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100">
                 <div className="p-8 bg-gray-50/50"><h2 className="font-black text-2xl">Реестр участников</h2></div>
                 <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-gray-100 text-gray-400 uppercase text-xs font-black"><tr><th className="p-6">Сотрудник</th><th className="p-6">Контакты</th><th className="p-6 text-center">Статус</th><th className="p-6 text-right"></th></tr></thead><tbody className="divide-y divide-gray-100">{users.filter(u => u.status === 'approved').map(u => (<tr key={u.id} className="hover:bg-blue-50/50 cursor-pointer group" onClick={() => setSelectedUser(u)}><td className="p-6"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden flex items-center justify-center">{u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover"/> : '👤'}</div><div><div className="font-black text-gray-900 group-hover:text-blue-600">{u.displayName}</div><div className="text-xs font-bold text-gray-500">{u.position}</div></div></div></td><td className="p-6"><div className="text-sm font-bold">{u.phoneNumber}</div><div className="text-xs text-gray-400">{u.email}</div></td><td className="p-6 text-center">{u.delegatedTo ? <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-black">Голос передан</span> : u.delegatedFrom && u.delegatedFrom.length > 0 ? <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black">Делегат (+{u.delegatedFrom.length})</span> : <span className="text-gray-300">—</span>}</td><td className="p-6 text-right"><button onClick={(e) => { e.stopPropagation(); handleRejectUser(u.id); }} className="text-red-300 hover:text-red-500 font-bold px-2">✕</button></td></tr>))}</tbody></table></div>
               </div>
             </div>
          )}

          {/* МОДАЛКИ */}
          {selectedTestStats && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in" onClick={() => setSelectedTestStats(null)}>
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-indigo-600 p-6 text-white relative">
                  <h3 className="font-black text-xl pr-8">{selectedTestStats.title}</h3>
                  <button onClick={() => setSelectedTestStats(null)} className="absolute top-4 right-4 bg-white/20 rounded-full p-2 hover:bg-white/30">✕</button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto bg-gray-50 flex gap-4">
                  <div className="flex-1"><h4 className="font-bold text-green-600 uppercase text-xs mb-3 border-b border-green-200 pb-1">Прошли ({selectedTestStats.completedBy?.length || 0})</h4><div className="space-y-1">{users.filter(u => selectedTestStats.completedBy?.includes(u.id)).map(u => (<div key={u.id} className="text-sm font-bold text-gray-700 bg-white p-2 rounded shadow-sm border border-green-50">✅ {u.displayName}</div>))}</div></div>
                  <div className="flex-1"><h4 className="font-bold text-gray-400 uppercase text-xs mb-3 border-b border-gray-200 pb-1">Не приступали</h4><div className="space-y-1 opacity-60">{users.filter(u => u.status === 'approved' && !selectedTestStats.completedBy?.includes(u.id)).map(u => (<div key={u.id} className="text-sm font-medium text-gray-500 bg-white p-2 rounded border border-gray-100">{u.displayName}</div>))}</div></div>
                </div>
              </div>
            </div>
          )}

          {selectedUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in" onClick={() => setSelectedUser(null)}>
               <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white relative">
                     <button onClick={() => setSelectedUser(null)} className="absolute top-6 right-6 bg-white/20 rounded-full p-2 hover:bg-white/30">✕</button>
                     <div className="flex items-center gap-6"><div className="w-24 h-24 bg-white rounded-full border-4 border-white/30 flex items-center justify-center text-4xl overflow-hidden">{selectedUser.photoUrl ? <img src={selectedUser.photoUrl} className="w-full h-full object-cover"/> : '👤'}</div><div><h2 className="text-3xl font-black">{selectedUser.displayName}</h2><p className="font-bold text-blue-100 text-lg opacity-90">{selectedUser.position}</p></div></div>
                     <div className="mt-6 flex gap-6 text-sm font-bold opacity-80"><span>📞 {selectedUser.phoneNumber}</span><span>✉️ {selectedUser.email}</span></div>
                  </div>
                  <div className="p-8 max-h-[60vh] overflow-y-auto bg-gray-50 grid md:grid-cols-2 gap-8">
                     <div><h3 className="font-black text-gray-400 uppercase text-xs tracking-wider mb-4 border-b pb-2">Ему доверили голоса</h3><div className="space-y-3">{delegations.filter(d => d.toId === selectedUser.id && d.status === 'approved').map(d => (<div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100"><p className="font-black text-gray-800">{d.fromName}</p><p className="text-xs font-bold text-indigo-500 mt-1 bg-indigo-50 inline-block px-2 py-0.5 rounded">{d.conferenceTitle || '—'}</p><p className="text-[10px] text-gray-400 mt-1">{new Date(d.createdAt).toLocaleDateString()}</p></div>))}{delegations.filter(d => d.toId === selectedUser.id && d.status === 'approved').length === 0 && <p className="text-gray-400 text-sm font-bold italic">Нет</p>}</div></div>
                     <div><h3 className="font-black text-gray-400 uppercase text-xs tracking-wider mb-4 border-b pb-2">Он доверил голос</h3><div className="space-y-3">{delegations.filter(d => d.fromId === selectedUser.id && d.status === 'approved').map(d => (<div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border border-yellow-100"><p className="text-xs text-gray-400 font-bold mb-1">Передано:</p><p className="font-black text-gray-800 text-lg">{d.toName}</p><p className="text-xs font-bold text-gray-500 mt-1">Соб: {d.conferenceTitle || '—'}</p></div>))}{delegations.filter(d => d.fromId === selectedUser.id && d.status === 'approved').length === 0 && <p className="text-gray-400 text-sm font-bold italic">Голосует сам</p>}</div></div>
                  </div>
               </div>
            </div>
          )}

          {/* ДРУГИЕ ВКЛАДКИ */}
          {activeTab === 'delegations' && <div className="space-y-6"><h2 className="font-black text-2xl mb-4">Голоса</h2>{pendingDelegations.length === 0 ? <div className="bg-white p-10 rounded-[2rem] text-center text-gray-400 font-bold border-2 border-dashed border-gray-200">✅ Нет новых заявок</div> : <div className="grid gap-4">{pendingDelegations.map(req => (<div key={req.id} className="bg-white p-6 rounded-[2rem] border border-indigo-100 shadow-xl flex flex-col lg:flex-row justify-between items-start gap-6"><div className="flex-grow"><div className="flex items-center gap-3 mb-3"><span className="font-black bg-gray-100 px-3 py-1 rounded-xl">{req.fromName}</span><span className="text-indigo-300 font-black text-2xl">➝</span><span className="font-black bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl">{req.toName}</span></div>{req.conferenceTitle && <div className="inline-flex bg-yellow-50 text-yellow-800 text-xs font-black px-3 py-1.5 rounded-lg mb-3">📅 {req.conferenceTitle}</div>}<div className="flex gap-4 text-xs font-bold text-gray-400"><span>🕒 {new Date(req.createdAt).toLocaleString()}</span>{req.docUrl && <a href={req.docUrl} target="_blank" className="text-blue-600 underline">📄 Документ</a>}</div></div><div className="flex gap-2"><button onClick={()=>handleApproveDelegation(req)} className="bg-green-500 text-white px-6 py-3 rounded-xl font-black">Одобрить</button><button onClick={()=>handleRejectDelegation(req.id, req.fromId)} className="bg-gray-100 text-red-500 px-6 py-3 rounded-xl font-black">Отказать</button></div></div>))}</div>}</div>}
          {activeTab === 'requests' && <div className="grid gap-4">{requests.map(req => (<div key={req.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm"><div className="flex justify-between items-start mb-3"><span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-black">{req.userEmail}</span><span className="text-xs font-bold text-gray-400">{new Date(req.createdAt).toLocaleString()}</span></div><p className="font-bold text-gray-800 text-lg mb-4">"{req.text}"</p>{req.response ? <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-sm font-bold text-green-900">{req.response}</div> : <div className="flex gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-200"><input className="bg-transparent p-2 w-full font-medium outline-none text-sm" placeholder="Ответ..." onChange={(e) => setReplyText({...replyText, [req.id]: e.target.value})} /><button onClick={() => handleReplyRequest(req.id)} className="bg-blue-600 text-white px-5 rounded-xl font-black text-sm">Send</button></div>}</div>))}</div>}
          {activeTab === 'news' && <div className="space-y-6"><div className="bg-white p-6 rounded-[2rem] shadow-lg"><h2 className="font-black text-xl mb-4">Новость</h2><form onSubmit={handlePublishNews} className="space-y-3"><input className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none" placeholder="Заголовок" value={newsTitle} onChange={e => setNewsTitle(e.target.value)} /><textarea className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none h-32" placeholder="Текст..." value={newsBody} onChange={e => setNewsBody(e.target.value)} /><div className="flex justify-between"><input type="file" onChange={e => setNewsFile(e.target.files?.[0] || null)} className="text-xs"/><button className="bg-black text-white px-8 py-3 rounded-xl font-black">Опубликовать</button></div></form></div><div className="grid md:grid-cols-2 gap-4">{news.map(n => (<div key={n.id} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm relative"><h3 className="font-black text-lg mb-2">{n.title}</h3><p className="text-xs text-gray-400 font-bold">{new Date(n.createdAt).toLocaleDateString()}</p><button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 font-black">✕</button></div>))}</div></div>}
          {activeTab === 'resources' && <div className="grid md:grid-cols-2 gap-6"><div className="bg-white p-8 rounded-[2rem] shadow-lg"><h3 className="font-black text-xl mb-4 text-teal-600">Ссылки</h3><form onSubmit={handleAddLink} className="flex gap-2 mb-4"><input className="bg-gray-50 p-3 rounded-xl w-full font-bold" placeholder="Title" value={linkTitle} onChange={e=>setLinkTitle(e.target.value)}/><input className="bg-gray-50 p-3 rounded-xl w-full" placeholder="URL" value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}/><button className="bg-teal-600 text-white p-3 rounded-xl font-black">+</button></form>{links.map(l=><div key={l.id} className="flex justify-between py-2 border-b"><span className="font-bold text-gray-700">{l.title}</span><button onClick={()=>handleDeleteLink(l.id)} className="text-red-400 font-bold">✕</button></div>)}</div><div className="bg-white p-8 rounded-[2rem] shadow-lg"><h3 className="font-black text-xl mb-4 text-orange-500">Шаблоны</h3><form onSubmit={handleAddTemplate} className="flex flex-col gap-3 mb-6"><input className="bg-gray-50 p-3 rounded-xl font-bold" placeholder="Название" value={tplTitle} onChange={e=>setTplTitle(e.target.value)}/><input type="file" onChange={e=>setTplFile(e.target.files?.[0] || null)} className="text-xs"/><button className="bg-orange-500 text-white py-3 rounded-xl font-black">Загрузить</button></form>{templates.map(t=><div key={t.id} className="flex justify-between py-2 border-b"><span className="font-bold text-gray-700">{t.title}</span><button onClick={()=>handleDeleteTemplate(t.id)} className="text-red-400 font-bold">✕</button></div>)}</div></div>}
          {activeTab === 'team' && <div className="bg-white p-8 rounded-[2rem] shadow-xl"><h2 className="font-black text-2xl mb-6">Совет</h2><form onSubmit={handleAddMember} className="bg-gray-50 p-6 rounded-2xl mb-8 flex gap-4"><input className="p-3 rounded-xl w-full font-bold border-0" placeholder="ФИО" value={memberName} onChange={e=>setMemberName(e.target.value)}/><input className="p-3 rounded-xl w-full border-0" placeholder="Роль" value={memberRole} onChange={e=>setMemberRole(e.target.value)}/><input type="file" onChange={e=>setMemberFile(e.target.files?.[0] || null)} className="text-xs"/><button className="bg-black text-white px-6 rounded-xl font-black">Add</button></form><div className="grid md:grid-cols-3 gap-4">{team.map(m=><div key={m.id} className="border p-4 rounded-2xl flex items-center gap-4 bg-white"><img src={m.photoUrl || '/default-avatar.png'} className="w-12 h-12 rounded-full object-cover"/><div className="flex-grow"><p className="font-black text-sm">{m.name}</p><p className="text-xs text-gray-400">{m.role}</p></div><button onClick={()=>handleDeleteMember(m.id)} className="text-red-400 font-black">✕</button></div>)}</div></div>}

        </div>
      </div>
    </div>
  );
}