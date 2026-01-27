'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase'; // Проверьте путь
import { doc, getDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewsDetailPage() {
  const { id } = useParams(); // Получаем ID из URL
  const router = useRouter();
  const [newsItem, setNewsItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchNews = async () => {
      try {
        const docRef = doc(db, 'news', id as string);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setNewsItem(docSnap.data());
        } else {
          setNewsItem(null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, [id]);

  if (loading) return <div className="p-20 text-center">Загрузка новости...</div>;
  if (!newsItem) return <div className="p-20 text-center">Новость не найдена <br/><Link href="/" className="text-blue-500">На главную</Link></div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-3xl mx-auto bg-white min-h-screen shadow-xl">
        
        {/* Картинка во всю ширину */}
        {newsItem.imageUrl && (
          <div className="w-full h-64 md:h-96 relative">
            <img src={newsItem.imageUrl} className="w-full h-full object-cover" alt={newsItem.title} />
          </div>
        )}

        <div className="p-6 md:p-10">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-blue-600 mb-6 flex items-center gap-2">
            ← Назад
          </button>

          <span className="text-gray-400 text-sm">{new Date(newsItem.createdAt).toLocaleDateString()}</span>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-8 leading-tight">
            {newsItem.title}
          </h1>

          <div className="prose prose-lg text-gray-700 whitespace-pre-wrap leading-relaxed">
            {newsItem.body}
          </div>
        </div>
      </div>
    </div>
  );
}