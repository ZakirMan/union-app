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

    const { userEmail, userName, phone, position, category, statementUrl, signatureUrl } = await request.json();

    // Check authorization: must be admin OR the user themselves
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const isAdmin = userDoc.exists && userDoc.data()?.role === 'admin';
    const isOwner = decodedToken.email === userEmail;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!statementUrl) {
      return NextResponse.json({ message: 'Нет заявления, отправка не требуется' });
    }

    // Get accounting email from settings
    const settingsDoc = await adminDb.collection('settings').doc('general').get();
    const accountingEmail = settingsDoc.data()?.accountingEmail;

    if (!accountingEmail) {
      return NextResponse.json({ message: 'Email бухгалтерии не настроен' });
    }

    // Fetch the file buffer
    const fileResponse = await fetch(statementUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch statement file' }, { status: 500 });
    }
    
    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const contentType = fileResponse.headers.get('content-type') || 'application/pdf';
    let extension = 'pdf'; // default
    if (contentType.includes('image/jpeg')) extension = 'jpg';
    else if (contentType.includes('image/png')) extension = 'png';

    let sigBuffer = null;
    if (signatureUrl) {
      try {
        const sigResponse = await fetch(signatureUrl);
        if (sigResponse.ok) {
          sigBuffer = Buffer.from(await sigResponse.arrayBuffer());
        }
      } catch (e) {
        console.error('Failed to fetch signature file:', e);
      }
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD?.replace(/\s+/g, ''),
      },
    });

    // Clean up multiple emails (e.g. "acc1@mail.ru, acc2@mail.ru")
    const toEmails = accountingEmail.split(',').map((e: string) => e.trim()).filter(Boolean).join(', ');

    const mailOptions = {
      from: `"Профсоюз" <${process.env.EMAIL_USER}>`,
      to: toEmails,
      subject: `Заявление на проф. взносы: ${userName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #1e3a8a;">Новое заявление на удержание взносов</h2>
          <p>В профсоюз вступил новый участник. Во вложении находится его заявление на удержание профсоюзных взносов.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p><strong>ФИО:</strong> ${userName}</p>
          <p><strong>Телефон:</strong> ${phone || 'Не указан'}</p>
          <p><strong>Должность:</strong> ${position || 'Не указана'}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 14px; font-weight: bold; color: #d97706;">Пожалуйста, подтвердите получение этого заявления, ответив на данное письмо.</p>
          <p style="font-size: 12px; color: #999; margin-top: 20px;">Письмо сгенерировано автоматически порталом Профсоюза.</p>
        </div>
      `,
      attachments: [
        {
          filename: `Заявление_${userName.replace(/\s+/g, '_')}.${extension}`,
          content: buffer,
          contentType: contentType,
        },
        ...(sigBuffer ? [{
          filename: `Подпись_${userName.replace(/\s+/g, '_')}.sig`,
          content: sigBuffer,
          contentType: 'application/pkcs7-signature',
        }] : [])
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
