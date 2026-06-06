import { NextResponse } from 'next/server';
import { adminAuth, adminMessaging, adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Проверка роли пользователя (только admin может отправлять уведомления)
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
    }

    const { title, body, userIds } = await request.json();

    let tokens: string[] = [];

    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      // 1а. Получаем токены только для указанных пользователей
      for (const uid of userIds) {
        const uDoc = await adminDb.collection('users').doc(uid).get();
        if (uDoc.exists) {
          const data = uDoc.data();
          if (data?.fcmTokens && Array.isArray(data.fcmTokens)) {
            tokens.push(...data.fcmTokens);
          }
        }
      }
    } else {
      // 1б. Получаем все токены пользователей из базы (массовая рассылка)
      const usersSnap = await adminDb.collection('users').get();
      usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
          tokens.push(...data.fcmTokens);
        }
      });
    }

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