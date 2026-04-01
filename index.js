const puppeteer = require('puppeteer');
const axios = require('axios');

const TELEGRAM_TOKEN = '8456860842:AAHF8hKUb-W9vVBO2N3ykcKLge14ObrtrXA';
const CHAT_ID = '858419911';

const DESTS = [
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422, airHaifaCode: 'ATH' },
    { code: 'ROM', name: 'רומא 🇮🇹', israirId: 802, airHaifaCode: null },
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931, airHaifaCode: 'LCA' },
    { code: 'PFO', name: 'פאפוס 🇨🇾', israirId: 3968, airHaifaCode: null }
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
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // טעינת הדף
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה משמעותית (25 שניות) כדי שהאתר של ישראייר יסיים להדביק את המדבקות של "טיסה מלאה"
        await new Promise(r => setTimeout(r, 25000));

        const isAvailable = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // 1. פסילה מיידית אם מופיעים משפטי "אין תוצאות" או "מלאה"
            const blacklist = [
                "לצערנו לא נמצאו תוצאות",
                "טיסה מלאה",
                "הטיסה מלאה",
                "מצטערים, אין מקומות",
                "אזל",
                "Sold out"
            ];
            
            if (blacklist.some(phrase => bodyText.includes(phrase))) {
                return false;
            }

            // 2. חיפוש אקטיבי של כפתורי רכישה (בישראייר זה בדרך כלל אלמנט לחיץ עם מחיר שלא מכוסה)
            // אנחנו מחפשים אם יש סימן של מטבע ($ או ₪) שאינו צמוד למילה "מלאה"
            const hasPrice = bodyText.includes('₪') || bodyText.includes('$');
            const hasSelection = bodyText.includes('בחירה') || bodyText.includes('בחר טיסה');

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
    console.log("מריץ סריקה קפדנית ל-4 נוסעים...");
    let results = [];

    for (const dest of DESTS) {
        for (const date of DATES) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            // ארקיע
            const arkiaUrl = `https://www.arkia.com/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1`;
            if (await checkAvailability(arkiaUrl)) {
                results.push(`✈️ *ארקיע* | ${dest.name} | ${fmtSlash} [לינק](${arkiaUrl})`);
            }

            // ישראייר
            const israirUrl = `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22type%22:%22IATA%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22TLV%22,%22ltravelId%22:null,%22countryCode%22:null,%22countryId%22:null%7D&destination=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22${dest.code === 'ROM' ? 'ROM' : dest.code}%22,%22ltravelId%22:${dest.israirId},%22countryCode%22:null,%22countryId%22:null%7D&startDate=${fmtSlash}&adults=3&children=1`;
            if (await checkAvailability(israirUrl)) {
                results.push(`✈️ *ישראייר* | ${dest.name} | ${fmtSlash} [לינק](${israirUrl})`);
            }

            // Air Haifa
            if (dest.airHaifaCode) {
                const airHaifaUrl = `https://www.airhaifa.com/flight-results/TLV-${dest.airHaifaCode}/${fmtDash}/NA/3/1/0?breakdown=%7B%7D`;
                if (await checkAvailability(airHaifaUrl)) {
                    results.push(`✈️ *Air Haifa* | ${dest.name} | ${fmtSlash} [לינק](${airHaifaUrl})`);
                }
            }
        }
    }

    const now = new Date().toLocaleTimeString('he-IL');
    if (results.length > 0) {
        await sendTelegram(`📢 *נמצאו טיסות פנויות באמת! (${now})*\n\n` + results.join('\n---\n'));
    } else {
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* לא נמצאו מקומות פנויים ל-4 נוסעים.`);
    }
}

run();
