'use client';

import { useEffect, useState, useRef } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SignatureCanvas from 'react-signature-canvas';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [tabelNumber, setTabelNumber] = useState(''); // НОВОЕ ПОЛЕ
  const [isPilot, setIsPilot] = useState(false); // НОВОЕ ПОЛЕ

  const [idCardFile, setIdCardFile] = useState<File | null>(null); 
  const [passFile, setPassFile] = useState<File | null>(null); // Для уже состоящих

  const [isAlreadyMember, setIsAlreadyMember] = useState(false);
  const [joinDate, setJoinDate] = useState(''); 

  const sigCanvas = useRef<SignatureCanvas>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');

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
      setError('Необходимо прикрепить фото пропуска');
      setLoading(false);
      return;
    }

    if (!isAlreadyMember && sigCanvas.current?.isEmpty()) {
      setError('Пожалуйста, поставьте подпись в соответствующем поле');
      setLoading(false);
      return;
    }

    try {
      // Подготовка подписи и генерация PDF для НОВЫХ участников
      let generatedStatementBlob: Blob | null = null;
      let generatedDeductionBlob: Blob | null = null;

      if (!isAlreadyMember) {
        const sigUrl = sigCanvas.current!.getTrimmedCanvas().toDataURL('image/png');
        setSignatureDataUrl(sigUrl);
        
        // Даем React время отрендерить картинку подписи в скрытом шаблоне
        await new Promise(r => setTimeout(r, 200));

        // Генерация Заявления на вступление
        const membershipEl = document.getElementById('membership-template');
        if (membershipEl) {
          const canvas = await html2canvas(membershipEl, { scale: 1.5 });
          const pdf = new jsPDF('p', 'mm', 'a4');
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
          generatedStatementBlob = pdf.output('blob');
        }

        // Генерация Заявления на удержание
        const deductionEl = document.getElementById('deduction-template');
        if (deductionEl) {
          const canvas = await html2canvas(deductionEl, { scale: 1.5 });
          const pdf = new jsPDF('p', 'mm', 'a4');
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
          generatedDeductionBlob = pdf.output('blob');
        }
      }

      // Регистрация в Firebase
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      let statementUrl = '';
      if (isAlreadyMember && passFile) {
        const storageRef = ref(storage, `registration_statements/${user.uid}_pass_${passFile.name}`);
        await uploadBytes(storageRef, passFile);
        statementUrl = await getDownloadURL(storageRef);
      } else if (generatedStatementBlob) {
        const storageRef = ref(storage, `registration_statements/${user.uid}_statement.pdf`);
        await uploadBytes(storageRef, generatedStatementBlob);
        statementUrl = await getDownloadURL(storageRef);
      }

      let deductionUrl = '';
      if (!isAlreadyMember && generatedDeductionBlob) {
        const storageRef = ref(storage, `deductions/${user.uid}_deduction.pdf`);
        await uploadBytes(storageRef, generatedDeductionBlob);
        deductionUrl = await getDownloadURL(storageRef);
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
        deductionUrl: deductionUrl,
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
            text: `🆕 <b>Новая заявка на вступление!</b>\n\n👤 <b>ФИО:</b> ${name}\n💼 <b>Должность:</b> ${position}\n📞 <b>Телефон:</b> ${phone}\n✉️ <b>Email:</b> ${email}\n🔰 <b>Уже в профсоюзе:</b> ${isAlreadyMember ? `Да (с ${joinDate || 'не указано'})` : 'Нет'}${statementUrl ? `\n\n📎 <a href="${statementUrl}">${isAlreadyMember ? 'Пропуск' : 'Заявление на вступление'}</a>` : ''}${deductionUrl ? `\n📎 <a href="${deductionUrl}">Заявление на удержание</a>` : ''}${idCardUrl ? `\n📎 <a href="${idCardUrl}">Уд. личности</a>` : ''}`
          })
        });
      } catch (tgError) {
        console.error('Telegram notification failed:', tgError);
      }

      // Отправка письма бухгалтеру (только для новых членов)
      if (!isAlreadyMember && deductionUrl) {
        try {
          const token = await user.getIdToken();
          await fetch('/api/send-accounting-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              userEmail: email,
              userName: name,
              phone: phone,
              position: position,
              category: 'Новое вступление',
              deductionUrl: deductionUrl
            })
          });
        } catch (accError) {
          console.error('Accounting email failed:', accError);
        }
      }

      router.push('/');
    } catch (err: unknown) {
      console.error(err);
      const errorObj = err as { code?: string };
      if (errorObj.code === 'auth/email-already-in-use') setError('Email уже занят.');
      else setError('Произошла ошибка при регистрации.');
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
            Обязуюсь произвести оплату вступительного и членских взносов, а так же признавать и выполнять Устав Объединения.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '40px', fontSize: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Подпись</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', height: '60px', position: 'relative' }}>
                {signatureDataUrl && <img src={signatureDataUrl} alt="signature" style={{ position: 'absolute', bottom: '0', left: '0', maxHeight: '100px', maxWidth: '200px' }} />}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Подпись</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', height: '60px', position: 'relative' }}>
                {signatureDataUrl && <img src={signatureDataUrl} alt="signature" style={{ position: 'absolute', bottom: '0', left: '0', maxHeight: '100px', maxWidth: '200px' }} />}
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
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">ФИО</label>
            <input type="text" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Имя Фамилия" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1">Должность</label>
            <input type="text" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="Ваша должность" value={position} onChange={(e) => setPosition(e.target.value)} />
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
            <input type="password" required className="w-full px-4 py-2 border rounded-lg text-black" placeholder="******" value={password} onChange={(e) => setPassword(e.target.value)} />
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
                    Ваша электронная подпись *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Распишитесь пальцем в поле ниже. Эта подпись будет автоматически добавлена в ваши заявления (на вступление и удержание).
                  </p>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden">
                    <SignatureCanvas 
                      ref={sigCanvas} 
                      penColor="black"
                      canvasProps={{ className: 'w-full h-40 cursor-crosshair' }} 
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => sigCanvas.current?.clear()} 
                    className="text-xs font-bold text-blue-600 mt-2 hover:underline"
                  >
                    Очистить подпись
                  </button>
                </div>
              </>
            )}

            {isAlreadyMember && (
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Прикрепить фото пропуска *
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
              <p className="text-[10px] text-gray-400 mt-1 mb-2 font-medium">Максимальный размер файла: 5 МБ</p>
            </div>
            
          </div>

          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-bold mt-4 shadow-lg transition">
            {loading ? 'Создание заявки и документов...' : 'Отправить заявку'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Уже есть аккаунт? <Link href="/login" className="text-blue-600 font-bold hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  );
}