// app/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      // Стандартная функция Firebase: отправляет письмо с ссылкой
      await sendPasswordResetEmail(auth, email);
      setStatus('success');
    } catch (error: unknown) {
      console.error(error);
      const firebaseError = error as { code?: string };
      setStatus('error');
      if (firebaseError.code === 'auth/user-not-found') {
        setErrorMsg('Такой Email не зарегистрирован.');
      } else if (firebaseError.code === 'auth/invalid-email') {
        setErrorMsg('Некорректный формат Email.');
      } else {
        setErrorMsg('Ошибка отправки. Попробуйте позже.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">

        <h2 className="text-2xl font-black text-gray-900 mb-2">Восстановление пароля</h2>
        <p className="text-gray-500 text-sm mb-6">Введите почту, указанную при регистрации. Мы отправим туда ссылку для сброса.</p>

        {status === 'success' ? (
          <div className="bg-green-50 p-6 rounded-xl border border-green-100">
            <p className="text-4xl mb-2">📧</p>
            <h3 className="font-bold text-green-700 mb-2">Письмо отправлено!</h3>
            <p className="text-sm text-gray-600 mb-6">Проверьте почту (и папку Спам). Перейдите по ссылке в письме, чтобы задать новый пароль.</p>
            <Link href="/login" className="block w-full bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 transition">
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Ваш Email</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-black"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {status === 'error' && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 disabled:opacity-70"
            >
              {status === 'loading' ? 'Отправка...' : 'Сбросить пароль'}
            </button>

            <div className="text-center mt-4">
              <Link href="/login" className="text-gray-500 text-sm font-bold hover:text-blue-600">
                ← Назад ко входу
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}