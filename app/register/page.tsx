// app/register/page.tsx
'use client';

import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState(''); // <-- НОВОЕ ПОЛЕ

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: name,
        position: position,
        phoneNumber: phone, // <-- СОХРАНЯЕМ ТЕЛЕФОН
        role: 'member',
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      router.push('/');
    } catch (err: unknown) {
      console.error(err);
      const error = err as { code?: string };
      if (error.code === 'auth/email-already-in-use') setError('Email занят.');
      else setError('Ошибка регистрации.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-10">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-2 text-black">Регистрация</h2>
        <p className="text-center text-gray-600 mb-6 text-sm">Подайте заявку на вступление</p>
        <p className="text-center text-gray-600 mb-6 text-sm">Ежемесячные членские взносы составляют 0,5% от заработной платы</p>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">ФИО</label>
            <input type="text" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Имя Фамилия" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Должность</label>
            <input type="text" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Ваша должность" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>

          {/* НОВОЕ ПОЛЕ: ТЕЛЕФОН */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Телефон</label>
            <input
              type="tel"
              required
              className="w-full px-4 py-2 border rounded-lg text-black"
              placeholder="Для быстрой ОС"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Email</label>
            <input type="email" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Будет вашим логином" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Пароль</label>
            <input type="password" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="******" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-bold mt-4">
            {loading ? 'Отправка...' : 'Отправить заявку'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Уже есть аккаунт? <Link href="/login" className="text-blue-600 font-bold hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  );
}