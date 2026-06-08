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

    // Проверка роли пользователя (только admin может отправлять email через этот роут)
    const adminDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
    }

    const { userEmail, userName } = await request.json();

    if (!userEmail) {
      return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD?.replace(/\s+/g, ''), // Удаляем пробелы на всякий случай
      },
    });

    const mailOptions = {
      from: `"Профсоюз" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: 'Ваша заявка в Профсоюз одобрена! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #1e3a8a; padding: 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Добро пожаловать в Профсоюз!</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px;">Здравствуйте, <strong>${userName || 'коллега'}</strong>!</p>
            <p style="font-size: 16px;">Ваша заявка на вступление успешно проверена и одобрена.</p>
            <p style="font-size: 16px;">Теперь вам доступны все функции нашего приложения: опросы, голосования, база знаний, оформление материальной помощи и многое другое.</p>
            <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
              <a href="https://union-app-two.vercel.app/" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Войти в приложение</a>
            </div>
            <p style="font-size: 14px; color: #666; text-align: center;">
              Если кнопка не работает, вы можете скопировать эту ссылку в браузер: <br/>
              <a href="https://union-app-two.vercel.app/" style="color: #2563eb;">https://union-app-two.vercel.app/</a>
            </p>
          </div>
          <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #9ca3af;">
            <p style="margin: 0;">Это автоматическое письмо, пожалуйста, не отвечайте на него.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Письмо успешно отправлено:', info.messageId);

    return NextResponse.json({ success: true, messageId: info.messageId });

  } catch (error) {
    console.error('Ошибка при отправке письма:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
