'use client';

import { useEffect, useState } from 'react';
import { db, auth, storage } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, deleteDoc, getDoc, increment, arrayUnion, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import Image from 'next/image';

// --- ТИПЫ ДАННЫХ ---
interface UserData {
  id: string; displayName: string; email: string; phoneNumber?: string; position: string; role: string; status: string;
  voteWeight?: number; delegatedTo?: string; delegatedToName?: string; delegatedFrom?: string[];
  createdAt?: string;
  delegationStatus?: string; delegationConferenceId?: string; photoUrl?: string;
  statementUrl?: string;
  deductionUrl?: string;
  isAlreadyMember?: boolean;
  joinDate?: string;
  idCardUrl?: string;
  category?: string;
  leaveStatus?: 'none' | 'unpaid' | 'maternity';
  leaveStartDate?: string;
  leaveEndDate?: string;
}

// Тесты
interface TestOption { id: string; text: string; isCorrect: boolean; }
interface TestQuestion { id: string; text: string; options: TestOption[]; }
interface Test {
  id: string; title: string; description: string; questions: TestQuestion[];
  createdAt: string; completedBy?: string[]; // ID пользователей, кто прошел
}

interface DelegationRequest {
  id: string; fromId: string; fromName: string; toId: string; toName: string; docUrl?: string; createdAt: string;
  status: 'pending' | 'approved' | 'rejected'; conferenceId?: string; conferenceTitle?: string;
}

interface Conference { id: string; title: string; date: string; createdAt: string; }
interface NewsItem { id: string; title: string; body: string; imageUrl?: string; fileUrl?: string; linkUrl?: string; createdAt: string; requiresResponse?: boolean; responseDeadlineDays?: number; isResponseReceived?: boolean; }
interface TeamMember {
  id: string;
  name: string;
  role: string;
  photoUrl?: string;
  order: number;
}
interface RequestData {
  id: string;
  userEmail: string;
  text: string;
  fileUrl?: string;
  createdAt: string;
  response?: string;
  aidStatus?: 'pending' | 'approved' | 'rejected';
  aidAmount?: number;
  isOffline?: boolean;
  userName?: string;
}
interface LinkItem { id: string; title: string; url: string; }
interface DocTemplate { id: string; title: string; description?: string; fileUrl: string; isRegistrationTemplate?: boolean; }

interface UnionDocument { id: string; title: string; content: string; createdAt: string; }

// Опросы
interface Poll {
  id: string;
  question: string;
  options: { id: string; text: string; votes: string[] }[];
  createdAt: string;
  expiresAt?: string;
  createdBy: string;
  isActive: boolean;
  targetCategory?: string;
}

// Аудит
interface AdminLog {
  id: string;
  adminId: string;
  adminName: string; // email/name
  action: string;
  targetType: string;
  details?: string;
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'events' | 'delegations' | 'users' | 'news' | 'requests' | 'resources' | 'team' | 'polls' | 'logs' | 'registry'>('dashboard');
  const [eventSubTab, setEventSubTab] = useState<'conferences' | 'tests'>('conferences');
  const [delegationSubTab, setDelegationSubTab] = useState<'pending' | 'history'>('pending');
  const [delegationFilterConf, setDelegationFilterConf] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Данные (инициализируем пустыми массивами, чтобы не было ошибок)
  const [users, setUsers] = useState<UserData[]>([]);
  const [delegations, setDelegations] = useState<DelegationRequest[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [unionDocs, setUnionDocs] = useState<UnionDocument[]>([]); // <--- NEW STATE
  const [polls, setPolls] = useState<Poll[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [selectedMonthStats, setSelectedMonthStats] = useState<{name: string, details: any[]} | null>(null);

  // Состояние для просмотра результатов теста
  const [selectedTestStats, setSelectedTestStats] = useState<Test | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editUserForm, setEditUserForm] = useState({ name: '', pos: '', phone: '', email: '', category: '', leaveStatus: 'none' as 'none' | 'unpaid' | 'maternity', leaveStartDate: '', leaveEndDate: '' });
  const [pendingCategories, setPendingCategories] = useState<{[key: string]: string}>({});
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSortMode, setUserSortMode] = useState<'alpha' | 'date'>('alpha');
  const [userStatusFilter, setUserStatusFilter] = useState<'approved' | 'frozen' | 'all'>('approved');
  const [userCategoryFilter, setUserCategoryFilter] = useState('');

  // Конструктор теста
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState('');
  const [testDesc, setTestDesc] = useState('');
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([{ id: 'q1', text: '', options: [{ id: 'o1', text: '', isCorrect: true }] }]);

