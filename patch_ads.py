import re

def patch_file():
    with open('app/dashboard/page.tsx', 'r') as f:
        content = f.read()

    # 1. Update AdItem
    ad_item_repl = """interface AdItem {
  id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  text: string;
  link?: string;
"""
    content = re.sub(r'interface AdItem {\n  id: string;\n  userId: string;\n  userName: string;\n  text: string;\n', ad_item_repl, content)

    # 2. Add states for link, touch, and interaction time
    states_search = """  const [adText, setAdText] = useState('');
  const [adImage, setAdImage] = useState<File | null>(null);
  const [isSubmittingAd, setIsSubmittingAd] = useState(false);"""
    
    states_repl = """  const [adText, setAdText] = useState('');
  const [adLink, setAdLink] = useState('');
  const [adImage, setAdImage] = useState<File | null>(null);
  const [isSubmittingAd, setIsSubmittingAd] = useState(false);
  const [adInteractionTime, setAdInteractionTime] = useState(Date.now());
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      setActiveAdIndex((prev) => (prev + 1) % ads.length);
      setAdInteractionTime(Date.now());
    }
    if (isRightSwipe) {
      setActiveAdIndex((prev) => (prev === 0 ? ads.length - 1 : prev - 1));
      setAdInteractionTime(Date.now());
    }
  };

  const handleAdClick = (ad: AdItem) => {
    if (ad.link) {
      window.open(ad.link, '_blank');
    } else if (ad.userPhone) {
      const phoneDigits = ad.userPhone.replace(/\D/g, '');
      if (phoneDigits) {
        window.open(`https://wa.me/${phoneDigits}`, '_blank');
      } else {
        alert('У автора не указан номер телефона.');
      }
    } else {
      alert('Нет ссылки и номера телефона для связи.');
    }
  };"""
    content = content.replace(states_search, states_repl)

    # 3. Update useEffect for timer
    timer_search = """  useEffect(() => {
    if (ads.length > 1) {
      const interval = setInterval(() => {
        setActiveAdIndex((prev) => (prev + 1) % ads.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [ads.length]);"""
    timer_repl = """  useEffect(() => {
    if (ads.length > 1) {
      const interval = setInterval(() => {
        setActiveAdIndex((prev) => (prev + 1) % ads.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [ads.length, adInteractionTime]);"""
    content = content.replace(timer_search, timer_repl)

    # 4. Update handleSubmitAd
    submit_search = """      await addDoc(collection(db, 'ads'), {
        userId: user.uid,
        userName: userData.displayName || user.email || 'Аноним',
        text: adText.trim(),
        imageUrl,"""
    submit_repl = """      await addDoc(collection(db, 'ads'), {
        userId: user.uid,
        userName: userData.displayName || user.email || 'Аноним',
        userPhone: userData.phoneNumber || '',
        text: adText.trim(),
        link: adLink.trim(),
        imageUrl,"""
    content = content.replace(submit_search, submit_repl)
    
    # clear link
    clear_search = """      setAdText('');
      setAdImage(null);"""
    clear_repl = """      setAdText('');
      setAdLink('');
      setAdImage(null);"""
    content = content.replace(clear_search, clear_repl)

    # 5. Ad form UI
    form_search = """                  <p className="text-right text-[10px] text-gray-400 font-bold mt-1">{adText.length}/100</p>
                </div>

                <div className="flex items-center gap-4">"""
    form_repl = """                  <p className="text-right text-[10px] text-gray-400 font-bold mt-1">{adText.length}/100</p>
                </div>
                
                <div>
                  <input
                    type="url"
                    value={adLink}
                    onChange={(e) => setAdLink(e.target.value)}
                    placeholder="Ссылка (необязательно, например: https://...)"
                    className="w-full bg-gray-50 p-4 rounded-2xl font-medium border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                  />
                </div>

                <div className="flex items-center gap-4">"""
    content = content.replace(form_search, form_repl)

    # 6. Ad rendering UI (Touch handlers + onclick + remove signature)
    render_search = """            {ads.length > 0 && (
              <div className="rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden relative h-[140px] flex items-center justify-center bg-white">
                <div className="relative w-full h-full overflow-hidden">
                  <div
                    className="flex h-full transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${activeAdIndex * 100}%)` }}
                  >
                    {ads.map((ad, idx) => {
                      const layout = ad.imageLayout || 'fill';
                      return (
                      <div key={ad.id} className={`w-full h-full shrink-0 relative flex items-center justify-center p-4 sm:p-5 ${ad.bgColor || 'bg-gradient-to-r from-blue-500 to-blue-600'} ${layout === 'left' ? 'flex-row justify-start' : layout === 'right' ? 'flex-row-reverse justify-start' : ''}`}>"""
    
    render_repl = """            {ads.length > 0 && (
              <div 
                className="rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden relative h-[140px] flex items-center justify-center bg-white"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <div className="relative w-full h-full overflow-hidden">
                  <div
                    className="flex h-full transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${activeAdIndex * 100}%)` }}
                  >
                    {ads.map((ad, idx) => {
                      const layout = ad.imageLayout || 'fill';
                      return (
                      <div 
                        key={ad.id} 
                        onClick={() => handleAdClick(ad)}
                        className={`w-full h-full shrink-0 relative flex items-center justify-center p-4 sm:p-5 cursor-pointer ${ad.bgColor || 'bg-gradient-to-r from-blue-500 to-blue-600'} ${layout === 'left' ? 'flex-row justify-start' : layout === 'right' ? 'flex-row-reverse justify-start' : ''}`}
                      >"""
    content = content.replace(render_search, render_repl)
    
    # Remove signature: Look for the signature block and remove it.
    signature_search = """                          <div className={`flex items-center gap-1.5 mt-0.5 ${(ad.imageUrl && layout === 'fill') || layout !== 'fill' ? 'text-white/80' : 'text-white/80'}`}>
                            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                              <span className="text-[8px]">👤</span>
                            </div>
                            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                              {ad.userName}
                            </p>
                          </div>"""
    content = content.replace(signature_search, "")

    with open('app/dashboard/page.tsx', 'w') as f:
        f.write(content)

    print("Patched app/dashboard/page.tsx")

if __name__ == '__main__':
    patch_file()
