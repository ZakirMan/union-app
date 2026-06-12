import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  const usersSnap = await adminDb.collection('users').where('role', '==', 'admin').get();
  const admins = usersSnap.docs.map(doc => doc.id);
  return NextResponse.json({ admins });
}
