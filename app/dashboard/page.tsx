'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Обновили вкладки: news, chat, resources, profile
  const [activeTab, setActiveTab] = useState<'news' | 'chat' | 'resources' | 'profile'>('news');

  // Данные
  const [links, setLinks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);

  // Форма вопроса
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { router.push('/login'); return; }
      setUser(currentUser);

      try {
        // 1. Профиль
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) setUserData(userDoc.data());

        // 2. Ресурсы
        const lSnap = await getDocs(collection(db, 'links'));
        setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const tSnap = await getDocs(collection(db, 'templates'));
        setTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. Новости
        const nSnap = await getDocs(collection(db, 'news'));
        const newsList = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        // @ts-ignore
        newsList.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setNews(newsList);

        // 4. Мои обращения
        const q = query(collection(db, 'requests'), where('userId', '==', currentUser.uid));
        const rSnap = await getDocs(q);
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
    const newReq = { userId: user.uid, userEmail: user.email, text: message, status: 'new', createdAt: new Date().toISOString() };
    try {
      const docRef = await addDoc(collection(db, 'requests'), newReq);
      setMyRequests([ { id: docRef.id, ...newReq }, ...myRequests ]); 
      setMessage('');
    } catch { alert('Ошибка'); } finally { setIsSending(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Загрузка...</div>;

  // Если статус PENDING
  if (userData?.status === 'pending') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full">
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-black text-black mb-2">Заявка принята</h1>
          <p className="text-gray-600 font-medium mb-6">Администратор проверяет ваши данные.</p>
          <button onClick={() => window.location.reload()} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold mb-3">Обновить</button>
          <button onClick={handleLogout} className="text-gray-400 font-bold text-sm">Выйти</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-black pb-24">
      
      {/* HEADER: Виден на всех вкладках кроме профиля (там свой дизайн) */}
      {activeTab !== 'profile' && (
        <div className="bg-blue-700 text-white p-6 rounded-b-3xl shadow-lg mb-6 sticky top-0 z-40">
          <div className="flex justify-between items-start">
            <div>
              <p className="opacity-80 text-xs font-bold mb-1 uppercase tracking-wide">
                {activeTab === 'news' && 'Главная лента'}
                {activeTab === 'chat' && 'Центр поддержки'}
                {activeTab === 'resources' && 'База знаний'}
              </p>
              <h1 className="text-2xl font-black leading-tight">
                {activeTab === 'news' && 'Новости Профсоюза'}
                {activeTab === 'chat' && 'Связь и Помощь'}
                {activeTab === 'resources' && 'Документы'}
              </h1>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-xl mx-auto px-4">

        {/* --- TAB 1: НОВОСТИ (News) --- */}
        {activeTab === 'news' && (
          <div className="space-y-6">
            {news.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-6xl mb-4">📰</p>
                <p className="text-gray-400 font-bold">Новостей пока нет</p>
              </div>
            ) : (
              <div className="space-y-5">
                {news.map(item => (
                  <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {item.imageUrl && (
                      <div className="h-48 w-full overflow-hidden">
                        <img src={item.imageUrl} alt="News" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Важно</span>
                        <span className="text-xs text-gray-400 font-bold">{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h3 className="font-black text-xl leading-tight mb-2 text-gray-900">{item.title}</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- TAB 2: ЧАТ (Chat + WhatsApp) --- */}
        {activeTab === 'chat' && (
          <div className="space-y-6">
            
            {/* 1. Кнопка SOS (Юрист) */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-green-100">
               <h2 className="font-black text-lg mb-2 text-gray-800">Экстренная связь</h2>
               <p className="text-xs text-gray-500 mb-4 font-bold">Напишите Председателю, если ваши права нарушают.</p>
               <a href="https://wa.me/77771234567" target="_blank" className="block bg-green-500 text-white p-4 rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-3 active:scale-95 transition transform">
                <span className="text-2xl">💬</span>
                <span className="font-bold text-lg">Написать в WhatsApp</span>
              </a>
            </div>

            <hr className="border-gray-200" />

            {/* 2. Форма вопроса Совету */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="font-black text-lg mb-2 text-gray-800">Вопрос администрации</h2>
              <p className="text-xs text-gray-500 mb-4 font-bold">Для официальных запросов и предложений.</p>
              <form onSubmit={sendRequest}>
                <textarea 
                  className="w-full bg-gray-50 p-4 rounded-xl border-2 border-gray-100 mb-3 text-sm font-medium focus:border-blue-500 outline-none transition" 
                  rows={4} 
                  placeholder="Опишите вашу ситуацию..." 
                  value={message} 
                  onChange={e => setMessage(e.target.value)} 
                />
                <button disabled={isSending} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition">
                  {isSending ? 'Отправка...' : 'Отправить вопрос'}
                </button>
              </form>
            </div>

            {/* 3. История */}
            <div>
              <h2 className="font-black text-lg mb-4 ml-1 text-gray-800">История обращений</h2>
              <div className="space-y-4">
                {myRequests.map(req => (
                  <div key={req.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between text-xs font-bold mb-3">
                      <span className="text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</span>
                      <span className={req.response ? 'text-green-600 bg-green-50 px-2 py-0.5 rounded' : 'text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded'}>
                        {req.response ? 'Ответ получен' : 'На рассмотрении'}
                      </span>
                    </div>
                    <p className="font-bold text-gray-800 mb-4 text-sm">{req.text}</p>
                    
                    {req.response && (
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] text-white">A</div>
                           <p className="text-xs text-blue-700 font-black uppercase">Ответ администрации</p>
                        </div>
                        <p className="text-sm text-gray-700 font-medium">{req.response}</p>
                      </div>
                    )}
                  </div>
                ))}
                {myRequests.length === 0 && <p className="text-center text-gray-400 py-10 font-medium">Вы еще не писали обращений</p>}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 3: РЕСУРСЫ (Resources: Templates + Links) --- */}
        {activeTab === 'resources' && (
          <div className="space-y-8">
            
            {/* Шаблоны */}
            <div>
              <h2 className="font-black text-xl mb-4 ml-1 text-gray-800">📄 Документы</h2>
              <div className="space-y-3">
                {templates.map(tpl => (
                  <div key={tpl.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <div className="pr-4">
                      <h3 className="font-bold text-gray-900 text-sm">{tpl.title}</h3>
                      {tpl.description && <p className="text-xs text-gray-500 mt-1 leading-tight">{tpl.description}</p>}
                    </div>
                    <a href={tpl.fileUrl} target="_blank" className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg font-bold text-xs transition whitespace-nowrap">
                      Скачать
                    </a>
                  </div>
                ))}
                {templates.length === 0 && <p className="text-gray-400 text-sm text-center bg-white p-4 rounded-xl">Шаблоны не загружены</p>}
              </div>
            </div>

            {/* Ссылки */}
            <div>
              <h2 className="font-black text-xl mb-4 ml-1 text-gray-800">🔗 Полезные ссылки</h2>
              <div className="grid grid-cols-1 gap-3">
                {links.map(link => (
                  <a key={link.id} href={link.url} target="_blank" className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 hover:border-blue-300 transition group">
                    <span className="text-xl group-hover:scale-110 transition">🌍</span>
                    <span className="font-bold text-gray-800 text-sm group-hover:text-blue-600">{link.title}</span>
                  </a>
                ))}
                {links.length === 0 && <p className="text-gray-400 text-sm text-center bg-white p-4 rounded-xl">Ссылки не добавлены</p>}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 4: ПРОФИЛЬ (Profile) --- */}
        {activeTab === 'profile' && (
          <div className="space-y-6 pt-4">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 border-4 border-white shadow-lg">
                👤
              </div>
              <h2 className="font-black text-2xl mb-1 text-gray-900">{userData?.displayName}</h2>
              <p className="text-gray-500 font-medium text-sm mb-6">{userData?.email}</p>
              
              <div className="bg-gray-50 p-4 rounded-2xl text-left text-sm space-y-3">
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-400 font-bold">Должность</span>
                  <span className="font-black text-gray-800">{userData?.position}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-400 font-bold">Телефон</span>
                  <span className="font-black text-gray-800">{userData?.phoneNumber || '-'}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-gray-400 font-bold">Статус</span>
                  <span className="text-green-600 font-black bg-green-100 px-2 rounded text-xs flex items-center">АКТИВЕН</span>
                </div>
              </div>
            </div>

            <button onClick={handleLogout} className="w-full bg-white text-red-500 py-4 rounded-2xl font-black border border-red-100 shadow-sm hover:bg-red-50 transition">
              Выйти из аккаунта
            </button>
            
            <p className="text-center text-gray-300 text-xs font-bold mt-4">Version 1.0.3</p>
          </div>
        )}

      </div>

      {/* НИЖНЕЕ МЕНЮ (4 ВКЛАДКИ) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 flex justify-between items-end z-50 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
        
        <button onClick={() => setActiveTab('news')} className={`flex flex-col items-center gap-1 w-1/4 transition-all duration-300 ${activeTab === 'news' ? 'text-blue-600 -translate-y-1' : 'text-gray-400'}`}>
          <span className="text-2xl filter drop-shadow-sm">📰</span>
          <span className="text-[10px] font-black uppercase tracking-wider">Новости</span>
        </button>
        
        <button onClick={() => setActiveTab('chat')} className={`flex flex-col items-center gap-1 w-1/4 transition-all duration-300 ${activeTab === 'chat' ? 'text-blue-600 -translate-y-1' : 'text-gray-400'}`}>
          <span className="text-2xl filter drop-shadow-sm">💬</span>
          <span className="text-[10px] font-black uppercase tracking-wider">Чат</span>
        </button>
        
        <button onClick={() => setActiveTab('resources')} className={`flex flex-col items-center gap-1 w-1/4 transition-all duration-300 ${activeTab === 'resources' ? 'text-blue-600 -translate-y-1' : 'text-gray-400'}`}>
          <span className="text-2xl filter drop-shadow-sm">📂</span>
          <span className="text-[10px] font-black uppercase tracking-wider">Ресурсы</span>
        </button>

        <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 w-1/4 transition-all duration-300 ${activeTab === 'profile' ? 'text-blue-600 -translate-y-1' : 'text-gray-400'}`}>
          <span className="text-2xl filter drop-shadow-sm">👤</span>
          <span className="text-[10px] font-black uppercase tracking-wider">Профиль</span>
        </button>

      </div>

    </div>
  );
}