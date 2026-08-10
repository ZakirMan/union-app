'use client';

import { useState, useEffect, useRef } from 'react';
import { auth, db, storage, messaging } from '@/lib/firebase';
import { getToken } from 'firebase/messaging';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut, deleteUser } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, getDocs, query, where, updateDoc, arrayUnion, deleteDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';
import SignatureCanvas from 'react-signature-canvas';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Home, ClipboardList, BarChart3, FolderOpen, User as UserIcon, Shield, Bell, ChevronLeft, ChevronRight, Edit2, Palmtree, LogOut, Save, Camera } from 'lucide-react';
import PaxCalculatorModal from '@/components/PaxCalculatorModal';
import CateringCalculatorModal from '@/components/CateringCalculatorModal';
import AirportInfoModal from '@/components/AirportInfoModal';

// --- ТИПЫ ДАННЫХ ---
interface DelegationRequest {
  id: string; fromId: string; fromName: string; toId: string; toName: string; docUrl?: string; createdAt: string;
  status: 'pending' | 'approved' | 'rejected'; conferenceId?: string;
}

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  position: string;
  role: string;
  status: string;
  photoUrl?: string;
  createdAt?: string;
  isAlreadyMember?: boolean;
  voteWeight?: number;
  delegatedTo?: string;
  delegatedToName?: string;
  delegationStatus?: 'pending' | 'approved';
  delegationConferenceId?: string; // <--- ADDED
  delegatedFrom?: string[];
  category?: string;
  referredBy?: string;
}

interface NewsItem { id: string; title: string; body: string; imageUrl?: string; fileUrl?: string; linkUrl?: string; createdAt: string; requiresResponse?: boolean; responseDeadlineDays?: number; isResponseReceived?: boolean; }
interface LinkItem { id: string; title: string; url: string; }
interface TemplateItem { id: string; title: string; description?: string; fileUrl: string; }
interface RequestItem { id: string; text: string; response?: string; createdAt: string; userId: string; userEmail: string; status: string; fileUrl?: string; }

interface UnionDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface Conference {
  id: string;
  title: string;
  date: string;
}

// --- ИНТЕРФЕЙСЫ ТЕСТОВ ---
interface TestOption { id: string; text: string; isCorrect: boolean; }
interface TestQuestion { id: string; text: string; options: TestOption[]; }
interface Test {
  id: string; title: string; description: string; questions: TestQuestion[];
  createdAt: string; completedBy?: string[];
}

interface Poll {
  id: string;
  question: string;
  targetCategory?: string;
  options: { id: string; text: string; votes: string[] }[];
  createdAt: string;
  expiresAt?: string;
  createdBy: string;
  isActive: boolean;
}

