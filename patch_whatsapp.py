import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Main table phone number (line 1776 contains this, but we'll find the specific substring)
old_table_td = '<div className="text-sm font-bold">{u.phoneNumber}</div>'
new_table_td = '''<div className="text-sm font-bold flex items-center gap-2">
  {u.phoneNumber}
  {u.phoneNumber && (
    <a href={`https://wa.me/${u.phoneNumber.replace(/\\D/g, '').replace(/^8/, '7')}`} 
       target="_blank" rel="noopener noreferrer" 
       onClick={e => e.stopPropagation()} 
       className="bg-green-100 text-green-600 hover:bg-green-200 px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors">
      WhatsApp
    </a>
  )}
</div>'''

# 2. Selected user modal (line 1895 contains <span>📞 {selectedUser.phoneNumber}</span>)
old_modal_span = '<span>📞 {selectedUser.phoneNumber}</span>'
new_modal_span = '''<div className="flex items-center gap-2">
  <span>📞 {selectedUser.phoneNumber}</span>
  {selectedUser.phoneNumber && (
    <a href={`https://wa.me/${selectedUser.phoneNumber.replace(/\\D/g, '').replace(/^8/, '7')}`} 
       target="_blank" rel="noopener noreferrer" 
       className="bg-green-100 text-green-600 hover:bg-green-200 px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors">
      Написать в WhatsApp
    </a>
  )}
</div>'''

content = content.replace(old_table_td, new_table_td)
content = content.replace(old_modal_span, new_modal_span)

with open(filepath, 'w') as f:
    f.write(content)

print("Patch applied successfully.")
