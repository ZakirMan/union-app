'use client';

import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { QRSigningClientCMS } from 'sigex-qr-signing-client';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const name = [lastName, firstName, middleName].filter(Boolean).join(' ');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [tabelNumber, setTabelNumber] = useState(''); // НОВОЕ ПОЛЕ
  const [isPilot, setIsPilot] = useState(false); // НОВОЕ ПОЛЕ

  const [idCardFile, setIdCardFile] = useState<File | null>(null); 
  const [passFile, setPassFile] = useState<File | null>(null); // Для уже состоящих

  const [isAlreadyMember, setIsAlreadyMember] = useState(false);
  const [joinDate, setJoinDate] = useState(''); 

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [eGovMobileLink, setEGovMobileLink] = useState('');
  const [eGovBusinessLink, setEGovBusinessLink] = useState('');
  const [isSigning, setIsSigning] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!idCardFile) {
      setError('Необходимо прикрепить удостоверение личности');
      setLoading(false);
      return;
    }

    if (isAlreadyMember && !passFile) {
      setError('Необходимо прикрепить корпоративный пропуск либо справку с места работы');
      setLoading(false);
      return;
    }

    let generatedStatementBlob: Blob | null = null;
    let generatedSignatureBlob: Blob | null = null;

    if (!isAlreadyMember) {
      // 1. Генерация одного объединенного PDF
      const membershipEl = document.getElementById('membership-template');
      const deductionEl = document.getElementById('deduction-template');
      
      if (membershipEl && deductionEl) {
        // Рендерим первую страницу
        const canvas1 = await html2canvas(membershipEl, { scale: 1.5 });
        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        
        // Рендерим вторую страницу
        const canvas2 = await html2canvas(deductionEl, { scale: 1.5 });
        pdf.addPage();
        pdf.addImage(canvas2.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        
        generatedStatementBlob = pdf.output('blob');
        
        // 2. Инициализация SIGEX QR
        setIsSigning(true);
        try {
          const safeName = name ? name.replace(/\s+/g, '_') : 'user';
          const qrSigner = new QRSigningClientCMS(`Заявление от ${name || 'нового участника'}`);
          await qrSigner.addDataToSign([`Заявление_${safeName}.pdf`], generatedStatementBlob, [], true);
          
          const qrCode = await qrSigner.registerQRSinging();
          setQrCodeDataUrl(`data:image/gif;base64,${qrCode}`);
          setEGovMobileLink(qrSigner.getEGovMobileLaunchLink());
          setEGovBusinessLink(qrSigner.getEGovBusinessLaunchLink());

          // 3. Ждем подписание
          const signatures = await qrSigner.getSignatures();
          const signature = signatures[0];
          
          // Конвертируем base64 подпись в Blob
          const byteCharacters = atob(signature);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          generatedSignatureBlob = new Blob([byteArray], {type: 'application/pkcs7-signature'});

        } catch (sigexErr: unknown) {
          console.error(sigexErr);
          const err = sigexErr as { details?: string; message?: string };
          setError('Ошибка при подписании документа: ' + (err.details || err.message || 'Неизвестная ошибка'));
          setLoading(false);
          setIsSigning(false);
          return;
        } finally {
          setIsSigning(false);
        }
      }
    }

    let userCreatedInThisSession = false;
    try {
      // Регистрация в Firebase
      let user = auth.currentUser;

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        userCreatedInThisSession = true;
      } catch (authErr: any) {
        throw authErr; // Передаем ошибку ниже в основной catch
      }

      let statementUrl = '';
      let signatureUrl = '';

      const safeName = name ? name.replace(/\s+/g, '_') : 'user';

      if (isAlreadyMember && passFile) {
        const storageRef = ref(storage, `registration_statements/${user.uid}_pass_${safeName}_${passFile.name}`);
        await uploadBytes(storageRef, passFile);
        statementUrl = await getDownloadURL(storageRef);
      } else if (generatedStatementBlob) {
        const storageRef = ref(storage, `registration_statements/${user.uid}_Заявление_${safeName}.pdf`);
        await uploadBytes(storageRef, generatedStatementBlob);
        statementUrl = await getDownloadURL(storageRef);

        if (generatedSignatureBlob) {
          const sigRef = ref(storage, `registration_statements/${user.uid}_Подпись_${safeName}.sig`);
          await uploadBytes(sigRef, generatedSignatureBlob);
          signatureUrl = await getDownloadURL(sigRef);
        }
      }

      let idCardUrl = '';
      if (idCardFile) {
        const idCardRef = ref(storage, `id_cards/${user.uid}_${idCardFile.name}`);
        await uploadBytes(idCardRef, idCardFile);
        idCardUrl = await getDownloadURL(idCardRef);
      }

      // Сохранение пользователя в Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: name,
        position: position,
        phoneNumber: phone,
        tabelNumber: tabelNumber || '',
        statementUrl: statementUrl,
        signatureUrl: signatureUrl,
        deductionUrl: "", // Мы объединили заявления в один файл
        idCardUrl: idCardUrl,
        isAlreadyMember: isAlreadyMember,
        joinDate: isAlreadyMember ? joinDate : '',
        role: 'member',
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      // Отправка уведомления админу в Telegram
      try {
        const token = await user.getIdToken();
        await fetch('/api/send-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            text: `🆕 <b>Новая заявка на вступление!</b>\n\n👤 <b>ФИО:</b> ${name}\n💼 <b>Должность:</b> ${position}\n📞 <b>Телефон:</b> ${phone}\n✉️ <b>Email:</b> ${email}\n🔰 <b>Уже в профсоюзе:</b> ${isAlreadyMember ? `Да (с ${joinDate || 'не указано'})` : 'Нет'}${statementUrl ? `\n\n📎 <a href="${statementUrl}">${isAlreadyMember ? 'Пропуск' : 'Заявление (объед.)'}</a>` : ''}${signatureUrl ? `\n📎 <a href="${signatureUrl}">Подпись SIGEX (.sig)</a>` : ''}${idCardUrl ? `\n📎 <a href="${idCardUrl}">Уд. личности</a>` : ''}`
          })
        });
      } catch (tgError) {
        console.error('Telegram notification failed:', tgError);
      }



      router.push('/');
    } catch (err: unknown) {
      console.error(err);
      
      // Если юзер был создан в этой сессии, но загрузка файлов или Firestore упали - удаляем его из Auth (rollback), чтобы он не застрял
      if (userCreatedInThisSession && auth.currentUser) {
         try {
            await auth.currentUser.delete();
         } catch (rollbackErr) {
            console.error('Rollback failed:', rollbackErr);
         }
      }

      const errorObj = err as { code?: string, message?: string };
      if (errorObj.code === 'auth/email-already-in-use') setError('Данный Email уже зарегистрирован.');
      else if (errorObj.code === 'auth/weak-password') setError('Пароль должен содержать минимум 6 символов.');
      else if (errorObj.code === 'auth/invalid-email') setError('Некорректный формат Email.');
      else setError(`Произошла ошибка при регистрации: ${errorObj.message || 'неизвестная ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

  const currentDate = new Date().toLocaleDateString('ru-RU');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-10 relative overflow-hidden">
      
      {/* СКРЫТЫЕ ШАБЛОНЫ ДЛЯ ГЕНЕРАЦИИ PDF */}
      <div style={{ position: 'absolute', left: '-9999px', top: '0' }}>
        {/* Шаблон: Заявление на вступление */}
        <div id="membership-template" style={{ width: '794px', height: '1123px', backgroundColor: '#fff', color: '#000', padding: '80px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'right', marginBottom: '60px', fontSize: '18px', lineHeight: '1.5' }}>
            Председателю ОО<br/>
            «Локальный Профсоюз<br/>
            Работников Авиации Казахстана»<br/>
            Фелькеру П.В.<br/>
            от <b>{name || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(Ф.И.О.)</span><br/>
            <b>{position || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(департамент/отдел)</span><br/>
            <b>{phone || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(контактный телефон)</span><br/>
            <b>{tabelNumber || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(табельный номер)</span>
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '20px' }}>Заявление</h2>

          <p style={{ textIndent: '40px', fontSize: '18px', lineHeight: '1.6', marginBottom: '40px' }}>
            Я, <b>{name || '_________________________________________________'}</b>,
            прошу Вас рассмотреть вопрос о моем приеме в члены ОО «Локальный Профсоюз Работников Авиации Казахстана».
          </p>

          <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '80px' }}>
            {isPilot ? (
              <>Обязуюсь произвести оплату членских взносов, а так же признавать и выполнять Устав Объединения.</>
            ) : (
              <>Обязуюсь произвести оплату вступительного и членских взносов, а так же признавать и выполнять Устав Объединения.</>
            )}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '40px', fontSize: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              <span style={{ marginTop: '10px' }}>Подпись</span>
              <div style={{ 
                border: '2px solid #2563eb', 
                borderRadius: '8px', 
                padding: '12px', 
                color: '#1e3a8a', 
                fontSize: '11px',
                lineHeight: '1.5',
                width: '280px',
                fontFamily: 'monospace',
                backgroundColor: '#eff6ff',
                boxSizing: 'border-box'
              }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#1d4ed8', borderBottom: '1px solid #bfdbfe', paddingBottom: '4px' }}>
                  ☑ ДОКУМЕНТ ПОДПИСАН ЭЦП
                </div>
                <div><b>Подписант:</b> {name || '________________'}</div>
                <div><b>Метод:</b> eGov Mobile (QR / SIGEX)</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Дата</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', textAlign: 'center' }}>{currentDate}</div>
            </div>
          </div>
        </div>

        {/* Шаблон: Заявление на удержание */}
        <div id="deduction-template" style={{ width: '794px', height: '1123px', backgroundColor: '#fff', color: '#000', padding: '80px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'right', marginBottom: '60px', fontSize: '18px', lineHeight: '1.5' }}>
            Главному бухгалтеру<br/>
            АО «Эйр Астана»<br/>
            Г-же Хасеновой С.<br/>
            от <b>{name || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(Ф.И.О.)</span><br/>
            <b>{position || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(департамент/отдел)</span><br/>
            <b>{phone || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(контактный телефон)</span><br/>
            <b>{tabelNumber || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(табельный номер)</span>
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '20px' }}>Заявление</h2>

          <p style={{ textIndent: '40px', fontSize: '18px', lineHeight: '1.6', marginBottom: '80px' }}>
            {isPilot ? (
              <>
                Прошу Вас ежемесячно удерживать сумму в размере 0,5% от начисленной заработной платы, но не более 15 000 тенге на счет ОО «Локальный Профсоюз Работников Авиации Казахстана»
              </>
            ) : (
              <>
                Прошу Вас удержать вступительный взнос в размере 0,5% с моей заработной платы, а так же ежемесячно удерживать сумму в размере 0,5% от начисленной заработной платы на счет ОО «Локальный Профсоюз Работников Авиации Казахстана»
              </>
            )}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '40px', fontSize: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              <span style={{ marginTop: '10px' }}>Подпись</span>
              <div style={{ 
                border: '2px solid #2563eb', 
                borderRadius: '8px', 
                padding: '12px', 
                color: '#1e3a8a', 
                fontSize: '11px',
                lineHeight: '1.5',
                width: '280px',
                fontFamily: 'monospace',
                backgroundColor: '#eff6ff',
                boxSizing: 'border-box'
              }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#1d4ed8', borderBottom: '1px solid #bfdbfe', paddingBottom: '4px' }}>
                  ☑ ДОКУМЕНТ ПОДПИСАН ЭЦП
                </div>
                <div><b>Подписант:</b> {name || '________________'}</div>
                <div><b>Метод:</b> eGov Mobile (QR / SIGEX)</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Дата</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', textAlign: 'center' }}>{currentDate}</div>
            </div>
          </div>
        </div>
      </div>
      {/* КОНЕЦ СКРЫТЫХ ШАБЛОНОВ */}


      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md relative z-10">
        <h2 className="text-2xl font-bold text-center mb-2 text-black">Регистрация</h2>
        <p className="text-center text-gray-600 mb-4 text-sm">Подайте заявку на вступление</p>
        <p className="text-center text-gray-600 mb-6 text-sm">Ежемесячные членские взносы составляют 0,5% от заработной платы (для пилотов — не более 15 000 тенге).</p>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">Фамилия</label>
              <input type="text" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Иванов" pattern="[А-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨө\s\-]+" title="Пожалуйста, введите на кириллице" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">Имя</label>
              <input type="text" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Иван" pattern="[А-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨө\s\-]+" title="Пожалуйста, введите на кириллице" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">Отчество (если есть)</label>
              <input type="text" className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Иванович" pattern="[А-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨө\s\-]+" title="Пожалуйста, введите на кириллице" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Должность</label>
            <input type="text" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Ваша должность" pattern="[А-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨө0-9\s\-\.,]+" title="Пожалуйста, введите на кириллице" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Телефон</label>
            <input type="tel" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Для быстрой ОС" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Табельный номер (если есть)</label>
            <input type="text" className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Например: 12345" value={tabelNumber} onChange={(e) => setTabelNumber(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Email</label>
            <input type="email" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Будет вашим логином" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">Пожалуйста, не используйте корпоративную почту</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Пароль</label>
            <input type="password" minLength={6} required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Минимум 6 символов" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="alreadyMember" 
                checked={isAlreadyMember} 
                onChange={(e) => setIsAlreadyMember(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="alreadyMember" className="text-sm font-medium text-gray-900 cursor-pointer select-none">
                Я уже состою в профсоюзе
              </label>
            </div>
            
            {isAlreadyMember && (
              <div className="mt-2 animate-in fade-in">
                <label className="block text-sm font-bold text-gray-900 mb-1">Месяц и год вступления</label>
                <input 
                  type="month" 
                  className="w-full px-4 py-2 border rounded-lg text-black bg-white" 
                  value={joinDate} 
                  onChange={(e) => setJoinDate(e.target.value)} 
                />
              </div>
            )}
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-4 space-y-6">
            
            {/* Опция только для НОВЫХ участников */}
            {!isAlreadyMember && (
              <>
                <div className="flex items-center gap-2 mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <input 
                    type="checkbox" 
                    id="isPilot" 
                    checked={isPilot} 
                    onChange={(e) => setIsPilot(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="isPilot" className="text-sm font-bold text-blue-900 cursor-pointer select-none">
                    Я пилот
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Подписание заявления
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Документ будет подписан с помощью eGov Mobile после нажатия кнопки &quot;Отправить заявку&quot;. 
                    Два заявления (на вступление и удержание) будут объединены в один документ для удобства.
                  </p>
                </div>
              </>
            )}

            {isAlreadyMember && (
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Прикрепить корпоративный пропуск либо справку с места работы *
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  required={isAlreadyMember}
                  className="w-full text-sm font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition cursor-pointer"
                  onChange={(e) => setPassFile(e.target.files?.[0] || null)}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">
                Прикрепить удостоверение личности (PDF или фото) *
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                required
                className="w-full text-sm font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition cursor-pointer"
                onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
              />
              <p className="text-[10px] text-gray-400 mt-1 mb-2 font-medium">Максимальный размер файла: 20 МБ</p>
            </div>
            
          </div>

          <div className="mt-6 mb-4 flex items-start gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <input
              type="checkbox"
              id="dataProcessing"
              required
              className="mt-0.5 w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="dataProcessing" className="text-xs font-medium text-gray-600 cursor-pointer leading-tight">
              Я даю согласие на сбор и обработку моих персональных данных.
            </label>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-bold mt-2 shadow-lg transition">
            {loading ? 'Создание заявки и документов...' : 'Отправить заявку'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Уже есть аккаунт? <Link href="/login" className="text-blue-600 font-bold hover:underline">Войти</Link>
        </p>
      </div>

      {loading && !isSigning && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-black text-blue-900 mb-2">Обработка...</h3>
          <p className="text-gray-600 font-medium text-center max-w-sm">
            Пожалуйста, подождите. Создаем документ и сохраняем данные.
          </p>
        </div>
      )}

      {isSigning && qrCodeDataUrl && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full flex flex-col items-center text-center border border-gray-100">
            <h3 className="text-xl font-black text-blue-900 mb-2">Подпишите документ</h3>
            <p className="text-sm text-gray-600 mb-6">
              Отсканируйте этот QR-код через приложение <b>eGov Mobile</b> для подписания заявлений.
            </p>
            
            <div className="bg-white p-2 rounded-xl shadow-inner border border-gray-100 mb-6">
              <img src={qrCodeDataUrl} alt="eGov QR Code" className="w-48 h-48" />
            </div>

            <p className="text-xs text-gray-500 mb-4">Ожидание подписания...</p>
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>

            <div className="flex flex-col gap-2 w-full">
              <a href={eGovMobileLink} target="_blank" rel="noopener noreferrer" className="text-sm font-bold bg-blue-50 text-blue-700 py-2 rounded-lg hover:bg-blue-100 transition">
                Открыть в eGov Mobile
              </a>
              <a href={eGovBusinessLink} target="_blank" rel="noopener noreferrer" className="text-sm font-bold bg-gray-50 text-gray-700 py-2 rounded-lg hover:bg-gray-100 transition">
                Открыть в eGov Business
              </a>
            </div>
            <button onClick={() => { setIsSigning(false); setLoading(false); }} className="mt-6 text-sm text-red-500 font-bold hover:underline">
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}