import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// --- ВНИМАНИЕ: СЮДА ВСТАВЬТЕ ДАННЫЕ ИЗ СКАЧАННОГО JSON ---
const serviceAccount = {

  "project_id": "union-aviation-app",
  "client_email": "firebase-adminsdk-fbsvc@union-aviation-app.iam.gserviceaccount.com",
  "private_key_id": "33e23ee3d7ec2137c4111af6d18e3b7149ac7f71",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDK5FYxr332pRTI\nUHSoQIqNPHIRe3cBfwT/Af3jmB6v7vzJTluPSuvA/ULZtqDUNOy6bEgT3ghymciM\nyQr6HMjm8Mgq4bLSXWQd+BC0YubiSmeCRZdaDNUD3ADfAcaC8xZ1GKxNteyE/3If\nXlSjCRLS5wycB7f45CRBcDC5sLp776MAXdLnJ+2uL8Pq/4Q6RVLYN/OxrQ6cwwN7\ntPc23V6Xn2cwJNA/Dmf/zPL2AlFOGjosYQFngGRsp/AFbO5rAUF9xFi8i+538QDO\nDo+yu+nOHIQ3iiykqXbE3aR5kX8lr128BzHu2Kf6zNpzr8+MCYTq46UBUbrj1ngM\ndge1zXzJAgMBAAECggEAHGRVl4BaXTB+twVjPcRCXz9NKxse7SusNE9ACyBXcwE7\niKQZdfTjBs+qEjNXUDrTwcazU2xnvDm+8cyUZ6mth3u8VxvcXUnKX9M96zBH5PTK\nhVVdt7FCAddAm/RwphSEWQCJ5BoILhhdDPyzVVlItBC3GAKQgRjT5gBgISwU/JCt\nRlKL25yLkJHanYTpHByKTOyZhu+XoKMX2QC3Inj2qbGGEXdp2/0RzGrTBKJpxd59\nQlJ2hMdWxvCgANzvYmlbsOU9T925O2aHJBqX8yz1/SmpbaByPHHFB0J91D7r0Kzk\nDT++kTHA58ygYU5U+GTLLl1DGgKLhlZtGGOPCR98MQKBgQD1WHaD4MwusiG3wRcT\n7C2OOGgqrZGhVwgP/jcrSXzaqTlH8ZOIqiFWPZQ4UvtGcrpYY2CwNFBWb1ykzSel\nX5QW586BVXfZJmIKQZKhT83Sa+mmmPBvt6LOuW4SgjzbsfTYvbPvDW66/Xwh9y/C\ny+XnaIB6QZqX4anFhd5nn/P3XQKBgQDTs+leimicCG/hlZX2g+vDlBctRLmSgNwu\n6qXLKxegv4amCrCP7H6XZc8BnAl1pfez+8G8/1PMDHCzRRW9oc6HHSZvHNqa/uI3\nNUKQ9uexxdyYPrgcwgnFBMcbMvZJhjAhDqH77LXD9+KYODPWL6mWOCbGnQ5TTZmM\n2M8UKTUgXQKBgQCcNrc/QOLA2KqfVVJcXQSkiUXJ5rnTAJchl7uI1EGq+BSAulA1\ntB2Fy6+ULUHQmTwNCzmE98ovPri+NeIIadLgwre5obGtkcLaxOWX0Dg8wnkCml58\nw2/mMCrlngch2y0K0769dtAKP1vKRJkkbq7zqJYlQaAtFIIEQjhZwn6UAQKBgQCX\nuruI+dRN+LIPUUHBA/3nF+2gkUAbo2Wr7ptTSRhPKtYbjU/MZ2i3o81Azw/slT46\nbjcF+U2a0lO3+MzDNAQszJSuUFTRf9qsTOzfr0aSIEihiVo1qlCMN4dolBb2zUkT\neERapeYEhVaPWMC2Q0TdmHMaKJiK1fQ2gXGxdnNQNQKBgQCZACMPPit6EJRVtc3N\nnfQyYztLwkBvflmAnC/UVXfrHvLomGbopxyej8jK1yIp1ELo/o0tbvOGVEhdLFIT\nPuUHg79Q4zUm+ccRx9JU5Ea/Ev+9OZ3kDvGR4iLOYb4DgDglFOX43anzFWGqJTiH\n47yYdN2j+snbOhcvP1u3QzXG0A==\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n'), // Важно сохранить переносы строк
};

// Инициализация Admin SDK (делаем это один раз)
if (!admin.apps.length) {
  admin.initializeApp({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    credential: admin.credential.cert(serviceAccount as any)
  });
}

const db = getFirestore();

export async function POST(request: Request) {
  try {
    const { title, body } = await request.json();

    // 1. Получаем все токены пользователей из базы
    const usersSnap = await db.collection('users').get();
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

    const response = await admin.messaging().sendEachForMulticast(message);

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