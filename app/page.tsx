'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth'; // <--- Добавили signOut
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string>('member');
  const [news, setNews] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role || 'member');
          }
        } catch (error) {
          console.error("Ошибка роли", error);
        }
      }
    });

    const loadData = async () => {
      try {
        const nSnap = await getDocs(collection(db, 'news'));
        const nList = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        nList.sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
        setNews(nList);

        const tSnap = await getDocs(collection(db, 'team'));
        setTeam(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); } 
      finally { setLoadingNews(false); }
    };
    loadData();

    return () => unsubscribe();
  }, []);

  // --- ФУНКЦИЯ ВЫХОДА ---
  const handleLogout = async () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
      await signOut(auth);
      // После выхода пользователь автоматически увидит кнопки "Войти/Вступить" 
      // благодаря onAuthStateChanged
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      
      {/* HEADER */}
      <nav className="border-b bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          
          {/* ЛОГОТИП И НАЗВАНИЕ */}
          <div className="flex items-center gap-4">
            {/* Картинка логотипа */}
            <img 
              src="/icon-512.png" 
              alt="Логотип" 
              className="h-12 w-auto object-contain" 
            />
            
            {/* Текст */}
            <div className="text-xl font-bold text-blue-900 leading-tight">
              Профсоюз Работников<br/>
              <span className="text-blue-600">Авиации Казахстана</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link href="/dashboard" className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium transition">
                  Кабинет
                </Link>
                
                {role === 'admin' && (
                  <Link href="/admin" className="bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition">
                    Админ
                  </Link>
                )}

                {/* КНОПКА ВЫХОДА (LOGOUT) */}
                <button 
                  onClick={handleLogout}
                  className="text-red-500 hover:text-red-700 font-medium px-2 py-2 border border-transparent hover:border-red-100 rounded transition text-sm"
                  title="Выйти из аккаунта"
                >
                  Выйти
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-gray-600 hover:text-blue-600 font-medium py-2">Войти</Link>
                <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full font-medium transition">Вступить</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-800 text-white py-20 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">Вместе мы — сила!</h1>
        <p className="text-xl text-blue-100 mb-8">Защита прав, юридическая помощь и поддержка.</p>
        {!user && (
          <Link href="/register" className="bg-yellow-400 text-blue-900 font-bold px-8 py-3 rounded-lg hover:bg-yellow-300 shadow-lg transition">
            Подать заявку
          </Link>
        )}
      </header>

      {/* NEWS SECTION */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8 text-center text-gray-800">Новости</h2>
          
          {loadingNews ? (
             <div className="text-center text-gray-500">Загрузка...</div>
          ) : news.length === 0 ? (
             <div className="text-center text-gray-400">Новостей пока нет</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8">
              {news.map((item) => (
                <Link href={`/news/${item.id}`} key={item.id} className="group bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition flex flex-col h-full cursor-pointer">
                  <div className="h-48 overflow-hidden bg-gray-200 relative">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-400 text-4xl">📰</div>
                    )}
                  </div>
                  <div className="p-6 flex flex-col flex-grow">
                    <span className="text-xs text-gray-400 mb-2">{new Date(item.createdAt).toLocaleDateString()}</span>
                    <h3 className="text-xl font-bold mb-2 group-hover:text-blue-600 transition">{item.title}</h3>
                    <p className="text-gray-600 text-sm line-clamp-3 mb-4">{item.body}</p>
                    <span className="text-blue-600 text-sm font-medium mt-auto">Читать далее →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TEAM SECTION */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center text-gray-800">Совет Профсоюза</h2>
          <div className="flex flex-wrap justify-center gap-10">
            {team.map(member => (
              <div key={member.id} className="flex flex-col items-center text-center w-40">
                <div className="w-32 h-32 rounded-full mb-4 overflow-hidden border-4 border-blue-50 shadow-sm relative">
                   <img src={member.photoUrl || '/default-avatar.png'} className="w-full h-full object-cover" />
                </div>
                <h3 className="text-lg font-bold leading-tight text-gray-900">{member.name}</h3>
                <p className="text-blue-600 text-sm">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-10 text-center">
        <p>© 2026 Профсоюз Работников Авиации Казахстана.</p>
      </footer>
    </div>
  );
}