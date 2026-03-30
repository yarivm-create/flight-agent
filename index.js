const axios = require('axios');

// הגדרות אישיות
const TELEGRAM_TOKEN = '8456860842:AAHF8hKUb-W9vVBO2N3ykcKLge14ObrtrXA';
const CHAT_ID = '858419911'; 

// פרמטרי חיפוש
const TARGET_DESTINATION = 'ATH'; // אתונה
const START_DATE = '2026-03-30';
const END_DATE = '2026-04-03';
const AIRLINES = ['EL AL', 'ISRAIR', 'ARKIA', 'ELECTRA', '3E', 'BGH'];

async function sendTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
    } catch (e) {
        console.error("Telegram Error:", e.response ? e.response.data : e.message);
    }
}

async function checkFlights() {
    try {
        console.log("סורק לוח טיסות ב-Resource ID שסופק...");
        
        // הכתובת המדויקת ששלחת
        const RESOURCE_ID = 'e83f763b-b7d7-479e-b172-ae981ddc6de5'; 
        const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&limit=1000`;
        
        const response = await axios.get(url);
        const flights = response.data.result.records;

        let foundMessages = [];
        let totalScanned = flights.length;

        flights.forEach(f => {
            // בדיקת קיום שדות קריטיים
            if (!f.CHSTOT || !f.CHLOC1) return;

            const flightDate = f.CHSTOT.split('T')[0];
            const destination = f.CHLOC1; // קוד יעד (ATH)
            const airline = f.CHOPER || ""; // שם חברת תעופה
            const flightNum = f.CHFLTN || ""; // מספר טיסה

            if (flightDate >= START_DATE && flightDate <= END_DATE && destination === TARGET_DESTINATION) {
                const isRelevant = AIRLINES.some(a => airline.toUpperCase().includes(a));
                if (isRelevant) {
                    const status = f.CHRMINE || 'מתוכנן';
                    foundMessages.push(`✈️ *טיסה נמצאה!*\nחברה: ${airline}\nמספר: ${flightNum}\nתאריך: ${flightDate}\nשעה: ${f.CHSTOT.split('T')[1].substring(0,5)}\nסטטוס: ${status}`);
                }
            }
        });

        if (foundMessages.length > 0) {
            await sendTelegram(`📢 *עדכון מהסוכן האוטומטי (נמצאו ${foundMessages.length} טיסות):*\n\n` + foundMessages.join('\n---\n'));
        } else {
            // הודעה שמוודאת שהסוכן רץ - ניתן להסיר אותה בהמשך
            await sendTelegram(`✅ *הסוכן פעיל:* נסרקו ${totalScanned} טיסות בלוח הממשלתי. לא נמצאה כרגע התאמה לאתונה בטווח התאריכים המבוקש.`);
        }

    } catch (error) {
        console.error("Error:", error.message);
        await sendTelegram(`⚠️ *שגיאה בסוכן:* ${error.message}`);
    }
}

checkFlights();
