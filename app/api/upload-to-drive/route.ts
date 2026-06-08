import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { adminAuth } from '@/lib/firebase-admin';

// Инициализируем клиента Google Drive
const getDriveClient = () => {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Google Drive credentials are not set in environment variables');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
};

// Функция для скачивания файла по URL
async function downloadFile(url: string): Promise<{ buffer: Buffer, mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  return { buffer, mimeType };
}

// Функция для преобразования буфера в поток
function bufferToStream(buffer: Buffer) {
  const { Readable } = require('stream');
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

// Функция для поиска или создания подпапки
async function getOrCreateSubfolder(drive: any, parentId: string, folderName: string): Promise<string> {
  const response = await drive.files.list({
    q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });
  
  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }
  
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };
  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });
  
  return folder.data.id!;
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

    if (!folderId) {
      return NextResponse.json({ error: 'Google Drive Folder ID is not set' }, { status: 500 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ success: true, message: 'No files to upload' });
    }

    const drive = getDriveClient();
    const uploadedFiles = [];

    // 3. Загрузка каждого файла
    for (const file of files) {
      try {
        const { url, type } = file; // type: 'statement' | 'idCard' | 'deduction'
        
        let prefix = 'Документ';
        let targetFolderName = '';
        if (type === 'statement') { prefix = 'Заявление'; targetFolderName = 'Заявки на вступление'; }
        if (type === 'idCard') { prefix = 'Удостоверение'; targetFolderName = 'Удостоверения личности'; }
        if (type === 'deduction') { prefix = 'Заявление_на_удержание'; targetFolderName = 'Заявки в бухгалтерию'; }

        // Получаем ID нужной подпапки
        const targetFolderId = targetFolderName ? await getOrCreateSubfolder(drive, folderId, targetFolderName) : folderId;

        // Скачиваем файл из Firebase Storage
        const { buffer, mimeType } = await downloadFile(url);
        
        // Определяем расширение
        let ext = '.pdf';
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
        if (mimeType.includes('png')) ext = '.png';
        if (mimeType.includes('pdf')) ext = '.pdf';

        const fileName = `${prefix}_${userName.replace(/ /g, '_')}${ext}`;

        // Загружаем на Google Drive
        const fileMetadata = {
          name: fileName,
          parents: [targetFolderId],
        };
        const media = {
          mimeType: mimeType,
          body: bufferToStream(buffer),
        };

        const driveResponse = await drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: 'id, name, webViewLink',
        });

        uploadedFiles.push(driveResponse.data);
      } catch (err) {
        console.error(`Ошибка загрузки файла ${file.type}:`, err);
        // Не прерываем остальные загрузки
      }
    }

    return NextResponse.json({ success: true, uploadedFiles });

  } catch (error: any) {
    console.error('Ошибка в upload-to-drive:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера', details: error.message }, { status: 500 });
  }
}
