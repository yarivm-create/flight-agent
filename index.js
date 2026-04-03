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

const DATES = ['20260402', '20260403', '20260404'];

async function sendTelegram(msg) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown', disable_web_page_preview: true
        });
    } catch (e) { console.error("Telegram error:", e.message); }
}

async function checkAvailability(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה ארוכה של 35 שניות כדי לוודא שכל המחירים והחותמות נטענו
        await new Promise(r => setTimeout(r, 35000));

        const isAvailable = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // פונקציית עזר לספירת מילים בטקסט
            const count = (str, word) => (str.split(word).length - 1);

            // סופר כמה כפתורי בחירה (פוטנציאליים) יש בדף
            const selectionButtons = count(bodyText, 'בחירה') + count(bodyText, 'Select') + count(bodyText, 'בחר');
            
            // סופר כמה חותמות "מלאה" מופיעות בדף
            const fullIndicators = count(bodyText, 'טיסה מלאה') + count(bodyText, 'הטיסה מלאה') + count(bodyText, 'Sold out') + count(bodyText, 'Full');

            // בדיקה האם מופיע מחיר כלשהו
            const hasPrice = bodyText.includes('$') || bodyText.includes('₪') || bodyText.includes('USD');

            // לוגיקה: הטיסה פנויה רק אם יש יותר כפתורי בחירה מחותמות "מלאה"
            // זה מונע הודעות שווא כשישראייר שמה חותמת "מלאה" על מחיר קיים
            return hasPrice && (selectionButtons > fullIndicators);
        });

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}

async function run() {
    console.log("מריץ סריקה חכמה ל-4 נוסעים (סינון חותמות 'מלאה')...");
    let results = [];

    for (const dest of DESTS) {
        for (const date of DATES) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            const checkList = [
                // חיפוש 3 מבוגרים וילד (סה"כ 4)
                { name: 'ארקיע', url: `https://www.arkia.com/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1` },
                { name: 'ישראייר', url: `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22type%22:%22IATA%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22TLV%22,%22ltravelId%22:null,%22countryCode%22:null,%22countryId%22:null%7D&destination=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22${dest.code === 'ROM' ? 'ROM' : dest.code}%22,%22ltravelId%22:${dest.israirId},%22countryCode%22:null,%22countryId%22:null%7D&startDate=${fmtSlash}&adults=3&children=1` }
            ];

            if (dest.airHaifaCode) {
                checkList.push({ name: 'Air Haifa', url: `https://www.airhaifa.com/flight-results/TLV-${dest.airHaifaCode}/${fmtDash}/NA/3/1/0?breakdown=%7B%7D` });
            }

            for (const item of checkList) {
                if (await checkAvailability(item.url)) {
                    results.push(`✈️ *${item.name}* | ${dest.name} | ${fmtSlash} [לינק](${item.url})`);
                }
            }
        }
    }

    const now = new Date().toLocaleTimeString('he-IL');
    if (results.length > 0) {
        await sendTelegram(`📢 *נמצאו טיסות ל-4 נוסעים! (${now})*\n\n` + results.join('\n---\n'));
    } else {
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* לא נמצאו מקומות פנויים ל-4 נוסעים.`);
    }
}

run();
