const puppeteer = require('puppeteer');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const DESTS = [
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422, airHaifaCode: 'ATH' },
    { code: 'ROM', name: 'רומא 🇮🇹', israirId: 802, airHaifaCode: null },
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931, airHaifaCode: 'LCA' },
    { code: 'PFO', name: 'פאפוס 🇨🇾', israirId: 3968, airHaifaCode: null }
];

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
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 40000));

        const isAvailable = await page.evaluate((sName) => {
            // לוגיקה ייעודית לארקיע
            if (sName === 'ארקיע') {
                // מחפשים את כל כרטיסי הטיסה בארקיע
                const cards = Array.from(document.querySelectorAll('div[class*="flight-card"], .flight-result-item, div.flight-row'));
                if (cards.length === 0) return document.body.innerText.includes('$') && !document.body.innerText.includes('אזל');

                return cards.some(card => {
                    const text = card.innerText;
                    const hasPrice = text.includes('$') || text.includes('₪');
                    const isSoldOut = text.includes('אזל') || text.includes('Sold');
                    // טיסה פנויה אם יש מחיר ואין עליה חותמת "אזל"
                    return hasPrice && !isSoldOut;
                });
            }

            // לוגיקה לישראייר ואייר חיפה
            const body = document.body.innerText;
            const hasPrice = body.includes('$') || body.includes('₪');
            const blockWords = ['טיסה מלאה', 'הטיסה מלאה', 'אזל', 'Sold out', 'קטן מהמבוקש'];
            const isBlocked = blockWords.some(word => body.includes(word));
            
            // בישראייר, אם מופיע מחיר ואין הודעת חסימה גורפת, זה כנראה פנוי
            return hasPrice && !isBlocked;
        }, siteName);

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}

async function run() {
    console.log("מריץ סריקה עם זיהוי כרטיסים נפרדים לארקיע...");
    let results = [];

    for (const dest of DESTS) {
        for (const date of DATES) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            const checkList = [
                { name: 'ארקיע', url: `https://www.arkia.co.il/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1` },
                { name: 'ישראייר', url: `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22type%22:%22IATA%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22TLV%22,%22ltravelId%22:null,%22countryCode%22:null,%22countryId%22:null%7D&destination=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22${dest.code === 'ROM' ? 'ROM' : dest.code}%22,%22ltravelId%22:${dest.israirId},%22countryCode%22:null,%22countryId%22:null%7D&startDate=${fmtSlash}&adults=3&children=1` }
            ];

            for (const item of checkList) {
                if (await checkAvailability(item.url, item.name)) {
                    results.push(`✈️ *${item.name}* | ${dest.name} | ${fmtSlash} [לינק](${item.url})`);
                }
            }
        }
    }

    const now = new Date().toLocaleTimeString('he-IL');
    if (results.length > 0) {
        await sendTelegram(`📢 *נמצאו טיסות פנויות! (${now})*\n\n` + results.join('\n---\n'));
    } else {
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* לא נמצאו מקומות פנויים.`);
    }
}

run();
