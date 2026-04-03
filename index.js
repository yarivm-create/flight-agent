const puppeteer = require('puppeteer');
const axios = require('axios');

// פרטי התחברות מה-Secrets של GitHub
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const DESTS = [
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422, airHaifaCode: 'ATH' },
    { code: 'ROM', name: 'רומא 🇮🇹', israirId: 802, airHaifaCode: null },
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931, airHaifaCode: 'LCA' },
    { code: 'PFO', name: 'פאפוס 🇨🇾', israirId: 3968, airHaifaCode: null }
];

// טווח תאריכים מבוקש
const DATES = ['20260403', '20260404', '20260405', '20260406', '20260407', '20260408'];

async function sendTelegram(msg) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown', disable_web_page_preview: true
        });
    } catch (e) { console.error("Telegram error:", e.message); }
}

async function checkAvailability(url, siteName) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה ארוכה של 45 שניות כדי לוודא שכל ה"חותמות" והבאנרים נטענו
        await new Promise(r => setTimeout(r, 45000));

        const isAvailable = await page.evaluate((sName) => {
            const bodyText = document.body.innerText;

            // בדיקת חסימות גורפות בדף (למשל כשאין טיסות בכלל)
            const globalBlock = ['לצערנו לא נמצאו', 'אין טיסות בתאריך', 'no flights found'];
            if (globalBlock.some(word => bodyText.includes(word))) return false;

            if (sName === 'ישראייר') {
                // מציאת כל השורות/כרטיסים של הטיסות
                const flightRows = Array.from(document.querySelectorAll('.flight-result-item, [class*="flight-card"], .flight-row, .flight-item'));
                if (flightRows.length === 0) return false;

                return flightRows.some(row => {
                    const text = row.innerText;
                    const hasPrice = text.includes('$') || text.includes('₪');
                    // סינון חכם: אם כתוב "מלאה" או "קטן מהמבוקש" בתוך השורה הספציפית
                    const isFull = text.includes('מלאה') || text.includes('קטן מהמבוקש') || text.includes('Sold');
                    return hasPrice && !isFull;
                });
            }

            if (sName === 'ארקיע') {
                // בארקיע מחפשים כרטיסי טיסה שאין עליהם את המילה "אזל"
                const arkiaCards = Array.from(document.querySelectorAll('div[class*="flight-card"], .flight-result-item'));
                if (arkiaCards.length === 0) return bodyText.includes('$') && !bodyText.includes('אזל');

                return arkiaCards.some(card => {
                    const text = card.innerText;
                    const hasPrice = text.includes('$') || text.includes('₪');
                    const isSoldOut = text.includes('אזל') || text.includes('Sold');
                    return hasPrice && !isSoldOut;
                });
            }

            // ברירת מחדל לאייר חיפה או אתרים אחרים
            return (bodyText.includes('$') || bodyText.includes('₪')) && !bodyText.includes('מלאה');
        }, siteName);

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}

async function run() {
    console.log("מתחיל סריקה גרסה 9.0 (הפרדת לוגיקה מלאה)...");
    let results = [];

    for (const dest of DESTS) {
        for (const date of DATES) {
            const fmtDash
