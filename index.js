const puppeteer = require('puppeteer');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const DESTS = [
    { code: 'ROM', name: 'רומא 🇮🇹', israirId: 802, airHaifaCode: null },
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422, airHaifaCode: 'ATH' },
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931, airHaifaCode: 'LCA' },
    { code: 'PFO', name: 'פאפוס 🇨🇾', israirId: 3968, airHaifaCode: null }
];

function getDynamicDates() {
    const dates = [];
    for (let i = 0; i <= 6; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}${month}${day}`);
    }
    return dates;
}

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
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // המתנה של 20 שניות מספיקה כדי שהכפתורים הכחולים יופיעו
        await new Promise(r => setTimeout(r, 20000));

        const isAvailable = await page.evaluate((sName) => {
            const bodyText = document.body.innerText;
            if (bodyText.includes('לצערנו לא נמצאו') || bodyText.includes('אין מקומות')) return false;

            // סריקה רחבה של אלמנטים שיכולים להכיל מחיר/כפתור בחירה
            const elements = Array.from(document.querySelectorAll('button, .flight-result-item, .item-container, [class*="price"], [class*="flight-card"]'));
            
            return elements.some(el => {
                const txt = el.innerText;
                // בדיקה אם יש סימן מטבע או מילה שמעידה על מחיר (כמו באייר חיפה)
                const hasPrice = txt.includes('$') || txt.includes('₪') || (sName === 'Air Haifa' && txt.includes('בחירה'));
                
                // סינון טיסות מלאות לפי צילומי המסך של ישראייר
                const isFull = txt.includes('מלאה') || txt.includes('מלא') || txt.includes('Sold') || txt.includes('אזל');
                
                return hasPrice && !isFull;
            });
        }, siteName);

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}

async function run() {
    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const dates = getDynamicDates();
    let results = [];

    // הודעת התחלה בטלגרם כדי לוודא דופק
    await sendTelegram(`🔍 *התחלת סריקת טיסות (${now})*`);

    for (const dest of DESTS) {
        for (const date of dates) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            const israirUrl = `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22TLV%22,%22ltravelId%22:2135%7D&destination=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22${dest.code}%22,%22ltravelId%22:${dest.israirId}%7D&startDate=${fmtSlash}&adults=3&children=1`;
            const arkiaUrl = `https://www.arkia.co.il/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1`;

            const checkList = [
                { name: 'ארקיע', url: arkiaUrl },
                { name: 'ישראייר', url: israirUrl }
            ];

            if (dest.airHaifaCode) {
                // לינק לאייר חיפה לפי הפורמט שבתמונה (3 מבוגרים, ילד אחד)
                checkList.push({ name: 'Air Haifa', url: `https://www.airhaifa.com/flight-results/TLV-${dest.airHaifaCode}/${fmtDash}/NA/3/1/0?breakdown=%7B%7D` });
            }

            for (const item of checkList) {
                console.log(`בודק ${item.name} ל-${dest.name} ב-${fmtSlash}`);
                if (await checkAvailability(item.url, item.name)) {
                    results.push(`✈️ *${item.name}* | ${dest.name} | ${fmtSlash} [לינק](${item.url})`);
                }
            }
        }
    }

    if (results.length > 0) {
        await sendTelegram(`📢 *נמצאו טיסות פנויות!*\n\n${results.join('\n---\n')}`);
    } else {
        await sendTelegram(`✅ *סריקה הושלמה*\nלא נמצאו טיסות פנויות כרגע.`);
    }
}

run();
