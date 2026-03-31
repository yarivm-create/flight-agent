const puppeteer = require('puppeteer');
const axios = require('axios');

const TELEGRAM_TOKEN = '8456860842:AAHF8hKUb-W9vVBO2N3ykcKLge14ObrtrXA';
const CHAT_ID = '858419911';

// הגדרות החיפוש שלך
const DESTS = [
    { code: 'ATH', name: 'אתונה', israirId: 422 },
    { code: 'FCO', name: 'רומא', israirId: 802 },
    { code: 'LCA', name: 'לרנקה', israirId: 931 },
    { code: 'PFO', name: 'פאפוס', israirId: 3968 }
];
const DATES = ['20260331', '20260401', '20260402', '20260403', '20260404'];

async function sendTelegram(msg) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown'
        });
    } catch (e) { console.error("Telegram error"); }
}

async function checkAvailability(url, selector, siteName) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        
        // ממתינים קצת שהמחירים יטענו
        await new Promise(r => setTimeout(r, 5000));

        const isAvailable = await page.evaluate((sel) => {
            const content = document.body.innerText;
            // בדיקה אם יש סימני מחיר או אלמנטים של טיסה
            return content.includes('₪') || content.includes('$') || !!document.querySelector(sel);
        }, selector);

        await browser.close();
        return isAvailable;
    } catch (e) {
        await browser.close();
        return false;
    }
}

async function run() {
    await sendTelegram("🔍 *הסוכן התחיל סריקת עומק באתרים (ארקיע וישראייר)...*");
    
    for (const dest of DESTS) {
        for (const date of DATES) {
            // בדיקת ארקיע
            const arkiaUrl = `https://www.arkia.com/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1`;
            const arkiaAvail = await checkAvailability(arkiaUrl, '.flight-row', 'ארקיע');
            
            if (arkiaAvail) {
                await sendTelegram(`🔥 *נמצאה טיסה בארקיע!*\n📍 יעד: ${dest.name}\n📅 תאריך: ${date}\n👨‍👩‍👧‍👦 נוסעים: 4\n🔗 [להזמנה לחץ כאן](${arkiaUrl})`);
            }

            // בדיקת ישראייר (פורמט תאריך שונה)
            const formattedDate = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;
            const israirUrl = `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22cityCode%22:%22TLV%22%7D&destination=%7B%22cityCode%22:%22${dest.code}%22,%22ltravelId%22:${dest.israirId}%7D&startDate=${formattedDate}&adults=3&children=1`;
            const israirAvail = await checkAvailability(israirUrl, '.flight-item', 'ישראייר');

            if (israirAvail) {
                await sendTelegram(`🔥 *נמצאה טיסה בישראייר!*\n📍 יעד: ${dest.name}\n📅 תאריך: ${formattedDate}\n👨‍👩‍👧‍👦 נוסעים: 4\n🔗 [להזמנה לחץ כאן](${israirUrl})`);
            }
        }
    }
    await sendTelegram("✅ *סריקת האתרים הושלמה.*");
}

run();
