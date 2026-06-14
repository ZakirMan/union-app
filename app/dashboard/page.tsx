'use client';

import { useState, useEffect } from 'react';
import { auth, db, storage, messaging } from '@/lib/firebase';
import { getToken } from 'firebase/messaging';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut, deleteUser } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, getDocs, query, where, updateDoc, arrayUnion, deleteDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';

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
  voteWeight?: number;
  delegatedTo?: string;
  delegatedToName?: string;
  delegationStatus?: 'pending' | 'approved';
  delegationConferenceId?: string; // <--- ADDED
  delegatedFrom?: string[];
  category?: string;
}

interface NewsItem { id: string; title: string; body: string; imageUrl?: string; fileUrl?: string; linkUrl?: string; createdAt: string; }
interface LinkItem { id: string; title: string; url: string; }
interface TemplateItem { id: string; title: string; description?: string; fileUrl: string; }
interface RequestItem { id: string; text: string; response?: string; createdAt: string; userId: string; userEmail: string; status: string; }

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

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'news' | 'chat' | 'resources' | 'training' | 'profile' | 'polls' | 'reports'>('news');

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

  // Делегирование (обновленные стейты для поиска)
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [selectedDelegateId, setSelectedDelegateId] = useState('');
  const [incomingDelegations, setIncomingDelegations] = useState<DelegationRequest[]>([]); // <--- ADDED
  const [delegateFile, setDelegateFile] = useState<File | null>(null);
  const [isSubmittingDelegation, setIsSubmittingDelegation] = useState(false);

  // --- НОВЫЕ СТЕЙТЫ ДЛЯ ПОИСКА ---
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Материальная помощь
  const [showAidModal, setShowAidModal] = useState(false);
  const [aidCategory, setAidCategory] = useState('');
  const [aidComment, setAidComment] = useState('');
  const [aidFile, setAidFile] = useState<File | null>(null);
  const [isSubmittingAid, setIsSubmittingAid] = useState(false);

  // Уведомления об отпуске
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState('Отпуск без содержания');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveComment, setLeaveComment] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // Тестирование
  const [activeTest, setActiveTest] = useState<Test | null>(null);
  const [testAnswers, setTestAnswers] = useState<{ [key: string]: string }>({});
  const [testResult, setTestResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const router = useRouter();

  // --- ЗАГРУЗКА ДАННЫХ ---
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

      const text = `Запрос материальной помощи: ${aidCategory}${aidComment ? '\nКомментарий: ' + aidComment : ''}`;
      const newReqData = {
        userId: user.uid,
        userEmail: user.email || '',
        text,
        fileUrl,
        status: 'new',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'requests'), newReqData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyRequests([{ ...newReqData, id: docRef.id } as any, ...myRequests]);
      
      setShowAidModal(false);
      setAidCategory('');
      setAidComment('');
      setAidFile(null);
      alert('Запрос на материальную помощь отправлен!');

      // Загрузка файла на Google Drive
      if (fileUrl) {
        try {
          const token = await user.getIdToken();
          await fetch('/api/upload-to-drive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              userName: userData?.displayName || user.email,
              files: [{ url: fileUrl, type: 'aid' }]
            })
          });
        } catch (err) { console.error('Drive upload failed:', err); }
      }

      try {
        const token = await user.getIdToken();
        await fetch('/api/send-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ text: `💰 <b>Запрос материальной помощи!</b>\n\n👤 <b>От:</b> ${userData?.displayName || user.email}\n📧 <b>Email:</b> ${user.email}\n\n🏷️ <b>Категория:</b> ${aidCategory}${aidComment ? '\n📝 <b>Комментарий:</b> ' + aidComment : ''}${fileUrl ? `\n\n📎 <a href="${fileUrl}">Прикрепленный документ</a>` : ''}` })
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

  if (userData?.status === 'pending') return <div className="p-10 text-center">Ожидание подтверждения</div>;

  return (
    <div className="min-h-screen bg-[#F2F6FF] font-sans text-[#1A1A1A] pb-32">

      {/* HEADER */}
      {activeTab !== 'profile' && (
        <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white pt-8 pb-8 px-6 rounded-b-[2.5rem] shadow-xl sticky top-0 z-30 mb-8">
          <div className="max-w-2xl mx-auto flex justify-between items-end">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">Профсоюз</p>
                {totalMembers > 0 && (
                  <span className="bg-white/10 text-[10px] font-bold px-2 py-0.5 rounded-md text-blue-100 border border-white/5">
                    {totalMembers} участников
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black">{ { news: 'Новости', chat: 'Связь', training: 'Обучение', polls: 'Опросы', resources: 'Ресурсы', reports: 'Отчеты', profile: 'Профиль' }[activeTab] }</h1>
            </div>
            <div className="flex gap-3 items-center">
              {userData?.role === 'admin' && (
                <button
                  onClick={() => router.push('/admin')}
                  className="bg-white/20 hover:bg-white/30 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10"
                >
                  Админ панель →
                </button>
              )}
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm shadow-inner cursor-pointer hover:bg-white/30 transition">
                <span className="text-xl">🔔</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-5">

        {/* НОВОСТИ */}
        {activeTab === 'news' && (
          <div className="space-y-6">
            {/* БЛОК СЛЕДУЮЩЕГО СОБРАНИЯ */}
            {nextConference && (
              <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 rounded-[2rem] shadow-lg shadow-indigo-200 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2">
                    <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide backdrop-blur-md">📅 Ближайшее событие</span>
                  </div>
                  <h3 className="font-black text-2xl mb-1">{nextConference.title}</h3>
                  <p className="text-indigo-100 font-bold text-sm bg-white/10 inline-block px-3 py-1 rounded-lg mt-2">
                    {new Date(nextConference.date).toLocaleString()}
                  </p>
                </div>
                <div className="absolute top-0 right-0 text-9xl opacity-10 -mr-4 -mt-4 rotate-12">🗓</div>
              </div>
            )}

            {news.map(i => (
              <div key={i.id} className="bg-white rounded-[2rem] shadow-lg shadow-indigo-100/50 border border-white overflow-hidden hover:shadow-xl transition-all duration-300 group">
                {i.imageUrl && (
                  <div className="relative h-56 w-full overflow-hidden">
                    <Image src={i.imageUrl} alt={i.title} fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60"></div>
                  </div>
                )}
                <div className="p-6 relative">
                  {!i.imageUrl && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>}
                  <div className="flex justify-between items-start mb-2">
                    <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide">{new Date(i.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3 className="font-black text-xl mb-3 leading-tight">{i.title}</h3>
                  <p className="text-gray-500 text-sm font-medium leading-relaxed whitespace-pre-wrap">{i.body}</p>
                  {(i.fileUrl || i.linkUrl) && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                      {i.fileUrl && (
                        <a href={i.fileUrl} target="_blank" className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-100 transition">
                          <span>📄</span> Скачать документ
                        </a>
                      )}
                      {i.linkUrl && (
                        <a href={i.linkUrl} target="_blank" className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-blue-100 transition">
                          <span>🔗</span> Открыть ссылку
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ЧАТ */}
        {activeTab === 'chat' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-[2rem] p-8 text-white shadow-lg shadow-green-200 relative overflow-hidden group cursor-pointer" onClick={() => setShowAidModal(true)}>
              <div className="relative z-10">
                <h2 className="font-black text-2xl mb-2">Материальная помощь</h2>
                <p className="text-green-100 font-bold text-sm mb-6 opacity-90">Запросите материальную помощь по нужной категории.</p>
                <button className="inline-block bg-white text-green-600 px-8 py-3 rounded-xl font-black shadow-md hover:bg-green-50 transition transform group-hover:scale-105">Оформить заявку</button>
              </div>
              <div className="absolute -right-10 -bottom-10 text-9xl opacity-20 rotate-12 group-hover:rotate-6 transition-transform duration-500">🤝</div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-indigo-50">
              <h2 className="font-black text-xl mb-4 text-gray-800">Обращение к админу</h2>
              <textarea
                className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-indigo-500/20 transition min-h-[120px]"
                rows={3}
                placeholder="Опишите вашу проблему или предложение..."
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
              <button
                onClick={sendRequest}
                disabled={isSending}
                className={`w-full bg-blue-600 text-white py-4 rounded-2xl font-black mt-4 shadow-lg shadow-blue-200 hover:shadow-xl hover:bg-blue-700 transition transform active:scale-95 ${isSending ? 'opacity-70' : ''}`}
              >
                {isSending ? 'Отправка...' : 'Отправить обращение'}
              </button>
              {/* FILE INPUT ADDED HERE */}
              <div className="mt-4">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2 ml-2">Прикрепить документ/фото</label>
                <input
                  type="file"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 5 * 1024 * 1024) {
                      alert('Размер файла не должен превышать 5 МБ');
                      e.target.value = '';
                      return;
                    }
                    setChatFile(f || null);
                  }}
                  className="w-full text-sm font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition"
                />
                <p className="text-[10px] text-gray-400 mt-1 mb-2 font-medium">Максимальный размер: 5 МБ (PDF, JPG, PNG)</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-black text-gray-400 uppercase text-xs ml-4 tracking-wider">Мои запросы</h3>
              {myRequests.length === 0 && <p className="text-center text-gray-400 font-bold py-4">Нет активных запросов</p>}
              {myRequests.map(r => (
                <div key={r.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                  <div className="flex justify-between mb-2">
                    <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-1 rounded">{new Date(r.createdAt).toLocaleDateString()}</span>
                    <div className="flex gap-2">
                      <span className={`text-[10px] font-black px-2 py-1 rounded ${r.response ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>{r.response ? 'ОТВЕТ ПОЛУЧЕН' : 'НА РАССМОТРЕНИИ'}</span>
                      <button onClick={() => handleDeleteRequest(r.id)} className="text-gray-400 hover:text-red-500 font-bold px-1 transition">✕</button>
                    </div>
                  </div>
                  <p className="font-bold text-gray-800 mb-3">{r.text}</p>
                  {r.response && (
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                      <p className="text-xs font-black text-green-600 uppercase mb-1">Ответ:</p>
                      <p className="text-sm font-bold text-gray-700">{r.response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* РЕСУРСЫ */}
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
              <h2 className="font-black text-2xl mb-4 ml-2 text-gray-800">Шаблоны</h2>
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
        {activeTab === 'training' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {tests.length === 0 && (
              <div className="bg-white p-10 rounded-[2rem] text-center border-2 border-dashed border-gray-200">
                <p className="text-gray-400 font-bold">Обучающие тесты пока не назначены</p>
              </div>
            )}
            {tests.map(test => {
              const isCompleted = test.completedBy?.includes(user?.uid || '');
              return (
                <div key={test.id} className="bg-white p-6 rounded-[2rem] shadow-lg border border-indigo-50 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-3 relative z-10">
                    <h3 className="font-black text-xl text-gray-800">{test.title}</h3>
                    {isCompleted ? (
                      <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide">Пройден</span>
                    ) : (
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide">Новый</span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm font-medium mb-6 leading-relaxed relative z-10">{test.description}</p>
                  <button
                    onClick={() => handleStartTest(test)}
                    className={`w-full py-4 rounded-2xl font-black text-lg transition-all transform active:scale-95 relative z-10 ${isCompleted ? 'bg-gray-100 text-gray-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 to-indigo-600 text-white shadow-lg shadow-blue-200 hover:shadow-xl'}`}
                  >
                    {isCompleted ? 'Пройти повторно' : 'Начать тестирование'}
                  </button>
                  {/* Декоративный фон */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-10 -mt-10 opacity-50"></div>
                </div>
              );
            })}
          </div>
        )}



        {/* ОПРОСЫ */}
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
                    <h3 className="font-black text-xl text-gray-800">{poll.question}</h3>
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
                          <div key={m.num} tabIndex={0} className="bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm hover:bg-white/20 transition cursor-pointer md:cursor-default relative group/month outline-none">
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
                          <div key={m.num} tabIndex={0} className="bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm hover:bg-white/20 transition cursor-pointer md:cursor-default relative group/month outline-none">
                            <span className="text-[10px] text-green-200 font-bold mb-1 uppercase tracking-wider">{m.name}</span>
                            <span className={`text-sm md:text-[15px] font-black leading-tight ${stat.count > 0 ? 'text-white' : 'text-white/30'}`}>
                              {stat.count > 0 ? `${stat.amount.toLocaleString('ru-RU')} ₸` : '0 ₸'}
                            </span>
                            {stat.count > 0 && <span className="text-[9px] text-green-100 font-bold mt-0.5">{stat.count} шт</span>}
                            {stat.pendingCount > 0 && <span className="text-[9px] text-orange-200 font-bold mt-0.5 opacity-80">+ {stat.pendingCount} ожид.</span>}
                            
                            {stat.details && stat.details.length > 0 && (
                              <div className="absolute z-50 bottom-full mb-2 w-48 bg-gray-900 text-white text-xs rounded-xl p-3 opacity-0 invisible group-hover/month:opacity-100 group-hover/month:visible group-focus/month:opacity-100 group-focus/month:visible transition-all shadow-xl pointer-events-none md:left-1/2 md:-translate-x-1/2 right-0 z-[100]">
                                <div className="font-black mb-2 text-green-400 border-b border-gray-700 pb-1">Выплаты за {m.name}</div>
                                <div className="max-h-32 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-600">
                                  {stat.details.map((d: any, i: number) => (
                                    <div key={i} className={`flex flex-col py-1 ${d.isPending ? 'bg-orange-500/10 px-2 rounded-lg border border-orange-500/30 mb-1' : ''}`}>
                                      <span className="font-bold">{d.name} {d.isPending && <span className="text-orange-400 text-[9px] uppercase tracking-wider ml-1">В очереди</span>}</span>
                                      <span className="text-gray-400 text-[10px]">{d.reason}</span>
                                      <span className={`${d.isPending ? 'text-orange-300' : 'text-green-300'} font-black`}>{d.amount.toLocaleString('ru-RU')} ₸</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-white relative overflow-hidden text-center mb-6">
              <div className="bg-gradient-to-b from-blue-50/50 to-transparent absolute inset-0"></div>
              <div className="relative z-10">
                <div className="w-32 h-32 bg-white rounded-full mx-auto mb-6 p-1 shadow-2xl relative group">
                  <div className="w-full h-full rounded-full overflow-hidden relative">
                    {userData.photoUrl ? <Image src={userData.photoUrl} alt={userData.displayName} fill className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl bg-gray-100">👤</div>}
                  </div>
                  {isEditing && (
                    <label className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center cursor-pointer text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-2xl">📷</span>
                      <span className="text-[10px] font-bold uppercase mt-1">Изменить</span>
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
                {isEditing && <p className="text-[10px] text-gray-400 mt-[-15px] mb-4 text-center">Макс. размер: 10 МБ. Изображение будет сжато.</p>}

                {!isEditing ? (
                  <>
                    <h2 className="font-black text-3xl text-gray-900 mb-1">{userData.displayName}</h2>
                    <p className="text-blue-500 font-bold text-lg mb-6">{userData.position}</p>
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => setIsEditing(true)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-6 py-2 rounded-xl font-bold text-sm transition">Редактировать</button>
                      <button onClick={() => setShowLeaveModal(true)} className="bg-orange-50 hover:bg-orange-100 text-orange-600 px-6 py-2 rounded-xl font-bold text-sm transition">В отпуск / декрет</button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 max-w-xs mx-auto">
                    <input className="w-full bg-gray-50 p-3 rounded-xl font-bold text-center border-0 outline-none focus:ring-2 focus:ring-blue-200" value={editName} onChange={e => setEditName(e.target.value)} />
                    <input className="w-full bg-gray-50 p-3 rounded-xl font-bold text-center border-0 outline-none focus:ring-2 focus:ring-blue-200" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">Отмена</button>
                      <button onClick={handleSaveProfile} disabled={isSavingProfile} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200">{isSavingProfile ? '...' : 'Сохранить'}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Блок Делегирования */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50 relative overflow-hidden mb-6">
              <h3 className="font-black text-xl text-indigo-900 mb-6 flex items-center gap-2">🗳️ Управление голосом</h3>

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
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl transform transition-transform scale-100">
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
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative my-auto animate-in zoom-in-95 duration-200">
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
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden p-8" onClick={e => e.stopPropagation()}>
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
                    ⚠️ ОБРАТИТЕ ВНИМАНИЕ: Необходимо прикрепить свидетельство о смерти (фото или PDF) в поле ниже.
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
                <label className="block text-sm font-bold text-gray-700 mb-2">Комментарий (необязательно)</label>
                <textarea 
                  className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-indigo-500/20 transition min-h-[100px]"
                  placeholder="Дополнительная информация..."
                  value={aidComment}
                  onChange={e => setAidComment(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Подтверждающий документ (фото/PDF)</label>
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
          <div className="bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
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

      {/* Footer Nav */}
      <div className="fixed bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-2 rounded-[2rem] shadow-2xl flex justify-between items-center z-40 border border-white/50 max-w-lg mx-auto overflow-x-auto no-scrollbar gap-1">
        {['news', 'chat', 'training', 'polls', 'reports', 'resources', 'profile'].map((tab) => {
          const isActive = activeTab === tab;
          const icons: { [key: string]: string } = { news: '📰', chat: '💬', training: '🎓', polls: '📋', reports: '📈', resources: '📂', profile: '👤' };
          const labels: { [key: string]: string } = { news: 'Главная', chat: 'Чат', training: 'Учеба', polls: 'Опросы', reports: 'Отчеты', resources: 'Инфо', profile: 'Я' };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'news' | 'chat' | 'resources' | 'training' | 'profile' | 'polls' | 'reports')}
              className={`flex-1 flex flex-col items-center py-3 rounded-[1.5rem] transition-all duration-300 ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 transform -translate-y-2' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="text-xl mb-0.5">{icons[tab]}</span>
              {isActive && <span className="text-[9px] font-black uppercase tracking-wide">{labels[tab]}</span>}
            </button>
          );
        })}
      </div>
    </div >
  );
}