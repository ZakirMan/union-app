'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';

interface UnionDocument {
    id: string;
    title: string;
    content: string;
    createdAt: string;
}

export default function DocumentPage() {
    const { id } = useParams();
    const router = useRouter();
    const [document, setDocument] = useState<UnionDocument | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDocument = async () => {
            if (!id || typeof id !== 'string') return;
            try {
                const docRef = doc(db, 'union_documents', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setDocument({ id: docSnap.id, ...docSnap.data() } as UnionDocument);
                } else {
                    console.error('Document not found');
                }
            } catch (e) {
                console.error('Error fetching document:', e);
            } finally {
                setLoading(false);
            }
        };

        fetchDocument();
    }, [id]);

    if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Загрузка...</div>;
    if (!document) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Документ не найден</div>;

    return (
        <div className="min-h-screen bg-[#F2F6FF] font-sans text-[#1A1A1A] p-6 md:p-12">
            <div className="max-w-4xl mx-auto bg-white rounded-[2.5rem] shadow-xl border border-white overflow-hidden p-8 md:p-12">
                <button
                    onClick={() => router.back()}
                    className="mb-8 px-4 py-2 bg-gray-100 hovering:bg-gray-200 rounded-xl font-bold text-gray-600 transition-colors"
                >
                    ← Назад
                </button>

                <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-8 border-b-4 border-indigo-500 pb-4 inline-block">
                    {document.title}
                </h1>

                <div className="prose prose-lg max-w-none">
                    <div className="whitespace-pre-wrap font-medium text-gray-700 leading-relaxed document-content">
                        {document.content}
                    </div>
                </div>
            </div>
            <style jsx global>{`
        .document-content p {
          text-indent: 1.5rem;
          margin-bottom: 1rem;
        }
      `}</style>
        </div>
    );
}
