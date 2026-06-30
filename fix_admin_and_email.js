const fs = require('fs');

// Fix admin page
let adminCode = fs.readFileSync('app/admin/page.tsx', 'utf-8');
adminCode = adminCode.replace(/deductionUrl\?: string;/g, 'deductionUrl?: string;\n  signatureUrl?: string;');

adminCode = adminCode.replace(
  /\/\/ Отправляем заявление на удержание в бухгалтерию \(если есть\)\s*if \(u\.deductionUrl\) \{\s*try \{\s*const token \= await auth\.currentUser\?\.getIdToken\(\);\s*if \(token\) \{\s*await fetch\('\/api\/send-accounting-email', \{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json',\s*'Authorization': `Bearer \$\{token\}`\s*\},\s*body: JSON\.stringify\(\{\s*userEmail: u\.email,\s*userName: u\.displayName,\s*phone: u\.phoneNumber,\s*position: u\.position,\s*category: u\.category,\s*deductionUrl: u\.deductionUrl\s*\}\)\s*\}\);\s*\}\s*\} catch \(err\) \{\s*console\.error\('Ошибка отправки Email в бухгалтерию:', err\);\s*\}\s*\}/,
  `// Отправляем объединенное заявление в бухгалтерию (если это новый участник)
      if (!u.isAlreadyMember && u.statementUrl) {
        try {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            await fetch('/api/send-accounting-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${token}\`
              },
              body: JSON.stringify({
                userEmail: u.email,
                userName: u.displayName,
                phone: u.phoneNumber,
                position: u.position,
                category: u.category,
                statementUrl: u.statementUrl,
                signatureUrl: u.signatureUrl
              })
            });
          }
        } catch (err) {
          console.error('Ошибка отправки Email в бухгалтерию:', err);
        }
      }`
);

// Add signatureUrl to the grid
adminCode = adminCode.replace(
  /\{u\.statementUrl && \(\s*<a href=\{u\.statementUrl\} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-blue-50 text-blue-700 px-3 py-1\.5 rounded-lg text-xs font-black hover:bg-blue-100 transition border border-blue-100">\s*📎 \{u\.isAlreadyMember \? 'Фото пропуска' : 'Заявление'\}\s*<\/a>\s*\)\}/,
  `{u.statementUrl && (
                              <a href={u.statementUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-100 transition border border-blue-100">
                                📎 {u.isAlreadyMember ? 'Фото пропуска' : 'Заявление'}
                              </a>
                            )}
                            {u.signatureUrl && (
                              <a href={u.signatureUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-purple-100 transition border border-purple-100">
                                🔑 SIGEX .sig
                              </a>
                            )}`
);

// Add signatureUrl to the table row
adminCode = adminCode.replace(
  /\{u\.statementUrl && \(\<div className="flex flex-col items-center gap-1"\>\<a href=\{u\.statementUrl\} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-\[10px\] font-bold" onClick=\{e => e\.stopPropagation\(\)\}>\{u\.isAlreadyMember \? 'Пропуск' : 'Заявление'\}<\/a><button onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleDeleteUserFile\(u\.id, u\.statementUrl!, 'statementUrl'\); \}\} className="text-red-400 hover:text-red-600 text-\[10px\] uppercase font-black"\>✕<\/button><\/div>\)\}/,
  `{u.statementUrl && (<div className="flex flex-col items-center gap-1"><a href={u.statementUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-[10px] font-bold" onClick={e => e.stopPropagation()}>{u.isAlreadyMember ? 'Пропуск' : 'Заявление'}</a><button onClick={(e) => { e.stopPropagation(); handleDeleteUserFile(u.id, u.statementUrl!, 'statementUrl'); }} className="text-red-400 hover:text-red-600 text-[10px] uppercase font-black">✕</button></div>)}{u.signatureUrl && (<div className="flex flex-col items-center gap-1 border-t pt-1 border-gray-100"><a href={u.signatureUrl} target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline text-[10px] font-bold" onClick={e => e.stopPropagation()}>Подпись .sig</a></div>)}`
);

// Add signatureUrl to the modal
adminCode = adminCode.replace(
  /\{selectedUser\.statementUrl && <a href=\{selectedUser\.statementUrl\} target="_blank" rel="noopener noreferrer" className="bg-white\/20 hover:bg-white\/30 px-3 py-1\.5 rounded-lg text-xs font-bold transition">📄 \{selectedUser\.isAlreadyMember \? 'Пропуск' : 'Заявление'\}<\/a>\}/,
  `{selectedUser.statementUrl && <a href={selectedUser.statementUrl} target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition">📄 {selectedUser.isAlreadyMember ? 'Пропуск' : 'Заявление'}</a>}
                      {selectedUser.signatureUrl && <a href={selectedUser.signatureUrl} target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition">🔑 Подпись .sig</a>}`
);

fs.writeFileSync('app/admin/page.tsx', adminCode);

// Fix email route
let emailCode = fs.readFileSync('app/api/send-accounting-email/route.ts', 'utf-8');
emailCode = emailCode.replace(
  /const \{ userEmail, userName, phone, position, category, deductionUrl \} = await request\.json\(\);/g,
  'const { userEmail, userName, phone, position, category, statementUrl, signatureUrl } = await request.json();'
);
emailCode = emailCode.replace(
  /if \(!deductionUrl\) \{\s*return NextResponse\.json\(\{ message: 'Нет заявления на удержание, отправка не требуется' \}\);\s*\}/g,
  `if (!statementUrl) {
      return NextResponse.json({ message: 'Нет заявления, отправка не требуется' });
    }`
);
emailCode = emailCode.replace(
  /const fileResponse = await fetch\(deductionUrl\);\s*if \(!fileResponse\.ok\) \{\s*return NextResponse\.json\(\{ error: 'Failed to fetch deduction file' \}, \{ status: 500 \}\);\s*\}\s*const arrayBuffer = await fileResponse\.arrayBuffer\(\);\s*const buffer = Buffer\.from\(arrayBuffer\);\s*const contentType = fileResponse\.headers\.get\('content-type'\) \|\| '';\s*let extension = 'pdf'; \/\/ default\s*if \(contentType\.includes\('image\/jpeg'\)\) extension = 'jpg';\s*else if \(contentType\.includes\('image\/png'\)\) extension = 'png';/g,
  `const fileResponse = await fetch(statementUrl);
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
    }`
);
emailCode = emailCode.replace(
  /attachments: \[\s*\{\s*filename: \`Заявление_на_удержание_\$\{userName\.replace\(\/\\\\s\+\/g, '_'\)\}\.\$\{extension\}\`,\s*content: buffer,\s*contentType: contentType,\s*\}\s*\]/g,
  `attachments: [
        {
          filename: \`Заявление_\${userName.replace(/\\s+/g, '_')}.\${extension}\`,
          content: buffer,
          contentType: contentType,
        },
        ...(sigBuffer ? [{
          filename: \`Подпись_\${userName.replace(/\\s+/g, '_')}.sig\`,
          content: sigBuffer,
          contentType: 'application/pkcs7-signature',
        }] : [])
      ]`
);

fs.writeFileSync('app/api/send-accounting-email/route.ts', emailCode);
