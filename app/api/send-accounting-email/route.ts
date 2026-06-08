import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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

    // Check admin role
    const adminDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
    }

    const { userEmail, userName, phone, position, category, deductionUrl } = await request.json();

    if (!deductionUrl) {
      return NextResponse.json({ message: 'Нет заявления на удержание, отправка не требуется' });
    }

    // Get accounting email from settings
    const settingsDoc = await adminDb.collection('settings').doc('general').get();
    const accountingEmail = settingsDoc.data()?.accountingEmail;

    if (!accountingEmail) {
      return NextResponse.json({ message: 'Email бухгалтерии не настроен' });
    }

    // Fetch the file buffer
    const fileResponse = await fetch(deductionUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch deduction file' }, { status: 500 });
    }
    
    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Determine extension from content-type
    const contentType = fileResponse.headers.get('content-type') || '';
    let extension = 'pdf'; // default
    if (contentType.includes('image/jpeg')) extension = 'jpg';
    else if (contentType.includes('image/png')) extension = 'png';

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD?.replace(/\s+/g, ''),
      },
    });

    const mailOptions = {
      from: `"Профсоюз" <${process.env.EMAIL_USER}>`,
      to: accountingEmail,
      subject: `Заявление на проф. взносы: ${userName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #1e3a8a;">Новое заявление на удержание взносов</h2>
          <p>В профсоюз вступил новый участник. Во вложении находится его заявление на удержание профсоюзных взносов.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p><strong>ФИО:</strong> ${userName}</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <p><strong>Телефон:</strong> ${phone || 'Не указан'}</p>
          <p><strong>Должность:</strong> ${position || 'Не указана'}</p>
          <p><strong>Категория:</strong> ${category || 'Не указана'}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999;">Письмо сгенерировано автоматически порталом Профсоюза.</p>
        </div>
      `,
      attachments: [
        {
          filename: `Заявление_на_удержание_${userName.replace(/\s+/g, '_')}.${extension}`,
          content: buffer,
          contentType: contentType,
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Письмо в бухгалтерию успешно отправлено:', info.messageId);

    return NextResponse.json({ success: true, messageId: info.messageId });

  } catch (error) {
    console.error('Ошибка при отправке письма в бухгалтерию:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
