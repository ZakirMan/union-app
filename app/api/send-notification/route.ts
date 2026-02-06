import { NextResponse } from 'next/server';
import { adminAuth, adminMessaging, adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
      await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { title, body } = await request.json();

    // 1. Получаем все токены пользователей из базы
    const usersSnap = await adminDb.collection('users').get();
    let tokens: string[] = [];

    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
        tokens.push(...data.fcmTokens);
      }
    });

    // Убираем дубликаты и пустые значения
    tokens = [...new Set(tokens)].filter(t => t);

    if (tokens.length === 0) {
      return NextResponse.json({ message: 'Нет подписчиков для рассылки' });
    }

    console.log(`Отправка уведомления на ${tokens.length} устройств...`);

    // 2. Отправляем сообщение всем сразу (Multicast)
    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: tokens,
    };

    const response = await adminMessaging.sendEachForMulticast(message);

    console.log('Успешно отправлено:', response.successCount);
    console.log('Ошибок:', response.failureCount);

    // (Опционально) Здесь можно почистить базу от невалидных токенов, если response.failureCount > 0

    return NextResponse.json({
      success: true,
      sentCount: response.successCount,
      failureCount: response.failureCount
    });

  } catch (error) {
    console.error('Ошибка отправки:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}