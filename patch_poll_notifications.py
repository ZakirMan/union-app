import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update sendPushNotification signature and body
old_push = '''  const sendPushNotification = async (title: string, body: string) => {
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
  };'''

new_push = '''  const sendPushNotification = async (title: string, body: string, userIds?: string[]) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, body, userIds }),
      });
      console.log('Уведомление отправлено:', title);
    } catch (e) {
      console.error('Ошибка отправки уведомления:', e);
    }
  };'''
content = content.replace(old_push, new_push)

# 2. Add push notification sending inside handleCreatePoll
old_create = '''      await addDoc(collection(db, 'polls'), {
        question: pollQuestion,
        targetCategory: pollTargetCategory,
        options: pollOptions.map(o => ({ id: `opt_${Date.now()}_${Math.random()}`, text: o, votes: [] })),
        isActive: true,
        createdBy: auth.currentUser?.uid,
        createdAt: new Date().toISOString()
      });
      // Push notification could go here

      setPollQuestion(''); setPollOptions(['', '']); setPollTargetCategory('Все'); setIsCreatingPoll(false);'''

new_create = '''      await addDoc(collection(db, 'polls'), {
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
      await sendPushNotification('📊 Новый опрос', `Пожалуйста, уделите минуту: ${pollQuestion}`, targetUserIds);

      setPollQuestion(''); setPollOptions(['', '']); setPollTargetCategory('Все'); setIsCreatingPoll(false);'''
content = content.replace(old_create, new_create)

with open(filepath, 'w') as f:
    f.write(content)

print("Patch applied")
