const { google } = require('googleapis');

async function testDrive() {
  try {
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    console.log('Email:', clientEmail);
    console.log('Folder ID:', folderId);
    console.log('Private Key starts with:', privateKey?.substring(0, 30));

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
    });

    console.log('Files in folder:', response.data.files);
  } catch (err) {
    console.error('Error:', err);
  }
}

testDrive();
