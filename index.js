const puppeteer = require('puppeteer');
const axios = require('axios');

// משיכת פרטי הבוט מה-Secrets של GitHub בצורה מאובטחת
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const DESTS = [
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422, airHaifaCode: 'ATH' },
    { code: 'ROM', name: 'רומא 🇮🇹', israirId: 802, airHaifaCode: null },
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931, airHaifaCode: 'LCA' },
    { code: 'PFO', name: 'פאפוס 🇨🇾', israirId: 3968, airHaifaCode: null }
];

// סריקה ממוקדת לימים הקרובים כדי להבטיח ריצה יציבה בכל שעה
const DATES = ['20260402', '20260403', '20260404'];

async function sendTelegram(msg) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        console.error("Missing Telegram Token or Chat ID in Secrets!");
        return;
    }
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
        
        // מגדיר סוכן משתמש כדי שהאתר לא יחשוב שמדובר ברובוט פשוט
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה ארוכה (35 שניות) כדי ש-Air Haifa וישראייר יסיימו לטעון כפתורי "בחירה"
        await new Promise(r => setTimeout(r, 35000));

        const isAvailable = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // רשימת פסילה (אם אלו מופיעים - הטיסה לא פנויה באמת)
            const blacklist = [
                "לצערנו לא נמצאו תוצאות",
                "טיסה מלאה",
                "הטיסה מלאה",
                "מצטערים, אין מקומות",
                "אזל",
                "Sold out",
                "Full"
            ];
            
            if (blacklist.some(phrase => bodyText.includes(phrase))) {
                return false;
            }

            // תנאי להצלחה: חייב להיות סימן מטבע וגם כפתור בחירה (עברית/אנגלית)
            const hasPrice = bodyText.includes('₪') || bodyText.includes('$') || bodyText.includes('USD');
            const hasSelection = bodyText.includes('בחירה') || bodyText.includes('בחר') || 
                                 bodyText.includes('Select') || bodyText.includes('Book');

            return hasPrice && hasSelection;
        });

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}

async function run() {
    console.log("מריץ סריקה סופר-ממוקדת עם המתנה מוגברת...");
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
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* לא נמצאו מקומות פנויים ל-4 נוסעים.`);
    }
}

run();
