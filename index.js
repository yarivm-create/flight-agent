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

// תאריכים עד ה-08.04
const DATES = ['20260403', '20260404', '20260405', '20260406', '20260407', '20260408'];

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
        // המתנה משמעותית לטעינת המחירים והאלמנטים הוויזואליים
        await new Promise(r => setTimeout(r, 40000));

        const isAvailable = await page.evaluate(() => {
            // זיהוי כל הטיסות בדף לפי קלאסים נפוצים או מבנה של "כרטיס"
            const flightCards = Array.from(document.querySelectorAll('div[class*="flight"], div[class*="card"], .flight-row'));
            
            // אם לא מצאנו אלמנטים ספציפיים, נחזור לבדיקת טקסט גמישה יותר
            if (flightCards.length === 0) {
                const body = document.body.innerText;
                const hasPrice = body.includes('$') || body.includes('₪');
                const isFull = body.includes('טיסה מלאה') || body.includes('הטיסה מלאה');
                const lowSeats = body.includes('מספר המושבים הפנויים בטיסה קטן');
                return hasPrice && !isFull && !lowSeats;
            }

            // בדיקה של כל כרטיס טיסה בנפרד
            return flightCards.some(card => {
                const text = card.innerText;
                const hasPrice = text.includes('$') || text.includes('₪');
                const isFull = text.includes('טיסה מלאה') || text.includes('הטיסה מלאה') || text.includes('אזל');
                const lowSeats = text.includes('קטן מהמבוקש') || text.includes('מושבים פנויים');
                
                // הטיסה פנויה אם יש מחיר ואין הודעות חוסר זמינות בתוך הכרטיס הספציפי
                return hasPrice && !isFull && !lowSeats;
            });
        });

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}

async function run() {
    console.log("מריץ סריקה משופרת ל-4 נוסעים (3+1) עד ה-08/04...");
    let results = [];

    for (const dest of DESTS) {
        for (const date of DATES) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            const checkList = [
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
        await sendTelegram(`📢 *נמצאו טיסות פנויות! (${now})*\n\n` + results.join('\n---\n'));
    } else {
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* לא נמצאו מקומות פנויים.`);
    }
}

run();
