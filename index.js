const puppeteer = require('puppeteer');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const DESTS = [
    { code: 'LCA', name: 'לרנקה 🇨🇾', israirId: 931, airHaifaCode: 'LCA' },
    { code: 'ATH', name: 'אתונה 🇬🇷', israirId: 422, airHaifaCode: 'ATH' },
    { code: 'ROM', name: 'רומא 🇮🇹', israirId: 802, airHaifaCode: null }
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

async function checkAvailability(url, siteName) {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // המתנה קריטית לאייר חיפה - המחיר נטען בתוך כפתור כחול
        await page.waitForSelector('button', { timeout: 30000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 40000)); 

        const isAvailable = await page.evaluate((sName) => {
            const bodyText = document.body.innerText;
            if (bodyText.includes('מצטערים, אין מקומות') || bodyText.includes('אין טיסות בתאריך')) return false;

            const allElements = Array.from(document.querySelectorAll('button, .price, [class*="price"], .flight-result-item'));
            
            return allElements.some(el => {
                const text = el.innerText;
                const hasPrice = text.includes('$') || text.includes('₪');
                // מוודא שהטיסה לא מסומנת כמלאה (תואם לצילום IMG_6816.jpg)
                const isFull = text.includes('מלאה') || text.includes('Sold Out') || text.includes('אזל');
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
    const dates = getDynamicDates();
    let results = [];

    for (const dest of DESTS) {
        for (const date of dates) {
            const fmtDash = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
            const fmtSlash = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;

            const checkList = [
                { name: 'ישראייר', url: `https://www.israir.co.il/he-IL/reservation/search/flights-abroad/results?origin=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22TLV%22,%22ltravelId%22:768%7D&destination=%7B%22type%22:%22ltravelId%22,%22destinationType%22:%22CITY%22,%22cityCode%22:%22${dest.code}%22,%22ltravelId%22:${dest.israirId}%7D&startDate=${fmtSlash}&adults=3&children=1` }
            ];

            if (dest.airHaifaCode) {
                // קישור מדויק ל-3 מבוגרים וילד אחד (3/1/0) כפי שמופיע בצילום המסך
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
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID, text: `📢 *נמצאו טיסות!* \n\n${results.join('\n---\n')}`, parse_mode: 'Markdown'
        });
    }
}

run();
