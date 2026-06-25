import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  try {
    // Проверка авторизации
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken); // Доступно всем авторизованным пользователям
    const uid = decodedToken.uid;

    // Получаем всех пользователей (approved)
    const usersSnap = await adminDb.collection('users').where('status', '==', 'approved').get();
    const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Получаем все запросы
    const requestsSnap = await adminDb.collection('requests').get();
    const requests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const newMembersStats: Record<string, { count: number; details: Array<{name: string, position: string}> }> = {};
    users.forEach((u: any) => {
      // Считаем только тех, кто ВПЕРВЫЕ вступил в профсоюз и уже одобрен
      if (u.status === 'approved' && u.isAlreadyMember === false && u.joinDate) {
        const month = u.joinDate.substring(0, 7);
        if (!newMembersStats[month]) newMembersStats[month] = { count: 0, details: [] };
        newMembersStats[month].count += 1;
        newMembersStats[month].details.push({
          name: u.displayName || u.email || 'Неизвестно',
          position: u.position || 'Без должности'
        });
      }
    });

    // Считаем статистику мат. помощи (aidStats)
    const aidStats: Record<string, { count: number; amount: number; pendingCount: number; details: Array<{name: string, amount: number, reason: string, isPending: boolean}> }> = {};
    
    requests.forEach((r: any) => {
      if (r.text && r.text.startsWith('Запрос материальной помощи') && (r.aidStatus === 'approved' || r.aidStatus === 'pending') && r.createdAt) {
        let dateStr = '';
        if (typeof r.createdAt === 'string') {
          dateStr = r.createdAt;
        } else if (r.createdAt.toDate) {
          dateStr = r.createdAt.toDate().toISOString();
        } else if (r.createdAt._seconds) {
          dateStr = new Date(r.createdAt._seconds * 1000).toISOString();
        }

        if (dateStr) {
          const month = dateStr.substring(0, 7);
          if (!aidStats[month]) aidStats[month] = { count: 0, amount: 0, pendingCount: 0, details: [] };
          
          const isPending = r.aidStatus === 'pending';
          
          if (!isPending) {
            aidStats[month].count += 1;
            aidStats[month].amount += (r.aidAmount || 0);
          } else {
            aidStats[month].pendingCount += 1;
          }
          
          const reason = r.text.split('\n')[0].replace('Запрос материальной помощи: ', '').trim();
          const requestUser = users.find((u: any) => u.email === r.userEmail);
          const name = r.userName || (requestUser as any)?.displayName || r.userEmail || 'Неизвестно';
          
          aidStats[month].details.push({
              name: name,
              amount: r.aidAmount || 0,
              reason: reason,
              isPending: isPending
          });
        }
      }
    });

    // Проверяем, является ли текущий пользователь админом
    const currentUser: any = users.find((u: any) => u.id === uid);
    const isAdmin = currentUser?.role === 'admin';

    // Если не админ, не передаем список вступивших
    if (!isAdmin) {
      Object.keys(newMembersStats).forEach(key => {
        newMembersStats[key].details = [];
      });
    }

    return NextResponse.json({ success: true, newMembersStats, aidStats });

  } catch (error: any) {
    console.error('Ошибка получения статистики:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера', details: error.message }, { status: 500 });
  }
}
