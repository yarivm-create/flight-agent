async function checkAvailability(url, siteName) {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה ארוכה כי ישראייר טוענים את הבאנר "טיסה מלאה" באיחור
        await new Promise(r => setTimeout(r, 45000));

        const isAvailable = await page.evaluate((sName) => {
            const body = document.body;
            const bodyText = body.innerText;

            // בדיקת חסימות גורפות שמופיעות בטקסט החופשי
            const globalBlockWords = ['לצערנו לא נמצאו תוצאות', 'אין טיסות בתאריך'];
            if (globalBlockWords.some(word => bodyText.includes(word))) return false;

            if (sName === 'ישראייר') {
                // נחפש את כל הטיסות שמוצגות בדף
                const flightContainers = Array.from(document.querySelectorAll('.flight-result-item, [class*="flight-card"], .flight-row'));
                
                // אם אין בכלל טיסות ברשימה
                if (flightContainers.length === 0) return false;

                return flightContainers.some(container => {
                    const text = container.innerText;
                    // האם יש מחיר בשורה הזו?
                    const hasPrice = text.includes('$') || text.includes('₪');
                    // האם מופיעה הודעת חסימה כלשהי בשורה הזו או באלמנטים שצמודים לה?
                    const isFull = text.includes('טיסה מלאה') || 
                                   text.includes('מושבים פנויים') || 
                                   text.includes('קטן מהמבוקש');
                    
                    // בגרסה הזו, אם מצאנו מחיר ואין "מלאה", נבדוק אם יש אלמנט לחיץ של מחיר (ולא רק 'פרטי טיסה')
                    return hasPrice && !isFull;
                });
            }

            if (sName === 'ארקיע') {
                // בארקיע הכי בטוח לבדוק שאין את הבאנר האדום "אזל" על המחיר
                const priceElements = Array.from(document.querySelectorAll('[class*="price"]'));
                return priceElements.some(el => {
                    const parentText = el.parentElement.innerText;
                    return (el.innerText.includes('$') || el.innerText.includes('₪')) && !parentText.includes('אזל');
                });
            }

            // ברירת מחדל לאייר חיפה - בדיקה שיש מחיר ואין "הטיסה מלאה"
            return bodyText.includes('$') && !bodyText.includes('הטיסה מלאה');
        }, siteName);

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}
