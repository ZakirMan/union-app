import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Получаем базовое количество из настроек
    const settingsSnap = await adminDb.collection('settings').doc('general').get();
    const baseCount = settingsSnap.exists ? (settingsSnap.data()?.accountingBaseMembers || 508) : 508;
    const baseDate = settingsSnap.exists ? (settingsSnap.data()?.accountingBaseDate || '') : '';

    // 2. Получаем количество НОВЫХ пользователей в приложении (которые не были членами до регистрации и одобрены)
    const usersSnap = await adminDb.collection('users').get();
    let appUsersCount = 0;
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.status === 'approved' && data.isAlreadyMember === false) {
        if (!baseDate || (data.joinDate && data.joinDate >= baseDate)) {
          appUsersCount++;
        }
      }
    });

    // 3. Вычитаем выбывших участников (тех, кто вышел ПОСЛЕ базовой даты)
    const exitedSnap = await adminDb.collection('exited_members').get();
    let exitedCount = 0;
    exitedSnap.forEach(doc => {
      const data = doc.data();
      if (!baseDate || (data.exitDate && data.exitDate >= baseDate)) {
        exitedCount++;
      }
    });

    return NextResponse.json({ success: true, totalMembers: baseCount + appUsersCount - exitedCount });
  } catch (error: any) {
    console.error('Error fetching public stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