const renderFormattedText = (text: string) => {
  if (!text) return null;
  const regex = /(\*\*.*?\*\*|<b>.*?<\/b>)/g;
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('<b>') && part.endsWith('</b>')) {
          return <strong key={index}>{part.slice(3, -4)}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'resources' | 'profile' | 'polls' | 'reports'>('home');

  // Данные
  const [unionStats, setUnionStats] = useState<any>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [unionDocs, setUnionDocs] = useState<UnionDocument[]>([]); // <--- NEW STATE
  const [tests, setTests] = useState<Test[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]); // <--- POLLS STATE
  const [myRequests, setMyRequests] = useState<RequestItem[]>([]);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [nextConference, setNextConference] = useState<Conference | null>(null);

  // Формы
  const [message, setMessage] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null); // <--- NEW STATE
  const [isSending, setIsSending] = useState(false);
  const [totalMembers, setTotalMembers] = useState(0);

  // Редактирование профиля
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editReferredBy, setEditReferredBy] = useState('');
  const [isSavingReferredBy, setIsSavingReferredBy] = useState(false);

  // Делегирование (обновленные стейты для поиска)
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [selectedDelegateId, setSelectedDelegateId] = useState('');
  const [incomingDelegations, setIncomingDelegations] = useState<DelegationRequest[]>([]); // <--- ADDED
  const [delegateFile, setDelegateFile] = useState<File | null>(null);
  const [isSubmittingDelegation, setIsSubmittingDelegation] = useState(false);

  // --- НОВЫЕ СТЕЙТЫ ДЛЯ ПОИСКА ---
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Стейты для модалок статистики
  const [selectedMonthStats, setSelectedMonthStats] = useState<{name: string, details: any[]} | null>(null);
  const [selectedAidStats, setSelectedAidStats] = useState<{name: string, details: any[]} | null>(null);

  // Материальная помощь
  const [showAdminRequestModal, setShowAdminRequestModal] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const [showAidModal, setShowAidModal] = useState(false);
  const [showPaxCalculator, setShowPaxCalculator] = useState(false);
  const [showCateringCalculator, setShowCateringCalculator] = useState(false);
  const [showAirportInfo, setShowAirportInfo] = useState(false);
  const [aidCategory, setAidCategory] = useState('');
  const [aidComment, setAidComment] = useState('');
  const [aidIban, setAidIban] = useState('');
  const [aidFile, setAidFile] = useState<File | null>(null);
  const [aidFile2, setAidFile2] = useState<File | null>(null);
  const [isSubmittingAid, setIsSubmittingAid] = useState(false);

  // Уведомления об отпуске
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState('Отпуск без содержания');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveComment, setLeaveComment] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // Выход из профсоюза
  const [showExitSurveyModal, setShowExitSurveyModal] = useState(false);
  const [showExitSignatureModal, setShowExitSignatureModal] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [exitSignatureDataUrl, setExitSignatureDataUrl] = useState('');
  const [isSubmittingExit, setIsSubmittingExit] = useState(false);
  const exitSignaturePad = useRef<any>(null);

  // Тестирование
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [activeTest, setActiveTest] = useState<Test | null>(null);
  const [testAnswers, setTestAnswers] = useState<{ [key: string]: string }>({});
  const [testResult, setTestResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const router = useRouter();

  // --- ЗАГРУЗКА ДАННЫХ ---
  useEffect(() => {
    // Проверка URL параметра для открытия нужной вкладки при переходе из пуш-уведомления
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['home', 'resources', 'profile', 'polls', 'reports'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'reports' && !unionStats && !isStatsLoading && user) {
      setIsStatsLoading(true);
      user.getIdToken().then(token => {
        return fetch('/api/stats', { headers: { 'Authorization': `Bearer ${token}` } });
      }).then(res => res.json()).then(data => {
        if (data.success) {
          setUnionStats(data);
        }
      }).catch(err => console.error('Stats error:', err))
        .finally(() => setIsStatsLoading(false));
    }
  }, [activeTab, user, unionStats, isStatsLoading]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { router.push('/login'); return; }
      setUser(currentUser);

      try {
        let userCategory = 'Все';
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          if (data.status === 'blocked') {
            await auth.signOut();
            router.push('/login');
            return;
          }
          setUserData({ ...data, id: userDoc.id });
          userCategory = data.category || 'Все';
          setEditName(data.displayName || '');
          setEditPhone(data.phoneNumber || '');
        }

        const [lSnap, tSnap, nSnap, uSnap, cSnap, testsSnap, docsSnap, pollsSnap] = await Promise.all([
          getDocs(collection(db, 'links')),
          getDocs(collection(db, 'templates')),
          getDocs(collection(db, 'news')),
          getDocs(query(collection(db, 'users'), where('status', '==', 'approved'))),
          getDocs(collection(db, 'conferences')),
          getDocs(collection(db, 'tests')),
          getDocs(collection(db, 'union_documents')), // <--- NEW FETCH
          getDocs(collection(db, 'polls')) // <--- FETCH POLLS
        ]);

        setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as LinkItem)));
        setTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TemplateItem)));
        setTests(testsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Test)));
        setUnionDocs(docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as UnionDocument))); // <--- SET STATE
        setTotalMembers(uSnap.size);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPolls(pollsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Poll)).filter((p: Poll) => p.isActive && (!p.targetCategory || p.targetCategory === 'Все' || p.targetCategory === userCategory)));

        const newsList = nSnap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem));
        newsList.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setNews(newsList);

        // --- СОРТИРОВКА КОЛЛЕГ ПО АЛФАВИТУ ---
        const usersList = uSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as UserProfile))
          .filter(u => u.id !== currentUser.uid);

        // Сортируем А-Я
        usersList.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

        setColleagues(usersList);

        // Поиск ближайшей конференции
        const now = new Date();
        const confs = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Conference));
        confs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const upcoming = confs.filter(c => new Date(c.date) > now);

        if (upcoming.length > 0) {
          setNextConference(upcoming[0]);
          // FETCH INCOMING DELEGATIONS FOR THIS CONFERENCE
          const qDelegations = query(
            collection(db, 'delegation_requests'),
            where('toId', '==', currentUser.uid),
            where('conferenceId', '==', upcoming[0].id),
            where('status', '==', 'approved')
          );
          const dSnap = await getDocs(qDelegations);
          setIncomingDelegations(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as DelegationRequest)));
        } else if (confs.length > 0) {
          setNextConference(confs[confs.length - 1]);
        }

        const qReq = query(collection(db, 'requests'), where('userId', '==', currentUser.uid));
        const rSnap = await getDocs(qReq);
        const reqs = rSnap.docs.map(d => ({ id: d.id, ...d.data() } as RequestItem));
        reqs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setMyRequests(reqs);

      } catch (e) { console.error(e); } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [router]);

  const handleDeleteRequest = async (id: string) => {
    if (!confirm('Удалить обращение?')) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      setMyRequests(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
      alert('Ошибка при удалении');
    }
  };

  // --- PUSH NOTIFICATIONS ---
  useEffect(() => {
    const registerPush = async () => {
      if (!user || !messaging) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // ⚠️ ВАЖНО: Сюда нужно вставить ваш VAPID Key из Firebase Console -> Cloud Messaging -> Web Configuration
          // Если ключа нет, генерация токена может упасть с ошибкой "Missing or incorrect vapidKey".
          const token = await getToken(messaging, {
            vapidKey: "BN83lUJyga9MEurnzCEDvPpprD2qxsqmkTGWs0ZLC9osteGB0fEFtEevApmBgNZwcZ-gMr8vPHYCns3GsLGc4Xw"
          });

          if (token) {
            await updateDoc(doc(db, 'users', user.uid), {
              fcmTokens: arrayUnion(token)
            });
            console.log('Push token saved:', token);
          }
        }
      } catch (err) {
        console.warn('Push notification error:', err);
      }
    };
    registerPush();
  }, [user]);

  const handleLogout = async () => { await signOut(auth); router.push('/'); };

  const getDelegationState = () => {
    if (!nextConference) return { isOpen: false, message: 'Нет запланированных конференций' };
    const confDate = new Date(nextConference.date);
    const now = new Date();
    const openDate = new Date(confDate);
    openDate.setDate(confDate.getDate() - 30);

    if (now > confDate) return { isOpen: false, message: 'Конференция уже началась или прошла' };
    if (now < openDate) return { isOpen: false, message: `Делегирование откроется ${openDate.toLocaleDateString()}` };
    return { isOpen: true, message: `Открыто до ${confDate.toLocaleDateString()}` };
  };

  const delegationState = getDelegationState();

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !chatFile) || !user) return; // Allow sending if at least file OR text is present
    setIsSending(true);
    try {
      let fileUrl = '';
      if (chatFile) {
        const storageRef = ref(storage, `requests/${user.uid}_${Date.now()}_${chatFile.name}`);
        await uploadBytes(storageRef, chatFile);
        fileUrl = await getDownloadURL(storageRef);
      }

      const newReqData = {
        userId: user.uid,
        userEmail: user.email || '',
        text: message,
        fileUrl, // <--- SAVE URL
        status: 'new',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'requests'), newReqData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyRequests([{ ...newReqData, id: docRef.id } as any, ...myRequests]);
      setMessage('');
      setChatFile(null); // Reset file

      // Загрузка файла на Google Drive
      if (fileUrl) {
        try {
          const token = await user.getIdToken();
          await fetch('/api/upload-to-drive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              userName: userData?.displayName || user.email,
              files: [{ url: fileUrl, type: 'appeal' }]
            })
          });
        } catch (err) { console.error('Drive upload failed:', err); }
      }

      // Отправляем уведомление в Telegram группу совета
      try {
        const token = await user.getIdToken();
        await fetch('/api/send-telegram', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            text: `💬 <b>Новое обращение!</b>\n\n👤 <b>От:</b> ${userData?.displayName || user.email}\n📧 <b>Email:</b> ${user.email}\n\n📝 <b>Текст:</b>\n${message}${fileUrl ? `\n\n📎 <a href="${fileUrl}">Прикрепленный файл</a>` : ''}`
          })
        });
      } catch (tgError) {
        console.error('Telegram notification failed:', tgError);
      }

      alert('Обращение отправлено!');
    } catch { alert('Ошибка'); } finally { setIsSending(false); }
  };

  const handleSendAidRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aidCategory || !user) {
      alert('Выберите категорию');
      return;
    }
    setIsSubmittingAid(true);
    try {
      let fileUrl = '';
      if (aidFile) {
        const storageRef = ref(storage, `requests/${user.uid}_${Date.now()}_${aidFile.name}`);
        await uploadBytes(storageRef, aidFile);
        fileUrl = await getDownloadURL(storageRef);
      }
      let fileUrl2 = '';
      if (aidFile2) {
        const storageRef2 = ref(storage, `requests/${user.uid}_${Date.now()}_${aidFile2.name}`);
        await uploadBytes(storageRef2, aidFile2);
        fileUrl2 = await getDownloadURL(storageRef2);
      }

      const text = `Запрос материальной помощи: ${aidCategory}${aidComment ? '\nКомментарий: ' + aidComment : ''}${aidIban ? '\nIBAN: ' + aidIban : ''}`;
      const newReqData = {
        userId: user.uid,
        userEmail: user.email || '',
        text,
        fileUrl,
        fileUrl2,
        status: 'new',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'requests'), newReqData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyRequests([{ ...newReqData, id: docRef.id } as any, ...myRequests]);
      
      setShowAidModal(false);
      setAidCategory('');
      setAidComment('');
      setAidIban('');
      setAidFile(null);
      setAidFile2(null);
      alert('Запрос на материальную помощь отправлен!');

      // Загрузка файла на Google Drive
      if (fileUrl || fileUrl2) {
        try {
          const filesToUpload = [];
          if (fileUrl) filesToUpload.push({ url: fileUrl, type: 'aid' });
          if (fileUrl2) filesToUpload.push({ url: fileUrl2, type: 'aid' });
          
          const token = await user.getIdToken();
          await fetch('/api/upload-to-drive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              userName: userData?.displayName || user.email,
              files: filesToUpload
            })
          });
        } catch (err) { console.error('Drive upload failed:', err); }
      }

      try {
        const token = await user.getIdToken();
        await fetch('/api/send-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ text: `💰 <b>Запрос материальной помощи!</b>\n\n👤 <b>От:</b> ${userData?.displayName || user.email}\n📧 <b>Email:</b> ${user.email}\n\n🏷️ <b>Категория:</b> ${aidCategory}${aidComment ? '\n📝 <b>Комментарий:</b> ' + aidComment : ''}${aidIban ? '\n🏦 <b>IBAN:</b> ' + aidIban : ''}${fileUrl ? `\n\n📎 <a href="${fileUrl}">Свидетельство о смерти / Документ 1</a>` : ''}${fileUrl2 ? `\n📎 <a href="${fileUrl2}">Свидетельство о рождении (родство)</a>` : ''}` })
        });
      } catch (err) { console.error(err); }

    } catch (err) {
      console.error(err);
      alert('Ошибка при отправке.');
    } finally {
      setIsSubmittingAid(false);
    }
  };

  const handleSendLeaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStartDate || !user) {
      alert('Укажите дату начала');
      return;
    }
    setIsSubmittingLeave(true);
    try {
      let finalEndDate = leaveEndDate;
      if (leaveType === 'Декретный отпуск' && !finalEndDate) {
        const start = new Date(leaveStartDate);
        start.setFullYear(start.getFullYear() + 1);
        finalEndDate = start.toISOString().split('T')[0];
      }

      const text = `Уведомление об отпуске: ${leaveType}\nС ${leaveStartDate}${finalEndDate ? ' по ' + finalEndDate : ''}${leaveComment ? '\nКомментарий: ' + leaveComment : ''}`;
      
      // Создаем обращение
      const newReqData = {
        userId: user.uid,
        userEmail: user.email || '',
        text,
        fileUrl: '',
        status: 'new',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'requests'), newReqData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyRequests([{ ...newReqData, id: docRef.id } as any, ...myRequests]);

      // Автоматически обновляем статус пользователя
      await updateDoc(doc(db, 'users', user.uid), {
        leaveStatus: leaveType === 'Декретный отпуск' ? 'maternity' : 'unpaid',
        leaveStartDate,
        leaveEndDate: finalEndDate
      });

      setShowLeaveModal(false);
      setLeaveStartDate('');
      setLeaveEndDate('');
      setLeaveComment('');
      alert('Уведомление отправлено и статус обновлен!');

      // Отправляем уведомление в Telegram
      try {
        const token = await user.getIdToken();
        await fetch('/api/send-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            text: `🏖️ <b>Уведомление об отпуске / декрете!</b>\n\n👤 <b>От:</b> ${userData?.displayName || user.email}\n📧 <b>Email:</b> ${user.email}\n\n📝 <b>Детали:</b>\n${text}`
          })
        });
      } catch (tgError) {
        console.error('Telegram notification failed:', tgError);
      }
    } catch { alert('Ошибка'); } finally { setIsSubmittingLeave(false); }
  };

  const handleClearExitSignature = () => {
    if (exitSignaturePad.current) {
      exitSignaturePad.current.clear();
      setExitSignatureDataUrl('');
    }
  };

  const handleSaveExitSignature = () => {
    if (exitSignaturePad.current && !exitSignaturePad.current.isEmpty()) {
      setExitSignatureDataUrl(exitSignaturePad.current.getTrimmedCanvas().toDataURL('image/png'));
    }
  };

  const handleSendExitRequest = async () => {
    if (!user || !userData) return;
    if (!exitReason) {
      alert('Пожалуйста, укажите причину выхода.');
      return;
    }
    if (!exitSignatureDataUrl) {
      alert('Пожалуйста, поставьте подпись.');
      return;
    }

    setIsSubmittingExit(true);
    try {
      // Генерация Заявления на выход
      const exitEl = document.getElementById('exit-membership-template');
      let exitStatementUrl = '';
      if (exitEl) {
        exitEl.style.left = '0';
        const canvas = await html2canvas(exitEl, { scale: 1, useCORS: true, logging: false });
        exitEl.style.left = '-9999px';
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        
        const blob = pdf.output('blob');
        const fileRef = ref(storage, `exit_statements/${user.uid}_exit.pdf`);
        await uploadBytes(fileRef, blob);
        exitStatementUrl = await getDownloadURL(fileRef);
      }

      // Генерация Заявления на прекращение удержания
      const exitDedEl = document.getElementById('exit-deduction-template');
      let exitDeductionUrl = '';
      if (exitDedEl) {
        exitDedEl.style.left = '0';
        const canvas = await html2canvas(exitDedEl, { scale: 1, useCORS: true, logging: false });
        exitDedEl.style.left = '-9999px';
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        
        const blob = pdf.output('blob');
        const fileRef = ref(storage, `exit_statements/${user.uid}_stop_deduction.pdf`);
        await uploadBytes(fileRef, blob);
        exitDeductionUrl = await getDownloadURL(fileRef);
      }

      const text = `Заявление на выход из профсоюза.\nПричина: ${exitReason}`;
      const newReqData = {
        userId: user.uid,
        userEmail: user.email || '',
        text,
        fileUrl: exitStatementUrl,
        additionalFileUrl: exitDeductionUrl,
        status: 'new',
        createdAt: new Date().toISOString(),
        isExitRequest: true
      };
      
      const docRef = await addDoc(collection(db, 'requests'), newReqData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyRequests([{ ...newReqData, id: docRef.id } as any, ...myRequests]);

      setShowExitSurveyModal(false);
      setShowExitSignatureModal(false);
      setExitReason('');
      handleClearExitSignature();

      alert('Ваше заявление на выход отправлено администратору.');

      // Отправляем уведомление в Telegram
      try {
        const token = await user.getIdToken();
        await fetch('/api/send-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            text: `⚠️ <b>Заявление на выход из профсоюза!</b>\n\n👤 <b>От:</b> ${userData?.displayName || user.email}\n📧 <b>Email:</b> ${user.email}\n\n📝 <b>Причина:</b>\n${exitReason}\n\n📎 <a href="${exitStatementUrl}">Заявление на выход</a>\n📎 <a href="${exitDeductionUrl}">Остановка удержаний</a>`
          })
        });
      } catch (tgError) {
        console.error('Telegram notification failed:', tgError);
      }

    } catch (e) {
      console.error(e);
      alert('Ошибка при формировании заявления');
    } finally {
      setIsSubmittingExit(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !userData) return;
    setIsSavingProfile(true);
    try {
      let photoUrl = userData.photoUrl;
      if (editFile) {
        try {
          const options = {
            maxSizeMB: 0.2, // ~200KB
            maxWidthOrHeight: 500,
            useWebWorker: true
          };
          const compressedFile = await imageCompression(editFile, options);
          const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);
          await uploadBytes(storageRef, compressedFile);
          photoUrl = await getDownloadURL(storageRef);
        } catch (error) {
          console.error("Compression error:", error);
          alert('Ошибка сжатия изображения. Попробуйте другое фото.');
          setIsSavingProfile(false);
          return;
        }
      }
      await updateDoc(doc(db, 'users', user.uid), { displayName: editName, phoneNumber: editPhone, photoUrl });
      setUserData({ ...userData, displayName: editName, phoneNumber: editPhone, photoUrl });
      setIsEditing(false); setEditFile(null);
    } catch { alert('Ошибка'); } finally { setIsSavingProfile(false); }
  };

  const handleSaveReferredBy = async () => {
    if (!user || !userData || !editReferredBy.trim()) return;
    setIsSavingReferredBy(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { referredBy: editReferredBy.trim() });
      setUserData({ ...userData, referredBy: editReferredBy.trim() });
      alert('Сохранено успешно!');
    } catch { alert('Ошибка при сохранении'); } finally { setIsSavingReferredBy(false); }
  };


  const handleRevokeDelegation = async () => {
    if (!user || !userData) return;
    if (!confirm('Вы уверены, что хотите отозвать свой голос?')) return;

    try {
      // 1. Находим активную заявку
      const q = query(
        collection(db, 'delegation_requests'),
        where('fromId', '==', user.uid)
      );
      const snap = await getDocs(q);

      const batch = [];
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'delegation_requests', d.id));
      }

      // 2. Обновляем профиль пользователя
      await updateDoc(doc(db, 'users', user.uid), {
        delegationStatus: deleteField(),
        delegatedTo: deleteField(),
        delegatedToName: deleteField(),
        delegationConferenceId: deleteField()
      });

      setUserData({
        ...userData,
        delegationStatus: undefined,
        delegatedTo: undefined,
        delegatedToName: undefined,
        delegationConferenceId: undefined
      });

      alert('Голос отозван.');
    } catch (e) {
      console.error(e);
      alert('Ошибка при отзыве голоса');
    }
  };

  const handleSubmitDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDelegateId) {
      alert('Пожалуйста, выберите коллегу из списка');
      return;
    }
    if (!nextConference) {
      alert('Нет активного собрания');
      return;
    }

    setIsSubmittingDelegation(true);
    try {
      let docUrl = '';
      if (delegateFile) {
        const docRef = ref(storage, `delegations/${user.uid}_${Date.now()}`);
        await uploadBytes(docRef, delegateFile);
        docUrl = await getDownloadURL(docRef);
      }
      const delegateUser = colleagues.find(c => c.id === selectedDelegateId);

      await addDoc(collection(db, 'delegation_requests'), {
        fromId: user.uid,
        fromName: userData?.displayName,
        toId: selectedDelegateId,
        toName: delegateUser?.displayName,
        conferenceId: nextConference.id, // <--- SAVE ID
        conferenceTitle: nextConference.title,
        docUrl,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      await updateDoc(doc(db, 'users', user.uid), {
        delegationStatus: 'pending',
        delegatedToName: delegateUser?.displayName,
        delegationConferenceId: nextConference.id // <--- SAVE ID
      });

      setUserData(prev => prev ? ({
        ...prev,
        delegationStatus: 'pending',
        delegatedToName: delegateUser?.displayName,
        delegationConferenceId: nextConference.id
      }) : null);

      setShowDelegateModal(false);
      alert('Заявка отправлена.');
    } catch { alert('Ошибка'); } finally { setIsSubmittingDelegation(false); }
  };

  // --- ЛОГИКА ТЕСТИРОВАНИЯ ---
  const handleStartTest = (test: Test) => {
    setActiveTest(test);
    setTestAnswers({});
    setTestResult(null);
    setCurrentQuestionIndex(0);
  };

  const handleNextQuestion = () => {
    if (!activeTest) return;
    if (currentQuestionIndex < activeTest.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleSubmitTest = async () => {
    if (!activeTest || !user) return;

    let correctCount = 0;
    activeTest.questions.forEach(q => {
      const selectedOptionId = testAnswers[q.id];
      const correctOption = q.options.find(o => o.isCorrect);
      if (selectedOptionId === correctOption?.id) {
        correctCount++;
      }
    });

    // Требуем 75% правильность
    const passed = (correctCount / activeTest.questions.length) >= 0.75;

    setTestResult({ score: correctCount, passed });

    if (passed) {
      try {
        await updateDoc(doc(db, 'tests', activeTest.id), {
          completedBy: arrayUnion(user.uid)
        });
        setTests(prev => prev.map(t => t.id === activeTest.id ? { ...t, completedBy: [...(t.completedBy || []), user.uid] } : t));
        // alert('Результат сохранен!'); // Убрал alert, так как показываем результат в модалке
      } catch (e) {
        console.error(e);
        alert('Ошибка при сохранении результата');
      }
    }
  };


  const handleVote = async (pollId: string, optionId: string) => {
    if (!user) return;
    if (!confirm('Вы уверены, что хотите выбрать этот вариант ответа? Это действие нельзя отменить.')) return;
    try {
      const poll = polls.find(p => p.id === pollId);
      if (!poll) return;

      const newOptions = poll.options.map(opt => {
        if (opt.id === optionId) {
          return { ...opt, votes: [...opt.votes, user.uid] };
        }
        return opt;
      });

      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options: newOptions } : p));

      await updateDoc(doc(db, 'polls', pollId), {
        options: newOptions
      });

    } catch (e) {
      console.error(e);
      alert('Ошибка при голосовании');
    }
  };

  // --- ФИЛЬТРАЦИЯ ДЛЯ ПОИСКА ---
  const filteredColleagues = colleagues.filter(c =>
    c.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Загрузка...</div>;
  
  if (!userData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F2F6FF] p-6 text-center font-sans">
        <h2 className="text-2xl font-black text-gray-800 mb-2">Профиль не найден</h2>
        <p className="text-sm font-bold text-gray-500 mb-6 max-w-sm">
          Возможно, ваша заявка была отклонена. Вы можете удалить этот аккаунт, чтобы подать заявку заново с правильными данными.
        </p>
        <button 
          onClick={async () => {
            if (confirm('Вы уверены, что хотите удалить этот аккаунт и начать регистрацию заново?')) {
              try {
                if (auth.currentUser) await deleteUser(auth.currentUser);
                router.push('/register');
              } catch (e) {
                alert('В целях безопасности перед удалением необходимо заново войти в аккаунт. Сейчас вы будете перенаправлены на страницу входа.');
                await signOut(auth);
                router.push('/login');
              }
            }
          }}
          className="bg-red-50 text-red-500 border border-red-200 font-black px-6 py-3 rounded-xl shadow-sm hover:bg-red-100 transition"
        >
          Удалить аккаунт и начать заново
        </button>
        <button onClick={() => signOut(auth)} className="mt-6 text-sm font-bold text-gray-400 hover:text-gray-600 transition underline">
          Выйти из аккаунта
        </button>
      </div>
    );
  }

  if (userData?.status === 'frozen') {
    return (
      <div className="min-h-screen bg-[#F2F6FF] font-sans text-[#1A1A1A] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center border border-orange-100">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">❄️</div>
          <h2 className="text-2xl font-black text-gray-900 mb-4">Аккаунт временно заморожен</h2>
          <p className="text-gray-500 font-medium mb-8 leading-relaxed">
            Ваш аккаунт временно приостановлен. Если вы считаете, что произошла ошибка, или вы вернулись из отпуска/декрета, пожалуйста, обратитесь в бухгалтерию или к администратору для восстановления доступа.
          </p>
          <button onClick={() => signOut(auth)} className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all">
            Выйти из аккаунта
          </button>
        </div>
      </div>
    );
  }

  if (userData?.status === 'pending') return <div className="p-10 text-center">Ожидание подтверждения</div>;

  return (
    <div className="min-h-screen bg-[#F2F6FF] font-sans text-[#1A1A1A] pb-32">

      {/* HEADER */}
      {activeTab !== 'profile' && (
        <div className="bg-blue-600 text-white pt-6 pb-5 px-6 rounded-b-3xl shadow-md sticky top-0 z-30 mb-8 border-b border-blue-500/30">
          <div className="max-w-2xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md shadow-inner border border-white/20">
                <Shield size={20} className="text-white" strokeWidth={2.5} />
              </div>
              <h1 className="text-2xl font-black tracking-tight">{ { home: 'Главная', polls: 'Опросы', resources: 'Ресурсы', reports: 'Отчеты', profile: 'Профиль' }[activeTab] }</h1>
            </div>
            <div className="flex gap-2 items-center">
              {userData?.role === 'admin' && (
                <button
                  onClick={() => router.push('/admin')}
                  className="bg-white/15 hover:bg-white/25 backdrop-blur-md px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border border-white/10"
                >
                  Админ →
                </button>
              )}
              <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center backdrop-blur-sm shadow-inner cursor-pointer hover:bg-white/25 active:scale-95 transition-all border border-white/10 shrink-0">
                <Bell size={18} className="text-white" strokeWidth={2.5} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-5">

        {/* НОВОСТИ */}

        {activeTab === 'home' && (
          <div className="space-y-6 pb-24 animate-fade-in-up">
            
            {/* Top Widgets */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button onClick={() => setShowAidModal(true)} className="relative overflow-hidden bg-gradient-to-br from-emerald-400 to-teal-500 p-3 sm:p-4 rounded-[1.25rem] shadow-lg shadow-teal-200 flex flex-col items-center justify-center text-center hover:-translate-y-1 transition duration-300 h-28 group">
                <div className="absolute -right-2 -bottom-2 text-5xl opacity-20 group-hover:scale-110 transition-transform rotate-12 pointer-events-none">🤝</div>
                <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-base mb-2 text-white shadow-inner relative z-10">
                  💖
                </div>
                <span className="font-black text-white text-[10px] sm:text-xs leading-tight relative z-10">Мат.<br/>помощь</span>
              </button>
              
              <button onClick={() => setShowAdminRequestModal(true)} className="relative overflow-hidden bg-gradient-to-br from-indigo-400 to-blue-500 p-3 sm:p-4 rounded-[1.25rem] shadow-lg shadow-blue-200 flex flex-col items-center justify-center text-center hover:-translate-y-1 transition duration-300 h-28 group">
                <div className="absolute -right-2 -bottom-2 text-5xl opacity-20 group-hover:scale-110 transition-transform -rotate-12 pointer-events-none">💬</div>
                <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-base mb-2 text-white shadow-inner relative z-10">
                  👨‍💻
                </div>
                <span className="font-black text-white text-[10px] sm:text-xs leading-tight relative z-10">Вопрос<br/>админу</span>
              </button>

              <button onClick={() => setShowTrainingModal(true)} className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-fuchsia-600 p-3 sm:p-4 rounded-[1.25rem] shadow-lg shadow-purple-200 flex flex-col items-center justify-center text-center hover:-translate-y-1 transition duration-300 h-28 group">
                <div className="absolute -right-2 -bottom-2 text-5xl opacity-20 group-hover:scale-110 transition-transform -rotate-12 pointer-events-none">🎓</div>
                <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-base mb-2 text-white shadow-inner relative z-10">
                  📚
                </div>
                <span className="font-black text-white text-[10px] sm:text-xs leading-tight relative z-10">Обучение<br/>(Тесты)</span>
              </button>
            </div>
            
            {/* Statistics Widget */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition">
              <div className="mb-4">
                <h3 className="font-black text-gray-800">Новые участники</h3>
              </div>
              
              {(() => {
                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + monthOffset);
                const targetMonth = targetDate.getMonth();
                const targetYear = targetDate.getFullYear();
                
                const mNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
                const monthName = mNames[targetMonth];
                
                let joinedCount = 0;
                let newMembersList: any[] = [];
                colleagues.forEach(c => {
                  if (c.createdAt && c.isAlreadyMember === false) {
                    const d = new Date(c.createdAt);
                    if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
                       joinedCount++;
                       newMembersList.push(c);
                    }
                  }
                });
                if (userData?.createdAt && userData.isAlreadyMember === false) {
                   const d = new Date(userData.createdAt);
                   if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
                       joinedCount++;
                       newMembersList.push(userData);
                   }
                }
                
                return (
                  <div 
                    onClick={() => setSelectedMonthStats({ name: `${monthName} ${targetYear}`, details: newMembersList })}
                    className="flex items-center justify-between bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-2 text-white relative shadow-lg shadow-blue-200 cursor-pointer hover:scale-[1.02] transition-transform overflow-hidden"
                  >
                    <div className="absolute right-[-10px] bottom-[-15px] text-7xl opacity-10 pointer-events-none">🤝</div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setMonthOffset(p => p - 1); }} 
                      className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/25 transition active:scale-95 backdrop-blur-sm z-10"
                    >
                      <ChevronLeft size={24} strokeWidth={2.5} />
                    </button>
                    
                    <div className="text-center z-10 py-3">
                      <div className="text-xs font-bold text-blue-100 mb-1 uppercase tracking-wider">{monthName} {targetYear}</div>
                      <div className="text-3xl font-black">{joinedCount} <span className="text-base opacity-80 font-bold tracking-normal">чел.</span></div>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); setMonthOffset(p => p + 1); }} 
                      disabled={monthOffset >= 0} 
                      className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/25 transition disabled:opacity-30 disabled:hover:bg-white/10 active:scale-95 backdrop-blur-sm z-10"
                    >
                      <ChevronRight size={24} strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Mini-Apps Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-4">
                <h2 className="text-xl font-black text-gray-800">Сервисы</h2>
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">Скоро</span>
              </div>
              
              <div className="flex overflow-x-auto gap-3 sm:gap-4 pb-4 snap-x snap-mandatory -mx-4 px-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {/* Pax Counter App */}
                <button 
                  onClick={() => setShowPaxCalculator(true)}
                  className="shrink-0 snap-start min-w-[150px] sm:min-w-[180px] w-[45%] relative overflow-hidden bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-start text-left group hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-bl from-blue-100 to-transparent rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500 pointer-events-none"></div>
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center text-2xl mb-3 shadow-md shadow-blue-200 text-white group-hover:rotate-12 transition-transform relative z-10">
                    ✈️
                  </div>
                  <h3 className="font-black text-gray-800 text-sm leading-tight mb-1 relative z-10">Пассажиры</h3>
                  <p className="text-[10px] text-gray-500 font-medium leading-tight relative z-10">Калькулятор для ВС</p>
                </button>

                {/* Catering Counter App */}
                <button 
                  onClick={() => setShowCateringCalculator(true)}
                  className="shrink-0 snap-start min-w-[150px] sm:min-w-[180px] w-[45%] relative overflow-hidden bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-start text-left group hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-bl from-orange-100 to-transparent rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500 pointer-events-none"></div>
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center text-2xl mb-3 shadow-md shadow-orange-200 text-white group-hover:-rotate-12 transition-transform relative z-10">
                    🍱
                  </div>
                  <h3 className="font-black text-gray-800 text-sm leading-tight mb-1 relative z-10">Провизия</h3>
                  <p className="text-[10px] text-gray-500 font-medium leading-tight relative z-10">Учет питания и бара</p>
                </button>

                {/* Airport Info App */}
                <button 
                  onClick={() => setShowAirportInfo(true)}
                  className="shrink-0 snap-start min-w-[150px] sm:min-w-[180px] w-[45%] relative overflow-hidden bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-start text-left group hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-bl from-indigo-100 to-transparent rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500 pointer-events-none"></div>
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center text-2xl mb-3 shadow-md shadow-indigo-200 text-white group-hover:scale-110 transition-transform relative z-10">
                    🌍
                  </div>
                  <h3 className="font-black text-gray-800 text-sm leading-tight mb-1 relative z-10">Аэропорты</h3>
                  <p className="text-[10px] text-gray-500 font-medium leading-tight relative z-10">Справочник для PA</p>
                </button>
              </div>
            </div>

            {/* News Feed inside Home */}
            <div>
              <h2 className="text-xl font-black text-gray-800 mb-4 px-2">Новости Профсоюза</h2>
              {news.length === 0 ? (
                <div className="bg-white p-8 rounded-3xl text-center border border-dashed border-gray-200">
                  <p className="text-gray-400 font-bold">Нет новостей</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {news.map((item) => (
                    <div key={item.id} onClick={() => router.push(`/news/${item.id}`)} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:-translate-y-1 transition duration-300">
                      {item.imageUrl && (
                        <div className="w-full h-48 bg-gray-100 rounded-2xl mb-4 overflow-hidden relative">
                          <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                        </div>
                      )}
                      <h3 className="font-black text-gray-900 text-lg mb-2">{item.title}</h3>
                      <p className="text-gray-600 text-sm mb-4 line-clamp-3 whitespace-pre-wrap">{renderFormattedText(item.body)}</p>
                      <div className="flex justify-between items-center text-xs font-bold mt-2 pt-2 border-t border-gray-50">
                        <span className="text-gray-400">{new Date(item.createdAt).toLocaleDateString('ru-RU')}</span>
                        <div className="flex gap-2">
                          {item.fileUrl && (
                            <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition">
                              📄 Вложение
                            </a>
                          )}
                          {item.linkUrl && (
                            <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
                              🔗 Ссылка
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'resources' && (

          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">

            {/* ДОКУМЕНТЫ ПРОФСОЮЗА */}
            {unionDocs.length > 0 && (
              <div>
                <h2 className="font-black text-2xl mb-4 ml-2 text-gray-800">Документы профсоюза</h2>
                <div className="grid gap-3">
                  {unionDocs.map(doc => (
                    <div
                      key={doc.id}
                      onClick={() => window.open(`/documents/${doc.id}`, '_blank')}
                      className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-indigo-100 flex justify-between items-center hover:shadow-md transition cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xl group-hover:bg-indigo-600 group-hover:text-white transition">📜</div>
                        <div>
                          <span className="font-bold text-gray-800 block text-lg">{doc.title}</span>
                          <span className="text-xs text-gray-400 font-bold block mt-0.5">Нажмите, чтобы открыть</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-full text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition">
                        ↗
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SALARY CALCULATOR BUTTON - ONLY FOR CREW */}
            {userData?.category === 'Экипаж' && (
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[2rem] p-8 text-white shadow-lg shadow-blue-200 relative overflow-hidden group cursor-pointer" onClick={() => router.push('/salary-calculator')}>
                <div className="relative z-10">
                  <h2 className="font-black text-2xl mb-2">Калькулятор Зарплаты</h2>
                  <p className="text-blue-100 font-bold text-sm mb-6 opacity-90 max-w-xs">Рассчитайте примерную заработную плату исходя из вашего налета и должности.</p>
                  <button className="bg-white text-blue-600 px-8 py-3 rounded-xl font-black shadow-md hover:bg-blue-50 transition transform group-hover:scale-105">
                    Открыть калькулятор
                  </button>
                </div>
                <div className="absolute -right-6 -bottom-6 text-9xl opacity-20 rotate-12 group-hover:rotate-6 transition-transform duration-500">🧮</div>
              </div>
            )}

            <div>
              <h2 className="font-black text-2xl mb-4 ml-2 text-gray-800">Документация</h2>
              <div className="grid gap-3">
                {templates.map(t => (
                  <div key={t.id} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex justify-between items-center hover:shadow-md transition">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xl">📄</div>
                      <div>
                        <span className="font-bold text-gray-700 block">{t.title}</span>
                        {t.description && <span className="text-xs text-gray-500 font-medium block mt-1 leading-tight max-w-[200px] md:max-w-xs">{t.description}</span>}
                      </div>
                    </div>
                    <a href={t.fileUrl} className="bg-gray-100 hover:bg-orange-50 text-gray-600 hover:text-orange-600 px-4 py-2 rounded-xl font-bold text-sm transition">Скачать</a>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-black text-2xl mb-4 ml-2 text-gray-800">Полезные ссылки</h2>
              <div className="grid gap-3">
                {links.map(l => (
                  <a key={l.id} href={l.url} target="_blank" className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md hover:border-blue-200 transition group">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-xl group-hover:scale-110 transition">🔗</div>
                    <span className="font-bold text-blue-900">{l.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ОБУЧЕНИЕ */}
        {activeTab === 'polls' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {polls.length === 0 && (
              <div className="bg-white p-10 rounded-[2rem] text-center border-2 border-dashed border-gray-200">
                <p className="text-gray-400 font-bold">Нет активных опросов</p>
              </div>
            )}
            {polls.map(poll => {
              const hasVoted = poll.options.some(opt => opt.votes.includes(user?.uid || ''));
              const totalVotes = poll.options.reduce((acc, o) => acc + (o.votes?.length || 0), 0) || 1;

              return (
                <div key={poll.id} className="bg-white p-6 rounded-[2rem] shadow-lg border border-green-50">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-black text-xl text-gray-800 whitespace-pre-wrap">{renderFormattedText(poll.question)}</h3>
                    {hasVoted && <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide">Голос учтен</span>}
                  </div>

                  <div className="space-y-3">
                    {poll.options.map(opt => {
                      const percent = Math.round(((opt.votes?.length || 0) / totalVotes) * 100);
                      const isMyVote = opt.votes.includes(user?.uid || '');

                      return hasVoted ? (
                        // RESULT VIEW
                        <div key={opt.id} className="relative">
                          <div className="flex justify-between text-xs font-bold mb-1 pl-1">
                            <span className={isMyVote ? 'text-green-600' : 'text-gray-600'}>{opt.text} {isMyVote && '(Вы)'}</span>
                            <span className="text-gray-400">{percent}%</span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${isMyVote ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      ) : (
                        // VOTING VIEW
                        <button
                          key={opt.id}
                          onClick={() => handleVote(poll.id, opt.id)}
                          className="w-full text-left p-4 rounded-xl border-2 border-gray-100 hover:border-green-400 hover:bg-green-50 transition-all font-bold text-gray-700 active:scale-[0.99]"
                        >
                          {opt.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ПРОФИЛЬ */}
        {activeTab === 'reports' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {isStatsLoading ? (
              <div className="text-center py-20">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400 font-bold">Загрузка статистики...</p>
              </div>
            ) : unionStats ? (
              <div className="grid md:grid-cols-2 gap-6">
                {/* NEW MEMBERS STATS */}
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-[2rem] shadow-xl text-white p-6 md:p-8 relative group">
                    <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -mr-20 -mt-20 group-hover:bg-white/20 transition-all duration-700"></div>
                    </div>
                    <div className="relative z-10">
                      <h3 className="font-black text-xl mb-2 flex items-center gap-2">
                        <span className="text-2xl">📈</span> Статистика вступлений
                      </h3>
                      <p className="text-blue-100 font-bold text-xs mb-6">Новые члены профсоюза за текущий год ({new Date().getFullYear()}).</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {[
                          { num: '01', name: 'Янв' }, { num: '02', name: 'Фев' }, { num: '03', name: 'Мар' },
                          { num: '04', name: 'Апр' }, { num: '05', name: 'Май' }, { num: '06', name: 'Июн' },
                          { num: '07', name: 'Июл' }, { num: '08', name: 'Авг' }, { num: '09', name: 'Сен' },
                          { num: '10', name: 'Окт' }, { num: '11', name: 'Ноя' }, { num: '12', name: 'Дек' }
                        ].map(m => {
                          const key = `${new Date().getFullYear()}-${m.num}`;
                          const stat = unionStats.newMembersStats[key] || { count: 0 };
                          return (
                            <div 
                              key={m.num} 
                              tabIndex={0} 
                              onClick={() => { if (stat.count > 0 && stat.details && stat.details.length > 0) setSelectedMonthStats({ name: m.name, details: stat.details }); }}
                              className={`bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm transition ${stat.count > 0 && stat.details && stat.details.length > 0 ? 'cursor-pointer hover:bg-white/20 hover:scale-105' : 'cursor-default opacity-50'} outline-none`}
                            >
                              <span className="text-[10px] text-blue-200 font-bold mb-1 uppercase tracking-wider">{m.name}</span>
                              <span className={`text-xl md:text-2xl font-black ${stat.count > 0 ? 'text-white' : 'text-white/30'}`}>{stat.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                {/* AID STATS */}
                <div className="bg-gradient-to-r from-green-500 to-teal-600 rounded-[2rem] shadow-xl text-white p-6 md:p-8 relative group">
                  <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -mr-20 -mt-20 group-hover:bg-white/20 transition-all duration-700"></div>
                  </div>
                  <div className="relative z-10">
                    <h3 className="font-black text-xl mb-2 flex items-center gap-2">
                      <span className="text-2xl">💰</span> Одобренная мат. помощь
                    </h3>
                    <p className="text-green-100 font-bold text-xs mb-6">Сумма и количество одобренных заявок за текущий год ({new Date().getFullYear()}). Наведите на месяц для деталей.</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {[
                        { num: '01', name: 'Янв' }, { num: '02', name: 'Фев' }, { num: '03', name: 'Мар' },
                        { num: '04', name: 'Апр' }, { num: '05', name: 'Май' }, { num: '06', name: 'Июн' },
                        { num: '07', name: 'Июл' }, { num: '08', name: 'Авг' }, { num: '09', name: 'Сен' },
                        { num: '10', name: 'Окт' }, { num: '11', name: 'Ноя' }, { num: '12', name: 'Дек' }
                      ].map(m => {
                        const key = `${new Date().getFullYear()}-${m.num}`;
                        const stat = unionStats.aidStats[key] || { count: 0, amount: 0, pendingCount: 0, details: [] };
                        return (
                          <div 
                            key={m.num} 
                            tabIndex={0} 
                            onClick={() => { if ((stat.count > 0 || stat.pendingCount > 0) && stat.details && stat.details.length > 0) setSelectedAidStats({ name: m.name, details: stat.details }); }}
                            className={`bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm transition ${(stat.count > 0 || stat.pendingCount > 0) ? 'cursor-pointer hover:bg-white/20 hover:scale-105' : 'cursor-default opacity-50'} outline-none`}
                          >
                            <span className="text-[10px] text-green-200 font-bold mb-1 uppercase tracking-wider">{m.name}</span>
                            <span className={`text-sm md:text-[15px] font-black leading-tight ${(stat.count > 0 || stat.pendingCount > 0) ? 'text-white' : 'text-white/30'}`}>
                              {stat.count > 0 ? `${stat.amount.toLocaleString('ru-RU')} ₸` : '0 ₸'}
                            </span>
                            {stat.count > 0 && <span className="text-[9px] text-green-100 font-bold mt-0.5">{stat.count} шт</span>}
                            {stat.pendingCount > 0 && <span className="text-[9px] text-orange-200 font-bold mt-0.5 opacity-80">+ {stat.pendingCount} ожид.</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === 'profile' && userData && (
          <div className="animate-in fade-in slide-in-from-bottom-8 pt-6">

            {/* Profile Header Card */}
            <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-gray-100/50 relative overflow-hidden text-center mb-6 group">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-white to-white opacity-80 pointer-events-none"></div>
              
              <div className="relative z-10 flex flex-col items-center">
                {/* Avatar */}
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-400 to-indigo-500 rounded-full blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500"></div>
                  <div className="w-32 h-32 bg-white rounded-full p-1.5 shadow-xl relative z-10 overflow-hidden group/avatar">
                    <div className="w-full h-full rounded-full overflow-hidden relative bg-gray-50 border border-gray-100">
                      {userData.photoUrl ? (
                        <Image src={userData.photoUrl} alt={userData.displayName} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-gray-100 to-gray-200">👤</div>
                      )}
                    </div>
                    {isEditing && (
                      <label className="absolute inset-1 bg-black/60 flex flex-col items-center justify-center cursor-pointer text-white rounded-full opacity-0 group-hover/avatar:opacity-100 transition-all backdrop-blur-sm z-20">
                        <Camera className="w-6 h-6 mb-1 text-white" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white">Изменить</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => {
                          const f = e.target.files?.[0];
                          if (f && f.size > 10 * 1024 * 1024) {
                            alert('Размер файла не должен превышать 10 МБ');
                            e.target.value = '';
                            return;
                          }
                          setEditFile(f || null);
                        }} />
                      </label>
                    )}
                  </div>
                </div>
                {isEditing && <p className="text-[10px] text-gray-400 mt-[-15px] mb-5 text-center font-medium bg-gray-50 px-3 py-1 rounded-full border border-gray-100">Макс. размер: 10 МБ</p>}

                {!isEditing ? (
                  <>
                    <h2 className="font-black text-2xl sm:text-3xl text-gray-900 mb-2 tracking-tight">{userData.displayName}</h2>
                    
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
                      <span className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold border border-blue-100/50 shadow-sm">
                        {userData.position}
                      </span>
                    </div>

                    <div className="w-full flex flex-col gap-3">
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setIsEditing(true)} 
                          className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 p-4 rounded-2xl font-bold text-sm transition-all flex flex-col items-center justify-center gap-2 border border-gray-200/50 hover:shadow-md hover:-translate-y-0.5 active:scale-95 group/btn"
                        >
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-gray-500 group-hover/btn:text-blue-500 transition-colors">
                            <Edit2 className="w-5 h-5" />
                          </div>
                          Редактировать
                        </button>

                        <button 
                          onClick={() => setShowLeaveModal(true)} 
                          className="flex-1 bg-orange-50/50 hover:bg-orange-50 text-orange-700 p-4 rounded-2xl font-bold text-sm transition-all flex flex-col items-center justify-center gap-2 border border-orange-100 hover:shadow-md hover:-translate-y-0.5 hover:shadow-orange-100 active:scale-95 group/btn"
                        >
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-orange-400 group-hover/btn:text-orange-600 transition-colors">
                            <Palmtree className="w-5 h-5" />
                          </div>
                          Отпуск / Декрет
                        </button>
                      </div>

                      <button 
                        onClick={() => setShowExitSurveyModal(true)} 
                        className="w-full bg-red-50/50 hover:bg-red-50 text-red-600 p-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-3 border border-red-100 hover:shadow-md hover:-translate-y-0.5 hover:shadow-red-100 active:scale-95"
                      >
                        <LogOut className="w-4 h-4" /> Выйти из профсоюза
                      </button>
                    </div>

                    {/* Показ реферальной статистики для активиста (если он кого-то привлек) */}
                    {(() => {
                      const invitedCount = colleagues.filter(c => c.referredBy && c.referredBy.toLowerCase().trim() === userData.displayName.toLowerCase().trim()).length;
                      if (invitedCount > 0) {
                        return (
                          <div className="w-full mt-4 bg-green-50/50 p-4 rounded-2xl border border-green-100 flex flex-col items-center justify-center gap-1">
                            <span className="text-xs text-green-600 font-bold uppercase tracking-wider">Привлечено участников</span>
                            <span className="text-3xl font-black text-green-700">{invitedCount}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Поле для нового участника: Кем приглашен */}
                    {(() => {
                      const joinDateStr = (userData.joinDate || userData.createdAt || '').slice(0, 10);
                      const isEligible = joinDateStr >= '2026-08-10';
                      
                      if (!isEligible) return null;

                      return (
                        <div className="w-full mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-2">
                          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider text-left">Кем приглашен (Активист)</span>
                          {userData.referredBy ? (
                            <div className="text-left font-bold text-gray-800 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                              {userData.referredBy}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <input 
                                className="w-full bg-white p-3 rounded-xl font-medium border border-gray-200 outline-none focus:border-blue-500 text-gray-800 text-sm" 
                                placeholder="ФИО активиста" 
                                value={editReferredBy} 
                                onChange={e => setEditReferredBy(e.target.value)} 
                              />
                              <button 
                                onClick={handleSaveReferredBy}
                                disabled={isSavingReferredBy || !editReferredBy.trim()}
                                className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700 py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                              >
                                {isSavingReferredBy ? 'Сохранение...' : 'Сохранить (без возможности изменения)'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="space-y-4 w-full max-w-xs mx-auto animate-in fade-in zoom-in-95 duration-200">
                    <div className="space-y-3">
                      <input className="w-full bg-white p-4 rounded-2xl font-bold text-center border-2 border-gray-100 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-gray-800" placeholder="Ваше Имя" value={editName} onChange={e => setEditName(e.target.value)} />
                      <input className="w-full bg-white p-4 rounded-2xl font-bold text-center border-2 border-gray-100 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-gray-800" placeholder="Номер телефона" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors active:scale-95">Отмена</button>
                      <button onClick={handleSaveProfile} disabled={isSavingProfile} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                        {isSavingProfile ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Save className="w-5 h-5" />
                            Сохранить
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Блок Делегирования */}
            <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-indigo-50/50 relative overflow-hidden mb-6 group">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-indigo-100/50">
                  🗳️
                </div>
                <h3 className="font-black text-xl text-gray-900 leading-tight">Управление<br/><span className="text-indigo-600">голосом</span></h3>
              </div>

              {nextConference ? (
                <div className="mb-6 bg-gradient-to-r from-indigo-500 to-purple-600 p-6 rounded-[1.5rem] text-white shadow-lg shadow-indigo-200">
                  <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-1">Ближайшее событие</p>
                  <p className="font-black text-xl leading-tight mb-2">{nextConference.title}</p>
                  <p className="text-sm font-bold opacity-80 bg-white/10 inline-block px-3 py-1 rounded-lg">{new Date(nextConference.date).toLocaleString()}</p>
                </div>
              ) : (
                <div className="mb-6 text-center py-4 border-2 border-dashed border-gray-100 rounded-2xl">
                  <p className="text-gray-400 font-bold text-sm">Нет активных событий</p>
                </div>
              )}

              <div className="flex justify-between items-center mb-6 bg-gray-50 p-4 rounded-2xl">
                <span className="font-bold text-gray-500">Сила вашего голоса</span>
                <span className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl font-black text-lg shadow-md">{1 + incomingDelegations.length}</span>
              </div>

              {/* СПИСОК ДОВЕРИВШИХ ГОЛОС */}
              {incomingDelegations.length > 0 && (
                <div className="mb-6 bg-blue-50 p-6 rounded-[1.5rem] border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider mb-2">Вам доверили голос ({incomingDelegations.length})</p>
                  <div className="space-y-2">
                    {incomingDelegations.map(d => (
                      <div key={d.id} className="bg-white p-3 rounded-xl border border-blue-50 flex justify-between items-center">
                        <span className="font-black text-blue-900 text-sm">{d.fromName}</span>
                        <span className="text-[10px] font-bold text-gray-400">{new Date(d.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {/* ЛОГИКА ОТОБРАЖЕНИЯ: Проверяем ID конференции */}
              {userData.delegatedTo && userData.delegationConferenceId === nextConference?.id ? (
                <div className="bg-yellow-50 p-6 rounded-[1.5rem] border border-yellow-100 text-center">
                  <div className="text-3xl mb-2">🤝</div>
                  <p className="text-xs font-black text-yellow-700 uppercase mb-1">Вы передали право голоса</p>
                  <p className="font-black text-gray-900 text-xl mb-4">{userData.delegatedToName}</p>
                  <button onClick={handleRevokeDelegation} className="bg-white text-red-500 text-xs font-bold px-4 py-2 rounded-xl border border-red-100 hover:bg-red-50 transition">Отозвать голос</button>
                </div>
              ) : userData.delegationStatus === 'pending' && userData.delegationConferenceId === nextConference?.id ? (
                <div className="bg-blue-50 p-6 rounded-[1.5rem] border border-blue-100 text-center">
                  <div className="text-3xl mb-2">⏳</div>
                  <p className="font-black text-blue-800">Заявка на рассмотрении</p>
                  <p className="text-xs text-blue-600 font-bold mt-1 mb-4">Ожидайте подтверждения коллеги</p>
                  <button onClick={handleRevokeDelegation} className="bg-white text-red-500 text-xs font-bold px-4 py-2 rounded-xl border border-red-100 hover:bg-red-50 transition">Отменить заявку</button>
                </div>
              ) : (
                delegationState.isOpen ? (
                  <button
                    onClick={() => { setShowDelegateModal(true); setSearchTerm(''); setIsDropdownOpen(false); }}
                    className="w-full py-4 bg-gray-900 text-white rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-black transition-transform active:scale-95"
                  >
                    Делегировать голос
                  </button>
                ) : (
                  <button disabled className="w-full py-4 bg-gray-100 text-gray-400 rounded-[1.5rem] font-bold cursor-not-allowed">
                    {delegationState.message}
                  </button>
                )
              )}

              {userData.delegatedFrom && userData.delegatedFrom.length > 0 && (
                <div className="mt-8">
                  <p className="text-xs font-black text-gray-400 uppercase mb-3 ml-2">Вам доверились ({userData.delegatedFrom.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {userData.delegatedFrom.map((name, idx) => (
                      <span key={idx} className="bg-white border border-green-200 text-green-700 px-3 py-1.5 rounded-xl text-xs font-black shadow-sm">+{name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={handleLogout} className="w-full bg-white text-red-500 font-black py-5 rounded-[2rem] shadow-lg shadow-red-50 hover:bg-red-50 transition mb-6">Выйти из аккаунта</button>
          </div>
        )}
      </div>

      {/* МОДАЛКА ДЕЛЕГИРОВАНИЯ */}
      {
        showDelegateModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm max-h-[90vh] overflow-y-auto p-8 shadow-2xl transform transition-transform scale-100">
              <h3 className="font-black text-2xl mb-2 text-gray-900">Передача голоса</h3>
              <p className="text-sm font-medium text-gray-500 mb-6 leading-relaxed">Выберите коллегу, которому вы доверяете свой голос на предстоящем собрании.</p>

              <form onSubmit={handleSubmitDelegation} className="space-y-5">
                <div className="relative">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-3 mb-1 block">Поиск коллеги</label>
                  <input
                    type="text"
                    placeholder="Введите имя..."
                    className="w-full p-4 bg-gray-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 rounded-2xl font-bold outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsDropdownOpen(true);
                      setSelectedDelegateId('');
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                  />

                  {isDropdownOpen && (
                    <div className="absolute z-20 w-full bg-white border border-gray-100 rounded-2xl mt-2 max-h-48 overflow-y-auto shadow-2xl left-0">
                      {filteredColleagues.length > 0 ? (
                        filteredColleagues.map(c => (
                          <div
                            key={c.id}
                            className="p-4 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                            onClick={() => {
                              setSelectedDelegateId(c.id);
                              setSearchTerm(c.displayName);
                              setIsDropdownOpen(false);
                            }}
                          >
                            <p className="font-bold text-gray-900">{c.displayName}</p>
                            <p className="text-xs font-bold text-gray-400 mt-0.5">{c.position}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-sm font-bold text-gray-400 text-center">Никого не найдено</div>
                      )}
                    </div>
                  )}
                  {selectedDelegateId && !isDropdownOpen && <div className="absolute right-4 top-[34px] text-green-500 text-xl">✅</div>}
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-3 mb-1 block">Документ (если есть)</label>
                  <input type="file" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 5 * 1024 * 1024) {
                      alert('Размер файла не должен превышать 5 МБ');
                      e.target.value = '';
                      return;
                    }
                    setDelegateFile(f || null);
                  }} className="w-full text-xs bg-gray-50 p-3 rounded-xl font-bold text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200" />
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">Максимальный размер: 5 МБ</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowDelegateModal(false)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-gray-200 transition">Отмена</button>
                  <button disabled={isSubmittingDelegation} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition">
                    {isSubmittingDelegation ? '...' : 'Подтвердить'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* МОДАЛКА ТЕСТА */}
      {
        activeTest && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative my-auto animate-in zoom-in-95 duration-200">
              <button onClick={() => setActiveTest(null)} className="absolute top-6 right-6 text-gray-300 hover:text-gray-600 font-bold text-2xl transition">✕</button>

              <h2 className="font-black text-3xl mb-2 pr-8 text-gray-900">{activeTest.title}</h2>
              <p className="text-gray-500 font-medium mb-8 border-b border-gray-100 pb-6">{activeTest.description || 'Пройдите тест, чтобы проверить свои знания.'}</p>

              {testResult ? (
                <div className="text-center py-4">
                  <div className={`text-8xl mb-6 transform transition-transform duration-500 hover:scale-110 ${testResult.passed ? 'text-green-500' : 'text-red-500'}`}>
                    {testResult.passed ? '🎉' : '😕'}
                  </div>
                  <h3 className="font-black text-3xl mb-2 text-gray-900">{testResult.passed ? 'Отличный результат!' : 'Попробуйте еще раз'}</h3>
                  <p className="text-gray-500 font-bold mb-8 text-lg">Вы набрали {testResult.score} из {activeTest.questions.length}</p>
                  <button onClick={() => setActiveTest(null)} className="bg-gray-900 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-black transition w-full">Завершить</button>
                </div>
              ) : (

                <div className="space-y-6">
                  {/* PROGRESS */}
                  <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl mb-2">
                    <span className="font-bold text-gray-500 text-sm">Вопрос {currentQuestionIndex + 1} из {activeTest.questions.length}</span>
                    <div className="flex gap-1">
                      {activeTest.questions.map((_, idx) => (
                        <div key={idx} className={`h-1.5 w-6 rounded-full transition-colors ${idx === currentQuestionIndex ? 'bg-indigo-500' : idx < currentQuestionIndex ? 'bg-green-400' : 'bg-gray-200'}`}></div>
                      ))}
                    </div>
                  </div>

                  {/* QUESTION */}
                  <div>
                    <h3 className="font-black text-2xl mb-6 text-gray-900 leading-tight">{activeTest.questions[currentQuestionIndex].text}</h3>
                    <div className="space-y-3">
                      {activeTest.questions[currentQuestionIndex].options.map(opt => {
                        const questionId = activeTest.questions[currentQuestionIndex].id;
                        const isAnswered = !!testAnswers[questionId];
                        const isSelected = testAnswers[questionId] === opt.id;
                        const isCorrect = opt.isCorrect;

                        let containerClass = "border-gray-100 bg-white hover:border-indigo-200";
                        let textClass = "text-gray-600";
                        let dotClass = "border-gray-300 group-hover:border-indigo-300";

                        if (isAnswered) {
                          if (isSelected && isCorrect) {
                            containerClass = "border-green-500 bg-green-50 ring-2 ring-green-200";
                            textClass = "text-green-800";
                            dotClass = "border-green-600 bg-green-600 text-white";
                          } else if (isSelected && !isCorrect) {
                            containerClass = "border-red-500 bg-red-50 ring-2 ring-red-200";
                            textClass = "text-red-800";
                            dotClass = "border-red-600 bg-red-600 text-white";
                          } else if (!isSelected && isCorrect) {
                            containerClass = "border-green-500 bg-green-50 ring-2 ring-green-100 opacity-80";
                            textClass = "text-green-800";
                            dotClass = "border-green-600 bg-green-600 text-white";
                          } else {
                            containerClass = "border-gray-100 bg-gray-50 opacity-40 grayscale";
                            textClass = "text-gray-400";
                            dotClass = "border-gray-200 bg-gray-100";
                          }
                        }

                        return (
                          <div
                            key={opt.id}
                            onClick={() => {
                              if (!isAnswered) {
                                setTestAnswers(prev => ({ ...prev, [questionId]: opt.id }));
                              }
                            }}
                            className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 group cursor-pointer relative overflow-hidden ${containerClass}`}
                          >
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${dotClass}`}>
                              {isAnswered && isCorrect && <span className="font-bold">✓</span>}
                              {isAnswered && !isCorrect && isSelected && <span className="font-bold">✕</span>}
                            </div>
                            <span className={`font-bold text-base ${textClass}`}>{opt.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100 mt-4">
                    {testAnswers[activeTest.questions[currentQuestionIndex].id] ? (
                      currentQuestionIndex < activeTest.questions.length - 1 ? (
                        <button
                          onClick={handleNextQuestion}
                          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] transition-all"
                        >
                          Следующий вопрос →
                        </button>
                      ) : (
                        <button
                          onClick={handleSubmitTest}
                          className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-xl shadow-xl shadow-green-200 hover:bg-green-700 hover:scale-[1.02] transition-all"
                        >
                          Завершить и узнать результат
                        </button>
                      )
                    ) : (
                      <div className="text-center text-gray-400 font-bold py-3 bg-gray-50 rounded-2xl">
                        Выберите вариант ответа, чтобы продолжить
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }

      {/* МОДАЛЬНОЕ ОКНО ЗАПРОСА МАТЕРИАЛЬНОЙ ПОМОЩИ */}
      {showAidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in" onClick={() => setShowAidModal(false)}>
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto p-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-2xl text-gray-800">Материальная помощь</h3>
              <button onClick={() => setShowAidModal(false)} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition font-bold">✕</button>
            </div>
            
            <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-sm">
              <p className="text-amber-800 text-xs font-bold leading-relaxed">
                ⚠️ <b>Внимание:</b> По решению конференции профсоюза от 27 мая 2026 г., прием заявок на материальную помощь по категориям: «Рождение ребенка», «Болезнь или операция» и «Путевки в детский лагерь» <b>приостановлен на период с 1 июня 2026 по 1 июня 2027 года</b>.
              </p>
            </div>

            <form onSubmit={handleSendAidRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Категория помощи <span className="text-red-500">*</span></label>
                <select 
                  required
                  className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-indigo-500/20 transition appearance-none"
                  value={aidCategory}
                  onChange={e => setAidCategory(e.target.value)}
                >
                  <option value="" disabled>Выберите категорию...</option>
                  <option value="По рождению ребенка" disabled>По рождению ребенка (Приостановлено)</option>
                  <option value="В связи со смертью близкого родственника">В связи со смертью близкого родственника</option>
                  <option value="Болезнь или операция" disabled>Болезнь или операция (Приостановлено)</option>
                  <option value="Путевки в детский лагерь" disabled>Путевки в детский лагерь (Приостановлено)</option>
                </select>
                {aidCategory === 'В связи со смертью близкого родственника' && (
                  <p className="mt-3 text-xs font-black text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-200 shadow-sm">
                    ⚠️ ОБРАТИТЕ ВНИМАНИЕ: Необходимо прикрепить <b>свидетельство о смерти</b> и <b>свидетельство о рождении</b> (для подтверждения родства).
                  </p>
                )}
                {aidCategory === 'По рождению ребенка' && (
                  <p className="mt-3 text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-3 rounded-xl border border-indigo-200 shadow-sm">
                    ℹ️ Необходимо прикрепить свидетельство о рождении в поле ниже.
                  </p>
                )}
                {aidCategory === 'Болезнь или операция' && (
                  <p className="mt-3 text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-3 rounded-xl border border-indigo-200 shadow-sm">
                    ℹ️ Необходимо прикрепить заключение врача и чеки в поле ниже.
                  </p>
                )}
                {aidCategory === 'Путевки в детский лагерь' && (
                  <p className="mt-3 text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-3 rounded-xl border border-indigo-200 shadow-sm">
                    ℹ️ Необходимо прикрепить чек и/или договор в поле ниже.
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">IBAN счет для перевода <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  placeholder="KZ123..."
                  value={aidIban}
                  onChange={e => setAidIban(e.target.value)}
                  className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Комментарий (необязательно)</label>
                <textarea 
                  className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-indigo-500/20 transition min-h-[100px]"
                  placeholder="Дополнительная информация..."
                  value={aidComment}
                  onChange={e => setAidComment(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">{aidCategory === 'В связи со смертью близкого родственника' ? 'Свидетельство о смерти (фото/PDF)' : 'Подтверждающий документ (фото/PDF)'}</label>
                <input 
                  type="file" 
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 5 * 1024 * 1024) {
                      alert('Размер файла не должен превышать 5 МБ');
                      e.target.value = '';
                      return;
                    }
                    setAidFile(f || null);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 transition cursor-pointer"
                />
                <p className="text-[10px] text-gray-400 mt-1 font-medium">Максимальный размер: 5 МБ (PDF, JPG, PNG)</p>
              </div>

              {aidCategory === 'В связи со смертью близкого родственника' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Свидетельство о рождении (для подтверждения родства)</label>
                  <input 
                    type="file" 
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 5 * 1024 * 1024) {
                        alert('Размер файла не должен превышать 5 МБ');
                        e.target.value = '';
                        return;
                      }
                      setAidFile2(f || null);
                    }}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 transition cursor-pointer"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">Максимальный размер: 5 МБ (PDF, JPG, PNG)</p>
                </div>
              )}

              <button 
                type="submit" 
                disabled={isSubmittingAid}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition disabled:opacity-50 mt-4"
              >
                {isSubmittingAid ? 'Отправка...' : 'Отправить запрос'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно уведомления об отпуске */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowLeaveModal(false)} className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 transition">✕</button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Уведомить об отпуске</h2>
            <p className="text-gray-500 text-sm mb-6 font-medium">Сообщите, чтобы вас не исключили из профсоюза из-за приостановки выплат.</p>
            
            <form onSubmit={handleSendLeaveNotice} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Тип отпуска</label>
                <select 
                  value={leaveType} 
                  onChange={(e) => setLeaveType(e.target.value)} 
                  className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                  required
                >
                  <option value="Отпуск без содержания">Отпуск без содержания</option>
                  <option value="Декретный отпуск">Декретный отпуск</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Дата начала</label>
                  <input type="date" required value={leaveStartDate} onChange={e => setLeaveStartDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">По дату (не обяз.)</label>
                  <input type="date" value={leaveEndDate} onChange={e => setLeaveEndDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Комментарий</label>
                <textarea 
                  value={leaveComment} 
                  onChange={(e) => setLeaveComment(e.target.value)} 
                  placeholder="Дополнительная информация..."
                  className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none focus:ring-2 focus:ring-blue-200 h-24 resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmittingLeave}
                className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-600 transition disabled:opacity-50 mt-4"
              >
                {isSubmittingLeave ? 'Отправка...' : 'Отправить уведомление'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ОПРОСНИК: Причина выхода */}
      {showExitSurveyModal && !showExitSignatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowExitSurveyModal(false)} className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 transition">✕</button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Выход из профсоюза</h2>
            <p className="text-gray-500 text-sm mb-6 font-medium">Пожалуйста, расскажите, почему вы решили выйти. Эта информация поможет нам стать лучше.</p>
            
            <textarea 
              value={exitReason} 
              onChange={(e) => setExitReason(e.target.value)} 
              placeholder="Напишите причину здесь..."
              className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none focus:ring-2 focus:ring-red-200 h-32 resize-none mb-4"
              required
            />

            <button 
              onClick={() => {
                if (!exitReason) {
                  alert('Пожалуйста, укажите причину');
                  return;
                }
                setShowExitSignatureModal(true);
              }} 
              className="w-full bg-red-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-red-200 hover:bg-red-600 transition"
            >
              Далее (Подписать заявление)
            </button>
          </div>
        </div>
      )}

      {/* ПОДПИСЬ: Заявление на выход */}
      {showExitSignatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => { setShowExitSignatureModal(false); setExitSignatureDataUrl(''); }} className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 transition">✕</button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Подписание заявлений</h2>
            <p className="text-gray-500 text-sm mb-6 font-medium">Распишитесь ниже. Ваша подпись будет прикреплена к заявлениям на выход и прекращение удержаний.</p>

            {!exitSignatureDataUrl ? (
              <>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden mb-4 bg-gray-50">
                  <SignatureCanvas 
                    ref={exitSignaturePad} 
                    canvasProps={{ className: 'w-full h-40 cursor-crosshair' }} 
                    minWidth={1}
                    maxWidth={2}
                    penColor="blue"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleClearExitSignature} className="flex-1 py-3 font-bold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Очистить</button>
                  <button type="button" onClick={handleSaveExitSignature} className="flex-1 py-3 font-black text-white bg-blue-500 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-600 transition">Сохранить</button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 p-6 rounded-2xl flex items-center justify-center border-2 border-blue-100">
                  <img src={exitSignatureDataUrl} alt="Saved Signature" className="max-h-24 max-w-[200px]" />
                </div>
                <button type="button" onClick={() => setExitSignatureDataUrl('')} className="w-full text-center text-sm font-bold text-blue-500 hover:text-blue-600 transition">
                  Перерисовать подпись
                </button>
              </div>
            )}

            <button 
              onClick={handleSendExitRequest}
              disabled={isSubmittingExit || !exitSignatureDataUrl}
              className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-red-200 hover:bg-red-700 transition disabled:opacity-50 mt-6"
            >
              {isSubmittingExit ? 'Формирование PDF и отправка...' : 'Отправить заявления'}
            </button>
          </div>
        </div>
      )}

      {/* СКРЫТЫЕ ШАБЛОНЫ ДЛЯ ГЕНЕРАЦИИ PDF ПРИ ВЫХОДЕ */}
      <div style={{ position: 'absolute', left: '-9999px', top: '0' }}>
        {/* Шаблон: Заявление на выход */}
        <div id="exit-membership-template" style={{ width: '794px', height: '1123px', backgroundColor: '#fff', color: '#000', padding: '80px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'right', marginBottom: '60px', fontSize: '18px', lineHeight: '1.5' }}>
            Председателю ОО<br/>
            «Локальный Профсоюз<br/>
            Работников Авиации Казахстана»<br/>
            Фелькеру П.В.<br/>
            от <b>{userData?.displayName || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(Ф.И.О.)</span><br/>
            <b>{userData?.position || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(департамент/отдел)</span><br/>
            <b>{userData?.phoneNumber || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(контактный телефон)</span>
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '20px' }}>Заявление</h2>

          <p style={{ textIndent: '40px', fontSize: '18px', lineHeight: '1.6', marginBottom: '40px' }}>
            Я, <b>{userData?.displayName || '_________________________________________________'}</b>,
            прошу Вас исключить меня из членов ОО «Локальный Профсоюз Работников Авиации Казахстана» по собственному желанию.
          </p>

          <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '80px' }}>
            Причина: {exitReason}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '40px', fontSize: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Подпись</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', height: '60px', position: 'relative' }}>
                {exitSignatureDataUrl && <img src={exitSignatureDataUrl} alt="signature" style={{ position: 'absolute', bottom: '0', left: '0', maxHeight: '50px', maxWidth: '150px' }} />}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Дата</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', textAlign: 'center' }}>{new Date().toLocaleDateString('ru-RU')}</div>
            </div>
          </div>
        </div>

        {/* Шаблон: Заявление на прекращение удержания */}
        <div id="exit-deduction-template" style={{ width: '794px', height: '1123px', backgroundColor: '#fff', color: '#000', padding: '80px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'right', marginBottom: '60px', fontSize: '18px', lineHeight: '1.5' }}>
            Главному бухгалтеру<br/>
            Хасеновой С.<br/>
            от <b>{userData?.displayName || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(Ф.И.О.)</span><br/>
            <b>{userData?.position || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(департамент/отдел)</span><br/>
            <b>{userData?.phoneNumber || '________________'}</b><br/>
            <span style={{ fontSize: '14px' }}>(контактный телефон)</span>
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '20px' }}>Заявление</h2>

          <p style={{ textIndent: '40px', fontSize: '18px', lineHeight: '1.6', marginBottom: '80px' }}>
            Прошу прекратить удержание профсоюзных взносов в размере 1% от заработной платы для перечисления на расчетный счет ОО «Локальный Профсоюз Работников Авиации Казахстана» в связи с выходом из профсоюза.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '40px', fontSize: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Подпись</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', height: '60px', position: 'relative' }}>
                {exitSignatureDataUrl && <img src={exitSignatureDataUrl} alt="signature" style={{ position: 'absolute', bottom: '0', left: '0', maxHeight: '50px', maxWidth: '150px' }} />}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span>Дата</span>
              <div style={{ width: '200px', borderBottom: '1px solid #000', textAlign: 'center' }}>{new Date().toLocaleDateString('ru-RU')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Nav */}
      <div className="fixed bottom-6 left-6 right-6 z-40 max-w-lg mx-auto pointer-events-none">
        <div className="bg-white/80 backdrop-blur-xl p-2.5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex justify-between items-center border border-white gap-1 pointer-events-auto relative">
          
          {/* Central Home Button */}
          <button
            onClick={() => setActiveTab('home')}
            className={`absolute left-1/2 -translate-x-1/2 -top-6 w-14 h-14 rounded-full flex items-center justify-center shadow-[0_10px_25px_rgba(15,23,42,0.3)] transition-all duration-300 shrink-0 z-50 active:scale-90 border-[3px] border-white ${activeTab === 'home' ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
          >
            <Home size={24} strokeWidth={2.5} />
          </button>

          {['resources', 'polls', 'placeholder', 'reports', 'profile'].map((tab) => {
            if (tab === 'placeholder') {
              return <div key="placeholder" className="w-14 shrink-0 pointer-events-none"></div>;
            }

            const isActive = activeTab === tab;
            const labels: { [key: string]: string } = { polls: 'Опросы', reports: 'Отчеты', resources: 'Инфо', profile: 'Я' };
            const Icon = {
              polls: ClipboardList,
              reports: BarChart3,
              resources: FolderOpen,
              profile: UserIcon
            }[tab as 'polls' | 'reports' | 'resources' | 'profile'];

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`relative flex-1 flex flex-col items-center justify-center py-2.5 rounded-2xl transition-all duration-300 active:scale-95 ${isActive ? 'bg-slate-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'}`}
              >
                <div className={`transition-all duration-300 ${isActive ? 'scale-110 drop-shadow-sm mb-1' : 'opacity-70 mb-0'}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] font-black tracking-wide transition-all duration-300 ${isActive ? 'opacity-100 max-h-4' : 'opacity-0 max-h-0 overflow-hidden'}`}>{labels[tab]}</span>
                {isActive && <div className="absolute -bottom-1.5 w-1.5 h-1.5 bg-indigo-600 rounded-full shadow-sm animate-fade-in-up"></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* MODAL FOR MONTH STATS (NEW MEMBERS) */}
      {selectedMonthStats && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="font-black text-xl">Новые участники</h3>
                <p className="text-blue-100 text-sm font-bold opacity-80">Месяц: {selectedMonthStats.name}</p>
              </div>
              <button onClick={() => setSelectedMonthStats(null)} className="text-white/50 hover:text-white bg-black/20 hover:bg-black/30 w-8 h-8 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {selectedMonthStats.details.map((d: any, i: number) => (
                <div key={i} className="flex flex-col bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <span className="font-black text-gray-900">{d.name}</span>
                  <span className="text-blue-500 font-bold text-xs mt-1">{d.position}</span>
                </div>
              ))}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0">
              <button onClick={() => setSelectedMonthStats(null)} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR AID STATS */}
      {selectedAidStats && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="bg-gradient-to-r from-green-500 to-teal-600 p-6 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="font-black text-xl">Одобренная мат. помощь</h3>
                <p className="text-green-100 text-sm font-bold opacity-80">Месяц: {selectedAidStats.name}</p>
              </div>
              <button onClick={() => setSelectedAidStats(null)} className="text-white/50 hover:text-white bg-black/20 hover:bg-black/30 w-8 h-8 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {selectedAidStats.details.map((d: any, i: number) => (
                <div key={i} className={`flex flex-col p-4 rounded-xl border ${d.isPending ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                  <span className="font-black text-gray-900 text-sm">{d.name} {d.isPending && <span className="text-orange-500 text-[10px] uppercase tracking-wider ml-2 bg-orange-100 px-2 py-0.5 rounded-md">В очереди</span>}</span>
                  <span className="text-gray-500 font-medium text-xs mt-1">{d.reason}</span>
                  <span className={`${d.isPending ? 'text-orange-500' : 'text-green-600'} font-black text-sm mt-2`}>{d.amount.toLocaleString('ru-RU')} ₸</span>
                </div>
              ))}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0">
              <button onClick={() => setSelectedAidStats(null)} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showTrainingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-up">
            <div className="bg-gradient-to-r from-purple-600 to-fuchsia-600 p-6 flex justify-between items-center text-white shrink-0">
              <h3 className="font-black text-xl">Обучение</h3>
              <button onClick={() => setShowTrainingModal(false)} className="text-white/50 hover:text-white bg-black/20 hover:bg-black/30 w-8 h-8 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 bg-gray-50 flex-1">
              {tests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="text-4xl mb-4 opacity-50">📭</span>
                  <p className="text-gray-400 font-bold">Нет доступных тестов</p>
                  <p className="text-gray-400 text-xs mt-2">Администратор еще не добавил обучающие материалы.</p>
                </div>
              ) : (
                tests.map(test => (
                  <div key={test.id} className="border border-gray-100 bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition">
                    <h4 className="font-black text-lg text-gray-800 mb-2 leading-tight">{test.title}</h4>
                    {test.description && <p className="text-xs text-gray-500 mb-4">{test.description}</p>}
                    <button 
                      onClick={() => {
                        setShowTrainingModal(false);
                        handleStartTest(test);
                      }}
                      className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 active:scale-95 transition"
                    >
                      Пройти тест
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    
      {showAdminRequestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-up">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex justify-between items-center text-white shrink-0">
              <h3 className="font-black text-xl">Обращение к админу</h3>
              <button onClick={() => setShowAdminRequestModal(false)} className="text-white/50 hover:text-white bg-black/20 hover:bg-black/30 w-8 h-8 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <form onSubmit={sendRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Опишите ваш вопрос</label>
                  <textarea
                    value={message} onChange={e => setMessage(e.target.value)}
                    placeholder="Напишите сообщение администратору..."
                    className="w-full border border-gray-200 p-4 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all resize-none h-32"
                  ></textarea>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Прикрепить файл (необязательно)</label>
                  <input
                    type="file" onChange={e => setChatFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer"
                  />
                  {chatFile && <p className="text-xs text-green-600 mt-2 font-bold">Выбран файл: {chatFile.name}</p>}
                </div>
                
                <button type="submit" disabled={isSending || (!message.trim() && !chatFile)} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition shadow-lg shadow-blue-200 mt-4">
                  {isSending ? 'Отправка...' : 'Отправить'}
                </button>
              </form>
              
              <div className="mt-8 border-t border-gray-100 pt-6">
                <h4 className="font-black text-gray-800 mb-4">История ваших обращений</h4>
                {myRequests.length === 0 ? (
                  <p className="text-gray-400 text-sm font-medium text-center">Вы еще не отправляли обращений</p>
                ) : (
                  <div className="space-y-3">
                    {myRequests.map(req => (
                      <div key={req.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-sm relative group">
                        <button onClick={() => handleDeleteRequest(req.id)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        <div className="font-bold text-gray-800 mb-1 pr-6">{req.text}</div>
                        {req.fileUrl && (
                           <a href={req.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs font-bold mb-2 inline-block">📄 Вложение</a>
                        )}
                        <div className="text-xs text-gray-500 mb-2">{new Date(req.createdAt).toLocaleString('ru-RU')}</div>
                        {req.response ? (
                          <div className="bg-blue-50 text-blue-800 p-3 rounded-xl mt-2 border border-blue-100">
                            <span className="font-black text-[10px] uppercase text-blue-500 block mb-1">Ответ админа:</span>
                            {renderFormattedText(req.response)}
                          </div>
                        ) : (
                          <div className="text-orange-500 font-bold text-xs">Ожидает ответа...</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <PaxCalculatorModal isOpen={showPaxCalculator} onClose={() => setShowPaxCalculator(false)} />
      <CateringCalculatorModal isOpen={showCateringCalculator} onClose={() => setShowCateringCalculator(false)} />
      <AirportInfoModal isOpen={showAirportInfo} onClose={() => setShowAirportInfo(false)} />
</div >
  );
}