  // Конструктор опроса
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [pollCategoryFilter, setPollCategoryFilter] = useState('all');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollTargetCategory, setPollTargetCategory] = useState('Все');
  const [pollExpiry, setPollExpiry] = useState('');
  const [selectedPollStats, setSelectedPollStats] = useState<Poll | null>(null);

  // Настройки
  const [accountingEmail, setAccountingEmail] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Формы
  const [confTitle, setConfTitle] = useState(''); const [confDate, setConfDate] = useState('');
  const [newsTitle, setNewsTitle] = useState(''); const [newsBody, setNewsBody] = useState(''); const [newsFile, setNewsFile] = useState<File | null>(null);
  const [newsFileDoc, setNewsFileDoc] = useState<File | null>(null); const [newsLink, setNewsLink] = useState(''); const [newsRequiresResponse, setNewsRequiresResponse] = useState(false); const [newsResponseDeadlineDays, setNewsResponseDeadlineDays] = useState(15);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [editNewsTitle, setEditNewsTitle] = useState('');
  const [editNewsBody, setEditNewsBody] = useState('');
  const [editNewsLink, setEditNewsLink] = useState('');
  const [memberName, setMemberName] = useState(''); const [memberRole, setMemberRole] = useState(''); const [memberFile, setMemberFile] = useState<File | null>(null);
  const [linkTitle, setLinkTitle] = useState(''); const [linkUrl, setLinkUrl] = useState('');
  const [tplTitle, setTplTitle] = useState(''); const [tplDesc, setTplDesc] = useState(''); const [tplFile, setTplFile] = useState<File | null>(null);

  // Создание Документа
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [replyAidAmount, setReplyAidAmount] = useState<{ [key: string]: string }>({});
  const [replyAidStatus, setReplyAidStatus] = useState<{ [key: string]: 'approved' | 'rejected' }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isApproving, setIsApproving] = useState(false); 
  const [currentPage, setCurrentPage] = useState(1);
  const [currentNewsPage, setCurrentNewsPage] = useState(1);

  // States for manual aid request form
  const [showManualAidModal, setShowManualAidModal] = useState(false);
  const [editingManualAidId, setEditingManualAidId] = useState<string | null>(null);
  const [manualAidName, setManualAidName] = useState('');
  const [manualAidCategory, setManualAidCategory] = useState('');
  const [manualAidCustomCategory, setManualAidCustomCategory] = useState('');
  const [manualAidAmount, setManualAidAmount] = useState('');
  const [manualAidDate, setManualAidDate] = useState('');
  const [manualAidFile, setManualAidFile] = useState<File | null>(null);
  const [isSubmittingManualAid, setIsSubmittingManualAid] = useState(false);

  // Реестр бухгалтерии
  const [registryMonth, setRegistryMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [registries, setRegistries] = useState<Record<string, {name: string, amount: number}[]>>({});
  const [registryInput, setRegistryInput] = useState('');
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);
  const [registryFilter, setRegistryFilter] = useState<'all' | 'unregistered'>('all');
  const [registrySearch, setRegistrySearch] = useState('');

  const itemsPerPage = 10;

  useEffect(() => { setCurrentPage(1); }, [activeTab, eventSubTab, delegationSubTab]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') fetchData();
          else router.push('/dashboard');
        } catch { router.push('/dashboard'); }
      } else router.push('/login');
    });
    return () => unsubscribe();
  }, [router]);

  const fetchData = async () => {
    try {
      const uSnap = await getDocs(collection(db, 'users')); setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
      const dSnap = await getDocs(collection(db, 'delegation_requests')); setDelegations(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as DelegationRequest)).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
      const cSnap = await getDocs(collection(db, 'conferences')); setConferences(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Conference)).sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1));

      // Загрузка тестов (с проверкой)
      const tSnap = await getDocs(collection(db, 'tests'));
      setTests(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as Test)).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));

      const nSnap = await getDocs(collection(db, 'news')); setNews(nSnap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
      const tmSnap = await getDocs(collection(db, 'team'));
      setTeam(tmSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamMember)).sort((a, b) => (a.order || 0) - (b.order || 0)));

      const rSnap = await getDocs(collection(db, 'requests')); setRequests(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as RequestData)).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
      const lSnap = await getDocs(collection(db, 'links')); setLinks(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as LinkItem)));
      const tplSnap = await getDocs(collection(db, 'templates')); setTemplates(tplSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocTemplate)));

      const docsSnap = await getDocs(collection(db, 'union_documents'));
      setUnionDocs(docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as UnionDocument)).sort((a, b) => a.title.localeCompare(b.title)));

      // Загрузка опросов
      const pollsSnap = await getDocs(collection(db, 'polls'));
      setPolls(pollsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Poll)).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));

      // Logs
      const logsSnap = await getDocs(collection(db, 'admin_logs'));
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminLog)).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1));

      // Настройки
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      if (settingsSnap.exists()) {
        setAccountingEmail(settingsSnap.data().accountingEmail || '');
      }

      // Реестры бухгалтерии (по месяцам)
      const regSnap = await getDocs(collection(db, 'registries'));
      const regs: Record<string, {name: string, amount: number}[]> = {};
      regSnap.forEach(docSnap => {
        regs[docSnap.id] = docSnap.data().records || [];
      });
      setRegistries(regs);

      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const uploadImage = async (file: File, folder: string) => {
    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  // --- 🔥 ФУНКЦИЯ ОТПРАВКИ PUSH-УВЕДОМЛЕНИЙ ---
  const sendPushNotification = async (title: string, body: string, userIds?: string[], link?: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, body, userIds, link }),
      });
      console.log('Уведомление отправлено:', title);
    } catch (e) {
      console.error('Ошибка отправки уведомления:', e);
    }
  };

  // --- ЛОГИРОВАНИЕ ---
  const logAction = async (action: string, targetType: string, details: string) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'admin_logs'), {
        adminId: auth.currentUser.uid,
        adminName: auth.currentUser.email || 'Admin',
        action,
        targetType,
        details,
        createdAt: new Date().toISOString()
      });
    } catch (e) { console.error('Log error', e); }
  };

  // --- ACTIONS ---

  const handleSaveAccountingEmail = async () => {
    setIsSavingEmail(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), { accountingEmail }, { merge: true });
      alert('Email бухгалтерии успешно сохранен!');
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении');
    }
    setIsSavingEmail(false);
  };

  // 1. UNION DOCUMENTS
  const handleCreateDocument = async () => {
    if (!docTitle || !docContent) { alert('Заполните название и текст'); return; }
    try {
      if (editingDocId) {
        await updateDoc(doc(db, 'union_documents', editingDocId), {
          title: docTitle,
          content: docContent
        });
        await logAction('update_doc', 'document', `Обновлен документ: ${docTitle}`);
      } else {
        await addDoc(collection(db, 'union_documents'), {
          title: docTitle,
          content: docContent,
          createdAt: new Date().toISOString()
        });
        await logAction('create_doc', 'document', `Создан документ: ${docTitle}`);
      }
      setDocTitle(''); setDocContent(''); setEditingDocId(null); setIsCreatingDoc(false);
      fetchData();
    } catch { alert('Ошибка при сохранении документа'); }
  };

  const handleSaveRegistry = async () => {
    if (!registryMonth) { alert('Выберите месяц'); return; }
    setIsSavingRegistry(true);
    try {
      const lines = registryInput.split('\n').map(n => n.trim()).filter(n => n.length > 0);
      const records: {name: string, amount: number}[] = [];
      lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          let amountStr = parts[parts.length - 1];
          let nameStr = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
          
          let str = amountStr.replace(/\s+/g, '').replace(/[^\d.,-]/g, '');
          const lastDot = str.lastIndexOf('.');
          const lastComma = str.lastIndexOf(',');
          const sepIdx = Math.max(lastDot, lastComma);
          
          if (sepIdx !== -1) {
              const hasBoth = lastDot !== -1 && lastComma !== -1;
              if (hasBoth) {
                  if (lastDot > lastComma) {
                      str = str.replace(/,/g, '');
                  } else {
                      str = str.replace(/\./g, '').replace(',', '.');
                  }
              } else {
                  if (str.length - sepIdx - 1 === 2) {
                      str = str.substring(0, sepIdx).replace(/[.,]/g, '') + '.' + str.substring(sepIdx + 1);
                  } else if (str.length - sepIdx - 1 === 3) {
                      str = str.replace(/[.,]/g, '');
                  } else {
                      str = str.substring(0, sepIdx).replace(/[.,]/g, '') + '.' + str.substring(sepIdx + 1);
                  }
              }
          }
          let amount = parseFloat(str);

          if (!isNaN(amount) && nameStr.trim().length > 3 && !/^\d+$/.test(nameStr)) {
            records.push({ name: nameStr.trim(), amount });
          }
        }
      });
      
      if (records.length === 0 && lines.length > 0) {
        alert('Не удалось распознать ФИО и суммы. Убедитесь, что скопировали таблицу с колонками ФИО и Сумма (через табуляцию).');
        setIsSavingRegistry(false);
        return;
      }

      await setDoc(doc(db, 'registries', registryMonth), { 
        month: registryMonth,
        records: records,
        updatedAt: new Date().toISOString()
      });
      
      setRegistries(prev => ({ ...prev, [registryMonth]: records }));
      await logAction('update_registry', 'system', `Загружен реестр за ${registryMonth} (записей: ${records.length})`);
      setRegistryInput('');
      alert('Реестр успешно загружен!');
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении реестра.');
    } finally {
      setIsSavingRegistry(false);
    }
  };

  const handleEditDocument = (d: UnionDocument) => {
    setDocTitle(d.title);
    setDocContent(d.content);
    setEditingDocId(d.id);
    setIsCreatingDoc(true);
  };

  const handleDeleteDocument = async (id: string) => {
    if (confirm('Удалить документ?')) {
      await deleteDoc(doc(db, 'union_documents', id));
      await logAction('delete_doc', 'document', `Удален документ: ${id}`);
      fetchData();
    }
  };

  // --- ЛОГИКА ТЕСТОВ ---
  const handleAddQuestion = () => {
    setTestQuestions([...testQuestions, { id: `q${Date.now()}`, text: '', options: [{ id: `o${Date.now()}`, text: '', isCorrect: true }] }]);
  };
  const handleUpdateQuestion = (qIdx: number, text: string) => {
    const newQ = [...testQuestions]; newQ[qIdx].text = text; setTestQuestions(newQ);
  };
  const handleAddOption = (qIdx: number) => {
    const newQ = [...testQuestions]; newQ[qIdx].options.push({ id: `o${Date.now()}`, text: '', isCorrect: false }); setTestQuestions(newQ);
  };
  const handleUpdateOption = (qIdx: number, oIdx: number, text: string) => {
    const newQ = [...testQuestions]; newQ[qIdx].options[oIdx].text = text; setTestQuestions(newQ);
  };
  const handleSetCorrectOption = (qIdx: number, oIdx: number) => {
    const newQ = [...testQuestions];
    newQ[qIdx].options.forEach((o, i) => o.isCorrect = i === oIdx);
    setTestQuestions(newQ);
  };
  const handleRemoveQuestion = (qIdx: number) => {
    const newQ = [...testQuestions]; newQ.splice(qIdx, 1); setTestQuestions(newQ);
  };

  // --- ACTIONS ---

  // 1. СОЗДАНИЕ И РЕДАКТИРОВАНИЕ ТЕСТА
  const handleCreateTest = async () => {
    if (!testTitle || testQuestions.some(q => !q.text || q.options.some(o => !o.text))) { alert('Заполните все поля'); return; }
    try {
      if (editingTestId) {
        // UPDATE EXISTING
        await updateDoc(doc(db, 'tests', editingTestId), {
          title: testTitle,
          description: testDesc,
          questions: testQuestions
        });
        await logAction('update_test', 'test', `Обновлен тест: ${testTitle}`);
        alert('Тест обновлен!');
      } else {
        // CREATE NEW
        await addDoc(collection(db, 'tests'), {
          title: testTitle,
          description: testDesc,
          questions: testQuestions,
          createdAt: new Date().toISOString(),
          completedBy: []
        });
        await sendPushNotification('🎓 Новый тест доступен', `Проверьте свои знания: ${testTitle}`, undefined, 'https://union-app-two.vercel.app/dashboard?tab=training');
        await logAction('create_test', 'test', `Создан тест: ${testTitle}`);
        alert('Тест создан!');
      }

      setTestTitle(''); setTestDesc(''); setTestQuestions([{ id: 'q1', text: '', options: [{ id: 'o1', text: '', isCorrect: true }] }]);
      setIsCreatingTest(false);
      setEditingTestId(null);
      fetchData();
    } catch { alert('Ошибка'); }
  };

  const handleEditTest = (t: Test) => {
    setEditingTestId(t.id);
    setTestTitle(t.title);
    setTestDesc(t.description);
    setTestQuestions(t.questions);
    setIsCreatingTest(true);
  };

  const handleDeleteTest = async (id: string) => {
    if (confirm('Удалить тест?')) { await deleteDoc(doc(db, 'tests', id)); await logAction('delete_test', 'test', `Удален тест: ${id}`); fetchData(); }
  };

  // 2. СОЗДАНИЕ КОНФЕРЕНЦИИ (С УВЕДОМЛЕНИЕМ)
  const handleCreateConference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confTitle || !confDate) return;
    await addDoc(collection(db, 'conferences'), { title: confTitle, date: confDate, createdAt: new Date().toISOString() });

    // Отправляем пуш
    await sendPushNotification('📅 Новое событие!', `Назначено: ${confTitle}`);
    await logAction('create_conference', 'conference', `Создано событие: ${confTitle}`);

    setConfTitle(''); setConfDate(''); fetchData(); alert('Конференция создана');
  };

  const handleDeleteConference = async (id: string) => { if (confirm('Удалить конференцию?')) { await deleteDoc(doc(db, 'conferences', id)); await logAction('delete_conference', 'conference', `Удалено событие: ${id}`); fetchData(); } };

  // 3. ПУБЛИКАЦИЯ НОВОСТИ (С УВЕДОМЛЕНИЕМ)
  const handlePublishNews = async (e: React.FormEvent) => {
    e.preventDefault(); setIsUploading(true);
    try {
      let imageUrl = ''; if (newsFile) imageUrl = await uploadImage(newsFile, 'news');
      let fileUrl = ''; if (newsFileDoc) fileUrl = await uploadImage(newsFileDoc, 'news_docs');
      await addDoc(collection(db, 'news'), { title: newsTitle, body: newsBody, imageUrl, fileUrl, linkUrl: newsLink, requiresResponse: newsRequiresResponse, responseDeadlineDays: newsRequiresResponse ? newsResponseDeadlineDays : null, isResponseReceived: false, createdAt: new Date().toISOString() });

      // Отправляем пуш
      await sendPushNotification('⚡️ Свежая новость', newsTitle, undefined, 'https://union-app-two.vercel.app/dashboard?tab=news');
      await logAction('publish_news', 'news', `Опубликована новость: ${newsTitle}`);

      setNewsTitle(''); setNewsBody(''); setNewsFile(null); setNewsFileDoc(null); setNewsLink(''); setNewsRequiresResponse(false); setNewsResponseDeadlineDays(15); fetchData();
    } catch { alert('Ошибка'); } finally { setIsUploading(false); }
  };

  const handleDeleteNews = async (id: string) => { if (confirm('Del?')) await deleteDoc(doc(db, 'news', id)); await logAction('delete_news', 'news', `Удалена новость: ${id}`); fetchData(); }; const handleToggleResponseReceived = async (id: string, received: boolean) => { try { await updateDoc(doc(db, 'news', id), { isResponseReceived: received }); fetchData(); } catch { alert('Ошибка сохранения'); } };
  const handleSaveNewsEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNews) return;
    try {
      await updateDoc(doc(db, 'news', editingNews.id), {
        title: editNewsTitle,
        body: editNewsBody,
        linkUrl: editNewsLink
      });
      setEditingNews(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Ошибка при сохранении новости');
    }
  };

  // 4. СОЗДАНИЕ ОПРОСА
  const handleCreatePoll = async () => {
    if (!pollQuestion || pollOptions.some(o => !o.trim())) { alert('Заполните вопрос и варианты'); return; }
    try {
      await addDoc(collection(db, 'polls'), {
        question: pollQuestion,
        targetCategory: pollTargetCategory,
        options: pollOptions.map(o => ({ id: `opt_${Date.now()}_${Math.random()}`, text: o, votes: [] })),
        isActive: true,
        createdBy: auth.currentUser?.uid,
        createdAt: new Date().toISOString()
      });
      
      let targetUserIds: string[] | undefined = undefined;
      if (pollTargetCategory && pollTargetCategory !== 'Все') {
        targetUserIds = users.filter(u => u.position === pollTargetCategory).map(u => u.id);
      }
      await sendPushNotification('📊 Новый опрос', `Пожалуйста, уделите минуту: ${pollQuestion}`, targetUserIds, 'https://union-app-two.vercel.app/dashboard?tab=polls');

      setPollQuestion(''); setPollOptions(['', '']); setPollTargetCategory('Все'); setIsCreatingPoll(false);
      await logAction('create_poll', 'poll', `Создан опрос: ${pollQuestion}`);
      fetchData();
      alert('Опрос запущен');
    } catch { alert('Ошибка'); }
  };

  const handleDeletePoll = async (id: string) => {
    if (confirm('Удалить опрос? Это действие нельзя отменить.')) {
      await deleteDoc(doc(db, 'polls', id));
      await logAction('delete_poll', 'poll', `Удален опрос: ${id}`);
      fetchData();
    }
  };

  const handleExportDelegations = () => {
    const dataToExport = delegations
      .filter(d => d.status !== 'pending')
      .filter(d => delegationFilterConf === 'all' || d.conferenceId === delegationFilterConf);

    if (dataToExport.length === 0) { alert('Нет данных для экспорта'); return; }

    const csvContent = [
      ['Дата', 'Кто', 'Кому', 'Событие', 'Статус', 'Документ'],
      ...dataToExport.map(d => [
        new Date(d.createdAt).toLocaleString(),
        d.fromName,
        d.toName,
        d.conferenceTitle || '',
        d.status,
        d.docUrl || ''
      ])
    ].map(e => e.join(',')).join('\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `delegations_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  // ОСТАЛЬНЫЕ ФУНКЦИИ
  const handleApproveDelegation = async (req: DelegationRequest) => { if (!confirm(`Одобрить?`)) return; await updateDoc(doc(db, 'delegation_requests', req.id), { status: 'approved' }); await updateDoc(doc(db, 'users', req.fromId), { voteWeight: 0, delegationStatus: 'approved', delegatedTo: req.toId, delegatedToName: req.toName, delegationConferenceId: req.conferenceId || null }); await updateDoc(doc(db, 'users', req.toId), { voteWeight: increment(1), delegatedFrom: arrayUnion(req.fromName) }); await logAction('approve_delegation', 'delegation', `Делегирование: ${req.fromName} -> ${req.toName}`); fetchData(); };
  const handleRejectDelegation = async (reqId: string, fromId: string) => { if (!confirm('Отклонить?')) return; await deleteDoc(doc(db, 'delegation_requests', reqId)); await updateDoc(doc(db, 'users', fromId), { delegationStatus: null, delegatedToName: null }); await logAction('reject_delegation', 'delegation', `Отклонено делегирование: ${reqId}`); fetchData(); };
  const handleApproveUser = async (u: UserData) => { 
    const cat = pendingCategories[u.id];
    if (!cat && !confirm('Вы не выбрали категорию. Принять без категории?')) return;

    if (confirm('Подтвердить принятие участника?')) { 
      setIsApproving(true);
      try {
        const updateData: any = { status: 'approved', voteWeight: 1 };
      
      if (cat) updateData.category = cat;

      if (!u.isAlreadyMember && !u.joinDate) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        updateData.joinDate = `${yyyy}-${mm}`;
      }

      await updateDoc(doc(db, 'users', u.id), updateData); 
      await logAction('approve_user', 'user', `Участник принят: ${u.id}`); 
      
      // Сохраняем документы на Google Drive
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          const filesToUpload = [];
          if (u.statementUrl && !u.isAlreadyMember) filesToUpload.push({ url: u.statementUrl, type: 'statement' });
          if (u.idCardUrl) filesToUpload.push({ url: u.idCardUrl, type: 'idCard' });
          if (u.deductionUrl && !u.isAlreadyMember) filesToUpload.push({ url: u.deductionUrl, type: 'deduction' });

          if (filesToUpload.length > 0) {
            try {
              // Ждем ответа, чтобы показать ошибку если что-то не так
              const driveRes = await fetch('/api/upload-to-drive', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  userName: u.displayName || u.email,
                  files: filesToUpload
                })
              });
              
              const driveData = await driveRes.json();
              if (!driveRes.ok || !driveData.success) {
                alert('Ошибка загрузки на Google Диск: ' + JSON.stringify(driveData));
              }
            } catch (e) {
               alert('Ошибка сети при загрузке на Google Диск: ' + e);
            }
          }
        }
      } catch (err) {
        console.error('Ошибка сохранения на Google Drive:', err);
      }
      
      // Очищаем локальное состояние категории после успешного принятия
      const newCats = {...pendingCategories};
      delete newCats[u.id];
      setPendingCategories(newCats);

      // Отправляем push-уведомление пользователю
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              title: 'Ваша заявка одобрена! 🎉',
              body: 'Вы успешно приняты в Профсоюз. Добро пожаловать!',
              userIds: [u.id]
            })
          });
        }
      } catch (err) {
        console.error('Ошибка отправки push-уведомления:', err);
      }

      // Отправляем Email-уведомление пользователю
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token && u.email) {
          await fetch('/api/send-welcome-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              userEmail: u.email,
              userName: u.displayName
            })
          });
        }
      } catch (err) {
        console.error('Ошибка отправки Email-уведомления:', err);
      }

      // Отправляем заявление на удержание в бухгалтерию (если есть)
      if (u.deductionUrl) {
        try {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            await fetch('/api/send-accounting-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                userEmail: u.email,
                userName: u.displayName,
                phone: u.phoneNumber,
                position: u.position,
                category: u.category,
                deductionUrl: u.deductionUrl
              })
            });
          }
        } catch (err) {
          console.error('Ошибка отправки в бухгалтерию:', err);
        }
      }

      fetchData(); 
      } finally {
        setIsApproving(false);
      }
    } 
  };
  const handleRejectUser = async (id: string, statementUrl?: string, idCardUrl?: string, deductionUrl?: string) => { 
    if (confirm('Удалить?')) { 
      if (statementUrl) {
        try {
          const fileRef = ref(storage, statementUrl);
          await deleteObject(fileRef);
        } catch (e) {
          console.error("Ошибка при удалении файла", e);
        }
      }
      if (deductionUrl) {
        try {
          const fileRef = ref(storage, deductionUrl);
          await deleteObject(fileRef);
        } catch (e) {
          console.error("Ошибка при удалении файла", e);
        }
      }
      if (idCardUrl) {
        try {
          const fileRef = ref(storage, idCardUrl);
          await deleteObject(fileRef);
        } catch (e) {
          console.error("Ошибка при удалении ID", e);
        }
      }

      // Удаляем из Firebase Authentication
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch('/api/delete-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ targetUserId: id })
          });
        }
      } catch (err) {
        console.error('Ошибка удаления из Auth:', err);
      }

      await deleteDoc(doc(db, 'users', id)); 
      await logAction('reject_user', 'user', `Участник удален/отклонен: ${id}`); 
      fetchData(); 
    } 
  };

  const handleFreezeUser = async (u: UserData) => {
    if (confirm(`Заморозить аккаунт ${u.displayName}?`)) {
      await updateDoc(doc(db, 'users', u.id), { status: 'frozen' });
      await logAction('freeze_user', 'user', `Участник заморожен: ${u.id}`);
      fetchData();
    }
  };

  const handleUnfreezeUser = async (u: UserData) => {
    if (confirm(`Разморозить аккаунт ${u.displayName}?`)) {
      await updateDoc(doc(db, 'users', u.id), { status: 'approved' });
      await logAction('unfreeze_user', 'user', `Участник разморожен: ${u.id}`);
      fetchData();
    }
  };

  const handleSaveUserEdit = async () => {
    if (!selectedUser) return;
    try {
      const updateData: any = {
        displayName: editUserForm.name,
        position: editUserForm.pos,
        phoneNumber: editUserForm.phone,
        email: editUserForm.email,
        category: editUserForm.category,
        leaveStatus: editUserForm.leaveStatus,
        leaveStartDate: editUserForm.leaveStartDate,
        leaveEndDate: editUserForm.leaveEndDate
      };
      await updateDoc(doc(db, 'users', selectedUser.id), updateData);
      setSelectedUser({...selectedUser, displayName: editUserForm.name, position: editUserForm.pos, phoneNumber: editUserForm.phone, email: editUserForm.email, category: editUserForm.category, leaveStatus: editUserForm.leaveStatus, leaveStartDate: editUserForm.leaveStartDate, leaveEndDate: editUserForm.leaveEndDate});
      setIsEditingUser(false);
      await logAction('edit_user', 'user', `Отредактирован профиль: ${selectedUser.id}`);
      fetchData();
    } catch (e) {
      alert("Ошибка при сохранении");
    }
  };

  const handleDeleteUserFile = async (id: string, fileUrl: string, field: 'statementUrl' | 'idCardUrl' | 'deductionUrl') => {
    if (confirm('Удалить прикрепленный файл пользователя из облака?')) {
      try {
        try {
          const fileRef = ref(storage, fileUrl);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Файл не найден в хранилище, удаляем только ссылку:", storageErr);
        }
        await updateDoc(doc(db, 'users', id), { [field]: '' });
        await logAction('delete_user_file', 'user', `Удален файл у пользователя: ${id}`);
        fetchData();
      } catch (e) {
        console.error("Ошибка при обновлении профиля пользователя", e);
        alert('Ошибка при удалении файла.');
      }
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    let photoUrl = '';
    if (memberFile) photoUrl = await uploadImage(memberFile, 'team');
    const order = team.length > 0 ? Math.max(...team.map(t => t.order || 0)) + 1 : 0;
    await addDoc(collection(db, 'team'), { name: memberName, role: memberRole, photoUrl, order });
    await logAction('add_member', 'team', `Добавлен член команды: ${memberName}`);
    setMemberName(''); setMemberRole(''); setMemberFile(null);
    fetchData();
    setIsUploading(false);
  };

  const handleMoveMember = async (id: string, direction: 'up' | 'down') => {
    const newTeam = [...team];
    const index = newTeam.findIndex(t => t.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTeam.length) return;

    // Swap locally
    [newTeam[index], newTeam[targetIndex]] = [newTeam[targetIndex], newTeam[index]];
    setTeam(newTeam); // Optimistic UI update

    // Update ALL orders to ensure consistency
    try {
      await Promise.all(newTeam.map((t, i) => updateDoc(doc(db, 'team', t.id), { order: i })));
    } catch (e) { console.error('Sort error', e); fetchData(); } // Revert on error
  };

  const handleDeleteMember = async (id: string) => { if (confirm('Del?')) await deleteDoc(doc(db, 'team', id)); await logAction('delete_member', 'team', `Удален член команды: ${id}`); fetchData(); };
  const handleEditMember = async (m: TeamMember) => {
    const newName = prompt('Новое ФИО:', m.name);
    if (newName === null) return;
    const newRole = prompt('Новая Роль:', m.role);
    if (newRole === null) return;
    try {
      await updateDoc(doc(db, 'team', m.id), {
        name: newName || m.name,
        role: newRole || m.role
      });
      fetchData();
      await logAction('edit_member', 'team', `Отредактирован член команды: ${m.id}`);
    } catch (e) { alert('Ошибка при обновлении'); }
  };
  const handleAddLink = async (e: React.FormEvent) => { e.preventDefault(); await addDoc(collection(db, 'links'), { title: linkTitle, url: linkUrl }); await logAction('add_link', 'resource', `Добавлена ссылка: ${linkTitle}`); setLinkTitle(''); setLinkUrl(''); fetchData(); };
  const handleDeleteLink = async (id: string) => { if (confirm('Del?')) await deleteDoc(doc(db, 'links', id)); await logAction('delete_link', 'resource', `Удалена ссылка: ${id}`); fetchData(); };
  const handleAddTemplate = async (e: React.FormEvent) => { e.preventDefault(); setIsUploading(true); if (!tplFile) return; const fileUrl = await uploadImage(tplFile, 'templates'); await addDoc(collection(db, 'templates'), { title: tplTitle, description: tplDesc, fileUrl }); await logAction('add_template', 'resource', `Добавлен шаблон: ${tplTitle}`); setTplTitle(''); setTplDesc(''); setTplFile(null); fetchData(); setIsUploading(false); };
  const handleDeleteTemplate = async (id: string) => { if (confirm('Del?')) await deleteDoc(doc(db, 'templates', id)); await logAction('delete_template', 'resource', `Удален шаблон: ${id}`); fetchData(); };
  const handleEditTemplate = async (t: DocTemplate) => {
    const newTitle = prompt('Новое название:', t.title);
    if (newTitle === null) return; // Cancelled
    const newDesc = prompt('Новое описание:', t.description || '');
    if (newDesc === null) return; // Cancelled

    try {
      await updateDoc(doc(db, 'templates', t.id), {
        title: newTitle || t.title,
        description: newDesc || ''
      });
      fetchData();
    } catch (e) { alert('Ошибка при обновлении'); }
  };
  const handleToggleRegistrationTemplate = async (t: DocTemplate) => {
    try {
      await updateDoc(doc(db, 'templates', t.id), {
        isRegistrationTemplate: !t.isRegistrationTemplate
      });
      fetchData();
    } catch (e) {
      alert('Ошибка обновления');
    }
  };
  const handleManualAidSubmit = async () => {
    if (!manualAidName || !manualAidAmount || (!manualAidCategory && !manualAidCustomCategory)) {
      alert('Заполните ФИО, категорию и сумму.');
      return;
    }
    const finalCategory = manualAidCategory === 'Другое' ? manualAidCustomCategory : manualAidCategory;
    
    setIsSubmittingManualAid(true);
    try {
      let fileUrl = '';
      if (manualAidFile) {
        const storageRef = ref(storage, `requests/manual_${Date.now()}_${manualAidFile.name}`);
        await uploadBytes(storageRef, manualAidFile);
        fileUrl = await getDownloadURL(storageRef);
      } else if (editingManualAidId) {
        const existingReq = requests.find(r => r.id === editingManualAidId);
        if (existingReq?.fileUrl) fileUrl = existingReq.fileUrl;
      }

      const selectedDate = manualAidDate ? new Date(manualAidDate) : new Date();

      if (editingManualAidId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
          text: `Запрос материальной помощи: ${finalCategory}\nКомментарий: Оффлайн заявка (вручную)`,
          aidAmount: Number(manualAidAmount),
          createdAt: selectedDate.toISOString(),
          userName: manualAidName
        };
        if (fileUrl) updateData.fileUrl = fileUrl;
        
        await updateDoc(doc(db, 'requests', editingManualAidId), updateData);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRequests(requests.map(r => r.id === editingManualAidId ? { ...r, ...updateData } as any : r));
      } else {
        const newReqData = {
          userEmail: `offline_user_${Date.now()}@union.local`,
          text: `Запрос материальной помощи: ${finalCategory}\nКомментарий: Оффлайн заявка (вручную)`,
          fileUrl,
          aidStatus: 'pending',
          aidAmount: Number(manualAidAmount),
          isOffline: true,
          createdAt: selectedDate.toISOString(),
          userName: manualAidName
        };
        
        const docRef = await addDoc(collection(db, 'requests'), newReqData);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRequests([{ ...newReqData, id: docRef.id } as any, ...requests]);
      }
      
      setShowManualAidModal(false);
      setEditingManualAidId(null);
      setManualAidName('');
      setManualAidCategory('');
      setManualAidCustomCategory('');
      setManualAidAmount('');
      setManualAidDate('');
      setManualAidFile(null);
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении заявки');
    } finally {
      setIsSubmittingManualAid(false);
    }
  };

  const handleEditManualAid = (req: RequestData) => {
    setEditingManualAidId(req.id);
    setManualAidName(req.userName || '');
    setManualAidAmount(req.aidAmount ? req.aidAmount.toString() : '');
    const dateObj = new Date(req.createdAt);
    setManualAidDate(dateObj.toISOString().split('T')[0]);
    
    let category = '';
    const match = req.text.match(/Запрос материальной помощи:\s*(.+?)\n/);
    if (match && match[1]) {
      category = match[1].trim();
    } else {
      category = req.text.replace('Запрос материальной помощи: ', '').replace('\nКомментарий: Оффлайн заявка (вручную)', '').trim();
    }
    
    const defaultCategories = ['Смерть близкого родственника', 'Смерть сотрудника', 'Юбилей', 'Рождение ребенка'];
    if (defaultCategories.includes(category)) {
      setManualAidCategory(category);
      setManualAidCustomCategory('');
    } else {
      setManualAidCategory('Другое');
      setManualAidCustomCategory(category);
    }
    
    setShowManualAidModal(true);
  };


  const handlePayManualAid = async (id: string) => {
    try {
      await updateDoc(doc(db, 'requests', id), { aidStatus: 'approved' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRequests(requests.map(r => r.id === id ? { ...r, aidStatus: 'approved' } as any : r));
    } catch (e) {
      console.error(e);
      alert('Ошибка при обновлении статуса');
    }
  };

  const handleReplyRequest = async (id: string, isAid: boolean = false) => {
    if (replyText[id]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { response: replyText[id], responseAt: new Date().toISOString() };
      if (isAid) {
        updateData.aidStatus = replyAidStatus[id] || 'approved';
        updateData.aidAmount = parseInt(replyAidAmount[id] || '0', 10);
      }
      await updateDoc(doc(db, 'requests', id), updateData);
      fetchData();
    }
  };
  const handleDeleteRequest = async (id: string) => { if (confirm('Удалить обращение?')) { await deleteDoc(doc(db, 'requests', id)); await logAction('delete_request', 'requests', `Удалено обращение: ${id}`); fetchData(); } };

  if (loading) return <div className="min-h-screen bg-[#F2F6FF] flex items-center justify-center font-black text-blue-900 animate-pulse">Загрузка данных...</div>;

  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeRequests = requests.filter(r => !r.response).length;
  const pendingDelegations = delegations.filter(d => d.status === 'pending');

  const filteredApprovedUsers = users
    .filter(u => 
      (userStatusFilter === 'all' ? (u.status === 'approved' || u.status === 'frozen') : u.status === userStatusFilter) && 
      (userCategoryFilter === '' || 
       (userCategoryFilter === 'none' && !u.category) || 
       u.category === userCategoryFilter) &&
      (!userSearchQuery || 
       u.displayName?.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
       u.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
       u.phoneNumber?.includes(userSearchQuery) ||
       u.position?.toLowerCase().includes(userSearchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      if (userSortMode === 'alpha') {
        return (a.displayName || '').localeCompare(b.displayName || '');
      } else {
        const dateA = a.joinDate || '';
        const dateB = b.joinDate || '';
        return dateB.localeCompare(dateA);
      }
    });

  const newMembersStats = (() => {
    const stats: Record<string, { count: number; details: Array<{name: string, position: string}> }> = {};
    users.forEach(u => {
      if (u.status === 'approved' && u.isAlreadyMember === false && u.joinDate) {
        if (!stats[u.joinDate]) stats[u.joinDate] = { count: 0, details: [] };
        stats[u.joinDate].count += 1;
        stats[u.joinDate].details.push({
          name: u.displayName || u.email || 'Неизвестно',
          position: u.position || 'Без должности'
        });
      }
    });
    return stats;
  })();

  const aidStats = (() => {
    const stats: Record<string, { count: number; amount: number; pendingCount: number; details: Array<{name: string, amount: number, reason: string, isPending: boolean}> }> = {};
    requests.forEach(r => {
      if (r.text.startsWith('Запрос материальной помощи') && (r.aidStatus === 'approved' || r.aidStatus === 'pending') && r.createdAt) {
        const month = r.createdAt.substring(0, 7);
        if (!stats[month]) stats[month] = { count: 0, amount: 0, pendingCount: 0, details: [] };
        
        const isPending = r.aidStatus === 'pending';
        
        if (!isPending) {
          stats[month].count += 1;
          stats[month].amount += (r.aidAmount || 0);
        } else {
          stats[month].pendingCount += 1;
        }
        
        const reason = r.text.split('\n')[0].replace('Запрос материальной помощи: ', '').trim();
        const requestUser = users.find(u => u.email === r.userEmail);
        const name = r.userName || requestUser?.displayName || r.userEmail || 'Неизвестно';
        
        stats[month].details.push({
            name: name,
            amount: r.aidAmount || 0,
            reason: reason,
            isPending: isPending
        });
      }
    });
    return stats;
  })();

  const pollStats = (() => {
    const stats: Record<string, { active: number; total: number }> = {};
    polls.forEach(p => {
      const cat = p.targetCategory || 'Все';
      if (!stats[cat]) stats[cat] = { active: 0, total: 0 };
      stats[cat].total += 1;
      if (p.isActive) stats[cat].active += 1;
    });
    return Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
  })();

  return (
    <div className="min-h-screen bg-[#F2F6FF] flex flex-col font-sans text-[#1A1A1A]">
      {isApproving && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-black text-blue-900 mb-2">Обработка заявки...</h3>
          <p className="text-gray-600 font-medium text-center max-w-sm">
            Сохраняем документы на Google Диск и рассылаем уведомления. Пожалуйста, не закрывайте страницу.
          </p>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white shadow-xl z-20 sticky top-0 rounded-b-[1.5rem] mb-4">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5 flex justify-between items-center">
          <div><h1 className="text-xl md:text-2xl font-black uppercase tracking-wide">Админ-Панель</h1><p className="text-[10px] md:text-xs text-blue-200 font-bold opacity-70">Профсоюз Авиаработников</p></div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard')} className="bg-white/10 hover:bg-white/20 backdrop-blur-md px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all">← Кабинет</button>
            {/* Hamburger for mobile */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden bg-white/10 hover:bg-white/20 backdrop-blur-md p-2 rounded-xl transition-all">
              <span className="text-xl">{mobileMenuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {/* Desktop tabs */}
        <div className="hidden md:flex max-w-7xl mx-auto px-4 gap-2 overflow-x-auto pb-4 no-scrollbar">
          {[
            { id: 'dashboard', label: 'Главная', icon: '📊' },
            { id: 'events', label: 'События', icon: '🎓' },
            { id: 'users', label: 'Участники', icon: '👥', count: pendingUsers.length, color: 'bg-red-500' },
            { id: 'delegations', label: 'Голоса', icon: '🗳️', count: pendingDelegations.length, color: 'bg-indigo-500' },
            { id: 'polls', label: 'Опросы', icon: '📋', count: polls.filter(p => p.isActive).length, color: 'bg-green-500' },
            { id: 'requests', label: 'Вопросы', icon: '💬', count: activeRequests, color: 'bg-blue-500' },
            { id: 'news', label: 'Новости', icon: '📰' },
            { id: 'resources', label: 'Ресурсы', icon: '📂' },
            { id: 'team', label: 'Совет', icon: '👔' },
            { id: 'logs', label: 'Аудит', icon: '🛡️' },
            { id: 'registry', label: 'Реестр', icon: '📋' }
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} className={`px-4 py-2.5 rounded-xl font-bold whitespace-nowrap flex items-center gap-1.5 transition-all duration-300 text-sm ${activeTab === tab.id ? 'bg-white text-blue-900 shadow-lg scale-105' : 'bg-blue-900/40 text-blue-100 hover:bg-blue-800/50'}`}>
              <span className="text-base">{tab.icon}</span> {tab.label}
              {tab.count !== undefined && tab.count > 0 && (<span className={`${tab.color || 'bg-gray-500'} text-white text-[9px] px-1.5 py-0.5 rounded-full ml-1`}>{tab.count}</span>)}
            </button>
          ))}
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-gradient-to-b from-indigo-900 to-indigo-950 border-t border-white/10 rounded-b-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3 space-y-1">
              {[
                { id: 'dashboard', label: 'Главная', icon: '📊' },
                { id: 'events', label: 'События & Обучение', icon: '🎓' },
                { id: 'users', label: 'Участники', icon: '👥', count: pendingUsers.length, color: 'bg-red-500' },
                { id: 'delegations', label: 'Голоса', icon: '🗳️', count: pendingDelegations.length, color: 'bg-indigo-500' },
                { id: 'polls', label: 'Опросы', icon: '📋', count: polls.filter(p => p.isActive).length, color: 'bg-green-500' },
                { id: 'requests', label: 'Вопросы', icon: '💬', count: activeRequests, color: 'bg-blue-500' },
                { id: 'news', label: 'Новости', icon: '📰' },
                { id: 'resources', label: 'Ресурсы', icon: '📂' },
                { id: 'team', label: 'Совет', icon: '👔' },
                { id: 'logs', label: 'Аудит', icon: '🛡️' },
                { id: 'registry', label: 'Реестр', icon: '📋' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id as typeof activeTab); setMobileMenuOpen(false); }}
                  className={`w-full px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-all ${activeTab === tab.id ? 'bg-white text-blue-900' : 'text-white/80 hover:bg-white/10'}`}
                >
                  <span className="text-xl w-8">{tab.icon}</span>
                  <span className="flex-1 text-left">{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (<span className={`${tab.color || 'bg-gray-500'} text-white text-[10px] px-2 py-0.5 rounded-full`}>{tab.count}</span>)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-grow p-4 md:p-6 pb-20">
        <div className="max-w-7xl mx-auto">

          {/* 0. ДАШБОРД (ГЛАВНАЯ) */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

              {/* STATS CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-indigo-50">
                  <p className="text-xs font-bold text-gray-400 uppercase">Всего участников</p>
                  <p className="text-3xl font-black text-indigo-900 mt-1">{users.filter(u => u.status === 'approved').length}</p>
                </div>
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-indigo-50">
                  <p className="text-xs font-bold text-gray-400 uppercase">Новые заявки</p>
                  <p className="text-3xl font-black text-orange-500 mt-1">{pendingUsers.length}</p>
                </div>
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-indigo-50">
                  <p className="text-xs font-bold text-gray-400 uppercase">Вопросов</p>
                  <p className="text-3xl font-black text-blue-500 mt-1">{activeRequests}</p>
                </div>
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-indigo-50">
                  <p className="text-xs font-bold text-gray-400 uppercase">Активных опросов</p>
                  <p className="text-3xl font-black text-green-500 mt-1">{polls.filter(p => p.isActive).length}</p>
                </div>
              </div>

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
                    <p className="text-blue-100 font-bold text-xs mb-6">Новые члены профсоюза за текущий год ({new Date().getFullYear()}). Нажмите на месяц для деталей.</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {[
                        { num: '01', name: 'Янв' },
                        { num: '02', name: 'Фев' },
                        { num: '03', name: 'Мар' },
                        { num: '04', name: 'Апр' },
                        { num: '05', name: 'Май' },
                        { num: '06', name: 'Июн' },
                        { num: '07', name: 'Июл' },
                        { num: '08', name: 'Авг' },
                        { num: '09', name: 'Сен' },
                        { num: '10', name: 'Окт' },
                        { num: '11', name: 'Ноя' },
                        { num: '12', name: 'Дек' }
                      ].map(m => {
                        const key = `${new Date().getFullYear()}-${m.num}`;
                        const stat = newMembersStats[key] || { count: 0, details: [] };
                        return (
                          <div 
                            key={m.num} 
                            onClick={() => { if (stat.count > 0) setSelectedMonthStats({ name: m.name, details: stat.details }); }}
                            className={`bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm transition ${stat.count > 0 ? 'cursor-pointer hover:bg-white/20 hover:scale-105' : 'cursor-default opacity-50'}`}
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
                        { num: '01', name: 'Янв' },
                        { num: '02', name: 'Фев' },
                        { num: '03', name: 'Мар' },
                        { num: '04', name: 'Апр' },
                        { num: '05', name: 'Май' },
                        { num: '06', name: 'Июн' },
                        { num: '07', name: 'Июл' },
                        { num: '08', name: 'Авг' },
                        { num: '09', name: 'Сен' },
                        { num: '10', name: 'Окт' },
                        { num: '11', name: 'Ноя' },
                        { num: '12', name: 'Дек' }
                      ].map(m => {
                        const key = `${new Date().getFullYear()}-${m.num}`;
                        const stat = aidStats[key] || { count: 0, amount: 0, pendingCount: 0, details: [] };
                        return (
                          <div key={m.num} tabIndex={0} className="bg-white/10 backdrop-blur-md px-2 py-3 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-sm hover:bg-white/20 transition cursor-pointer md:cursor-default relative group/month outline-none">
                            <span className="text-[10px] text-green-200 font-bold mb-1 uppercase tracking-wider">{m.name}</span>
                            <span className={`text-sm md:text-[15px] font-black leading-tight ${stat.count > 0 ? 'text-white' : 'text-white/30'}`}>
                              {stat.count > 0 ? `${stat.amount.toLocaleString('ru-RU')} ₸` : '0 ₸'}
                            </span>
                            {stat.count > 0 && <span className="text-[9px] text-green-100 font-bold mt-0.5">{stat.count} шт</span>}
                            {stat.pendingCount > 0 && <span className="text-[9px] text-orange-200 font-bold mt-0.5 opacity-80">+ {stat.pendingCount} ожид.</span>}
                            
                            {stat.details && stat.details.length > 0 && (
                              <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-gray-900 text-white text-xs rounded-xl p-3 opacity-0 invisible group-hover/month:opacity-100 group-hover/month:visible group-focus/month:opacity-100 group-focus/month:visible transition-all shadow-xl pointer-events-none">
                                <div className="font-black mb-2 text-green-400 border-b border-gray-700 pb-1">Выплаты за {m.name}</div>
                                <div className="max-h-32 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-600">
                                  {stat.details.map((d, i) => (
                                    <div key={i} className={`flex flex-col py-1 ${d.isPending ? 'bg-orange-500/10 px-2 rounded-lg border border-orange-500/30 mb-1' : ''}`}>
                                      <span className="font-bold">{d.name} {d.isPending && <span className="text-orange-400 text-[9px] uppercase tracking-wider ml-1">В очереди</span>}</span>
                                      <span className="text-gray-400 text-[10px]">{d.reason}</span>
                                      <span className={`${d.isPending ? 'text-orange-300' : 'text-green-300'} font-black`}>{d.amount.toLocaleString('ru-RU')} ₸</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* POLL STATS */}
                <div className="md:col-span-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-[2rem] shadow-xl text-white p-6 md:p-8 relative group">
                  <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -mr-20 -mt-20 group-hover:bg-white/20 transition-all duration-700"></div>
                  </div>
                  <div className="relative z-10">
                    <h3 className="font-black text-xl mb-2 flex items-center gap-2">
                      <span className="text-2xl">📊</span> Статистика опросов
                    </h3>
                    <p className="text-orange-100 font-bold text-xs mb-6">Количество созданных опросов по категориям работников.</p>
                    <div className="flex flex-wrap gap-3">
                      {pollStats.length > 0 ? pollStats.map(([category, stat]) => (
                        <div key={category} className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl flex flex-col border border-white/20 shadow-lg hover:bg-white/20 transition cursor-default flex-1 min-w-[140px]">
                          <div className="flex justify-between items-end mb-1">
                            <span className="text-3xl font-black">{stat.total}</span>
                            {stat.active > 0 && <span className="text-xs font-black bg-green-500 text-white px-2 py-0.5 rounded-full mb-1 flex items-center gap-1 shadow-lg shadow-green-500/50"><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> {stat.active} акт.</span>}
                          </div>
                          <span className="text-xs font-black text-orange-100 tracking-wider uppercase mt-1">{category}</span>
                        </div>
                      )) : (
                        <div className="text-orange-200 text-xs font-bold bg-black/20 px-4 py-2 rounded-xl">Нет данных</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SETTINGS (ACCOUNTING EMAIL) */}
                <div className="md:col-span-1 bg-white p-6 md:p-8 rounded-[2rem] shadow-lg border border-gray-100 flex flex-col justify-center">
                  <h3 className="font-black text-xl mb-2 text-gray-800">Настройки уведомлений</h3>
                  <p className="text-gray-500 font-bold text-xs mb-4">Настройте автоматическую отправку заявлений на удержание взносов. Можно указать несколько Email через запятую.</p>
                  <div className="space-y-3">
                    <input 
                      type="text" 
                      placeholder="acc1@mail.ru, acc2@mail.ru" 
                      className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none focus:ring-2 focus:ring-blue-500 transition"
                      value={accountingEmail}
                      onChange={e => setAccountingEmail(e.target.value)}
                    />
                    <button 
                      onClick={handleSaveAccountingEmail}
                      disabled={isSavingEmail}
                      className="w-full bg-blue-600 text-white font-black py-3 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition hover:scale-105 disabled:opacity-50"
                    >
                      {isSavingEmail ? 'Сохранение...' : 'Сохранить Email'}
                    </button>
                  </div>
                </div>

                {/* RECENT ACTIVITY / CHART PLACEHOLDER */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-lg border border-gray-100">
                  <h3 className="font-black text-xl mb-4 text-gray-800">Активность тестов</h3>
                  <div className="space-y-4">
                    {tests.slice(0, 3).map(t => (
                      <div key={t.id}>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span>{t.title}</span>
                          <span>{Math.round(((t.completedBy?.length || 0) / (users.filter(u => u.status === 'approved').length || 1)) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${((t.completedBy?.length || 0) / (users.filter(u => u.status === 'approved').length || 1)) * 100}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* UPCOMING EVENTS */}
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 md:p-8 rounded-[2rem] text-white shadow-xl shadow-blue-200">
                  <h3 className="font-black text-xl mb-4 opacity-90">Ближайшие события</h3>
                  {conferences.filter(c => new Date(c.date) > new Date()).slice(0, 3).map(c => (
                    <div key={c.id} className="bg-white/10 p-4 rounded-xl mb-3 backdrop-blur-sm border border-white/10">
                      <p className="font-bold text-lg">{c.title}</p>
                      <p className="text-xs font-bold opacity-70 mt-1">{new Date(c.date).toLocaleString()}</p>
                    </div>
                  ))}
                  {conferences.filter(c => new Date(c.date) > new Date()).length === 0 && (
                    <div className="text-center py-8 opacity-60 font-bold">Нет запланированных событий</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 0.5 ОПРОСЫ */}
          {activeTab === 'polls' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {!isCreatingPoll ? (
                <button onClick={() => setIsCreatingPoll(true)} className="w-full py-6 rounded-[2rem] border-2 border-dashed border-green-300 bg-green-50 text-green-600 font-black text-xl hover:bg-green-100 transition-colors">
                  + Создать новый опрос
                </button>
              ) : (
                <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-green-100">
                  <h2 className="font-black text-2xl mb-4">Новый опрос</h2>
                  <div className="space-y-4">
                    <input className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none" placeholder="Вопрос..." value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} />

                    <select 
                      className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-r-[16px] border-transparent"
                      value={pollTargetCategory}
                      onChange={e => setPollTargetCategory(e.target.value)}
                    >
                      <option value="Все">Для всех (Все категории)</option>
                      <option value="Бортпроводник">Бортпроводник</option>
                      <option value="Пилот">Пилот</option>
                      <option value="Наземка">Наземка</option>
                      <option value="Перрон">Перрон</option>
                      <option value="Инженеры">Инженеры</option>
                      <option value="Руководитель">Руководитель</option>
                      <option value="Офис">Офис</option>
                      <option value="Авиационная безопасность">Авиационная безопасность</option>
                    </select>

                    <div className="pl-4 border-l-2 border-green-200 space-y-2">
                      {pollOptions.map((opt, i) => (
                        <input key={i} className="w-full p-3 bg-white border border-gray-200 rounded-xl font-medium text-sm" placeholder={`Вариант ${i + 1}`} value={opt} onChange={e => {
                          const newOpts = [...pollOptions]; newOpts[i] = e.target.value; setPollOptions(newOpts);
                        }} />
                      ))}
                      <button onClick={() => setPollOptions([...pollOptions, ''])} className="text-xs font-bold text-green-600">+ Добавить вариант</button>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => setIsCreatingPoll(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">Отмена</button>
                      <button onClick={handleCreatePoll} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-black shadow-lg shadow-green-200">Запустить</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                <h2 className="font-black text-xl">Все опросы</h2>
                <select 
                  className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-green-500 text-sm font-bold bg-white"
                  value={pollCategoryFilter}
                  onChange={(e) => setPollCategoryFilter(e.target.value)}
                >
                  <option value="all">Все категории</option>
                  <option value="Все">Для всех (Общие)</option>
                  <option value="Бортпроводник">Бортпроводник</option>
                  <option value="Пилот">Пилот</option>
                  <option value="Наземка">Наземка</option>
                  <option value="Перрон">Перрон</option>
                  <option value="Инженеры">Инженеры</option>
                  <option value="Руководитель">Руководитель</option>
                  <option value="Офис">Офис</option>
                  <option value="Авиационная безопасность">Авиационная безопасность</option>
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {polls.filter(p => pollCategoryFilter === 'all' || p.targetCategory === pollCategoryFilter || (!p.targetCategory && pollCategoryFilter === 'Все')).map(poll => (
                  <div key={poll.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-black text-lg leading-tight pr-2">{poll.question}</h3>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase whitespace-nowrap ${poll.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{poll.isActive ? 'Активен' : 'Завершен'}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">🎯 {poll.targetCategory || 'Для всех'}</span>
                      <span className="text-[10px] font-bold text-gray-400">📅 {new Date(poll.createdAt).toLocaleDateString('ru-RU')}</span>
                    </div>
                    <div className="space-y-3">
                      {poll.options.map(opt => {
                        const totalVotes = poll.options.reduce((acc, o) => acc + (o.votes?.length || 0), 0) || 1;
                        const percent = Math.round(((opt.votes?.length || 0) / totalVotes) * 100);
                        return (
                          <div key={opt.id}>
                            <div className="flex justify-between text-xs font-bold mb-1">
                              <span>{opt.text}</span>
                              <span>{percent}% ({opt.votes?.length || 0})</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${percent}%` }}></div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* BUTTONS */}
                    <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                      <button onClick={() => setSelectedPollStats(poll)} className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded-xl text-xs font-black hover:bg-indigo-100 transition">
                        📊 Детали и голоса
                      </button>
                      <button onClick={() => handleDeletePoll(poll.id)} className="w-10 flex items-center justify-center bg-red-50 text-red-400 rounded-xl hover:bg-red-100 transition">
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* MODAL FOR POLL DETAILS */}
              {selectedPollStats && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
                  <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 shadow-2xl relative my-auto animate-in zoom-in-95 duration-200">
                    <button onClick={() => setSelectedPollStats(null)} className="absolute top-6 right-6 text-gray-300 hover:text-gray-600 font-bold text-2xl transition">✕</button>

                    <h2 className="font-black text-2xl mb-1 text-gray-900 pr-8">{selectedPollStats.question}</h2>
                    <p className="text-gray-400 font-bold text-xs uppercase mb-6">{selectedPollStats.isActive ? '🟢 Активен' : '🔴 Завершен'}</p>

                    <div className="space-y-6">
                      {selectedPollStats.options.map(opt => {
                        const voters = opt.votes.map(uid => users.find(u => u.id === uid)).filter(Boolean);
                        return (
                          <div key={opt.id} className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                            <div className="flex justify-between items-center mb-3">
                              <span className="font-black text-lg text-gray-800">{opt.text}</span>
                              <span className="bg-white px-3 py-1 rounded-lg border border-gray-200 text-xs font-bold text-gray-500">Голосов: {opt.votes.length}</span>
                            </div>
                            {voters.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {voters.map((v, idx) => (
                                  <span key={idx} className="bg-white border border-blue-100 text-blue-800 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                    <span className="w-4 h-4 rounded-full bg-gray-200 overflow-hidden relative">
                                      {v?.photoUrl ? <img src={v.photoUrl} className="w-full h-full object-cover" /> : '👤'}
                                    </span>
                                    {v?.displayName || 'Unknown'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic">Нет голосов</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* 1. СОБЫТИЯ И ОБУЧЕНИЕ */}
          {activeTab === 'events' && (
            <div className="space-y-6">
              <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-200 w-fit mx-auto mb-6">
                <button onClick={() => setEventSubTab('conferences')} className={`px-6 py-2 rounded-xl font-bold transition-all ${eventSubTab === 'conferences' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>📅 Собрания</button>
                <button onClick={() => setEventSubTab('tests')} className={`px-6 py-2 rounded-xl font-bold transition-all ${eventSubTab === 'tests' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>🎓 Тесты</button>
              </div>

              {/* КОНФЕРЕНЦИИ */}
              {eventSubTab === 'conferences' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-white p-8 rounded-[2rem] shadow-lg shadow-indigo-200/40 border border-white">
                    <h2 className="font-black text-2xl mb-6 text-gray-800">Назначить событие</h2>
                    <form onSubmit={handleCreateConference} className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="w-full"><label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">Название</label><input className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold outline-none" value={confTitle} onChange={e => setConfTitle(e.target.value)} required /></div>
                      <div className="w-full"><label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">Дата</label><input type="datetime-local" className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold outline-none" value={confDate} onChange={e => setConfDate(e.target.value)} required /></div>
                      <button className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black w-full md:w-auto">Создать</button>
                    </form>
                  </div>
                  <div className="grid gap-4">
                    {conferences.map(conf => {
                      // БЕЗОПАСНАЯ ПРОВЕРКА ДАТЫ
                      const d = conf.date ? new Date(conf.date) : new Date();
                      const isPast = d < new Date();
                      return (<div key={conf.id} className={`p-4 md:p-6 rounded-[2rem] flex justify-between items-center transition-all ${isPast ? 'bg-gray-100 opacity-70 border border-gray-200' : 'bg-white shadow-md border border-indigo-50 hover:shadow-lg'}`}><div><h4 className="font-black text-xl text-gray-900">{conf.title}</h4><p className={`font-bold text-sm flex items-center gap-2 mt-1 ${isPast ? 'text-gray-500' : 'text-green-600'}`}>{isPast ? '🏁 Завершено' : '🟢 Активно'} — {d.toLocaleString()}</p></div><button onClick={() => handleDeleteConference(conf.id)} className="text-red-500 bg-red-50 px-4 py-2 rounded-xl font-bold text-xs uppercase hover:bg-red-100 transition">Удалить</button></div>)
                    })}
                  </div>
                </div>
              )}

              {/* ТЕСТЫ */}
              {eventSubTab === 'tests' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  {!isCreatingTest ? (
                    <button onClick={() => { setIsCreatingTest(true); setEditingTestId(null); setTestTitle(''); setTestDesc(''); setTestQuestions([{ id: 'q1', text: '', options: [{ id: 'o1', text: '', isCorrect: true }] }]); }} className="w-full py-6 rounded-[2rem] border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-600 font-black text-xl hover:bg-indigo-100 transition-colors">
                      + Создать новый обучающий тест
                    </button>
                  ) : (
                    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-indigo-100">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="font-black text-2xl text-gray-800">{editingTestId ? 'Редактировать тест' : 'Конструктор теста'}</h2>
                        <button onClick={() => { setIsCreatingTest(false); setEditingTestId(null); }} className="bg-gray-100 text-gray-500 px-4 py-2 rounded-xl font-bold text-sm">Отмена</button>
                      </div>
                      <div className="space-y-6">
                        <div><label className="text-xs font-black text-gray-400 uppercase ml-2 block">Тема теста</label><input className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition" value={testTitle} onChange={e => setTestTitle(e.target.value)} placeholder="Например: Техника безопасности" /></div>
                        <div><label className="text-xs font-black text-gray-400 uppercase ml-2 block">Описание</label><input className="w-full p-4 bg-gray-50 rounded-2xl font-medium outline-none" value={testDesc} onChange={e => setTestDesc(e.target.value)} placeholder="Краткое описание" /></div>
                        <div className="space-y-4">
                          {testQuestions.map((q, qIdx) => (
                            <div key={q.id} className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 relative">
                              <button onClick={() => handleRemoveQuestion(qIdx)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 font-bold">✕</button>
                              <label className="text-xs font-black text-indigo-400 uppercase ml-2 mb-1 block">Вопрос {qIdx + 1}</label>
                              <input className="w-full p-3 bg-white rounded-xl font-bold border border-indigo-100 mb-4 outline-none" value={q.text} onChange={e => handleUpdateQuestion(qIdx, e.target.value)} placeholder="Текст вопроса..." />
                              <div className="space-y-2 pl-4 border-l-2 border-indigo-200">
                                {q.options.map((opt, oIdx) => (
                                  <div key={opt.id} className="flex items-center gap-3">
                                    <input type="radio" name={`correct-${q.id}`} checked={opt.isCorrect} onChange={() => handleSetCorrectOption(qIdx, oIdx)} className="w-5 h-5 accent-green-600 cursor-pointer" />
                                    <input className={`flex-grow p-2 rounded-lg text-sm font-medium outline-none ${opt.isCorrect ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-white border border-gray-200'}`} value={opt.text} onChange={e => handleUpdateOption(qIdx, oIdx, e.target.value)} placeholder={`Вариант ${oIdx + 1}`} />
                                  </div>
                                ))}
                                <button onClick={() => handleAddOption(qIdx)} className="text-xs font-bold text-indigo-600 hover:underline mt-2">+ Добавить вариант</button>
                              </div>
                            </div>
                          ))}
                          <button onClick={handleAddQuestion} className="w-full py-3 bg-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-gray-200">+ Добавить вопрос</button>
                        </div>
                        <button onClick={handleCreateTest} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-transform active:scale-95">{editingTestId ? 'Сохранить изменения' : 'Сохранить и Опубликовать'}</button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4">
                    {tests.map(test => (
                      <div key={test.id} className="bg-white p-4 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-black text-xl text-gray-900">{test.title}</h3>
                            <p className="text-gray-500 text-sm font-medium">{test.description}</p>
                            {/* БЕЗОПАСНЫЙ ДОСТУП К ВОПРОСАМ */}
                            <div className="mt-2 text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded inline-block">Вопросов: {test.questions?.length || 0}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditTest(test)} className="text-blue-500 bg-blue-50 px-3 py-1 rounded-lg font-bold text-xs uppercase hover:bg-blue-100 transition">Ред</button>
                            <button onClick={() => handleDeleteTest(test.id)} className="text-red-400 hover:text-red-600 font-bold p-2">🗑</button>
                          </div>
                        </div>
                        <div className="bg-gray-100 rounded-full h-4 w-full overflow-hidden relative cursor-pointer group" onClick={() => setSelectedTestStats(test)}>
                          {/* БЕЗОПАСНАЯ АРИФМЕТИКА */}
                          <div className="bg-green-500 h-full transition-all duration-1000" style={{ width: `${((test.completedBy?.length || 0) / (users.filter(u => u.status === 'approved').length || 1)) * 100}%` }}></div>
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-gray-600 group-hover:text-black">
                            Прошли: {test.completedBy?.length || 0} из {users.filter(u => u.status === 'approved').length} (Нажмите для деталей)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. УЧАСТНИКИ */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {pendingUsers.length > 0 && (
                <div className="bg-gradient-to-r from-yellow-100 to-orange-100 p-6 rounded-[2rem] border border-yellow-200 shadow-lg">
                  <h2 className="font-black text-xl mb-4 text-yellow-900">🔔 Ожидают доступа</h2>
                  <div className="grid gap-4">
                    {pendingUsers.map(u => (
                      <div key={u.id} className="flex flex-col md:flex-row md:justify-between items-start md:items-center bg-white/80 p-5 rounded-2xl gap-4 shadow-sm">
                        <div className="flex-1">
                          <span className="font-black block text-lg text-gray-900">{u.displayName}</span>
                          <span className="text-sm text-gray-500 font-bold block mt-1">
                            {u.position} <span className="opacity-50 mx-1">•</span> {u.phoneNumber || 'Без телефона'}
                          </span>
                          <span className="text-xs text-gray-400 block mt-1">{u.email}</span>
                          
                          <div className="mt-3 flex flex-wrap gap-2 items-center">
                            {u.statementUrl && (
                              <a href={u.statementUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-100 transition border border-blue-100">
                                📎 {u.isAlreadyMember ? 'Фото пропуска' : 'Заявление'}
                              </a>
                            )}
                            {u.deductionUrl && (
                              <a href={u.deductionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-green-100 transition border border-green-100">
                                📎 На удержание
                              </a>
                            )}
                            {u.idCardUrl && (
                              <a href={u.idCardUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-orange-100 transition border border-orange-100">
                                📎 Уд. Личности
                              </a>
                            )}
                            {(!u.statementUrl && !u.idCardUrl && !u.deductionUrl) && (
                              <span className="text-xs text-red-500 font-bold">Файлы не прикреплены</span>
                            )}
                            {u.isAlreadyMember && (
                              <span className="inline-flex items-center bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-black border border-green-100">
                                🔰 Член профсоюза {u.joinDate ? `(с ${u.joinDate})` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                          <select 
                            className="bg-white border border-yellow-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 outline-none w-full"
                            value={pendingCategories[u.id] || ''}
                            onChange={(e) => setPendingCategories({...pendingCategories, [u.id]: e.target.value})}
                          >
                            <option value="">🏷️ Категория...</option>
                            <option value="Бортпроводник">Бортпроводник</option>
                            <option value="Пилот">Пилот</option>
                            <option value="Наземка">Наземка</option>
                            <option value="Перрон">Перрон</option>
                            <option value="Инженеры">Инженеры</option>
                            <option value="Руководитель">Руководитель</option>
                            <option value="Офис">Офис</option>
                            <option value="Авиационная безопасность">Авиационная безопасность</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => handleApproveUser(u)} className="flex-1 md:flex-none bg-green-500 text-white px-6 py-2 rounded-xl font-black shadow-lg shadow-green-200/50 hover:bg-green-600 transition hover:scale-105">Принять</button>
                            <button onClick={() => handleRejectUser(u.id, u.statementUrl, u.idCardUrl, u.deductionUrl)} className="flex-1 md:flex-none bg-red-50 text-red-500 px-6 py-2 rounded-xl font-black hover:bg-red-100 transition">Отклонить</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* СТАТИСТИКА ПО КАТЕГОРИЯМ */}
              <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100">
                <h2 className="font-black text-2xl mb-6 text-gray-900">Статистика по категориям</h2>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(
                    users.filter(u => u.status === 'approved').reduce((acc, user) => {
                      const cat = user.category || 'Без категории';
                      acc[cat] = (acc[cat] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([category, count]) => {
                    const filterValue = category === 'Без категории' ? 'none' : category;
                    const isActive = userCategoryFilter === filterValue;
                    return (
                    <div 
                      key={category} 
                      onClick={() => { setUserCategoryFilter(filterValue); setCurrentPage(1); }}
                      className={`border rounded-2xl px-6 py-4 flex flex-col items-center min-w-[140px] flex-1 md:flex-none cursor-pointer transition-all duration-300 ${isActive ? 'bg-blue-600 border-blue-700 shadow-lg scale-105 ring-4 ring-blue-600/20' : 'bg-blue-50/50 border-blue-100 hover:shadow-md hover:bg-blue-100/50'}`}
                    >
                      <span className={`text-3xl font-black mb-1 ${isActive ? 'text-white' : 'text-blue-600'}`}>{count}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider text-center ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>{category}</span>
                    </div>
                  )})}
                  <div 
                    onClick={() => { setUserCategoryFilter(''); setCurrentPage(1); }}
                    className={`border rounded-2xl px-6 py-4 flex flex-col items-center min-w-[140px] flex-1 md:flex-none cursor-pointer transition-all duration-300 ${userCategoryFilter === '' ? 'bg-indigo-600 border-indigo-700 shadow-lg scale-105 ring-4 ring-indigo-600/20' : 'bg-indigo-50 border-indigo-100 hover:shadow-md hover:bg-indigo-100/50'}`}
                  >
                    <span className={`text-3xl font-black mb-1 ${userCategoryFilter === '' ? 'text-white' : 'text-indigo-600'}`}>{users.filter(u => u.status === 'approved').length}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider text-center ${userCategoryFilter === '' ? 'text-indigo-100' : 'text-gray-500'}`}>Всего участников</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100">
                <div className="p-8 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h2 className="font-black text-2xl">Реестр участников</h2>
                  <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <select
                      className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500 text-sm font-bold bg-white"
                      value={userStatusFilter}
                      onChange={(e) => {
                        setUserStatusFilter(e.target.value as any);
                        setCurrentPage(1);
                      }}
                    >
                      <option value="approved">Активные</option>
                      <option value="frozen">Замороженные</option>
                      <option value="all">Все</option>
                    </select>
                    <select
                      className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500 text-sm font-bold bg-white"
                      value={userCategoryFilter}
                      onChange={(e) => {
                        setUserCategoryFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    >
                      <option value="">Все категории</option>
                      <option value="none">Без категории</option>
                      <option value="Бортпроводник">Бортпроводник</option>
                      <option value="Пилот">Пилот</option>
                      <option value="Наземка">Наземка</option>
                      <option value="Перрон">Перрон</option>
                      <option value="Инженеры">Инженеры</option>
                      <option value="Руководитель">Руководитель</option>
                      <option value="Офис">Офис</option>
                      <option value="Авиационная безопасность">Авиационная безопасность</option>
                    </select>
                    <select
                      className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500 text-sm font-bold bg-white"
                      value={userSortMode}
                      onChange={(e) => {
                        setUserSortMode(e.target.value as 'alpha' | 'date');
                        setCurrentPage(1);
                      }}
                    >
                      <option value="alpha">А-Я</option>
                      <option value="date">По дате вступления</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Поиск по имени, email, должности..." 
                      className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500 flex-1 md:w-64 text-sm font-bold"
                      value={userSearchQuery}
                      onChange={(e) => {
                        setUserSearchQuery(e.target.value);
                        setCurrentPage(1); // reset pagination on search
                      }}
                    />
                    <div className="text-xs font-bold text-gray-400 whitespace-nowrap">Всего: {filteredApprovedUsers.length}</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 text-gray-400 uppercase text-xs font-black"><tr><th className="p-6">Сотрудник</th><th className="p-6">Контакты</th><th className="p-6 text-center">Файлы</th><th className="p-6 text-center">Статус</th><th className="p-6 text-right"></th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredApprovedUsers
                        .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                        .map(u => (<tr key={u.id} className="hover:bg-blue-50/50 cursor-pointer group" onClick={() => setSelectedUser(u)}><td className="p-6"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden flex items-center justify-center relative">{u.photoUrl ? <Image src={u.photoUrl} alt={u.displayName} fill className="object-cover" /> : '👤'}</div><div><div className="font-black text-gray-900 group-hover:text-blue-600 flex items-center gap-1">{u.displayName}{u.leaveStatus === 'unpaid' && <span title={`Отпуск без содержания\n${u.leaveStartDate || ''} - ${u.leaveEndDate || ''}`} className="text-base leading-none">🏖️</span>}{u.leaveStatus === 'maternity' && <span title={`Декретный отпуск\n${u.leaveStartDate || ''} - ${u.leaveEndDate || ''}`} className="text-base leading-none">🍼</span>}{(u.leaveStatus === 'unpaid' || u.leaveStatus === 'maternity') && u.leaveEndDate && <span className="text-[10px] text-gray-400 font-bold ml-1">до {new Date(u.leaveEndDate).toLocaleDateString('ru-RU')}</span>}</div><div className="text-xs font-bold text-gray-500">{u.position}</div>{u.status === 'frozen' && <div className="text-[10px] text-orange-600 font-bold mt-0.5 bg-orange-100 px-2 py-0.5 rounded-md inline-block">❄️ Заморожен</div>}{u.joinDate && <div className="text-[10px] text-green-600 font-bold mt-0.5">🔰 В профсоюзе с {u.joinDate}</div>}</div></div></td><td className="p-6"><div className="text-sm font-bold flex items-center gap-2">
  {u.phoneNumber}
  {u.phoneNumber && (
    <a href={`https://wa.me/${u.phoneNumber.replace(/\D/g, '').replace(/^8/, '7')}`} 
       target="_blank" rel="noopener noreferrer" 
       onClick={e => e.stopPropagation()} 
       className="bg-green-100 text-green-600 hover:bg-green-200 px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors">
      WhatsApp
    </a>
  )}
</div><div className="text-xs text-gray-400">{u.email}</div></td><td className="p-6 text-center"><div className="flex flex-col items-center gap-2">{u.statementUrl && (<div className="flex flex-col items-center gap-1"><a href={u.statementUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-[10px] font-bold" onClick={e => e.stopPropagation()}>{u.isAlreadyMember ? 'Пропуск' : 'Заявление'}</a><button onClick={(e) => { e.stopPropagation(); handleDeleteUserFile(u.id, u.statementUrl!, 'statementUrl'); }} className="text-red-400 hover:text-red-600 text-[10px] uppercase font-black">✕</button></div>)}{u.deductionUrl && (<div className="flex flex-col items-center gap-1 border-t pt-1 border-gray-100"><a href={u.deductionUrl} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline text-[10px] font-bold" onClick={e => e.stopPropagation()}>На удержание</a><button onClick={(e) => { e.stopPropagation(); handleDeleteUserFile(u.id, u.deductionUrl!, 'deductionUrl'); }} className="text-red-400 hover:text-red-600 text-[10px] uppercase font-black">✕</button></div>)}{u.idCardUrl && (<div className="flex flex-col items-center gap-1 border-t pt-1 border-gray-100"><a href={u.idCardUrl} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline text-[10px] font-bold" onClick={e => e.stopPropagation()}>Уд. Личности</a><button onClick={(e) => { e.stopPropagation(); handleDeleteUserFile(u.id, u.idCardUrl!, 'idCardUrl'); }} className="text-red-400 hover:text-red-600 text-[10px] uppercase font-black">✕</button></div>)}{!u.statementUrl && !u.idCardUrl && !u.deductionUrl && <span className="text-gray-300 text-xs">—</span>}</div></td><td className="p-6 text-center">{u.delegatedTo ? <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-black">Голос передан</span> : u.delegatedFrom && u.delegatedFrom.length > 0 ? <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black">Делегат (+{u.delegatedFrom.length})</span> : <span className="text-gray-300">—</span>}</td><td className="p-6 text-right">{u.status === 'frozen' ? (
  <button onClick={(e) => { e.stopPropagation(); handleUnfreezeUser(u); }} className="text-blue-500 hover:text-blue-700 font-bold px-2 whitespace-nowrap text-xs">Разморозить</button>
) : (
  <button onClick={(e) => { e.stopPropagation(); handleFreezeUser(u); }} className="text-orange-300 hover:text-orange-500 font-bold px-2 whitespace-nowrap text-xs">❄️ Заморозить</button>
)}
<button onClick={(e) => { e.stopPropagation(); handleRejectUser(u.id, u.statementUrl, u.idCardUrl, u.deductionUrl); }} className="text-red-300 hover:text-red-500 font-bold px-2">✕</button></td></tr>))}
                    </tbody>
                  </table>
                </div>
                {/* PAGINATION USERS */}
                {filteredApprovedUsers.length > itemsPerPage && (
                  <div className="p-6 flex justify-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl bg-gray-100 font-bold text-gray-600 disabled:opacity-50">←</button>
                    <span className="px-4 py-2 font-black text-gray-400">Стр. {currentPage}</span>
                    <button onClick={() => setCurrentPage(p => (p * itemsPerPage < filteredApprovedUsers.length ? p + 1 : p))} disabled={currentPage * itemsPerPage >= filteredApprovedUsers.length} className="px-4 py-2 rounded-xl bg-gray-100 font-bold text-gray-600 disabled:opacity-50">→</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* МОДАЛКИ */}
          {selectedTestStats && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in" onClick={() => setSelectedTestStats(null)}>
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-indigo-600 p-6 text-white relative">
                  <h3 className="font-black text-xl pr-8">{selectedTestStats.title}</h3>
                  <button onClick={() => setSelectedTestStats(null)} className="absolute top-4 right-4 bg-white/20 rounded-full p-2 hover:bg-white/30">✕</button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto bg-gray-50 flex gap-4">
                  <div className="flex-1"><h4 className="font-bold text-green-600 uppercase text-xs mb-3 border-b border-green-200 pb-1">Прошли ({selectedTestStats.completedBy?.length || 0})</h4><div className="space-y-1">{users.filter(u => selectedTestStats.completedBy?.includes(u.id)).map(u => (<div key={u.id} className="text-sm font-bold text-gray-700 bg-white p-2 rounded shadow-sm border border-green-50">✅ {u.displayName}</div>))}</div></div>
                  <div className="flex-1"><h4 className="font-bold text-gray-400 uppercase text-xs mb-3 border-b border-gray-200 pb-1">Не приступали</h4><div className="space-y-1 opacity-60">{users.filter(u => u.status === 'approved' && !selectedTestStats.completedBy?.includes(u.id)).map(u => (<div key={u.id} className="text-sm font-medium text-gray-500 bg-white p-2 rounded border border-gray-100">{u.displayName}</div>))}</div></div>
                </div>
              </div>
            </div>
          )}


          {selectedUser && (() => {
            // 1. Находим ближайшую конференцию для фильтрации
            const now = new Date();
            const upcoming = conferences.filter(c => new Date(c.date) > now).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const nextConf = upcoming[0] || conferences[conferences.length - 1]; // Fallback to last

            // 2. Считаем активные делегирования НА ЭТУ КОНФЕРЕНЦИЮ
            const activeDelegationsIn = delegations.filter(d => d.toId === selectedUser!.id && d.status === 'approved' && d.conferenceId === nextConf?.id);

            // 3. Получаем историю обращений этого пользователя
            const userRequests = requests.filter(r => r.userEmail === selectedUser!.email);

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in" onClick={() => setSelectedUser(null)}>
                <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white relative">
                    <div className="absolute top-6 right-6 flex gap-2">
                      {!isEditingUser ? (
                        <button onClick={() => { setIsEditingUser(true); setEditUserForm({ name: selectedUser.displayName, pos: selectedUser.position, phone: selectedUser.phoneNumber || '', email: selectedUser.email, category: selectedUser.category || '', leaveStatus: selectedUser.leaveStatus || 'none', leaveStartDate: selectedUser.leaveStartDate || '', leaveEndDate: selectedUser.leaveEndDate || '' }); }} className="bg-white/20 rounded-full p-2 hover:bg-white/30 text-sm font-bold px-4">✏️ Редактировать</button>
                      ) : (
                        <button onClick={handleSaveUserEdit} className="bg-green-500 rounded-full p-2 hover:bg-green-600 text-sm font-bold px-4 shadow-lg">✅ Сохранить</button>
                      )}
                      <button onClick={() => { setSelectedUser(null); setIsEditingUser(false); }} className="bg-white/20 rounded-full p-2 hover:bg-white/30">✕</button>
                    </div>
                    <div className="flex items-center gap-6"><div className="w-24 h-24 bg-white rounded-full border-4 border-white/30 flex items-center justify-center text-4xl overflow-hidden relative">{selectedUser.photoUrl ? <Image src={selectedUser.photoUrl} alt={selectedUser.displayName} fill className="object-cover" /> : '👤'}</div>
                      <div className="flex-grow">
                        {isEditingUser ? (
                          <>
                            <input className="text-3xl font-black bg-black/20 rounded-lg px-3 py-1 outline-none w-full mb-2 placeholder-white/50" value={editUserForm.name} onChange={e => setEditUserForm({...editUserForm, name: e.target.value})} placeholder="ФИО" />
                            <div className="flex gap-2">
                              <input className="font-bold text-blue-100 bg-black/20 rounded-lg px-3 py-1 outline-none flex-1 placeholder-white/50" value={editUserForm.pos} onChange={e => setEditUserForm({...editUserForm, pos: e.target.value})} placeholder="Должность" />
                              <select className="bg-black/20 rounded-lg px-3 py-1 outline-none text-white font-bold w-40" value={editUserForm.category} onChange={e => setEditUserForm({...editUserForm, category: e.target.value})}>
                                <option value="" className="text-black">Без категории</option>
                                <option value="Бортпроводник" className="text-black">Бортпроводник</option>
                                <option value="Пилот" className="text-black">Пилот</option>
                                <option value="Наземка" className="text-black">Наземка</option>
                                <option value="Перрон" className="text-black">Перрон</option>
                                <option value="Инженеры" className="text-black">Инженеры</option>
                                <option value="Руководитель" className="text-black">Руководитель</option>
                                <option value="Офис" className="text-black">Офис</option>
                                <option value="Авиационная безопасность" className="text-black">Авиационная безопасность</option>
                              </select>
                              <select className="bg-black/20 rounded-lg px-3 py-1 outline-none text-white font-bold w-40" value={editUserForm.leaveStatus} onChange={e => setEditUserForm({...editUserForm, leaveStatus: e.target.value as 'none' | 'unpaid' | 'maternity'})}>
                                <option value="none" className="text-black">Активен (Без отпуска)</option>
                                <option value="unpaid" className="text-black">🏖️ Отпуск без содерж.</option>
                                <option value="maternity" className="text-black">🍼 Декретный</option>
                              </select>
                            </div>
                            {editUserForm.leaveStatus !== 'none' && (
                              <div className="flex gap-2 mt-2">
                                <input type="date" className="font-bold text-white bg-black/20 rounded-lg px-3 py-1 outline-none flex-1" value={editUserForm.leaveStartDate} onChange={e => setEditUserForm({...editUserForm, leaveStartDate: e.target.value})} title="Дата начала" />
                                <input type="date" className="font-bold text-white bg-black/20 rounded-lg px-3 py-1 outline-none flex-1" value={editUserForm.leaveEndDate} onChange={e => setEditUserForm({...editUserForm, leaveEndDate: e.target.value})} title="Дата окончания" />
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <h2 className="text-3xl font-black">{selectedUser.displayName}</h2>
                            <p className="font-bold text-blue-100 text-lg opacity-90">
                              {selectedUser.position}
                              {selectedUser.category && <span className="ml-3 bg-white/20 px-2 py-0.5 rounded text-sm text-white border border-white/30 shadow-sm">🏷️ {selectedUser.category}</span>}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* DISPLAY DYNAMIC VOTE WEIGHT */}
                    <div className="mt-4 bg-white/10 p-3 rounded-xl inline-flex items-center gap-2">
                      <span className="text-sm font-bold opacity-80">Сила голоса на {nextConf?.title || 'собрании'}:</span>
                      <span className="text-2xl font-black">{1 + activeDelegationsIn.length}</span>
                    </div>

                    <div className="mt-6 flex gap-6 text-sm font-bold opacity-80">
                      {isEditingUser ? (
                        <>
                          <div className="flex items-center gap-2">📞 <input className="bg-black/20 rounded-lg px-3 py-1 outline-none placeholder-white/50" value={editUserForm.phone} onChange={e => setEditUserForm({...editUserForm, phone: e.target.value})} placeholder="Телефон" /></div>
                          <div className="flex items-center gap-2">✉️ <input className="bg-black/20 rounded-lg px-3 py-1 outline-none placeholder-white/50" value={editUserForm.email} onChange={e => setEditUserForm({...editUserForm, email: e.target.value})} placeholder="Email" /></div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
  <span>📞 {selectedUser.phoneNumber}</span>
  {selectedUser.phoneNumber && (
    <a href={`https://wa.me/${selectedUser.phoneNumber.replace(/\D/g, '').replace(/^8/, '7')}`} 
       target="_blank" rel="noopener noreferrer" 
       className="bg-green-100 text-green-600 hover:bg-green-200 px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors">
      Написать в WhatsApp
    </a>
  )}
</div>
                          <span>✉️ {selectedUser.email}</span>
                        </>
                      )}
                    </div>
                    {selectedUser.joinDate && (
                      <div className="mt-3 text-xs font-black text-green-300">
                        🔰 Член профсоюза (с {selectedUser.joinDate})
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedUser.statementUrl && <a href={selectedUser.statementUrl} target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition">📄 {selectedUser.isAlreadyMember ? 'Пропуск' : 'Заявление'}</a>}
                      {selectedUser.deductionUrl && <a href={selectedUser.deductionUrl} target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition">📄 На удержание</a>}
                      {selectedUser.idCardUrl && <a href={selectedUser.idCardUrl} target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition">🪪 Уд. Личности</a>}
                    </div>
                  </div>
                  <div className="p-8 max-h-[60vh] overflow-y-auto bg-gray-50 grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="font-black text-gray-400 uppercase text-xs tracking-wider mb-4 border-b pb-2">
                        Доверили голос ({nextConf ? 'на тек. собр.' : 'всего'})
                      </h3>
                      <div className="space-y-3">
                        {activeDelegationsIn.map(d => (
                          <div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100"><p className="font-black text-gray-800">{d.fromName}</p><p className="text-xs font-bold text-indigo-500 mt-1 bg-indigo-50 inline-block px-2 py-0.5 rounded">{d.conferenceTitle || '—'}</p><p className="text-[10px] text-gray-400 mt-1">{new Date(d.createdAt).toLocaleDateString()}</p></div>
                        ))}
                        {activeDelegationsIn.length === 0 && <p className="text-gray-400 text-sm font-bold italic">Нет активных делегирований</p>}
                      </div>
                    </div>
                    <div><h3 className="font-black text-gray-400 uppercase text-xs tracking-wider mb-4 border-b pb-2">Он доверил голос</h3><div className="space-y-3">{delegations.filter(d => d.fromId === selectedUser!.id && d.status === 'approved').map(d => (<div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border border-yellow-100"><p className="text-xs text-gray-400 font-bold mb-1">Передано:</p><p className="font-black text-gray-800 text-lg">{d.toName}</p><p className="text-xs font-bold text-gray-500 mt-1">Соб: {d.conferenceTitle || '—'}</p></div>))}{delegations.filter(d => d.fromId === selectedUser!.id && d.status === 'approved').length === 0 && <p className="text-gray-400 text-sm font-bold italic">Голосует сам</p>}</div></div>
                    
                    <div className="md:col-span-2 mt-4 pt-6 border-t border-gray-200">
                      <h3 className="font-black text-gray-400 uppercase text-xs tracking-wider mb-4">История обращений ({userRequests.length})</h3>
                      <div className="space-y-4">
                        {userRequests.map(req => (
                          <div key={req.id} className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200">
                            <p className="text-sm font-bold text-gray-800 whitespace-pre-wrap">{req.text}</p>
                            {req.fileUrl && (
                              <a href={req.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 text-xs font-bold mt-2 inline-flex items-center gap-1 bg-blue-50 px-2 py-1 rounded">📎 Прикрепленный файл</a>
                            )}
                            <div className="mt-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                              <p className="text-xs font-black text-gray-400 mb-1">ОТВЕТ АДМИНИСТРАТОРА:</p>
                              {req.response ? (
                                <p className="text-sm font-bold text-indigo-700 whitespace-pre-wrap">{req.response}</p>
                              ) : (
                                <p className="text-sm font-bold text-gray-400 italic">Ожидает ответа...</p>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 font-bold">{new Date(req.createdAt).toLocaleString()}</p>
                          </div>
                        ))}
                        {userRequests.length === 0 && <div className="text-gray-400 text-sm font-bold italic bg-white p-4 rounded-xl border border-dashed border-gray-200 text-center">Нет обращений от этого участника</div>}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}

          {/* ОСТАЛЬНЫЕ ВКЛАДКИ */}
          {activeTab === 'delegations' && (
            <div className="space-y-6">
              <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-200 w-fit mx-auto mb-6">
                <button onClick={() => setDelegationSubTab('pending')} className={`px-6 py-2 rounded-xl font-bold transition-all ${delegationSubTab === 'pending' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>Заявки ({pendingDelegations.length})</button>
                <button onClick={() => setDelegationSubTab('history')} className={`px-6 py-2 rounded-xl font-bold transition-all ${delegationSubTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>История</button>
              </div>

              {/* PENDING REQUESTS */}
              {delegationSubTab === 'pending' && (
                <div className="animate-in fade-in slide-in-from-bottom-4">
                  {pendingDelegations.length === 0 ? (
                    <div className="bg-white p-10 rounded-[2rem] text-center text-gray-400 font-bold border-2 border-dashed border-gray-200">✅ Нет новых заявок</div>
                  ) : (
                    <div className="grid gap-4">
                      {pendingDelegations.map(req => (
                        <div key={req.id} className="bg-white p-4 md:p-6 rounded-[2rem] border border-indigo-100 shadow-xl flex flex-col lg:flex-row justify-between items-start gap-4 md:gap-6">
                          <div className="flex-grow">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="font-black bg-gray-100 px-3 py-1 rounded-xl">{req.fromName}</span>
                              <span className="text-indigo-300 font-black text-2xl">➝</span>
                              <span className="font-black bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl">{req.toName}</span>
                            </div>
                            {req.conferenceTitle && <div className="inline-flex bg-yellow-50 text-yellow-800 text-xs font-black px-3 py-1.5 rounded-lg mb-3">📅 {req.conferenceTitle}</div>}
                            <div className="flex gap-4 text-xs font-bold text-gray-400">
                              <span>🕒 {new Date(req.createdAt).toLocaleString()}</span>
                              {req.docUrl && <a href={req.docUrl} target="_blank" className="text-blue-600 underline">📄 Документ</a>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleApproveDelegation(req)} className="bg-green-500 text-white px-6 py-3 rounded-xl font-black">Одобрить</button>
                            <button onClick={() => handleRejectDelegation(req.id, req.fromId)} className="bg-gray-100 text-red-500 px-6 py-3 rounded-xl font-black">Отказать</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* HISTORY */}
              {delegationSubTab === 'history' && (
                <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100 animate-in fade-in">
                  <div className="p-6 md:p-8 bg-gray-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h2 className="font-black text-2xl">Архив голосов</h2>
                    <div className="flex gap-2">
                      <select
                        className="bg-white p-3 rounded-xl font-bold border border-gray-200 outline-none focus:border-indigo-500"
                        value={delegationFilterConf}
                        onChange={(e) => setDelegationFilterConf(e.target.value)}
                      >
                        <option value="all">Все события</option>
                        {conferences.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </select>
                      <button onClick={handleExportDelegations} className="bg-green-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-green-700 transition shadow-lg shadow-green-200">
                        📥 Export CSV
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-100 text-gray-400 uppercase text-xs font-black">
                        <tr>
                          <th className="p-4 md:p-6">Дата</th>
                          <th className="p-4 md:p-6">Кто</th>
                          <th className="p-4 md:p-6">Кому</th>
                          <th className="p-4 md:p-6">Событие</th>
                          <th className="p-4 md:p-6 text-center">Статус</th>
                          <th className="p-4 md:p-6 text-right">Файл</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {delegations
                          .filter(d => d.status !== 'pending')
                          .filter(d => delegationFilterConf === 'all' || d.conferenceId === delegationFilterConf)
                          .map(d => (
                            <tr key={d.id} className="hover:bg-gray-50">
                              <td className="p-4 md:p-6 text-xs text-gray-400 font-bold">{new Date(d.createdAt).toLocaleDateString()}</td>
                              <td className="p-4 md:p-6 font-bold text-gray-800">{d.fromName}</td>
                              <td className="p-4 md:p-6 font-bold text-indigo-700">{d.toName}</td>
                              <td className="p-4 md:p-6 text-xs font-bold text-gray-500">{d.conferenceTitle || '—'}</td>
                              <td className="p-4 md:p-6 text-center">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${d.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {d.status === 'approved' ? 'Принято' : 'Отказано'}
                                </span>
                              </td>
                              <td className="p-4 md:p-6 text-right">
                                {d.docUrl ? <a href={d.docUrl} target="_blank" className="text-blue-500 underline text-xs font-bold">Скачать</a> : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {delegations.filter(d => d.status !== 'pending' && (delegationFilterConf === 'all' || d.conferenceId === delegationFilterConf)).length === 0 && (
                      <div className="p-8 text-center text-gray-400 font-bold">Записей не найдено</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'requests' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-800">Обращения</h2>
                <button onClick={() => setShowManualAidModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2">
                  <span>➕</span> Добавить оффлайн-заявку
                </button>
              </div>

              {showManualAidModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[2rem] p-6 md:p-8 w-full max-w-lg shadow-2xl relative">
                    <button onClick={() => { setShowManualAidModal(false); setEditingManualAidId(null); setManualAidName(''); setManualAidCategory(''); setManualAidCustomCategory(''); setManualAidAmount(''); setManualAidDate(''); setManualAidFile(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl font-black">✕</button>
                    <h3 className="text-2xl font-black mb-6 text-gray-800">{editingManualAidId ? 'Редактирование оффлайн-заявки' : 'Оффлайн-заявка'}</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">ФИО заявителя</label>
                        <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold outline-none" value={manualAidName} onChange={(e) => setManualAidName(e.target.value)} placeholder="Например: Иванов Иван" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Категория / Причина</label>
                        <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold outline-none" value={manualAidCategory} onChange={(e) => {
                          const val = e.target.value;
                          setManualAidCategory(val);
                          if (val === 'Смерть близкого родственника' || val === 'Смерть сотрудника' || val === 'Рождение ребенка') {
                            const currentMrp = 4325; // МРП на 2026 год
                            setManualAidAmount((20 * currentMrp).toString());
                          }
                        }}>
                          <option value="">Выберите категорию...</option>
                          <option value="Смерть близкого родственника">Смерть близкого родственника</option>
                          <option value="Смерть сотрудника">Смерть сотрудника</option>
                          <option value="Юбилей">Юбилей</option>
                          <option value="Рождение ребенка">Рождение ребенка</option>
                          <option value="Другое">Другое (указать)</option>
                        </select>
                        {manualAidCategory === 'Другое' && (
                          <input type="text" className="w-full mt-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold outline-none" value={manualAidCustomCategory} onChange={(e) => setManualAidCustomCategory(e.target.value)} placeholder="Своя категория" />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Сумма (₸)</label>
                          <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold outline-none" value={manualAidAmount} onChange={(e) => setManualAidAmount(e.target.value)} placeholder="Например: 50000" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Дата (по умолчанию сегодня)</label>
                          <input type="date" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold outline-none" value={manualAidDate} onChange={(e) => setManualAidDate(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Документ (Свидетельство, чек и т.д.)</label>
                        <input type="file" className="w-full text-sm font-bold file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" onChange={(e) => setManualAidFile(e.target.files?.[0] || null)} />
                      </div>
                      <button onClick={handleManualAidSubmit} disabled={isSubmittingManualAid} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg transition mt-4 disabled:opacity-50">
                        {isSubmittingManualAid ? 'Сохранение...' : editingManualAidId ? 'Сохранить изменения' : 'Добавить заявку'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                {requests.map(req => (
                  <div key={req.id} className={`bg-white p-4 md:p-6 rounded-[2rem] border shadow-sm relative transition-all ${req.aidStatus === 'pending' ? 'border-orange-300 border-2 bg-orange-50/50' : 'border-gray-100'}`}>
                    {req.aidStatus === 'pending' && (
                      <div className="absolute -top-3 left-6 bg-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-md animate-pulse">⌛ В очереди на оплату</div>
                    )}
                    <div className="flex justify-between items-start mb-3 mt-2">
                      <span className={`px-3 py-1 rounded-lg text-xs font-black ${req.isOffline ? 'bg-orange-100 text-orange-800' : 'bg-blue-50 text-blue-700'}`}>
                        {req.userName || req.userEmail} {req.isOffline && '(Оффлайн)'}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-400">{new Date(req.createdAt).toLocaleString()}</span>
                        {req.isOffline && (
                          <button onClick={() => handleEditManualAid(req)} className="text-blue-400 hover:text-blue-600 font-black transition text-lg leading-none" title="Редактировать">✏️</button>
                        )}
                        <button onClick={() => handleDeleteRequest(req.id)} className="text-red-400 hover:text-red-600 font-black transition text-lg leading-none" title="Удалить">✕</button>
                      </div>
                    </div>
                    <p className="font-bold text-gray-800 text-lg mb-4">&quot;{req.text}&quot;</p>
            {/* FILE DISPLAY */}
            {req.fileUrl && (
              <div className="mb-4">
                <a href={req.fileUrl} target="_blank" className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-indigo-100 transition">
                  <span>📎</span> Прикрепленный файл
                </a>
              </div>
            )}
            {req.response || (req.aidStatus === 'approved' && req.isOffline) ? (
              <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-sm font-bold text-green-900">
                {req.response && <p className="whitespace-pre-wrap">{req.response}</p>}
                {req.text.startsWith('Запрос материальной помощи') && req.aidStatus && (
                  <div className={`mt-3 pt-3 border-t border-green-200/50 text-xs opacity-90 flex gap-4 ${!req.response ? 'border-t-0 mt-0 pt-0' : ''}`}>
                    <span><b>Статус:</b> {req.aidStatus === 'approved' ? 'Одобрено (Оплачено)' : 'Отклонено'}</span>
                    {req.aidStatus === 'approved' && <span><b>Сумма:</b> {req.aidAmount?.toLocaleString('ru-RU')} ₸</span>}
                  </div>
                )}
              </div>
            ) : req.aidStatus === 'pending' ? (
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm font-bold text-orange-900">
                  <p>Заявка ожидает подтверждения выплаты.</p>
                  {req.aidAmount && <p className="text-xs opacity-80 mt-1">К выплате: {req.aidAmount.toLocaleString('ru-RU')} ₸</p>}
                </div>
                <button onClick={() => handlePayManualAid(req.id)} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-black text-sm shadow-md transition w-full sm:w-auto">
                  Оплатить / Подтвердить
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                {req.text.startsWith('Запрос материальной помощи') && (
                  <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">Решение:</span>
                    <select className="p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 font-bold outline-none" onChange={(e) => setReplyAidStatus({ ...replyAidStatus, [req.id]: e.target.value as 'approved' | 'rejected'})} value={replyAidStatus[req.id] || 'approved'}>
                      <option value="approved">Одобрить</option>
                      <option value="rejected">Отказать</option>
                    </select>
                    {(replyAidStatus[req.id] || 'approved') === 'approved' && (
                      <input type="number" className="p-2 border border-gray-200 rounded-lg text-sm w-32 bg-white font-bold outline-none" placeholder="Сумма (₸)" value={replyAidAmount[req.id] || ''} onChange={(e) => setReplyAidAmount({ ...replyAidAmount, [req.id]: e.target.value })} />
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <input className="bg-white border border-gray-200 p-3 w-full font-medium rounded-xl outline-none text-sm shadow-sm" placeholder="Ответ..." onChange={(e) => setReplyText({ ...replyText, [req.id]: e.target.value })} />
                  <button onClick={() => handleReplyRequest(req.id, req.text.startsWith('Запрос материальной помощи'))} className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl font-black text-sm shadow-md transition">Отправить</button>
                </div>
              </div>
            )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'news' && <div className="space-y-6"><div className="bg-white p-6 rounded-[2rem] shadow-lg"><h2 className="font-black text-xl mb-4">Новость</h2><form onSubmit={handlePublishNews} className="space-y-3"><input className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none" placeholder="Заголовок" value={newsTitle} onChange={e => setNewsTitle(e.target.value)} /><textarea className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none h-32" placeholder="Текст..." value={newsBody} onChange={e => setNewsBody(e.target.value)} /><input className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none" placeholder="Внешняя ссылка (опционально)" value={newsLink} onChange={e => setNewsLink(e.target.value)} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="reqResp" checked={newsRequiresResponse} onChange={e => setNewsRequiresResponse(e.target.checked)} className="w-5 h-5" />
                  <label htmlFor="reqResp" className="font-bold text-gray-700">Требует ответа работодателя</label>
                </div>
                {newsRequiresResponse && (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">Срок ответа (рабочих дней):</span>
                    <input type="number" min="1" className="bg-gray-50 p-2 rounded-xl font-bold border-0 outline-none w-24 text-center" value={newsResponseDeadlineDays} onChange={e => setNewsResponseDeadlineDays(parseInt(e.target.value) || 1)} />
                  </div>
                )}<div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-2xl"><div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-500">Обложка (фото):</span><input type="file" onChange={e => setNewsFile(e.target.files?.[0] || null)} className="text-xs" accept="image/*" /></div><div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-500">Документ (файл):</span><input type="file" onChange={e => setNewsFileDoc(e.target.files?.[0] || null)} className="text-xs" /></div></div><div className="flex justify-end pt-2"><button disabled={isUploading} className="bg-black text-white px-8 py-3 rounded-xl font-black">{isUploading ? 'Загрузка...' : 'Опубликовать'}</button></div></form></div><div className="grid md:grid-cols-2 gap-4">{news.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(n => (<div key={n.id} className="bg-white p-3 md:p-4 rounded-3xl border border-gray-100 shadow-sm relative"><h3 className="font-black text-lg mb-2">{n.title}</h3><p className="text-xs text-gray-400 font-bold">{new Date(n.createdAt).toLocaleDateString()}</p><button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 font-black">✕</button>
                      {n.requiresResponse && (
                        <div className="mt-3 bg-gray-50 p-3 rounded-xl flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-600">Ответ получен?</span>
                          <input 
                            type="checkbox" 
                            checked={n.isResponseReceived || false} 
                            onChange={(e) => handleToggleResponseReceived(n.id, e.target.checked)}
                            className="w-5 h-5"
                          />
                        </div>
                      )}
<button onClick={() => {
  setEditingNews(n);
  setEditNewsTitle(n.title);
  setEditNewsBody(n.body);
  setEditNewsLink(n.linkUrl || '');
}} className="absolute top-4 right-10 text-blue-500 font-black hover:text-blue-700">✏️</button></div>))}</div>
            {/* PAGINATION NEWS */}
            {news.length > itemsPerPage && (
              <div className="flex justify-center gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl bg-gray-200 font-bold text-gray-600 disabled:opacity-50">←</button>
                <span className="px-4 py-2 font-black text-gray-400">Стр. {currentPage}</span>
                <button onClick={() => setCurrentPage(p => (p * itemsPerPage < news.length ? p + 1 : p))} disabled={currentPage * itemsPerPage >= news.length} className="px-4 py-2 rounded-xl bg-gray-200 font-bold text-gray-600 disabled:opacity-50">→</button>
              </div>
            )}
          </div>}
          {activeTab === 'resources' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

              {/* UNION DOCUMENTS SECTION */}
              <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-indigo-50">
                <h3 className="font-black text-xl mb-6 text-indigo-800">Документы профсоюза (Устав, Договор)</h3>

                {/* Form */}
                {isCreatingDoc ? (
                  <div className="bg-indigo-50/50 p-6 rounded-2xl mb-6">
                    <h4 className="font-bold mb-4">{editingDocId ? 'Редактировать' : 'Новый документ'}</h4>
                    <div className="space-y-4">
                      <input
                        className="w-full p-4 bg-white rounded-xl font-bold border border-indigo-100 outline-none"
                        placeholder="Название (например: Устав профсоюза)"
                        value={docTitle}
                        onChange={e => setDocTitle(e.target.value)}
                      />
                      <textarea
                        className="w-full p-4 bg-white rounded-xl font-medium border border-indigo-100 outline-none min-h-[200px]"
                        placeholder="Текст документа (поддерживает переносы строк)..."
                        value={docContent}
                        onChange={e => setDocContent(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setIsCreatingDoc(false); setEditingDocId(null); setDocTitle(''); setDocContent(''); }} className="bg-white text-gray-500 px-6 py-3 rounded-xl font-bold border border-gray-200">Отмена</button>
                        <button onClick={handleCreateDocument} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black shadow-lg">Сохранить</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setIsCreatingDoc(true)} className="w-full py-4 mb-6 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-500 font-bold hover:bg-indigo-50 transition">
                    + Добавить документ
                  </button>
                )}

                {/* List */}
                <div className="grid gap-3">
                  {unionDocs.map(doc => (
                    <div key={doc.id} className="bg-indigo-50/30 p-5 rounded-xl border border-indigo-50 flex justify-between items-center hover:bg-indigo-50 transition">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white text-indigo-600 rounded-full flex items-center justify-center text-xl shadow-sm">📜</div>
                        <div>
                          <span className="font-bold text-gray-800 block text-lg">{doc.title}</span>
                          <span className="text-xs text-gray-400 font-bold">{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditDocument(doc)} className="bg-white text-blue-500 px-4 py-2 rounded-lg font-bold text-xs uppercase shadow-sm hover:bg-blue-50">Изменить</button>
                        <button onClick={() => handleDeleteDocument(doc.id)} className="bg-white text-red-500 px-4 py-2 rounded-lg font-bold text-xs uppercase shadow-sm hover:bg-red-50">Удалить</button>
                      </div>
                    </div>
                  ))}
                  {unionDocs.length === 0 && !isCreatingDoc && <p className="text-gray-400 font-bold text-center py-4">Документы пока не добавлены</p>}
                </div>
              </div>

              {/* LINKS & TEMPLATES GRID */}
              <div className="grid md:grid-cols-2 gap-6">

                {/* LINKS */}
                <div className="bg-white p-8 rounded-[2rem] shadow-lg">
                  <h3 className="font-black text-xl mb-4 text-teal-600">Ссылки</h3>
                  <form onSubmit={handleAddLink} className="flex gap-2 mb-4">
                    <input className="bg-gray-50 p-3 rounded-xl w-full font-bold" placeholder="Title" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} />
                    <input className="bg-gray-50 p-3 rounded-xl w-full" placeholder="URL" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
                    <button className="bg-teal-600 text-white p-3 rounded-xl font-black">+</button>
                  </form>
                  {links.map(l => (
                    <div key={l.id} className="flex justify-between py-2 border-b">
                      <span className="font-bold text-gray-700">{l.title}</span>
                      <button onClick={() => handleDeleteLink(l.id)} className="text-red-400 font-bold">✕</button>
                    </div>
                  ))}
                </div>

                {/* TEMPLATES */}
                <div className="bg-white p-8 rounded-[2rem] shadow-lg">
                  <h3 className="font-black text-xl mb-4 text-orange-500">Шаблоны</h3>
                  <form onSubmit={handleAddTemplate} className="flex flex-col gap-3 mb-6">
                    <input className="bg-gray-50 p-3 rounded-xl font-bold" placeholder="Название" value={tplTitle} onChange={e => setTplTitle(e.target.value)} />
                    <input className="bg-gray-50 p-3 rounded-xl text-sm" placeholder="Описание (для чего этот документ?)" value={tplDesc} onChange={e => setTplDesc(e.target.value)} />
                    <input type="file" onChange={e => setTplFile(e.target.files?.[0] || null)} className="text-xs" />
                    <button disabled={isUploading} className="bg-orange-500 text-white py-3 rounded-xl font-black">{isUploading ? '...' : 'Загрузить'}</button>
                  </form>
                  {templates.map(t => (
                    <div key={t.id} className="flex flex-col border-b py-2">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-700">{t.title}</span>
                          {t.isRegistrationTemplate && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded uppercase font-black w-fit mt-1">Отображается при регистрации</span>}
                        </div>
                        <div className="flex gap-2 items-center">
                          <button onClick={() => handleToggleRegistrationTemplate(t)} className={`text-[10px] uppercase font-black px-2 py-1 rounded ${t.isRegistrationTemplate ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600'}`}>{t.isRegistrationTemplate ? 'Скрыть из реги' : 'В регу'}</button>
                          <button onClick={() => handleEditTemplate(t)} className="text-blue-400 font-bold text-xs uppercase">Edit</button>
                          <button onClick={() => handleDeleteTemplate(t.id)} className="text-red-400 font-bold">✕</button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 mb-1">{t.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'team' && <div className="bg-white p-8 rounded-[2rem] shadow-xl"><h2 className="font-black text-2xl mb-6">Совет</h2><form onSubmit={handleAddMember} className="bg-gray-50 p-6 rounded-2xl mb-8 flex gap-4"><input className="p-3 rounded-xl w-full font-bold border-0" placeholder="ФИО" value={memberName} onChange={e => setMemberName(e.target.value)} /><input className="p-3 rounded-xl w-full border-0" placeholder="Роль" value={memberRole} onChange={e => setMemberRole(e.target.value)} /><input type="file" onChange={e => setMemberFile(e.target.files?.[0] || null)} className="text-xs" /><button disabled={isUploading} className="bg-black text-white px-6 rounded-xl font-black">{isUploading ? '...' : 'Add'}</button></form><div className="grid md:grid-cols-3 gap-4">{team.map((m, i) => <div key={m.id} className="border p-3 md:p-4 rounded-2xl flex items-center gap-3 md:gap-4 bg-white relative group"><div className="w-12 h-12 rounded-full overflow-hidden relative"><Image src={m.photoUrl || '/default-avatar.png'} alt={m.name} fill className="object-cover" /></div><div className="flex-grow"><p className="font-black text-sm">{m.name}</p><p className="text-xs text-gray-400">{m.role}</p></div><div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleMoveMember(m.id, 'up')} disabled={i === 0} className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] hover:bg-gray-200 disabled:opacity-30">▲</button><button onClick={() => handleMoveMember(m.id, 'down')} disabled={i === team.length - 1} className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] hover:bg-gray-200 disabled:opacity-30">▼</button></div><div className="flex gap-2 ml-2"><button onClick={() => handleEditMember(m)} className="text-blue-400 font-black hover:text-blue-600 transition">✎</button><button onClick={() => handleDeleteMember(m.id)} className="text-red-400 font-black hover:text-red-600 transition">✕</button></div></div>)}</div></div>}

          {/* LOGS TAB */}
          {activeTab === 'logs' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100">
                <div className="p-8 bg-gray-50/50 flex justify-between items-center">
                  <h2 className="font-black text-2xl text-gray-800">Журнал действий</h2>
                  <div className="text-xs font-bold text-gray-400">{logs.length} записей</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 text-gray-400 uppercase text-xs font-black">
                      <tr>
                        <th className="p-4 md:p-6">Дата</th>
                        <th className="p-4 md:p-6">Админ</th>
                        <th className="p-4 md:p-6">Действие</th>
                        <th className="p-4 md:p-6">Детали</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {logs
                        .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                        .map(log => (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="p-4 md:p-6 text-xs font-bold text-gray-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                            <td className="p-4 md:p-6 text-sm font-bold text-gray-800">{log.adminName}</td>
                            <td className="p-4 md:p-6">
                              <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">{log.action}</span>
                            </td>
                            <td className="p-4 md:p-6 text-sm text-gray-600">{log.details}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {/* PAGINATION LOGS */}
                {logs.length > itemsPerPage && (
                  <div className="p-6 flex justify-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl bg-gray-100 font-bold text-gray-600 disabled:opacity-50">←</button>
                    <span className="px-4 py-2 font-black text-gray-400">Стр. {currentPage}</span>
                    <button onClick={() => setCurrentPage(p => (p * itemsPerPage < logs.length ? p + 1 : p))} disabled={currentPage * itemsPerPage >= logs.length} className="px-4 py-2 rounded-xl bg-gray-100 font-bold text-gray-600 disabled:opacity-50">→</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ВКЛАДКА: РЕЕСТР БУХГАЛТЕРИИ */}
          {activeTab === 'registry' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">Реестр бухгалтерии</h2>
                  <p className="text-gray-500 font-medium mt-2">Умный импорт таблиц по месяцам для сверки взносов</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                  <span className="font-bold text-gray-500 pl-2">Месяц:</span>
                  <input 
                    type="month" 
                    value={registryMonth} 
                    onChange={(e) => setRegistryMonth(e.target.value)}
                    className="bg-gray-50 border-none outline-none font-black text-indigo-600 px-4 py-2 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Левая колонка - Вставка */}
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col">
                  <h3 className="font-black text-xl mb-2 flex items-center gap-2"><span className="text-2xl">📋</span> Импорт из Excel</h3>
                  <p className="text-sm text-gray-500 mb-4">Скопируйте колонки <b>ФИО</b> и <b>Сумма взноса</b> из Excel или Google Sheets и вставьте в поле ниже.</p>
                  <textarea
                    value={registryInput}
                    onChange={(e) => setRegistryInput(e.target.value)}
                    placeholder="Абайылданова Эльмира...&#9;3331.36&#10;Абдигалиева Жанар...&#9;3012.92"
                    className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none focus:ring-2 focus:ring-indigo-200 h-64 resize-none mb-4 whitespace-pre"
                  />
                  <button
                    onClick={handleSaveRegistry}
                    disabled={isSavingRegistry}
                    className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition disabled:opacity-50 mt-auto"
                  >
                    {isSavingRegistry ? 'Сохранение...' : 'Обновить реестр'}
                  </button>
                </div>

                {/* Правая колонка - Аналитика и текущий месяц */}
                <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <h3 className="font-black text-xl">Данные за {registryMonth}</h3>
                    <div className="flex gap-2 w-full sm:w-auto flex-col sm:flex-row">
                      <input
                        type="text"
                        placeholder="Поиск по реестру..."
                        value={registrySearch}
                        onChange={(e) => setRegistrySearch(e.target.value)}
                        className="px-4 py-2 rounded-xl border border-gray-200 outline-none focus:border-indigo-500 text-sm font-bold w-full sm:w-64"
                      />
                      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                        <button onClick={() => setRegistryFilter('all')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'all' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Все ({registries[registryMonth]?.length || 0})</button>
                        <button onClick={() => setRegistryFilter('unregistered')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${registryFilter === 'unregistered' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>Незарег.</button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead className="bg-gray-50/50 text-gray-400 text-xs uppercase tracking-wider font-bold">
                        <tr>
                          <th className="p-4 pl-6">ФИО сотрудника</th>
                          <th className="p-4 text-right">Сумма взноса</th>
                          <th className="p-4 text-center">Статус в приложении</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...(registries[registryMonth] || [])]
                          .sort((a, b) => b.amount - a.amount)
                          .filter(record => 
                            !registrySearch || record.name.toLowerCase().includes(registrySearch.toLowerCase())
                          )
                          .map((record, i) => {
                          const isRegistered = users.some(u => 
                            u.status === 'approved' && 
                            (u.displayName.toLowerCase().includes(record.name.toLowerCase()) || record.name.toLowerCase().includes(u.displayName.toLowerCase()))
                          );
                          if (registryFilter === 'unregistered' && isRegistered) return null;
                          
                          return (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="p-4 pl-6 font-bold text-sm">{record.name}</td>
                              <td className="p-4 text-right font-black text-indigo-600">{record.amount.toLocaleString('ru-RU')} ₸</td>
                              <td className="p-4 text-center">
                                {isRegistered ? (
                                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 uppercase tracking-wider">✅ Да</span>
                                ) : (
                                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 uppercase tracking-wider">❌ Нет</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {(!registries[registryMonth] || registries[registryMonth].length === 0) && (
                          <tr><td colSpan={3} className="p-8 text-center text-gray-400 font-bold">Нет данных за этот месяц</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {registries[registryMonth] && registries[registryMonth].length > 0 && (
                     <div className="mt-4 text-right pr-4">
                       <span className="text-gray-500 font-bold text-sm">Итого за месяц: </span>
                       <span className="text-2xl font-black text-green-600 ml-2">
                         {registries[registryMonth].reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('ru-RU')} ₸
                       </span>
                     </div>
                  )}
                </div>
              </div>

              {/* ДИНАМИКА И ОТВАЛИВШИЕСЯ */}
              {registries[registryMonth] && registries[registryMonth].length > 0 && (
                <div className="grid lg:grid-cols-2 gap-6 mt-8">
                  {/* Кандидаты на заморозку */}
                  <div className="bg-white p-6 rounded-[2rem] border border-orange-100 shadow-sm flex flex-col h-full">
                    <div className="flex flex-col mb-6 gap-2">
                      <h3 className="font-black text-xl text-orange-900">Кандидаты на заморозку</h3>
                      <div className="text-xs text-gray-500 font-bold leading-relaxed">
                        Участники со статусом "Активный" в приложении, которых <b>нет</b> в загруженном реестре за {registryMonth}
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white flex-1">
                      <table className="w-full text-left border-collapse min-w-[400px]">
                        <thead className="bg-orange-50/50 text-orange-800 text-[10px] uppercase tracking-wider font-black">
                          <tr>
                            <th className="p-3 pl-4">Сотрудник</th>
                            <th className="p-3 text-right">Действие</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {users.filter(u => {
                            if (u.status !== 'approved') return false;
                            const inRegistry = registries[registryMonth].some(r => 
                              u.displayName.toLowerCase().includes(r.name.toLowerCase()) || 
                              r.name.toLowerCase().includes(u.displayName.toLowerCase())
                            );
                            return !inRegistry;
                          }).map(u => (
                            <tr key={u.id} className="hover:bg-orange-50/30 transition-colors">
                              <td className="p-3 pl-4 font-bold text-sm">
                                <div>{u.displayName}</div>
                                <div className="text-[10px] text-gray-400 font-normal">{u.position}</div>
                              </td>
                              <td className="p-3 text-right">
                                <button onClick={() => handleFreezeUser(u)} className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded-lg text-xs font-black transition-colors whitespace-nowrap">
                                  ❄️ Заморозить
                                </button>
                              </td>
                            </tr>
                          ))}
                          {users.filter(u => u.status === 'approved' && !registries[registryMonth].some(r => u.displayName.toLowerCase().includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(u.displayName.toLowerCase()))).length === 0 && (
                            <tr><td colSpan={2} className="p-8 text-center text-gray-400 font-bold">Все текущие участники найдены в реестре ✅</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Сравнение с прошлым месяцем */}
                  <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm flex flex-col h-full">
                    <div className="flex flex-col mb-6 gap-2">
                      <h3 className="font-black text-xl text-blue-900">Сравнение с прошлым месяцем</h3>
                      <div className="text-xs text-gray-500 font-bold leading-relaxed">
                        Анализ изменений между реестрами
                      </div>
                    </div>

                    <div className="space-y-4 flex-1">
                      {(() => {
                        const [year, month] = registryMonth.split('-');
                        let prevDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                        prevDate.setMonth(prevDate.getMonth() - 1);
                        const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
                        
                        const currentReg = registries[registryMonth] || [];
                        const prevReg = registries[prevMonthStr];

                        if (!prevReg || prevReg.length === 0) {
                          return <div className="p-8 text-center text-gray-400 font-bold bg-gray-50 rounded-2xl border border-gray-100">Нет данных за предыдущий месяц ({prevMonthStr}) для сравнения</div>;
                        }

                        // Кто был в прошлом, но нет в этом
                        const dropOffs = prevReg.filter(p => !currentReg.some(c => c.name.toLowerCase() === p.name.toLowerCase()));
                        // Кто есть в этом, но не было в прошлом
                        const newAdditions = currentReg.filter(c => !prevReg.some(p => p.name.toLowerCase() === c.name.toLowerCase()));

                        return (
                          <div className="grid grid-cols-1 gap-4">
                            <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                              <h4 className="font-black text-red-800 text-sm mb-2">🔴 Перестали платить ({dropOffs.length})</h4>
                              <div className="max-h-32 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-red-200">
                                {dropOffs.length === 0 ? <div className="text-xs text-gray-500 font-medium">Нет отвалившихся</div> : dropOffs.map((d, i) => (
                                  <div key={i} className="text-xs font-bold text-red-900 mb-1 border-b border-red-100/50 pb-1">{d.name} <span className="text-red-400 float-right">{d.amount} ₸</span></div>
                                ))}
                              </div>
                            </div>
                            <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                              <h4 className="font-black text-green-800 text-sm mb-2">🟢 Новые плательщики ({newAdditions.length})</h4>
                              <div className="max-h-32 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-green-200">
                                {newAdditions.length === 0 ? <div className="text-xs text-gray-500 font-medium">Нет новых</div> : newAdditions.map((d, i) => (
                                  <div key={i} className="text-xs font-bold text-green-900 mb-1 border-b border-green-100/50 pb-1">{d.name} <span className="text-green-500 float-right">+{d.amount} ₸</span></div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

      {/* MODAL FOR MONTH STATS */}
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
              {selectedMonthStats.details.map((d, i) => (
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
        </div>
      </div>

      {/* MODAL FOR EDITING NEWS */}
      {editingNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setEditingNews(null)}>
          <div className="bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 w-full max-w-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditingNews(null)} className="absolute top-6 right-6 text-gray-400 hover:text-black font-black bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            <h2 className="text-2xl font-black mb-6">Редактирование новости</h2>
            <form onSubmit={handleSaveNewsEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Заголовок</label>
                <input required className="w-full bg-gray-50 p-4 rounded-xl font-bold border-0 outline-none" value={editNewsTitle} onChange={e => setEditNewsTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Текст</label>
                <textarea required className="w-full bg-gray-50 p-4 rounded-xl font-medium border-0 outline-none h-40" value={editNewsBody} onChange={e => setEditNewsBody(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Ссылка</label>
                <input className="w-full bg-gray-50 p-4 rounded-xl font-medium border-0 outline-none" value={editNewsLink} onChange={e => setEditNewsLink(e.target.value)} />
              </div>
              <div className="flex justify-end pt-4 gap-3">
                <button type="button" onClick={() => setEditingNews(null)} className="px-6 py-3 font-bold text-gray-500 hover:text-black">Отмена</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-600/30">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
