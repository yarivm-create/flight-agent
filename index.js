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
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        // התחזות מלאה לאייפון כדי לעקוף חסימות של אייר חיפה
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844 });

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        
        // המתנה לטעינת הכפתורים הכחולים של אייר חיפה
        await new Promise(r => setTimeout(r, 25000));

        const isAvailable = await page.evaluate((sName) => {
            const body = document.body.innerText;
            if (body.includes('לא נמצאו תוצאות') || body.includes('אין טיסות')) return false;

            if (sName === 'Air Haifa') {
                // חיפוש כפתורים שמכילים גם מחיר וגם את המילה "בחירה"
                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                return buttons.some(b => {
                    const t = b.innerText;
                    return t.includes('$') && t.includes('בחירה') && !t.includes('מלאה');
                });
            }

            // לוגיקה לישראייר וארקיע
            const items = Array.from(document.querySelectorAll('.flight-result-item, .item-container, [class*="flight-card"]'));
            return items.some(el => {
                const txt = el.innerText;
                const hasPrice = txt.includes('$') || txt.includes('₪');
                const isFull = txt.includes('מלאה') || txt.includes('מלא') || txt.includes('Sold');
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

    // הודעת פתיחה כדי שתדע שהבוט התחיל לעבוד
    await sendTelegram(`🔍 *סריקה התחילה: ${now}*`);

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
                checkList.push({ name: 'Air Haifa', url: `https://www.airhaifa.com/flight-results/TLV-${dest.airHaifaCode}/${fmtDash}/NA/3/1/0?breakdown=%7B%7D` });
            }

            for (const item of checkList) {
                if (await checkAvailability(item.url, item.name)) {
                    results.push(`✈️ *${item.name}* | ${dest.name} | ${fmtSlash} [לינק](${item.url})`);
                }
            }
        }
    }

    if (results.length > 0) {
        await sendTelegram(`📢 *נמצאו טיסות! *\n\n${results.join('\n---\n')}`);
    } else {
        await sendTelegram(`✅ *סריקה הושלמה*\nלא נמצאו טיסות פנויות שעומדות בקריטריונים.`);
    }
}

run();
