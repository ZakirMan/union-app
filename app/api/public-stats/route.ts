import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Получаем базовое количество из настроек
    const settingsSnap = await adminDb.collection('settings').doc('general').get();
    const baseCount = settingsSnap.exists ? (settingsSnap.data()?.accountingBaseMembers || 508) : 508;

    // 2. Получаем количество НОВЫХ пользователей в приложении (которые не были членами до регистрации и одобрены)
    const usersSnap = await adminDb.collection('users').get();
    let appUsersCount = 0;
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.status === 'approved' && data.isAlreadyMember === false) {
        appUsersCount++;
      }
    });

    return NextResponse.json({ success: true, totalMembers: baseCount + appUsersCount });
  } catch (error: any) {
    console.error('Error fetching public stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
