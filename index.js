const puppeteer = require('puppeteer');
const axios = require('axios');

const TELEGRAM_TOKEN = '8456860842:AAHF8hKUb-W9vVBO2N3ykcKLge14ObrtrXA';
const CHAT_ID = '858419911';

const DESTS = [
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422 },
    { code: 'FCO', name: 'רומא 🇮🇹', israirId: 802 },
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931 },
    { code: 'PFO', name: 'פאפוס 🇨🇾', israirId: 3968 }
];

const DATES = ['20260331', '20260401', '20260402', '20260403', '20260404'];

async function sendTelegram(msg) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown', disable_web_page_preview: true
        });
    } catch (e) { console.error("Telegram error"); }
}

async function checkAvailability(url) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 10000)); // המתנה לרינדור

        const result = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const errorPhrases = [
                "הפעם לא מצאנו", "נסו לשנות את היעד", "לצערנו לא נמצאו", 
                "על פי הפרמטרים שהוזנו", "אזל", "טיסה מלאה", "לא נמצאו טיסות",
                "מספר המושבים הפנויים בטיסה קטן מהמבוקש בחיפוש"
            ];
            const hasError = errorPhrases.some(phrase => bodyText.includes(phrase));
            const hasPrice = bodyText.includes('₪') || bodyText.includes('$') || bodyText.includes('USD');
            return hasPrice && !hasError;
        });

        await browser.close();
        return result;
    } catch (e) {
        await browser.close();
        return false;
    }
}

async function run() {
    console.log("מתחיל סריקה ריכוזית...");
    let results = [];
    
    for (const dest of DESTS) {
        for (const date of DATES) {
            // בדיקת ארקיע
            const arkiaUrl = `https://www.arkia.com/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1`;
            if (await checkAvailability(arkiaUrl)) {
                results.push(`✈️ *ארקיע* ל${dest.name} ב-${date} [לינק](${arkiaUrl})`);
            }

            // בדיקת ישראייר
            const fmtDate = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;
            const israirUrl = `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22cityCode%22:%22TLV%22%7D&destination=%7B%22cityCode%22:%22${dest.code}%22,%22ltravelId%22:${dest.israirId}%7D&startDate=${fmtDate}&adults=3&children=1`;
            if (await checkAvailability(israirUrl)) {
                results.push(`✈️ *ישראייר* ל${dest.name} ב-${fmtDate} [לינק](${israirUrl})`);
            }
        }
    }

    const now = new Date().toLocaleTimeString('he-IL');
    if (results.length > 0) {
        const summaryMsg = `📢 *נמצאו טיסות פנויות! (עדכון ${now})*\n\n` + results.join('\n\n');
        await sendTelegram(summaryMsg);
    } else {
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* לא נמצאו טיסות פנויות ל-4 נוסעים ביעדים שנבדקו.`);
    }
}

run();
