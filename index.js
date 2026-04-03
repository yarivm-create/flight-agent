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

            // בדי
