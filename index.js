const puppeteer = require('puppeteer');
const axios = require('axios');

// הגדרות בוט טלגרם
const TELEGRAM_TOKEN = '8456860842:AAHF8hKUb-W9vVBO2N3ykcKLge14ObrtrXA';
const CHAT_ID = '858419911';

// יעדים ותאריכים (31.03 עד 04.04)
const DESTS = [
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422, airHaifaCode: 'ATH' },
    { code: 'FCO', name: 'רומא 🇮🇹', israirId: 802, airHaifaCode: null },
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931, airHaifaCode: 'LCA' },
    { code: 'PFO', name: 'פאפוס 🇨🇾', israirId: 3968, airHaifaCode: null }
];

const DATES = ['20260331', '20260401', '20260402', '20260403', '20260404'];

async function sendTelegram(msg) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID, 
            text: msg, 
            parse_mode: 'Markdown', 
            disable_web_page_preview: true
        });
    } catch (e) { 
        console.error("Telegram error:", e.message); 
    }
}

async function checkAvailability(url) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // טעינת דף עם זמן המתנה של 60 שניות
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה של 15 שניות לרינדור המחירים והכפתור הכחול ("בחירה")
        await new Promise(r => setTimeout(r, 15000));

        const result = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // משפטי שגיאה שמעידים שאין מקומות
            const errorPhrases = [
                "מצטערים, אין מקומות", "אזל", "טיסה מלאה", "לא נמצאו טיסות",
                "No flights found", "Sold out", "הטיסה מלאה", "נסו לשנות את היעד", "הפעם לא מצאנו"
            ];

            const hasError = errorPhrases.some(phrase => bodyText.includes(phrase));
            
            // סימני הצלחה - מחיר או כפתור בחירה
            const hasPrice = bodyText.includes('₪') || 
                             bodyText.includes('$') || 
                             bodyText.includes('ILS') || 
                             bodyText.includes('USD') || 
                             bodyText.includes('בחירה');

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
    console.log("Starting master scan for 4 passengers...");
    let results = [];
    
    for (const dest of DESTS) {
        for (const date of DATES) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            // 1. ארקיע (4 נוסעים)
            const arkiaUrl = `https://www.arkia.com/he/flights-results?CC=FL&IS_BACK_N_FORTH=false&OB_DEP_CITY=TLV&OB_ARV_CITY=${dest.code}&OB_DATE=${date}&ADULTS=3&CHILDREN=1`;
            if (await checkAvailability(arkiaUrl)) {
                results.push(`✈️ *ארקיע* | ${dest.name} | ${fmtSlash} [לינק](${arkiaUrl})`);
            }

            // 2. ישראייר (4 נוסעים)
            const israirUrl = `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22cityCode%22:%22TLV%22%7D&destination=%7B%22cityCode%22:%22${dest.code}%22,%22ltravelId%22:${dest.israirId}%7D&startDate=${fmtSlash}&adults=3&children=1`;
            if (await checkAvailability(israirUrl)) {
                results.push(`✈️ *ישראייר* | ${dest.name} | ${fmtSlash} [לינק](${israirUrl})`);
            }

            // 3. Air Haifa (4 נוסעים) - כולל breakdown
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
        const summaryMsg = `📢 *נמצאו טיסות פנויות ל-4 נוסעים! (${now})*\n\n` + results.join('\n---\n');
        await sendTelegram(summaryMsg);
    } else {
        await sendTelegram(`✅ *סריקה הושלמה (${now}):* לא נמצאו כרטיסים פנויים ל-4 נוסעים בארקיע, ישראייר או Air Haifa.`);
    }
}

run();
