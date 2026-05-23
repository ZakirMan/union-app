'use client';

import { useEffect, useState } from 'react';
import { db, auth, storage } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, deleteDoc, getDoc, increment, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import Image from 'next/image';

// --- ТИПЫ ДАННЫХ ---
interface UserData {
  id: string; displayName: string; email: string; phoneNumber?: string; position: string; role: string; status: string;
  voteWeight?: number; delegatedTo?: string; delegatedToName?: string; delegatedFrom?: string[];
  delegationStatus?: string; delegationConferenceId?: string; photoUrl?: string;
  statementUrl?: string;
  isAlreadyMember?: boolean;
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
interface NewsItem { id: string; title: string; body: string; imageUrl?: string; createdAt: string; }
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
}
interface LinkItem { id: string; title: string; url: string; }
interface DocTemplate { id: string; title: string; description?: string; fileUrl: string; }

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'events' | 'delegations' | 'users' | 'news' | 'requests' | 'resources' | 'team' | 'polls' | 'logs'>('dashboard');
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

  // Состояние для просмотра результатов теста
  const [selectedTestStats, setSelectedTestStats] = useState<Test | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  // Конструктор теста
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState('');
  const [testDesc, setTestDesc] = useState('');
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([{ id: 'q1', text: '', options: [{ id: 'o1', text: '', isCorrect: true }] }]);

  // Конструктор опроса
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollExpiry, setPollExpiry] = useState('');
  const [selectedPollStats, setSelectedPollStats] = useState<Poll | null>(null); // <--- NEW STATE

  // Формы
  const [confTitle, setConfTitle] = useState(''); const [confDate, setConfDate] = useState('');
  const [newsTitle, setNewsTitle] = useState(''); const [newsBody, setNewsBody] = useState(''); const [newsFile, setNewsFile] = useState<File | null>(null);
  const [memberName, setMemberName] = useState(''); const [memberRole, setMemberRole] = useState(''); const [memberFile, setMemberFile] = useState<File | null>(null);
  const [linkTitle, setLinkTitle] = useState(''); const [linkUrl, setLinkUrl] = useState('');
  const [tplTitle, setTplTitle] = useState(''); const [tplDesc, setTplDesc] = useState(''); const [tplFile, setTplFile] = useState<File | null>(null);

  // Создание Документа
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [isUploading, setIsUploading] = useState(false);

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1);
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
  const sendPushNotification = async (title: string, body: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, body }),
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
        await sendPushNotification('🎓 Новый тест доступен', `Проверьте свои знания: ${testTitle}`);
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
      await addDoc(collection(db, 'news'), { title: newsTitle, body: newsBody, imageUrl, createdAt: new Date().toISOString() });

      // Отправляем пуш
      await sendPushNotification('⚡️ Свежая новость', newsTitle);
      await logAction('publish_news', 'news', `Опубликована новость: ${newsTitle}`);

      setNewsTitle(''); setNewsBody(''); setNewsFile(null); fetchData();
    } catch { alert('Ошибка'); } finally { setIsUploading(false); }
  };

  const handleDeleteNews = async (id: string) => { if (confirm('Del?')) await deleteDoc(doc(db, 'news', id)); await logAction('delete_news', 'news', `Удалена новость: ${id}`); fetchData(); };

  // 4. СОЗДАНИЕ ОПРОСА
  const handleCreatePoll = async () => {
    if (!pollQuestion || pollOptions.some(o => !o.trim())) { alert('Заполните вопрос и варианты'); return; }
    try {
      await addDoc(collection(db, 'polls'), {
        question: pollQuestion,
        options: pollOptions.map(o => ({ id: `opt_${Date.now()}_${Math.random()}`, text: o, votes: [] })),
        isActive: true,
        createdBy: auth.currentUser?.uid,
        createdAt: new Date().toISOString()
      });
      // Push notification could go here

      setPollQuestion(''); setPollOptions(['', '']); setIsCreatingPoll(false);
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
  const handleApproveUser = async (id: string) => { if (confirm('Подтвердить?')) { await updateDoc(doc(db, 'users', id), { status: 'approved', voteWeight: 1 }); await logAction('approve_user', 'user', `Участник принят: ${id}`); fetchData(); } };
  const handleRejectUser = async (id: string, statementUrl?: string) => { 
    if (confirm('Удалить?')) { 
      if (statementUrl) {
        try {
          const fileRef = ref(storage, statementUrl);
          await deleteObject(fileRef);
        } catch (e) {
          console.error("Ошибка при удалении файла", e);
        }
      }
      await deleteDoc(doc(db, 'users', id)); 
      await logAction('reject_user', 'user', `Участник удален/отклонен: ${id}`); 
      fetchData(); 
    } 
  };

  const handleDeleteUserStatement = async (id: string, statementUrl: string) => {
    if (confirm('Удалить прикрепленный файл пользователя из облака?')) {
      try {
        const fileRef = ref(storage, statementUrl);
        await deleteObject(fileRef);
        await updateDoc(doc(db, 'users', id), { statementUrl: '' });
        await logAction('delete_user_statement', 'user', `Удален файл у пользователя: ${id}`);
        fetchData();
      } catch (e) {
        console.error("Ошибка при удалении файла", e);
        alert('Ошибка при удалении файла. Возможно, он уже удален.');
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
  const handleReplyRequest = async (id: string) => { if (replyText[id]) { await updateDoc(doc(db, 'requests', id), { response: replyText[id], responseAt: new Date().toISOString() }); fetchData(); } };

  if (loading) return <div className="min-h-screen bg-[#F2F6FF] flex items-center justify-center font-black text-blue-900 animate-pulse">Загрузка данных...</div>;

  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeRequests = requests.filter(r => !r.response).length;
  const pendingDelegations = delegations.filter(d => d.status === 'pending');

  return (
    <div className="min-h-screen bg-[#F2F6FF] flex flex-col font-sans text-[#1A1A1A]">

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
            { id: 'logs', label: 'Аудит', icon: '🛡️' }
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
                { id: 'logs', label: 'Аудит', icon: '🛡️' }
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

              <div className="grid md:grid-cols-2 gap-4">
                {polls.map(poll => (
                  <div key={poll.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-black text-lg">{poll.question}</h3>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${poll.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{poll.isActive ? 'Активен' : 'Завершен'}</span>
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
                            {u.statementUrl ? (
                              <a href={u.statementUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-100 transition border border-blue-100">
                                📎 Скачать {u.isAlreadyMember ? 'фото пропуска' : 'заявление'}
                              </a>
                            ) : (
                              <span className="text-xs text-red-500 font-bold">Файл не прикреплен</span>
                            )}
                            {u.isAlreadyMember && (
                              <span className="inline-flex items-center bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-black border border-green-100">
                                🔰 Уже в профсоюзе
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                          <button onClick={() => handleApproveUser(u.id)} className="flex-1 md:flex-none bg-green-500 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-green-200/50 hover:bg-green-600 transition hover:scale-105">Принять</button>
                          <button onClick={() => handleRejectUser(u.id, u.statementUrl)} className="flex-1 md:flex-none bg-red-50 text-red-500 px-6 py-3 rounded-xl font-black hover:bg-red-100 transition">Отклонить</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100">
                <div className="p-8 bg-gray-50/50 flex justify-between items-center">
                  <h2 className="font-black text-2xl">Реестр участников</h2>
                  <div className="text-xs font-bold text-gray-400">Всего: {users.filter(u => u.status === 'approved').length}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 text-gray-400 uppercase text-xs font-black"><tr><th className="p-6">Сотрудник</th><th className="p-6">Контакты</th><th className="p-6 text-center">Файл</th><th className="p-6 text-center">Статус</th><th className="p-6 text-right"></th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {users
                        .filter(u => u.status === 'approved')
                        .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                        .map(u => (<tr key={u.id} className="hover:bg-blue-50/50 cursor-pointer group" onClick={() => setSelectedUser(u)}><td className="p-6"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden flex items-center justify-center relative">{u.photoUrl ? <Image src={u.photoUrl} alt={u.displayName} fill className="object-cover" /> : '👤'}</div><div><div className="font-black text-gray-900 group-hover:text-blue-600">{u.displayName}</div><div className="text-xs font-bold text-gray-500">{u.position}</div></div></div></td><td className="p-6"><div className="text-sm font-bold">{u.phoneNumber}</div><div className="text-xs text-gray-400">{u.email}</div></td><td className="p-6 text-center">{u.statementUrl ? (<div className="flex flex-col items-center gap-1"><a href={u.statementUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs font-bold" onClick={e => e.stopPropagation()}>Смотреть</a><button onClick={(e) => { e.stopPropagation(); handleDeleteUserStatement(u.id, u.statementUrl!); }} className="text-red-400 hover:text-red-600 text-[10px] uppercase font-black">Удалить</button></div>) : <span className="text-gray-300 text-xs">—</span>}</td><td className="p-6 text-center">{u.delegatedTo ? <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-black">Голос передан</span> : u.delegatedFrom && u.delegatedFrom.length > 0 ? <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black">Делегат (+{u.delegatedFrom.length})</span> : <span className="text-gray-300">—</span>}</td><td className="p-6 text-right"><button onClick={(e) => { e.stopPropagation(); handleRejectUser(u.id, u.statementUrl); }} className="text-red-300 hover:text-red-500 font-bold px-2">✕</button></td></tr>))}
                    </tbody>
                  </table>
                </div>
                {/* PAGINATION USERS */}
                {users.filter(u => u.status === 'approved').length > itemsPerPage && (
                  <div className="p-6 flex justify-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl bg-gray-100 font-bold text-gray-600 disabled:opacity-50">←</button>
                    <span className="px-4 py-2 font-black text-gray-400">Стр. {currentPage}</span>
                    <button onClick={() => setCurrentPage(p => (p * itemsPerPage < users.filter(u => u.status === 'approved').length ? p + 1 : p))} disabled={currentPage * itemsPerPage >= users.filter(u => u.status === 'approved').length} className="px-4 py-2 rounded-xl bg-gray-100 font-bold text-gray-600 disabled:opacity-50">→</button>
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

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in" onClick={() => setSelectedUser(null)}>
                <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white relative">
                    <button onClick={() => setSelectedUser(null)} className="absolute top-6 right-6 bg-white/20 rounded-full p-2 hover:bg-white/30">✕</button>
                    <div className="flex items-center gap-6"><div className="w-24 h-24 bg-white rounded-full border-4 border-white/30 flex items-center justify-center text-4xl overflow-hidden relative">{selectedUser.photoUrl ? <Image src={selectedUser.photoUrl} alt={selectedUser.displayName} fill className="object-cover" /> : '👤'}</div><div><h2 className="text-3xl font-black">{selectedUser.displayName}</h2><p className="font-bold text-blue-100 text-lg opacity-90">{selectedUser.position}</p></div></div>

                    {/* DISPLAY DYNAMIC VOTE WEIGHT */}
                    <div className="mt-4 bg-white/10 p-3 rounded-xl inline-flex items-center gap-2">
                      <span className="text-sm font-bold opacity-80">Сила голоса на {nextConf?.title || 'собрании'}:</span>
                      <span className="text-2xl font-black">{1 + activeDelegationsIn.length}</span>
                    </div>

                    <div className="mt-6 flex gap-6 text-sm font-bold opacity-80"><span>📞 {selectedUser.phoneNumber}</span><span>✉️ {selectedUser.email}</span></div>
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
          {activeTab === 'requests' && <div className="grid gap-4">{requests.map(req => (<div key={req.id} className="bg-white p-4 md:p-6 rounded-[2rem] border border-gray-100 shadow-sm"><div className="flex justify-between items-start mb-3"><span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-black">{req.userEmail}</span><span className="text-xs font-bold text-gray-400">{new Date(req.createdAt).toLocaleString()}</span></div><p className="font-bold text-gray-800 text-lg mb-4">&quot;{req.text}&quot;</p>
            {/* FILE DISPLAY */}
            {req.fileUrl && (
              <div className="mb-4">
                <a href={req.fileUrl} target="_blank" className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-indigo-100 transition">
                  <span>📎</span> Прикрепленный файл
                </a>
              </div>
            )}
            {req.response ? <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-sm font-bold text-green-900">{req.response}</div> : <div className="flex gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-200"><input className="bg-transparent p-2 w-full font-medium outline-none text-sm" placeholder="Ответ..." onChange={(e) => setReplyText({ ...replyText, [req.id]: e.target.value })} /><button onClick={() => handleReplyRequest(req.id)} className="bg-blue-600 text-white px-5 rounded-xl font-black text-sm">Send</button></div>}</div>))}</div>}
          {activeTab === 'news' && <div className="space-y-6"><div className="bg-white p-6 rounded-[2rem] shadow-lg"><h2 className="font-black text-xl mb-4">Новость</h2><form onSubmit={handlePublishNews} className="space-y-3"><input className="w-full bg-gray-50 p-4 rounded-2xl font-bold border-0 outline-none" placeholder="Заголовок" value={newsTitle} onChange={e => setNewsTitle(e.target.value)} /><textarea className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-0 outline-none h-32" placeholder="Текст..." value={newsBody} onChange={e => setNewsBody(e.target.value)} /><div className="flex justify-between"><input type="file" onChange={e => setNewsFile(e.target.files?.[0] || null)} className="text-xs" /><button disabled={isUploading} className="bg-black text-white px-8 py-3 rounded-xl font-black">{isUploading ? 'Загрузка...' : 'Опубликовать'}</button></div></form></div><div className="grid md:grid-cols-2 gap-4">{news.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(n => (<div key={n.id} className="bg-white p-3 md:p-4 rounded-3xl border border-gray-100 shadow-sm relative"><h3 className="font-black text-lg mb-2">{n.title}</h3><p className="text-xs text-gray-400 font-bold">{new Date(n.createdAt).toLocaleDateString()}</p><button onClick={() => handleDeleteNews(n.id)} className="absolute top-4 right-4 text-red-300 font-black">✕</button></div>))}</div>
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
                        <span className="font-bold text-gray-700">{t.title}</span>
                        <div className="flex gap-2">
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
          {activeTab === 'team' && <div className="bg-white p-8 rounded-[2rem] shadow-xl"><h2 className="font-black text-2xl mb-6">Совет</h2><form onSubmit={handleAddMember} className="bg-gray-50 p-6 rounded-2xl mb-8 flex gap-4"><input className="p-3 rounded-xl w-full font-bold border-0" placeholder="ФИО" value={memberName} onChange={e => setMemberName(e.target.value)} /><input className="p-3 rounded-xl w-full border-0" placeholder="Роль" value={memberRole} onChange={e => setMemberRole(e.target.value)} /><input type="file" onChange={e => setMemberFile(e.target.files?.[0] || null)} className="text-xs" /><button disabled={isUploading} className="bg-black text-white px-6 rounded-xl font-black">{isUploading ? '...' : 'Add'}</button></form><div className="grid md:grid-cols-3 gap-4">{team.map((m, i) => <div key={m.id} className="border p-3 md:p-4 rounded-2xl flex items-center gap-3 md:gap-4 bg-white relative group"><div className="w-12 h-12 rounded-full overflow-hidden relative"><Image src={m.photoUrl || '/default-avatar.png'} alt={m.name} fill className="object-cover" /></div><div className="flex-grow"><p className="font-black text-sm">{m.name}</p><p className="text-xs text-gray-400">{m.role}</p></div><div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleMoveMember(m.id, 'up')} disabled={i === 0} className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] hover:bg-gray-200 disabled:opacity-30">▲</button><button onClick={() => handleMoveMember(m.id, 'down')} disabled={i === team.length - 1} className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] hover:bg-gray-200 disabled:opacity-30">▼</button></div><button onClick={() => handleDeleteMember(m.id)} className="text-red-400 font-black ml-2">✕</button></div>)}</div></div>}

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

        </div>
      </div >
    </div >
  );
}