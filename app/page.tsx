'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import Image from 'next/image';

interface NewsItem { id: string; title: string; body: string; imageUrl?: string; createdAt: string; }
interface TeamMember { id: string; name: string; role: string; photoUrl?: string; }

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string>('member');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);

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
        const nList = nSnap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem));
        nList.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setNews(nList);

        const tSnap = await getDocs(collection(db, 'team'));
        const teamData = tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamMember));
        
        // Сортируем: Председатель первый, Заместитель второй, остальные по алфавиту
        teamData.sort((a, b) => {
          const aRole = (a.role || '').toLowerCase();
          const bRole = (b.role || '').toLowerCase();
          
          if (aRole.includes('председатель профсоюза')) return -1;
          if (bRole.includes('председатель профсоюза')) return 1;
          
          if (aRole.includes('заместитель')) return -1;
          if (bRole.includes('заместитель')) return 1;
          
          return a.name.localeCompare(b.name);
        });

        setTeam(teamData);
      } catch (e) { console.error(e); }
      finally { setLoadingNews(false); }

      try {
        const statsRes = await fetch('/api/public-stats');
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success && statsData.totalMembers) {
            setTotalMembers(statsData.totalMembers);
          }
        }
      } catch (e) { console.error("Error loading stats", e); }
    };
    loadData();

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
      await signOut(auth);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F6FF] font-sans text-[#1A1A1A] overflow-x-hidden">

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 transition-all duration-300 backdrop-blur-md bg-white/80 border-b border-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4 group cursor-pointer">
            <div className="relative w-12 h-12 transition-transform duration-500 group-hover:rotate-6">
              <Image src="/icon-512.png" alt="Logo" fill className="object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-black leading-none text-blue-900 uppercase tracking-wide">Профсоюз</h1>
              <p className="text-[10px] font-bold text-blue-400 tracking-wider">Работников Авиации Казахстана</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <Link href="/dashboard" className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  Личный кабинет
                </Link>
                {role === 'admin' && (
                  <Link href="/admin" className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold hover:bg-black transition">
                    Админ
                  </Link>
                )}
                <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition">
                  🚪
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" className="px-6 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition">Войти</Link>
                <Link href="/register" className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition">Вступить</Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <div className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-800"></div>
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-30">
          <div className="absolute -top-[50%] -left-[20%] w-[80%] h-[80%] bg-blue-500 rounded-full blur-[150px]"></div>
          <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <span className="inline-block py-1 px-3 rounded-full bg-white/10 border border-white/20 text-blue-200 text-xs font-black uppercase tracking-widest mb-6 backdrop-blur-md">
            Единство • Защита • Прогресс
          </span>
          <h1 className="text-5xl md:text-7xl font-black text-white mb-8 leading-tight tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-200">Вместе мы сила!</span>
          </h1>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed opacity-90 font-medium">
            Мы объединяем профессионалов для защиты трудовых прав, обеспечения безопасности и повышения качества жизни каждого сотрудника.
          </p>

          {!user && (
            <div className="flex justify-center gap-4">
              <Link href="/register" className="px-10 py-4 rounded-2xl bg-white text-blue-900 font-black text-lg shadow-2xl hover:shadow-white/20 hover:-translate-y-1 transition-all">
                Стать частью команды
              </Link>
            </div>
          )}
        </div>

        {/* STATS DECORATION */}
        <div className="max-w-5xl mx-auto mt-20 grid md:grid-cols-3 gap-6 px-6 relative z-10">
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 rounded-3xl text-center">
            <div className="text-4xl font-black text-white mb-1">{role === 'admin' && totalMembers ? totalMembers : '500+'}</div>
            <div className="text-blue-200 text-sm font-bold uppercase">Участников</div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 rounded-3xl text-center">
            <div className="text-3xl font-black text-white mb-1">Независимый</div>
            <div className="text-blue-200 text-sm font-bold uppercase">Председатель</div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 rounded-3xl text-center">
            <div className="text-4xl font-black text-white mb-1">100%</div>
            <div className="text-blue-200 text-sm font-bold uppercase">Защита прав</div>
          </div>
        </div>
      </div>

      {/* WAVE SEPARATOR */}
      <div className="relative -mt-24 h-24 overflow-hidden">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="absolute bottom-0 w-full h-full text-[#F2F6FF] fill-current">
          <path fillOpacity="1" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,250.7C960,235,1056,181,1152,165.3C1248,149,1344,171,1392,181.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </div>


      {/* NEWS SECTION */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <p className="text-blue-600 font-bold uppercase tracking-widest text-xs mb-2">Актуально</p>
              <h2 className="text-4xl font-black text-gray-900">Новости Профсоюза</h2>
            </div>
            {!loadingNews && news.length > 0 && <span className="hidden md:block bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold text-sm">Всего: {news.length}</span>}
          </div>

          {loadingNews ? (
            <div className="flex justify-center p-20"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
          ) : news.length === 0 ? (
            <div className="bg-white p-20 rounded-[3rem] text-center border border-dashed border-gray-200">
              <p className="text-gray-400 font-bold text-xl">Лента новостей пока пуста</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8">
              {news.map((item) => (
                <Link href={`/news/${item.id}`} key={item.id} className="group bg-white rounded-[2.5rem] shadow-xl shadow-blue-100/50 border border-white overflow-hidden hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 flex flex-col h-full">
                  <div className="h-60 overflow-hidden bg-gray-100 relative">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-300 text-5xl bg-gradient-to-br from-gray-50 to-gray-200">📰</div>
                    )}
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase text-gray-500 shadow-sm">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="p-8 flex flex-col flex-grow relative">
                    <h3 className="text-2xl font-black text-gray-900 mb-3 leading-tight group-hover:text-blue-600 transition-colors">{item.title}</h3>
                    <p className="text-gray-500 font-medium leading-relaxed line-clamp-3 mb-6 whitespace-pre-wrap">{item.body}</p>
                    <div className="mt-auto flex items-center gap-2 text-blue-600 font-bold text-sm group-hover:gap-4 transition-all">
                      Читать полностью <span>→</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TEAM SECTION */}
      <section className="py-20 px-6 bg-white relative">
        {/* Decor */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>

        <div className="max-w-7xl mx-auto text-center">
          <p className="text-indigo-500 font-bold uppercase tracking-widest text-xs mb-3">Команда</p>
          <h2 className="text-4xl font-black text-gray-900 mb-16">Совет Профсоюза</h2>

          <div className="flex flex-wrap justify-center gap-12 md:gap-16">
            {team.map((member) => {
              const isChairman = (member.role || '').toLowerCase().includes('председатель профсоюза');
              const isDeputy = (member.role || '').toLowerCase().includes('заместитель');

              return (
              <div key={member.id} className={`flex flex-col items-center group ${isChairman ? 'w-full mb-8' : ''}`}>
                <div className={`${isChairman ? 'w-48 h-48 md:w-56 md:h-56' : 'w-32 h-32 md:w-40 md:h-40'} rounded-full mb-6 p-1 ${isChairman ? 'bg-gradient-to-br from-yellow-400 to-amber-600' : isDeputy ? 'bg-gradient-to-br from-blue-400 to-indigo-600' : 'bg-gradient-to-br from-blue-100 to-indigo-100'} relative`}>
                  <div className="w-full h-full rounded-full overflow-hidden relative bg-white border-4 border-white shadow-xl group-hover:scale-105 transition-transform duration-300">
                    <Image src={member.photoUrl || '/default-avatar.png'} alt={member.name} fill className="object-cover" />
                  </div>
                </div>
                <h3 className={`${isChairman ? 'text-3xl' : 'text-xl'} font-black text-gray-900 leading-tight mb-2 text-center`}>{member.name}</h3>
                <p className={`${isChairman ? 'text-amber-700 bg-amber-50 px-5 py-2 text-base' : isDeputy ? 'text-indigo-600 bg-indigo-50 px-4 py-1.5 text-sm' : 'text-gray-500 bg-gray-50 px-3 py-1 text-sm'} font-bold rounded-xl text-center`}>{member.role}</p>
              </div>
            )})}
          </div>

          {team.length === 0 && (
            <p className="text-gray-400 font-bold">Информация о составе обновляется...</p>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-white py-16 px-6 border-t border-gray-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12 text-center md:text-left">
          <div className="max-w-md mx-auto md:mx-0">
            <h2 className="text-2xl font-black uppercase tracking-widest mb-2">Профсоюз</h2>
            <p className="text-gray-500 text-sm">Мы работаем для вас. Вместе мы делаем труд безопаснее, а жизнь — достойнее.</p>
          </div>
          
          <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start w-full md:w-auto">
            <p className="font-bold text-white uppercase tracking-widest text-xs mb-2">Контакты</p>
            <div className="text-center md:text-left">
              <p className="font-bold text-gray-300">Председатель</p>
              <p className="text-gray-500 mb-1">Петр Фелькер</p>
              <a href="mailto:petr.prof.aviation@gmail.com" className="text-blue-400 hover:text-blue-300 transition font-medium">petr.prof.aviation@gmail.com</a>
            </div>
            <div className="text-center md:text-left">
              <p className="font-bold text-gray-300">Заместитель председателя</p>
              <p className="text-gray-500 mb-1">Закир Мансуров</p>
              <a href="mailto:zakir.prof.aviation@gmail.com" className="text-blue-400 hover:text-blue-300 transition font-medium">zakir.prof.aviation@gmail.com</a>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-800 text-center text-xs font-bold text-gray-600">
          © 2026 Профсоюз Работников Авиации Казахстана. Все права защищены.
        </div>
      </footer>
    </div>
  );
}