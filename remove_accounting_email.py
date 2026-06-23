import sys

filepath = 'app/register/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

block_to_remove = '''      // Отправка письма бухгалтеру (только для новых членов)
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
      }'''

if block_to_remove in content:
    content = content.replace(block_to_remove, '')
    with open(filepath, 'w') as f:
        f.write(content)
    print("Removed from register page")
else:
    print("Block not found")

