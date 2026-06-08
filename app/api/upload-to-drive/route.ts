import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

// Функция для скачивания файла по URL и конвертации в Base64
async function downloadFileAsBase64(url: string): Promise<{ base64: string, mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  return { base64: buffer.toString('base64'), mimeType };
}

export async function POST(request: Request) {
  try {
    // 1. Проверка авторизации
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    await adminAuth.verifyIdToken(idToken);

    // 2. Получение данных
    const { userName, files } = await request.json();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL; // URL веб-хука Google Apps Script

    if (!folderId || !scriptUrl) {
      return NextResponse.json({ error: 'Google Drive Folder ID or Script URL is not set' }, { status: 500 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ success: true, message: 'No files to upload' });
    }

    const uploadedFiles = [];
    const errors = [];

    // 3. Загрузка каждого файла через Apps Script Webhook
    for (const file of files) {
      try {
        const { url, type } = file;
        
        let prefix = 'Документ';
        let targetFolderName = '';
        let subFolderName = ''; // Имя пользователя для вложенной папки
        
        if (type === 'statement') { prefix = 'Заявление'; targetFolderName = 'Заявки на вступление'; }
        if (type === 'idCard') { prefix = 'Удостоверение'; targetFolderName = 'Удостоверения личности'; }
        if (type === 'deduction') { prefix = 'Заявление_на_удержание'; targetFolderName = 'Заявки в бухгалтерию'; }
        if (type === 'aid') { prefix = 'Заявление_на_матпомощь'; targetFolderName = 'Материальная помощь'; subFolderName = userName; }
        if (type === 'appeal') { prefix = 'Документ_обращения'; targetFolderName = 'Обращения'; subFolderName = userName; }

        // Скачиваем файл из Firebase Storage и кодируем в Base64
        const { base64, mimeType } = await downloadFileAsBase64(url);
        
        // Определяем расширение
        let ext = '.pdf';
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
        if (mimeType.includes('png')) ext = '.png';
        if (mimeType.includes('pdf')) ext = '.pdf';

        const fileName = `${prefix}_${userName.replace(/ /g, '_')}${ext}`;

        // Отправляем POST запрос на Google Apps Script
        const response = await fetch(scriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            parentFolderId: folderId,
            targetFolderName: targetFolderName,
            subFolderName: subFolderName, // Новое поле
            filename: fileName,
            mimeType: mimeType,
            fileData: base64
          })
        });

        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Unknown Apps Script error');
        }

        uploadedFiles.push(result);
      } catch (err: any) {
        console.error(`Ошибка загрузки файла ${file.type}:`, err);
        errors.push({ type: file.type, error: err.message });
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: 'Some files failed', details: errors });
    }

    return NextResponse.json({ success: true, uploadedFiles });

  } catch (error: any) {
    console.error('Ошибка в upload-to-drive:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера', details: error.message }, { status: 500 });
  }
}
