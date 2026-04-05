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

function getDynamicDates() {
    const dates = [];
    for (let i = 0; i <= 7; i++) {
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
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה לטעינת התוצאות מהקישור
        await page.waitForSelector('button, .price, .flight-result-item', { timeout: 30000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 45000));

        const isAvailable = await page.evaluate((sName) => {
            const bodyText = document.body.innerText;
            if (bodyText.includes('לצערנו לא נמצאו') || bodyText.includes('אין טיסות בתאריך')) return false;

            if (sName === 'ישראייר') {
                // בדיקת כרטיסיות מחיר (תואם ללינק ששלחת)
                const items = Array.from(document.querySelectorAll('.flight-result-item, [class*="flight-card"], .item-container'));
                return items.some(el => {
                    const t = el.innerText;
                    return (t.includes('$') || t.includes('₪')) && !t.includes('מלאה') && !t.includes('קטן מהמבוקש');
                });
            }

            if (sName === 'Air Haifa') {
                if (bodyText.includes('אין מקומות') || bodyText.includes('מצטערים')) return false;
                const btns = Array.from(document.querySelectorAll('button'));
                return btns.some(b => (b.innerText.includes('$') || b.innerText.includes('₪')) && !b.innerText.includes('מלאה'));
            }

            if (sName === 'ארקיע') {
                const cards = Array.from(document.querySelectorAll('div[class*="flight-card"]'));
                return cards.some(c => c.innerText.includes('$') && !c.innerText.includes('אזל'));
            }

            return false;
        }, siteName);

        await browser.close();
        return isAvailable;
    } catch (e) {
        if (browser) await browser.close();
        return false;
    }
}

async function run() {
    const dynamicDates = getDynamicDates();
    let results = [];

    for (const dest of DESTS) {
        for (const date of dynamicDates) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            // הקישור המדויק של ישראייר לפי המבנה ששלחת
            const israirUrl = `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22TLV%22,%22ltravelId%22:768,%22countryCode%22:null,%22countryId%22:null%7D&destination=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22${dest.code}%22,%22ltravelId%22:${dest.israirId},%22countryCode%22:null,%22countryId%22:null%7D&startDate=${fmtSlash}&adults=3&children=1`;

            const checkList = [
                { name: 'ארקיע', url: `https://www.arkia.co.il/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1` },
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

    const now = new Date().toLocaleTimeString('he-IL');
    if (results.length > 0) {
        await sendTelegram(`📢 *נמצאו טיסות פנויות! (${now})*\n\n` + results.join('\n---\n'));
    } else {
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* הכל מלא.`);
    }
}

run();
